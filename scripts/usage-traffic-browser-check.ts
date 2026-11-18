// Real-browser check of the Traffic option against a mocked usage answer: with Traffic off every
// graph and details view has the structure it had before, and with it on every state fits at phone,
// tablet and desktop widths in light and dark with nothing cut or overlapping.
//
//   bun scripts/usage-traffic-browser-check.ts            compare with the recorded structure
//   bun scripts/usage-traffic-browser-check.ts --record   write the structure of the current code
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { clippedTextProblems, sidewaysOverflowProblems } from './helpers/clipped-text';
import { fileTab, openFile } from './helpers/screen-tour';
import { inspect, isStructuredEntity } from '../src/shared/core/model';
import { graphCanvasProblems } from './helpers/graph-canvas-geometry';
import { neighborhoodCardProblems } from './helpers/card-geometry';
import { setShown, viewOptions } from './helpers/graph-options';
import { tokenContrast } from './helpers/theme-tour';
import { cardSizes, countedItems, domSignature, usageInterceptor, withoutPart, type UsageMock } from './helpers/usage-traffic';

const BASELINE = 'tests/fixtures/usage/dom-baseline.json';
const record = process.argv.includes('--record');
const FILE = 'ubl.ontology.yaml';
const WIDTHS: [number, number][] = [
  [360, 780],
  [768, 900],
  [1280, 800],
];

const api = await startIsolatedApi();
await api.ws.loadExample('ubl');
const project = api.ws.state.registry().projects[0].slug;
const source = await Bun.file('public/examples/ubl/' + FILE).text();
const items = countedItems(project, FILE, source);
// The most asked-about entity is the first addressable one, so a sorted list starts with it.
const busiestName = inspect(source, FILE).entities.find(isStructuredEntity)!.name;
const mock: UsageMock = { mode: 'ready', requests: [], release: () => {} };
const browser = await chromium.launch();
const errors: string[] = [];
let passed = 0;

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

async function openApp(width: number, height: number, colorScheme: 'light' | 'dark' = 'light'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(
    page,
    api,
    usageInterceptor(mock, () => items),
  );
  await page.goto(appUrl());
  await openFile(page, FILE);
  return page;
}

/** Opens one view tab of the file, after the sidebar steps a phone needs. */
const openTab = (page: Page, name: string) => fileTab(FILE, name)(page);

async function setTraffic(page: Page, on: boolean) {
  await viewOptions(page, async options => setShown(options, 'Traffic', on));
}

/** The only element Traffic adds to a screen while it is off: its own switch. */
const SWITCH = 'button.show-toggle[title^="Shade items"]';

/** The structure of the graph, the neighborhood and the details of the first entity, with Traffic never switched on and its switch left out. */
async function offStructure(page: Page) {
  const signatures: Record<string, Record<string, number>> = {};
  await openTab(page, 'Graph');
  await page.waitForTimeout(1200);
  signatures.graph = withoutPart(await domSignature(page, '.full-graph'), await domSignature(page, `.full-graph ${SWITCH}`));
  await page.locator('.full-entity').first().click();
  await expect(page.locator('.inspector h2')).toBeVisible();
  signatures.details = await domSignature(page, '.inspector');
  await openTab(page, 'Neighborhood');
  await page.waitForTimeout(1200);
  signatures.neighborhood = withoutPart(await domSignature(page, '.neighborhood-graph'), await domSignature(page, `.neighborhood-graph ${SWITCH}`));
  return signatures;
}

{
  const page = await openApp(1280, 800);
  const structure = await offStructure(page);
  expect(mock.requests, 'Traffic off asks for nothing').toEqual([]);
  if (record) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, JSON.stringify(structure, null, 1) + '\n');
    console.log('Recorded', BASELINE);
  } else if (existsSync(BASELINE)) {
    await check('with Traffic off every view has the recorded structure and asks for nothing', async () => {
      expect(structure).toEqual(JSON.parse(readFileSync(BASELINE, 'utf8')));
    });
  }
  await page.close();
}

