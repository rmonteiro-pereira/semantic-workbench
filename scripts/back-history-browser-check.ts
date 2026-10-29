// Checks that Back undoes every action a click caused and Forward redoes it, in an isolated
// browser workspace. A journey of click actions across screens records a fingerprint of the page
// after each action; browser Back must restore each earlier fingerprint in order, Forward must
// replay them, and the in-app back arrows must agree with the browser.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
import { groupTrigger, openGroupMenu } from './helpers/grouping-menu';

const api = await startIsolatedApi();
const mall = await api.ws.loadExample('mall');
const commerce = await api.ws.loadExample('commerce');
const wideColumns = Array.from({ length: 9 }, (_, index) => `measure_${index + 1}`);
const wideContract = [
  'apiVersion: v3.1.0',
  'kind: DataContract',
  'id: 2f6c3e0a-8b1d-4c55-9a77-1d2e3f4a5b6c',
  'name: Wide contract',
  'version: 1.0.0',
  'status: active',
  'schema:',
  '  - name: wide_table',
  '    physicalName: analytics.wide_table',
  '    physicalType: table',
  '    logicalType: object',
  '    properties:',
  ...wideColumns.flatMap(column => [`      - name: ${column}`, '        logicalType: number']),
].join('\n');
const wideModel = [
  'version: 0.2.0.dev0',
  'name: Wide model',
  'datasets:',
  '  - name: wide_view',
  '    source: analytics.wide_table',
  '    fields:',
  ...wideColumns.flatMap(column => [`      - name: ${column}`, '        expression:', '          dialects:', '            - dialect: ANSI_SQL', `              expression: ${column}`]),
].join('\n');
const wide = await api.ws.importBatch(
  {
    name: 'Wide lines',
    files: [
      { path: 'wide.odcs.yaml', source: wideContract + '\n' },
      { path: 'wide.semantic.yaml', source: wideModel + '\n' },
    ],
  },
  LOCAL_READER,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    errors.push(message.text());
  }
});

const POLL_MS = 400;
const STABLE_READS = 3;
const SETTLE_TIMEOUT_MS = 15000;
const tabs = () => page.locator('.tabs');
const tabButton = (name: string) => tabs().getByRole('button', { name: new RegExp(`^${name}`) });

// What a person sees of the page state: the open file, the tab, switches, the walk trail, the
// selection and what each graph, list and metric pane shows. It leaves out pixel positions.
type Fingerprint = Record<string, unknown>;
const fingerprint = (): Promise<Fingerprint> =>
  page.evaluate(() => {
    const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    const texts = (selector: string) => [...document.querySelectorAll(selector)].map(element => clean(element.textContent));
    const ids = (selector: string, attribute: string) => [...document.querySelectorAll(selector)].map(e => e.getAttribute(attribute)).sort();
    const switches = [...document.querySelectorAll('.canvas [aria-pressed], .canvas [role=radio]')]
      .map(element => {
        const label = clean(element.getAttribute('aria-label') ?? element.textContent);
        const state = element.getAttribute('aria-pressed') ?? element.getAttribute('aria-checked');
        return `${label}=${state}`;
      })
      .sort();
    return {
      file: clean(document.querySelector('.project-tree [aria-selected="true"]')?.textContent),
      tab: clean(document.querySelector('.tabs [aria-current="page"]')?.textContent),
      switches,
      // Steps ahead of the current one stay on the trail after Back, and a centre that is not
      // on the trail has its own entry, so only the steps up to the current one count.
      trail: (() => {
        const selector = '.walk-trail ol button, .lineage-trail ol button';
        const buttons = [...document.querySelectorAll(selector)].filter(button => button.getAttribute('title') !== 'Current center');
        const current = buttons.findIndex(button => button.getAttribute('aria-current') === 'step');
        return buttons.slice(0, current + 1).map(button => clean(button.textContent));
      })(),
      trailNow: texts('.walk-trail [aria-current="step"], .lineage-trail [aria-current="step"]'),
      details: clean(document.querySelector('.inspector h2, .inspector h3')?.textContent),
      flowNodes: ids('.react-flow__node', 'data-id'),
      flowEdges: document.querySelectorAll('.react-flow__edge').length,
      lineageLines: ids('g.lineage-edge', 'data-count'),
      areas: texts('.area-grid > *').length,
      bindings: document.querySelectorAll('.mapping-binding').length,
      showFewer: texts('.mapping-show-more button'),
      metric: clean(document.querySelector('.kpi-detail h2')?.textContent),
      catalogRows: document.querySelectorAll('.catalog-card, .catalog-row').length,
    };
  });

