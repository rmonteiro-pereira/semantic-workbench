// Checks in the browser that an author can manage attributes, governance and agent context of a concept, confirm the revision change, and that nothing overlaps, scrolls sideways or is cut at phone and desktop width in both themes.
import { chromium, expect, type Page } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { clippedTextProblems } from './helpers/clipped-text';
import { layoutProblems } from './helpers/layout-geometry';
import { routeApi, startIsolatedApi } from './helpers/isolated-api';
import { chooseTheme, tokenContrast } from './helpers/theme-tour';
import { LOCAL_READER } from '../src/server/projects/reader';

const FILE = 'retail.ontology.yaml';
const OLDER_FILE = 'older.ontology.yaml';
const LARGE_FILE = 'large.ontology.yaml';
const LONG_NAME = 'a_very_long_attribute_name_that_has_no_break_'.repeat(3);

const RETAIL = `tessera: 2
version: 0.2.0.dev0
name: Retail
ontology:
  - concept: LoyaltyTier
    type: ValueType
  - concept: Customer
    type: EntityType
    description: A person who buys.
    relationships:
      - name: email
        roles: [{concept: String}]
        verbalizes: [Customer has email]
      - name: tier
        roles: [{concept: LoyaltyTier}]
        verbalizes: [Customer has tier]
`;
const OLDER = RETAIL.replace('tessera: 2', 'tessera: 1').replace('name: Retail', 'name: Older');

/** A document with 200 concepts, each with two attributes, to measure how long the details take to appear. */
function largeOntology(): string {
  const concepts = Array.from(
    { length: 200 },
    (_, index) =>
      `  - concept: Thing${index}\n    type: EntityType\n    relationships:\n      - name: code\n        roles: [{concept: String}]\n        verbalizes: [Thing${index} has code]\n      - name: size\n        roles: [{concept: Integer}]\n        verbalizes: [Thing${index} has size]\n`,
  );
  return `tessera: 2\nversion: 0.2.0.dev0\nname: Large\nontology:\n${concepts.join('')}`;
}

// The workspace is a temporary data root, so the real workspace is never touched.
const api = await startIsolatedApi({ watch: false });
await api.ws.importBatch(
  {
    name: 'Retail',
    files: [
      { path: FILE, source: RETAIL },
      { path: OLDER_FILE, source: OLDER },
      { path: LARGE_FILE, source: largeOntology() },
    ],
  },
  LOCAL_READER,
);
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];

async function openPage(width: number, height: number, scheme: 'light' | 'dark'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(page, api);
  await page.goto(appUrl());
  return page;
}

async function openConcept(page: Page, file: string, concept: string) {
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: file, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
  await page
    .locator('.catalog-card', { hasText: concept })
    .getByRole('button', { name: /View details/ })
    .click();
  await page.getByRole('complementary', { name: 'Definition details' }).waitFor();
}

async function expectCleanLayout(page: Page, label: string) {
  expect(await layoutProblems(page), `${label}: layout`).toEqual([]);
  expect(await clippedTextProblems(page), `${label}: clipped text`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no sideways scroll`).toBe(true);
}

async function attributeFlow(page: Page, label: string) {
  await openConcept(page, FILE, 'Customer');
  const details = page.getByRole('complementary', { name: 'Definition details' });
  const attributes = details.getByRole('region', { name: 'Attributes' });
  await attributes.getByText('tier').first().waitFor();
  await attributes.getByRole('button', { name: 'Add attribute' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(LONG_NAME);
  await expectCleanLayout(page, `${label}: add form`);
  await dialog.getByRole('button', { name: 'Add attribute' }).click();
  await attributes.getByText(LONG_NAME, { exact: true }).waitFor();
  await expectCleanLayout(page, `${label}: long name row`);
  await attributes.getByRole('button', { name: `Move ${LONG_NAME} up` }).click();
  await attributes.getByRole('button', { name: `Edit ${LONG_NAME}` }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('phone');
  await page.getByRole('dialog').getByRole('button', { name: 'Save attribute' }).click();
  await attributes.getByText('phone', { exact: true }).waitFor();
  await attributes.getByRole('button', { name: 'Remove phone' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await attributes.getByText('phone', { exact: true }).waitFor({ state: 'detached' });
}

async function governanceAndContextFlow(page: Page, label: string) {
  await openConcept(page, FILE, 'Customer');
  const details = page.getByRole('complementary', { name: 'Definition details' });
  const governance = details.getByRole('region', { name: 'Governance' });
  await governance.getByLabel('Status', { exact: true }).selectOption('proposed');
  await governance.getByLabel('Owner').fill('dana@example.com');
  await governance.getByRole('button', { name: 'Save governance' }).click();
  await governance.getByText('proposed').first().waitFor();
  const context = details.getByRole('region', { name: 'Agent context' });
  await context.getByLabel('Instructions').fill('Prefer the tier. '.repeat(20));
  await context.getByRole('button', { name: 'Save agent context' }).click();
  await context.getByText('Agents read this text only from the published version').waitFor();
  await expectCleanLayout(page, `${label}: governance and context`);
  expect(await tokenContrast(page, '--color-text', '--color-surface')).toBeGreaterThanOrEqual(4.5);
}

async function revisionFlow(page: Page) {
  await openConcept(page, OLDER_FILE, 'Customer');
  const attributes = page.getByRole('complementary', { name: 'Definition details' }).getByRole('region', { name: 'Attributes' });
  await attributes.getByRole('button', { name: 'Move tier up' }).click();
  const question = page.getByRole('dialog', { name: 'Move this file to Tessera 2?' });
  await question.waitFor();
  await question.getByRole('button', { name: 'Cancel' }).click();
  expect(api.ws.readFile('retail', OLDER_FILE, LOCAL_READER).source).toBe(OLDER);
  await attributes.getByRole('button', { name: 'Move tier up' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to Tessera 2' }).click();
  await expect.poll(() => api.ws.readFile('retail', OLDER_FILE, LOCAL_READER).source).toContain('tessera: 2');
}

async function largeDocumentTiming(page: Page): Promise<number> {
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: LARGE_FILE, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
  const started = Date.now();
  await page
    .locator('.catalog-card', { hasText: 'Thing199' })
    .first()
    .getByRole('button', { name: /View details/ })
    .click();
  await page.getByRole('complementary', { name: 'Definition details' }).getByRole('region', { name: 'Attributes' }).getByText('size').waitFor();
  return Date.now() - started;
}

try {
  for (const [width, height, scheme] of [
    [1440, 900, 'light'],
    [360, 800, 'dark'],
  ] as const) {
    const page = await openPage(width, height, scheme);
    if (scheme === 'dark') await chooseTheme(page, 'Dark');
    const label = `${width}px ${scheme}`;
    await attributeFlow(page, label);
    await governanceAndContextFlow(page, label);
    await page.close();
  }
  const desktop = await openPage(1440, 900, 'light');
  await revisionFlow(desktop);
  const milliseconds = await largeDocumentTiming(desktop);
  console.log(`MEASURED details of a concept in a document of 200 concepts appeared after ${milliseconds} ms`);
  await desktop.close();
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS attributes, agent context and governance are edited in the browser at phone and desktop width');
} finally {
  await browser.close();
  await api.stop();
}