async function checkOn(width: number, height: number, scheme: 'light' | 'dark') {
  const label = `${width}px ${scheme}`;
  const page = await openApp(width, height, scheme);
  mock.mode = 'ready';
  await openTab(page, 'Graph');
  await page.waitForTimeout(1200);
  const before = await cardSizes(page, '.full-graph');
  await setTraffic(page, true);
  await expect(page.locator('.full-graph .traffic-ring').first()).toBeAttached();
  await check(`${label}: cards keep their size and the graph has nothing cut or overlapping`, async () => {
    expect(await cardSizes(page, '.full-graph')).toEqual(before);
    expect(await graphCanvasProblems(page, 'model')).toEqual([]);
    expect(await clippedTextProblems(page, '.full-graph')).toEqual([]);
  });
  await check(`${label}: the legend names the measure, the operations and the period`, async () => {
    const legend = page.locator('.full-graph details.traffic-legend');
    await expect(legend).toContainText('requests through this workbench in the last 30 days');
    await expect(legend).toContainText('context requests, query plan requests, metric explanation requests');
    expect(await clippedTextProblems(page, '.full-graph')).toEqual([]);
    expect(await sidewaysOverflowProblems(page, '.traffic-legend')).toEqual([]);
  });
  await check(`${label}: the ring and the bar contrast with the card and the legend is readable`, async () => {
    expect(await tokenContrast(page, '--color-accent', '--color-surface')).toBeGreaterThanOrEqual(3);
    expect(await tokenContrast(page, '--color-text-muted', '--color-surface-page')).toBeGreaterThanOrEqual(4.5);
  });
  await check(`${label}: the details panel counts 1,200,000 requests in words`, async () => {
    await page.locator('.full-entity:has(.traffic-ring)').first().click();
    const badge = page.locator('.inspector .traffic-badge').first();
    await expect(badge).toContainText('1,200,000 requests through this workbench in the last 30 days');
    expect(await clippedTextProblems(page, '.inspector')).toEqual([]);
    expect(await sidewaysOverflowProblems(page, '.inspector')).toEqual([]);
  });
  await check(`${label}: the neighborhood shades the same items and fits`, async () => {
    await openTab(page, 'Neighborhood');
    await expect(page.locator('.neighborhood-graph .traffic-ring').first()).toBeAttached();
    expect(await neighborhoodCardProblems(page)).toEqual([]);
    expect(await graphCanvasProblems(page, 'neighborhood')).toEqual([]);
  });
  await check(`${label}: the catalog sorts by traffic and keeps the existing order for ties`, async () => {
    await openTab(page, 'Catalog');
    const sort = page.getByRole('button', { name: 'Sort by traffic', exact: true });
    const plain = await page.locator('.catalog-card').allInnerTexts();
    await sort.click();
    const sorted = await page.locator('.catalog-card').allInnerTexts();
    expect(sorted[0]).toContain(busiestName);
    expect([...sorted].sort()).toEqual([...plain].sort());
    await sort.click();
    expect(await page.locator('.catalog-card').allInnerTexts()).toEqual(plain);
  });
  await page.close();
}

async function checkStates(scheme: 'light' | 'dark') {
  const page = await openApp(1280, 800, scheme);
  await openTab(page, 'Graph');
  const legend = page.locator('.full-graph');
  const expected: [typeof mock.mode, string | RegExp][] = [
    ['empty', 'No requests through this workbench counted yet in the last 30 days.'],
    ['off', 'Counters are off. An operator turns them on with SW_USAGE_COUNTERS.'],
    ['partial', /Counts are unavailable for one day \(2026-11-15\)/],
    ['error', 'Request failed (500).'],
  ];
  for (const [mode, text] of expected) {
    await check(`${scheme}: the ${mode} state says so and cuts nothing`, async () => {
      mock.mode = mode;
      await setTraffic(page, false);
      await setTraffic(page, true);
      await expect(legend).toContainText(text);
      expect(await clippedTextProblems(page, '.full-graph')).toEqual([]);
    });
  }
  await check(`${scheme}: after an error Retry loads the counts`, async () => {
    mock.mode = 'ready';
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.full-graph .traffic-ring').first()).toBeAttached();
  });
  await check(`${scheme}: the loading state holds a place of its own until the answer comes`, async () => {
    mock.mode = 'loading';
    await setTraffic(page, false);
    await setTraffic(page, true);
    await expect(page.locator('.full-graph .traffic-loading')).toBeVisible();
    mock.release();
    await expect(page.locator('.full-graph .traffic-ring').first()).toBeAttached();
  });
  await check(`${scheme}: the option is remembered for the model after a reload`, async () => {
    mock.mode = 'ready';
    await page.reload();
    await openFile(page, FILE);
    await openTab(page, 'Graph');
    await expect(page.locator('.full-graph .traffic-ring').first()).toBeAttached();
  });
  await page.close();
}

try {
  for (const scheme of ['light', 'dark'] as const) {
    if (!record) for (const [width, height] of WIDTHS) await checkOn(width, height, scheme);
    if (!record) await checkStates(scheme);
  }
} finally {
  await browser.close();
  await api.stop();
}
console.log(JSON.stringify({ passed, errors }));
if (errors.length) throw Error(errors.join('\n'));