// Graph layouts finish a moment after the click, so the fingerprint is read until it stops
// changing.
// A lineage canvas draws only the cards in view, so it is fitted before each reading.
async function readFitted(): Promise<string> {
  const fit = lineage().getByRole('button', { name: 'Fit' });
  if (await fit.count()) await fit.click();
  return JSON.stringify(await fingerprint());
}
async function settledFingerprint(): Promise<Fingerprint> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let previous = await readFitted();
  let stable = 1;
  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_MS);
    const next = await readFitted();
    stable = next === previous ? stable + 1 : 1;
    if (stable >= STABLE_READS) return JSON.parse(next);
    previous = next;
  }
  throw new Error('The page did not settle: ' + previous);
}

type Action = { name: string; run: () => Promise<void> };
const openFile = (path: string): Action => ({
  name: `open ${path}`,
  run: async () => {
    await page.getByRole('button', { name: path, exact: true }).first().click();
  },
});
const openTab = (name: string): Action => ({
  name: `${name} tab`,
  run: async () => {
    await tabButton(name).click();
  },
});
const neighbours = () => page.locator('.neighborhood-node:not(.center)');
const lineage = () => page.getByRole('region', { name: 'Lineage graph' });

const journey: Action[] = [
  openFile('mall.ontology.yaml'),
  openTab('Neighborhood'),
  {
    name: 'select a neighbor, which centres on it',
    run: async () => {
      await neighbours().nth(1).click();
    },
  },
  {
    name: 'recentre on another neighbor',
    run: async () => {
      await neighbours().nth(2).click();
    },
  },
  {
    name: 'toggle Labels',
    run: async () => {
      await page.getByRole('button', { name: 'Labels', exact: true }).click();
    },
  },
  {
    name: 'toggle Value types',
    run: async () => {
      await page.getByRole('button', { name: /^Value types/ }).click();
    },
  },
  openTab('Graph'),
  {
    name: 'collapse the graph areas',
    run: async () => {
      await page.getByRole('button', { name: 'Collapse areas' }).click();
    },
  },
  {
    name: 'open a graph area',
    run: async () => {
      await page.locator('.react-flow__node[data-id^="collapsed:"]').first().click();
    },
  },
  {
    name: 'select an entity in the graph',
    run: async () => {
      await page.locator('.react-flow__node[data-id^="ontology/"]').first().click();
    },
  },
  openTab('Overview'),
  openTab('Mappings'),
  {
    name: 'Mappings: show more concepts',
    run: async () => {
      await page
        .getByRole('button', { name: /^Show \d+ more/ })
        .first()
        .click();
    },
  },
  {
    name: 'Mappings: select a concept',
    run: async () => {
      await page.locator('.mapping-concept-list button[aria-pressed]').nth(3).click();
    },
  },
  openFile('wide.odcs.yaml'),
  openTab('Graph'),
  {
    name: 'split a bundled line',
    run: async () => {
      const bundled = lineage().locator('g.lineage-edge[data-count="9"]');
      await expect(bundled).toHaveCount(1);
      await bundled.locator('.react-flow__edge-interaction').dispatchEvent('click');
    },
  },
  openFile('mall.odcs.yaml'),
  {
    name: 'open a lineage group',
    run: async () => {
      await lineage()
        .locator('.lineage-card.group')
        .getByRole('button', { name: /^Expand / })
        .click();
    },
  },
  {
    name: 'recentre the lineage on another card',
    run: async () => {
      const side = lineage().locator('.lineage-card:not(.center):not(.group)').first();
      await side.getByRole('button', { name: 'Walk here' }).click();
    },
  },
  openFile('sales.ossie.yaml'),
  openTab('Metrics'),
  {
    name: 'select a metric',
    run: async () => {
      await page.locator('button.metrics-name').first().click();
    },
  },
  openTab('Catalog'),
];

