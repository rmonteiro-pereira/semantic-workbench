// Checks that every card of the Mappings tab keeps its content inside, that the tab stays one page
// of bounded length, and that counts read "1 binding". It covers every shipped mapping document
// and a synthetic one with 80-character identifiers and long dotted paths, at six viewports.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
import { fileTab, showSidebar } from './helpers/screen-tour';

const VIEWPORTS: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [1024, 768],
  [390, 844],
];

const read = (path: string) => readFileSync('public/examples/' + path, 'utf8');
const files = (folder: string, names: string[]) => names.map(name => ({ path: name, source: read(`${folder}/${name}`) }));

// Long names without separators, and long dotted paths, in place of the commerce names.
const LONG_DATASET = 'customeraccountswithverifiedidentityandregionalbillingpreferencesnorthamerica';
const LONG_FIELD = 'customer_identifier_assigned_by_the_upstream_customer_master_data_management';
const LONG_SOURCE = 'enterprise_analytics_warehouse.commerce_customer_master_data.customers_current_snapshot_version_two';
const LONG_CONCEPT = 'CustomerAccountHolderWithVerifiedIdentityAndRegionalBillingPreferenceRecords';

function longNames(text: string) {
  return text
    .replaceAll('analytics.commerce.customers', LONG_SOURCE)
    .replace(/\bcustomers\b/g, LONG_DATASET)
    .replace(/\bcustomer_id\b/g, LONG_FIELD)
    .replace(/\bCustomer\b/g, LONG_CONCEPT);
}

const commerceTrio = ['commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml', 'commerce.mapping.yaml'];
const projects = [
  { name: 'Commerce', files: files('commerce', commerceTrio) },
  {
    name: 'Billing',
    files: files('billing', ['billing.ontology.yaml', 'billing.semantic.yaml', 'billing.mapping.yaml']),
  },
  {
    name: 'Flights',
    files: files('ossie', ['flights.ontology.yaml', 'flights.semantic_model.yaml', 'flights.mapping.yaml', 'flights.yaml']),
  },
  {
    name: 'Mall',
    files: files('mall', ['mall.ontology.yaml', 'mall.semantic.yaml', 'mall.mapping.yaml']),
  },
  {
    name: 'Long names',
    files: files('commerce', commerceTrio).map(file => ({
      ...file,
      source: longNames(file.source),
    })),
  },
];

const api = await startIsolatedApi();
for (const project of projects) await api.ws.importBatch(project, LOCAL_READER);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;

// One file of each imported project; Mappings lists only the mappings of the open file's project.
const projectFiles: [string, string][] = [
  ['Commerce', 'commerce.mapped-ontology.yaml'],
  ['Billing', 'billing.ontology.yaml'],
  ['Flights', 'flights.ontology.yaml'],
  ['Mall', 'mall.ontology.yaml'],
  ['Long names', 'commerce.mapped-ontology.yaml'],
];

/** Opens a file of one project in the sidebar tree and shows its Mappings tab. */
async function openProjectMappings(target: Page, project: string, file: string) {
  await showSidebar(target);
  const tree = target.getByRole('treeitem', { name: project, exact: true });
  if ((await tree.getAttribute('aria-expanded')) === 'false') {
    await tree.getByRole('button', { name: project, exact: true }).click();
  }
  await tree.getByRole('button', { name: file, exact: true }).click();
  await target.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
}

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

