// Checks that every binding in the Mappings tab stays inside its card, that arrows stay with the
// step they lead to, and that counts read "1 binding". It covers every shipped mapping document
// and a synthetic one with 80-character identifiers and long dotted paths, at six viewports.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
import { fileTab, showSidebar } from './helpers/screen-tour';
import { BINDINGS_PER_GROUP, BINDINGS_STEP, GROUPS_SHOWN } from '../src/app/mappings/list-window';

const VIEWPORTS: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [1024, 768],
  [390, 844],
];

// A binding card is 180 to 300px tall, so the Mall mapping with its default limits (3 groups of 5
// bindings beside 12 concepts) measured 3.4 to 5.3 viewports tall on desktop and 7.1 on a phone.
// One "Show more" press adds 10 bindings, which measured 9.4 viewports on a phone. The limits
// below sit just above those values. Each list grows by tall cards, so a viewport multiple alone
// would not notice a Show more that reveals a few extra groups; the rendered binding count is
// checked exactly as well.
const MAX_TAB_VIEWPORTS = 8;
const MAX_TAB_VIEWPORTS_AFTER_SHOW_MORE = 10;
const MAX_BINDINGS_BY_DEFAULT = GROUPS_SHOWN * BINDINGS_PER_GROUP;

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

/** The mapping ids the open project offers, once the list has loaded. */
async function listedMappings(target: Page) {
  const chooser = target.getByLabel('Mapping document');
  await expect(chooser.locator('option').nth(1)).toBeAttached();
  return chooser.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
}

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

