// Builds a Traffic store over a canned usage answer, for tests of the Traffic displays.
import type { UsageAnswer, UsageItem } from '../../src/server/usage/usage-read';
import { createTrafficStore, type TrafficDeps, type TrafficStore } from '../../src/app/usage/traffic-store';

export const PROJECT = 'shop';
export const DOCUMENT = 'sales.yaml';
export const MODEL = 'Sales';
const model = `sw1:${PROJECT}/${DOCUMENT}#model:${MODEL}`;

/** An item of the example document, counted under the context and plan operations. */
export function itemOf(relative: string, total: number, byOperation: Record<string, number> = { 'agent.context.read': total }): UsageItem {
  return { address: model + relative, total, byOperation, byOrigin: { http: total } };
}

/** The answer of a server whose counters are on. */
export function answerWith(items: UsageItem[], overrides: Partial<UsageAnswer['measures'][0]> = {}, retentionDays = 30): UsageAnswer {
  return {
    counters: { enabled: true, retentionDays },
    measures: [
      {
        measure: 'workbench-requests',
        label: 'requests through this workbench',
        from: '2026-10-19',
        to: '2026-11-17',
        total: items.reduce((sum, item) => sum + item.total, 0),
        unavailableDays: [],
        items,
        ...overrides,
      },
    ],
  };
}

/** Dependencies with a canned fetch, a recorded timer and an in-memory remembered option. */
export function fakeDeps(respond: (project: string) => Promise<UsageAnswer>, remembered: Record<string, boolean> = {}) {
  const requests: string[] = [];
  const timers: { milliseconds: number; run: () => void; stopped: boolean }[] = [];
  const deps: TrafficDeps = {
    fetchUsage: project => {
      requests.push(project);
      return respond(project);
    },
    every: (milliseconds, run) => {
      const timer = { milliseconds, run, stopped: false };
      timers.push(timer);
      return () => {
        timer.stopped = true;
      };
    },
    readOn: modelName => remembered[modelName] === true,
    writeOn: (modelName, on) => {
      remembered[modelName] = on;
    },
  };
  return { deps, requests, timers, remembered };
}

/** A store attached to the example document and, when asked, already switched on. */
export async function storeWith(
  respond: () => Promise<UsageAnswer>,
  options: { on?: boolean } = {},
): Promise<{ store: TrafficStore; requests: string[]; timers: ReturnType<typeof fakeDeps>['timers'] }> {
  const { deps, requests, timers } = fakeDeps(respond);
  const store = createTrafficStore(deps);
  await store.attach({ project: PROJECT, path: DOCUMENT, modelName: MODEL });
  if (options.on !== false) await store.setOn(true);
  return { store, requests, timers };
}