// The in-app back and forward arrows of the Neighborhood and lineage walks must move exactly as
// the browser's buttons do.
async function checkArrows() {
  const arrow = (trail: string, name: 'Back' | 'Forward') => page.locator(`${trail} button[aria-label="${name}"]`);
  const walks = [
    {
      name: 'Neighborhood',
      trail: '.walk-trail',
      start: [openFile('mall.ontology.yaml'), openTab('Neighborhood')],
      steps: [async () => void (await neighbours().nth(0).click()), async () => void (await neighbours().nth(1).click())],
    },
    {
      name: 'lineage',
      trail: '.lineage-trail',
      start: [openFile('mall.odcs.yaml'), openTab('Graph')],
      steps: [
        async () => {
          const side = lineage().locator('.lineage-card:not(.center):not(.group)').first();
          await side.getByRole('button', { name: 'Walk here' }).click();
        },
        async () => {
          const side = lineage().locator('.lineage-card:not(.center):not(.group)').first();
          await side.getByRole('button', { name: 'Walk here' }).click();
        },
      ],
    },
  ];
  for (const walk of walks) {
    for (const action of walk.start) await action.run();
    const states = [await settledFingerprint()];
    for (const step of walk.steps) {
      await step();
      states.push(await settledFingerprint());
    }
    const last = states.length - 1;
    await arrow(walk.trail, 'Back').click();
    expect(await settledFingerprint(), `${walk.name} arrow Back`).toEqual(states[last - 1]);
    await page.goForward();
    expect(await settledFingerprint(), `${walk.name} browser Forward`).toEqual(states[last]);
    await page.goBack();
    expect(await settledFingerprint(), `${walk.name} browser Back`).toEqual(states[last - 1]);
    await arrow(walk.trail, 'Forward').click();
    expect(await settledFingerprint(), `${walk.name} arrow Forward`).toEqual(states[last]);
    for (let index = last - 1; index >= 0; index--) {
      await arrow(walk.trail, 'Back').click();
      expect(await settledFingerprint(), `${walk.name} arrow Back to ${index}`).toEqual(states[index]);
    }
    console.log('ARROWS ok', walk.name);
  }
}

// Back and Forward only change what is shown. A grouping choice is saved when it is made, and
// moving through the history must not write it again.
async function checkBackDoesNotSave() {
  const groupingWrites: string[] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().endsWith('/grouping')) {
      groupingWrites.push(request.url());
    }
  });
  await openFile('mall.ontology.yaml').run();
  await openTab('Graph').run();
  const trigger = groupTrigger(page);
  const before = await trigger.innerText();
  const menu = await openGroupMenu(page);
  const entries = await menu.getByRole('menuitemradio').allInnerTexts();
  // Picks an entry that changes what the trigger says, so Back has something to restore.
  const chosenEntry = entries.find(entry => !entry.startsWith('Automatic') && !before.endsWith(entry.split('\n')[0]))!;
  await menu.getByRole('menuitemradio', { name: chosenEntry.split('\n')[0] }).click();
  const chosen = await trigger.innerText();
  expect(chosen).not.toBe(before);
  await expect.poll(() => groupingWrites.length).toBe(1);
  await page.goBack();
  await expect(trigger).toHaveText(before);
  await page.goForward();
  await expect(trigger).toHaveText(chosen);
  await page.waitForTimeout(POLL_MS);
  expect(groupingWrites, 'Back and Forward do not save the grouping').toHaveLength(1);
  console.log('GROUPING not saved by Back');
}

// After a reload, the earlier entries belong to another session. Back skips them and leaves the
// app instead of doing nothing.
async function checkBackAfterReload() {
  await page.reload();
  await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
  await page.goBack();
  await expect.poll(() => page.url(), { timeout: SETTLE_TIMEOUT_MS }).toBe('about:blank');
  console.log('RELOAD then Back leaves the app');
}

try {
  await routeApi(page, api);
  await page.goto(appUrl());
  await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
  const initial = await settledFingerprint();
  const after: Fingerprint[] = [];
  for (const action of journey) {
    await action.run();
    after.push(await settledFingerprint());
    const before = after.length > 1 ? after[after.length - 2] : initial;
    expect(after.at(-1), `"${action.name}" changes the page`).not.toEqual(before);
    console.log('DID', action.name);
  }
  const expectedBefore = [initial, ...after.slice(0, -1)];
  for (let index = journey.length - 1; index >= 0; index--) {
    await page.goBack();
    const actual = await settledFingerprint();
    expect(actual, `Back over "${journey[index].name}"`).toEqual(expectedBefore[index]);
    console.log('BACK ok', journey[index].name);
  }
  for (let index = 0; index < journey.length; index++) {
    await page.goForward();
    const actual = await settledFingerprint();
    expect(actual, `Forward over "${journey[index].name}"`).toEqual(after[index]);
    console.log('FORWARD ok', journey[index].name);
  }
  await checkArrows();
  await checkBackDoesNotSave();
  await checkBackAfterReload();
  expect(errors).toEqual([]);
  console.log('PASS back-history');
} finally {
  await browser.close();
  await api.stop();
}
void mall;
void commerce;
void wide;