// Problems in the expanded bindings: an element past its card, text overflowing its own box, or
// an arrow on a different line from the step it leads to.
async function bindingLayoutProblems(target: Page) {
  return target.evaluate(() => {
    const found: string[] = [];
    const overlaps = (first: DOMRect, second: DOMRect) => first.bottom > second.top + 1 && first.top < second.bottom - 1;
    for (const details of document.querySelectorAll<HTMLDetailsElement>('.mapping-bindings, .mapping-group')) details.open = true;
    for (const card of document.querySelectorAll<HTMLElement>('.mapping-binding')) {
      const box = card.getBoundingClientRect();
      const label = card.getAttribute('aria-label');
      for (const element of card.querySelectorAll<HTMLElement>('*')) {
        if (element.closest('details:not([open]) > :not(summary)')) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${label}: <${element.tagName.toLowerCase()}> ${element.className} leaves its card`);
        const style = getComputedStyle(element);
        const clips = ['auto', 'scroll', 'hidden'].includes(style.overflowX);
        if (!clips && element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) found.push(`${label}: <${element.tagName.toLowerCase()}> text overflows its box`);
      }
      const steps = [...card.querySelectorAll<HTMLElement>('.mapping-binding-chain [data-step]')];
      // The arrow is drawn before each step after the first; it must share a line with the
      // step's label, or it would hang alone at the end of the previous line.
      steps.slice(1).forEach(step => {
        const arrow = getComputedStyle(step, '::before');
        const first = step.firstElementChild?.getClientRects()[0];
        if (!arrow.content.includes('→')) {
          found.push(`${label}: no arrow before ${step.textContent}`);
          return;
        }
        const box = step.getBoundingClientRect();
        const top = arrow.position === 'absolute' ? box.top + parseFloat(arrow.top) : box.top;
        const height = parseFloat(arrow.lineHeight) || parseFloat(arrow.fontSize) * 1.2;
        const arrowBox = { top, bottom: top + height } as DOMRect;
        if (first && !overlaps(arrowBox, first)) found.push(`${label}: the arrow before ${step.textContent} sits on another line`);
      });
    }
    return found;
  });
}

// Problems with the tab's height and with the "Show more" buttons: the tab scrolls as one page and
// stays a reasonable length because every list shows a few items first, no column is a scroll box
// of its own, and a control must stay inside its group's box.
async function boundedLayoutProblems(target: Page, viewportHeight: number, afterShowMore = false) {
  return target.evaluate(
    ({ viewport, maxViewports, maxBindings }) => {
      const found: string[] = [];
      const explorer = document.querySelector<HTMLElement>('.mapping-explorer')!;
      if (explorer.scrollHeight > viewport * maxViewports) found.push(`the tab is ${explorer.scrollHeight}px tall`);
      for (const selector of ['.mapping-concepts', '.mapping-concept-list', '.mapping-detail']) {
        const column = document.querySelector<HTMLElement>(selector)!;
        if (getComputedStyle(column).overflowY !== 'visible') found.push(`${selector} scrolls on its own`);
      }
      const groups = document.querySelectorAll<HTMLElement>('.mapping-group');
      for (const group of groups) {
        const groupBox = group.getBoundingClientRect();
        for (const button of group.querySelectorAll<HTMLElement>('.mapping-show-more, .mapping-show-more button')) {
          const box = button.getBoundingClientRect();
          if (box.left < groupBox.left - 1 || box.right > groupBox.right + 1) found.push(`a show-more control leaves its group sideways`);
          if (box.bottom > groupBox.bottom + 1) found.push(`a show-more control leaves its group`);
        }
      }
      const rendered = document.querySelectorAll('.mapping-binding').length;
      if (rendered > maxBindings) found.push(`${rendered} bindings rendered; at most ${maxBindings} expected`);
      const cards = document.querySelectorAll('.mapping-group:first-of-type .mapping-binding');
      if (cards.length > 15) found.push(`${cards.length} bindings rendered in the first group`);
      return found;
    },
    {
      viewport: viewportHeight,
      maxViewports: afterShowMore ? MAX_TAB_VIEWPORTS_AFTER_SHOW_MORE : MAX_TAB_VIEWPORTS,
      maxBindings: MAX_BINDINGS_BY_DEFAULT + (afterShowMore ? BINDINGS_STEP : 0),
    },
  );
}

try {
  await page.goto(appUrl());
  const chooser = page.getByLabel('Mapping document');
  const documentsByProject = new Map<string, string[]>();
  await check('each project lists only its own mapping documents', async () => {
    for (const [project, file] of projectFiles) {
      await openProjectMappings(page, project, file);
      const listed = await listedMappings(page);
      const slugs = new Set(listed.map(id => id.split('/')[0]));
      expect(slugs.size, `${project} lists ${listed.join(', ')}`).toBe(1);
      documentsByProject.set(project, listed);
    }
    const total = [...documentsByProject.values()].flat();
    expect(new Set(total).size).toBe(6);
  });

  await check('a concept with one binding reads "1 binding"', async () => {
    await openProjectMappings(page, 'Commerce', 'commerce.mapped-ontology.yaml');
    const commerce = documentsByProject.get('Commerce')!.find(id => id.endsWith('mapping.yaml'))!;
    await chooser.selectOption(commerce);
    const revenue = page.locator('.mapping-concepts').getByRole('button', { name: /^Revenue/ });
    await expect(revenue).toContainText(/(^|\D)1 binding$/);
  });
  await check('every binding stays inside its card at six viewports', async () => {
    const found: string[] = [];
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const [project, file] of projectFiles) {
        await openProjectMappings(page, project, file);
        for (const id of documentsByProject.get(project)!) {
          await chooser.selectOption(id);
          await expect(page.locator('.mapping-binding').first()).toBeAttached();
          for (const problem of await bindingLayoutProblems(page)) found.push(`${width}×${height} ${id}: ${problem}`);
        }
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
      await openProjectMappings(page, 'Unbound commerce', 'commerce.mapped-ontology.yaml');
      await chooser.selectOption(document.id);
      await expect(page.getByText('No bindings in this mapping', { exact: true })).toBeVisible();
      await expect(page.locator('.mapping-concept-list > button')).toHaveCount(1);
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
  await check('opening a file selects a mapping of its own project', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showSidebar(page);
    const mallProject = page.getByRole('treeitem', { name: 'Mall', exact: true });
    if ((await mallProject.getAttribute('aria-expanded')) === 'false') {
      await mallProject.getByRole('button', { name: 'Mall', exact: true }).click();
    }
    await fileTab('mall.ontology.yaml', 'Mappings')(page);
    await expect(chooser).toHaveValue(/mall\.mapping\.yaml/);
    await expect(page.locator('.mapping-binding').first()).toBeAttached();
  });
  await check('long mapping lists stay bounded and show-more stays in its group', async () => {
    const found: string[] = [];
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await showSidebar(page);
      await fileTab('mall.ontology.yaml', 'Mappings')(page);
      await expect(page.locator('.mapping-binding').first()).toBeAttached();
      await page.locator('.mapping-bindings > summary').click();
      const first = await boundedLayoutProblems(page, height);
      found.push(...first.map(problem => `${width}: ${problem}`));
      const more = page.locator('.mapping-group .mapping-show-more button').first();
      await more.click();
      const second = await boundedLayoutProblems(page, height, true);
      found.push(...second.map(problem => `${width} after show more: ${problem}`));
      await page.locator('.mapping-group').first().getByRole('button', { name: 'Show fewer' }).click();
    }
    expect(found).toEqual([]);
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} mapping layout checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
