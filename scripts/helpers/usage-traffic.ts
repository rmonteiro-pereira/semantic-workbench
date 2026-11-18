// Mocked usage answers and page measurements for the Traffic browser check.
import type { Page, Route } from '@playwright/test';
import { formatAddress } from '../../src/shared/core/item-address';
import { absoluteItemAddress } from '../../src/shared/core/model-addresses';
import { inspect, isStructuredEntity } from '../../src/shared/core/model';
import type { UsageAnswer, UsageItem } from '../../src/server/usage/usage-read';

/** What the mocked usage route answers. `loading` holds the answer until it is released. */
export type UsageMode = 'ready' | 'empty' | 'off' | 'partial' | 'error' | 'loading';

/** The mocked usage route: its mode, the requests it saw and the release of a held answer. */
export type UsageMock = { mode: UsageMode; requests: string[]; release: () => void };

const COUNTS = [1_200_000, 90_000, 4_000, 700, 90, 12, 3, 1];

/** The counted items of a model: its first entities and ontology relationships, busiest first. */
export function countedItems(project: string, path: string, source: string): UsageItem[] {
  const model = inspect(source, path);
  const document = { project, document: path.split('/') };
  const absolute = (address: Parameters<typeof absoluteItemAddress>[0]) => formatAddress(absoluteItemAddress(address, document));
  const entities = model.entities.filter(isStructuredEntity).slice(0, COUNTS.length);
  const links = model.edges.filter(edge => edge.data.kind === 'Ontology relationship').slice(0, 3);
  const addresses = [...entities.map(entity => absolute(entity.address)), ...links.map(link => absolute(link.address))];
  return addresses.map((address, index) => {
    const total = COUNTS[index] ?? 2;
    return { address, total, byOperation: { 'agent.context.read': Math.ceil(total * 0.7), 'agent.plan': Math.floor(total * 0.3) }, byOrigin: { http: total } };
  });
}

function answerFor(mode: UsageMode, items: UsageItem[]): UsageAnswer {
  if (mode === 'off') return { counters: { enabled: false }, measures: [] };
  const shown = mode === 'empty' ? [] : items;
  return {
    counters: { enabled: true, retentionDays: 30 },
    measures: [
      {
        measure: 'workbench-requests',
        label: 'requests through this workbench',
        from: '2026-10-19',
        to: '2026-11-17',
        total: shown.reduce((sum, item) => sum + item.total, 0),
        unavailableDays: mode === 'partial' ? ['2026-11-15'] : [],
        items: shown,
      },
    ],
  };
}

/** Answers the usage route of a page from the mock and leaves every other request alone. */
export function usageInterceptor(mock: UsageMock, items: () => UsageItem[]) {
  let held: Promise<void> = Promise.resolve();
  mock.release = () => {};
  return async (route: Route): Promise<boolean> => {
    const url = new URL(route.request().url());
    if (!/\/api\/projects\/[^/]+\/usage$/.test(url.pathname)) return false;
    mock.requests.push(url.pathname);
    if (mock.mode === 'loading') {
      held = new Promise(resolve => (mock.release = resolve));
      await held;
    }
    if (mock.mode === 'error') await route.fulfill({ status: 500, json: { error: 'Request failed (500).' } });
    else await route.fulfill({ json: answerFor(mock.mode === 'loading' ? 'ready' : mock.mode, items()) });
    return true;
  };
}

/** How many elements of each kind (tag and classes) a region holds; equal counts mean an equal structure. */
export async function domSignature(page: Page, selector: string): Promise<Record<string, number>> {
  return page.evaluate(root => {
    const counts: Record<string, number> = {};
    const scope = document.querySelector(root);
    if (!scope) return { missing: 1 };
    for (const element of [scope, ...scope.querySelectorAll('*')]) {
      const classes = [...element.classList].filter(name => !/^(selected|focused|dragging|react-flow__node-.*)$/.test(name)).sort();
      const key = element.tagName.toLowerCase() + (classes.length ? '.' + classes.join('.') : '');
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, selector);
}

/** The width and height of every card of a graph in graph units, by node id, so a change of zoom does not count as a change of size. */
export async function cardSizes(page: Page, selector: string): Promise<Record<string, [number, number]>> {
  return page.evaluate(root => {
    const sizes: Record<string, [number, number]> = {};
    for (const node of document.querySelectorAll<HTMLElement>(`${root} .react-flow__node`)) {
      sizes[node.dataset.id ?? ''] = [node.offsetWidth, node.offsetHeight];
    }
    return sizes;
  }, selector);
}

/** Removes the elements of one part, such as the Traffic switch itself, from a structure. */
export function withoutPart(signature: Record<string, number>, part: Record<string, number>): Record<string, number> {
  const rest = { ...signature };
  for (const [key, count] of Object.entries(part)) {
    rest[key] = (rest[key] ?? 0) - count;
    if (rest[key] <= 0) delete rest[key];
  }
  return rest;
}
