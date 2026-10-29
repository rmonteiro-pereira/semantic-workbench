// Checks that every binding in the Mappings tab stays inside its card, that arrows stay with the
// step they lead to, and that counts read "1 binding". It covers every shipped mapping document
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
const files = (folder: string, names: string[]) =>
  names.map(name => ({ path: name, source: read(`${folder}/${name}`) }));

// Long names without separators, and long dotted paths, in place of the commerce names.
const LONG_DATASET =
  'customeraccountswithverifiedidentityandregionalbillingpreferencesnorthamerica';
const LONG_FIELD = 'customer_identifier_assigned_by_the_upstream_customer_master_data_management';
const LONG_SOURCE =
  'enterprise_analytics_warehouse.commerce_customer_master_data.customers_current_snapshot_version_two';
const LONG_CONCEPT = 'CustomerAccountHolderWithVerifiedIdentityAndRegionalBillingPreferenceRecords';

function longNames(text: string) {
  return text
    .replaceAll('analytics.commerce.customers', LONG_SOURCE)
    .replace(/\bcustomers\b/g, LONG_DATASET)
    .replace(/\bcustomer_id\b/g, LONG_FIELD)
    .replace(/\bCustomer\b/g, LONG_CONCEPT);
}

const commerceTrio = [
  'commerce.mapped-ontology.yaml',
  'commerce.mapped-semantic.yaml',
  'commerce.mapping.yaml',
];
const projects = [
  { name: 'Commerce', files: files('commerce', commerceTrio) },
  {
    name: 'Billing',
    files: files('billing', [
      'billing.ontology.yaml',
      'billing.semantic.yaml',
      'billing.mapping.yaml',
    ]),
  },
  {
    name: 'Flights',
    files: files('ossie', [
      'flights.ontology.yaml',
      'flights.semantic_model.yaml',
      'flights.mapping.yaml',
      'flights.yaml',
    ]),
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
    const overlaps = (first: DOMRect, second: DOMRect) =>
      first.bottom > second.top + 1 && first.top < second.bottom - 1;
    for (const details of document.querySelectorAll<HTMLDetailsElement>(
      '.mapping-bindings, .mapping-group',
    ))
      details.open = true;
    for (const card of document.querySelectorAll<HTMLElement>('.mapping-binding')) {
      const box = card.getBoundingClientRect();
      const label = card.getAttribute('aria-label');
      for (const element of card.querySelectorAll<HTMLElement>('*')) {
        if (element.closest('details:not([open]) > :not(summary)')) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.left < box.left - 1 || rect.right > box.right + 1)
          found.push(
            `${label}: <${element.tagName.toLowerCase()}> ${element.className} leaves its card`,
          );
        const style = getComputedStyle(element);
        const clips = ['auto', 'scroll', 'hidden'].includes(style.overflowX);
        if (!clips && element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0)
          found.push(`${label}: <${element.tagName.toLowerCase()}> text overflows its box`);
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
        if (first && !overlaps(arrowBox, first))
          found.push(`${label}: the arrow before ${step.textContent} sits on another line`);
      });
    }
    return found;
  });
}

try {
  await page.goto(appUrl());
  await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
  const chooser = page.getByLabel('Mapping document');
  await expect(chooser.locator('option')).toHaveCount(7);
  const documents = await chooser
    .locator('option')
    .evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value).filter(Boolean),
    );

  await check('a concept with one binding reads "1 binding"', async () => {
    const commerce = documents.find(id => id.includes('commerce.mapping.yaml'))!;
    await chooser.selectOption(commerce);
    const revenue = page.locator('.mapping-concepts').getByRole('button', { name: /^Revenue/ });
    await expect(revenue).toContainText(/(^|\D)1 binding$/);
  });
  await check('every binding stays inside its card at six viewports', async () => {
    const found: string[] = [];
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const id of documents) {
        await chooser.selectOption(id);
        await expect(page.locator('.mapping-binding').first()).toBeAttached();
        for (const problem of await bindingLayoutProblems(page))
          found.push(`${width}×${height} ${id}: ${problem}`);
      }
      await page.screenshot({ path: `/tmp/workbench-mappings-${width}.png`, fullPage: false });
    }
    expect(found.slice(0, 20)).toEqual([]);
  });
  await check(
    'empty mapping actions open the selected mapping source at every viewport',
    async () => {
      const emptyMapping =
        read('commerce/commerce.mapping.yaml')
          .split('concept_mappings:')[0]
          .replace('name: Commerce ontology mapping', 'name: Unbound mapping regression') +
        'concept_mappings: []\n';
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
      const document = api.ws
        .documentsFor(LOCAL_READER)
        .find(
          candidate =>
            candidate.project === 'unbound-commerce' &&
            candidate.filename === 'commerce.mapping.yaml',
        )!;
      for (const [width, height] of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await showSidebar(page);
        const commerceProject = page.getByRole('treeitem', { name: 'Commerce', exact: true });
        if ((await commerceProject.getAttribute('aria-expanded')) === 'false') {
          await commerceProject.getByRole('button', { name: 'Commerce', exact: true }).click();
        }
        await fileTab('commerce.mapped-ontology.yaml', 'Mappings')(page);
        await chooser.selectOption(document.id);
        await expect(page.getByText('No bindings in this mapping', { exact: true })).toBeVisible();
        await expect(page.locator('.mapping-concept-list > button')).toHaveCount(1);
        await page.getByRole('button', { name: 'Compose a query…', exact: true }).click();
        await page
          .getByRole('button', { name: 'Open Source to add bindings', exact: true })
          .click();
        await expect(page.locator('.tabs .selected')).toHaveText('Source');
        await expect(page.locator('.workspace-title h1')).toHaveText('Unbound mapping regression');
        await expect(page.getByLabel('Definition source')).toContainText('concept_mappings: []');
      }
    },
  );
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} mapping layout checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