// Problems in the cards and the strip: an element past its box sideways, or text overflowing its own box.
async function cardLayoutProblems(target: Page) {
  return target.evaluate(() => {
    const found: string[] = [];
    for (const container of document.querySelectorAll<HTMLElement>('.mapping-card, .mapping-layers, .mapping-concepts')) {
      const box = container.getBoundingClientRect();
      for (const element of container.querySelectorAll<HTMLElement>('*')) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const name = `<${element.tagName.toLowerCase()}> ${element.className}`;
        if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${name} leaves its box`);
        if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0 && getComputedStyle(element).display !== 'inline') found.push(`${name} text overflows its box`);
      }
    }
    if (document.documentElement.scrollWidth > innerWidth) found.push('the page scrolls sideways');
    return found;
  });
}

// Problems with the tab's height and with the "Show more" buttons: the tab scrolls as one page and
// stays a reasonable length because every list shows a few items first, no column is a scroll box
// of its own, and a control must stay inside its card.
async function boundedLayoutProblems(target: Page, viewportHeight: number) {
  return target.evaluate(viewport => {
    const found: string[] = [];
    const explorer = document.querySelector<HTMLElement>('.mapping-explorer')!;
    if (explorer.scrollHeight > viewport * 12) found.push(`the tab is ${explorer.scrollHeight}px tall`);
    for (const selector of ['.mapping-columns', '.mapping-concepts', '.mapping-detail']) {
      const column = document.querySelector<HTMLElement>(selector)!;
      if (getComputedStyle(column).overflowY !== 'visible') found.push(`${selector} scrolls on its own`);
    }
    for (const card of document.querySelectorAll<HTMLElement>('.mapping-card')) {
      const cardBox = card.getBoundingClientRect();
      for (const button of card.querySelectorAll<HTMLElement>('.mapping-show-more, .mapping-show-more button')) {
        const box = button.getBoundingClientRect();
        if (box.left < cardBox.left - 1 || box.right > cardBox.right + 1) found.push('a show-more control leaves its card sideways');
        if (box.bottom > cardBox.bottom + 1) found.push('a show-more control leaves its card');
      }
    }
    const datasetRows = document.querySelectorAll('.mapping-dataset-row').length;
    if (datasetRows > 3) found.push(`${datasetRows} dataset rows rendered before Show more`);
    return found;
  }, viewportHeight);
}

try {
  await page.goto(appUrl());
  await check('each project shows only the mapping of its own project', async () => {
    for (const [project, file] of projectFiles) {
      await openProjectMappings(page, project, file);
      await expect(page.locator('.mapping-page').first()).toBeVisible();
      for (const description of await page.locator('.mapping-page .mapping-top p').allTextContents()) {
        expect(description, `${project} shows ${description}`).toContain(`The mapping of the ${project} project`);
      }
    }
  });

  await check('a concept with one binding reads "1 binding"', async () => {
    await openProjectMappings(page, 'Commerce', 'commerce.mapped-ontology.yaml');
    const revenue = page.locator('.mapping-concepts').getByRole('button', { name: /^Revenue/ });
    await expect(revenue).toContainText(/(^|\D)1 binding$/);
  });
  await check('every card stays inside its box at six viewports', async () => {
    const found: string[] = [];
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const [project, file] of projectFiles) {
        await openProjectMappings(page, project, file);
        await expect(page.locator('.mapping-detail .mapping-card').first()).toBeVisible();
        for (const problem of await cardLayoutProblems(page)) found.push(`${width}×${height} ${project}: ${problem}`);
      }
      await page.screenshot({ path: `/tmp/workbench-mappings-${width}.png`, fullPage: false });
    }
    expect(found.slice(0, 20)).toEqual([]);
  });
  await check('empty mapping actions open the selected mapping source at every viewport', async () => {
    const emptyMapping = read('commerce/commerce.mapping.yaml').split('concept_mappings:')[0].replace('name: Commerce ontology mapping', 'name: Unbound mapping regression') + 'concept_mappings: []\n';
    await api.ws.importBatch(
      {
        name: 'Unbound commerce',
        files: files('commerce', commerceTrio).map(file => ({
          ...file,
          source: file.path === 'commerce.mapping.yaml' ? emptyMapping : file.source,
        })),
      },
      LOCAL_READER,
    );
    const document = api.ws.documentsFor(LOCAL_READER).find(candidate => candidate.project === 'unbound-commerce' && candidate.filename === 'commerce.mapping.yaml')!;
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openProjectMappings(page, 'Unbound commerce', 'commerce.mapping.yaml');
      await expect(page.locator('.mapping-detail .mapping-note').first()).toContainText('No binding of all concepts');
      await expect(page.locator('.mapping-concepts .mapping-concept')).toHaveCount(1);
      await page.getByRole('button', { name: 'Show query', exact: true }).click();
      await page.getByRole('button', { name: 'Open Source to add bindings', exact: true }).click();
      await expect(page.locator('.tabs .selected')).toHaveText('Source');
      // The title is the file name; the model's own name moves to its tooltip.
      const title = page.locator('.workspace-title h1');
      await expect(title).toHaveText(document.filename);
      await expect(title).toHaveAttribute('title', 'Unbound mapping regression');
      await expect(page.getByLabel('Definition source')).toContainText('concept_mappings: []');
    }
  });
  await check('opening a file shows the mapping of its own project', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showSidebar(page);
    const mallProject = page.getByRole('treeitem', { name: 'Mall', exact: true });
    if ((await mallProject.getAttribute('aria-expanded')) === 'false') {
      await mallProject.getByRole('button', { name: 'Mall', exact: true }).click();
    }
    await fileTab('mall.ontology.yaml', 'Mappings')(page);
    await expect(page.locator('.mapping-page .mapping-top p')).toContainText('mall.mapping.yaml');
    await expect(page.locator('.mapping-detail .mapping-card').first()).toBeVisible();
  });
  await check('long mapping lists stay bounded and show-more stays in its card', async () => {
    const found: string[] = [];
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await showSidebar(page);
      await fileTab('mall.ontology.yaml', 'Mappings')(page);
      await expect(page.locator('.mapping-detail .mapping-card').first()).toBeVisible();
      const first = await boundedLayoutProblems(page, height);
      found.push(...first.map(problem => `${width}: ${problem}`));
      const more = page.locator('.mapping-detail .mapping-show-more button').first();
      if (await more.count()) {
        await more.click();
        const second = await boundedLayoutProblems(page, height);
        found.push(...second.filter(problem => !problem.includes('dataset rows rendered')).map(problem => `${width} after show more: ${problem}`));
        await page.locator('.mapping-detail .mapping-show-more').getByRole('button', { name: 'Show fewer' }).click();
      }
    }
    expect(found).toEqual([]);
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} mapping layout checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
