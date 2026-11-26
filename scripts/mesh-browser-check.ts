/** Exercises authoring and publication links in an isolated browser workspace. */
import { chromium, expect, type Page } from '@playwright/test';
import { LOCAL_READER } from '../src/server/projects/reader';
import { hideGraphControls, revealGraphControls } from './helpers/graph-options';
import { fileTab } from './helpers/screen-tour';
import { appUrl } from './helpers/base-url';
import { clippedTextProblems } from './helpers/clipped-text';
import { layoutProblems } from './helpers/layout-geometry';
import { routeApi, startIsolatedApi, type IsolatedApi } from './helpers/isolated-api';

const root = 'retail.yaml';
const longProviderName = 'Finance Department with a long public ontology name';
const version = '0.2.0.dev0';

async function seed(api: IsolatedApi) {
  const finance = await api.ws.importBatch(
    {
      name: longProviderName,
      files: [
        {
          path: 'finance.yaml',
          source: JSON.stringify({
            tessera: 3,
            name: 'Finance',
            version,
            tessera_exports: ['Invoice'],
            ontology: [{ concept: 'Invoice', type: 'EntityType' }],
          }),
        },
      ],
    },
    LOCAL_READER,
  );
  await api.ws.publish(finance.slug, LOCAL_READER);
  const retail = await api.ws.importBatch(
    {
      name: 'Retail',
      files: [
        {
          path: root,
          source: JSON.stringify({
            tessera: 3,
            name: 'Retail',
            version,
            tessera_includes: ['customers.yaml'],
            ontology: [{ concept: 'Order', type: 'EntityType' }],
          }),
        },
        {
          path: 'customers.yaml',
          source: JSON.stringify({
            tessera: 3,
            tessera_part: true,
            ontology: [{ concept: 'Customer', type: 'EntityType' }],
          }),
        },
      ],
    },
    LOCAL_READER,
  );
  await api.ws.publish(retail.slug, LOCAL_READER);
  return retail.slug;
}

async function editImport(page: Page, api: IsolatedApi, project: string) {
  const tree = page.getByRole('tree', { name: 'Projects' });
  await tree.getByRole('button', { name: root, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.locator('.catalog-card').filter({ hasText: 'Order' }).first().locator('button').first().click();
  const editor = page.getByRole('region', { name: 'Imports' });
  await editor.getByRole('button', { name: 'Add import' }).click();
  await editor.getByRole('radio', { name: new RegExp(longProviderName) }).check();
  await editor.getByLabel('Alias', { exact: true }).fill('fin');
  await editor.getByRole('checkbox', { name: 'Invoice', exact: true }).check();
  await expect(editor.getByText(/people who can publish the provider/)).toBeVisible();
  await editor.getByRole('button', { name: 'Save import' }).click();
  await editor.getByRole('button', { name: 'Update dependencies' }).click();
  await expect(editor.getByText('Compatibility not judged')).toBeVisible();
  await editor.getByRole('button', { name: 'Save dependency manifest' }).click();
  await expect(editor.getByRole('button', { name: 'Save dependency manifest' })).toHaveCount(0);
  const saved = api.ws.readFile(project, root);
  const data = JSON.parse(saved.source);
  data.ontology[0].extends = ['fin.Invoice'];
  await api.ws.saveFile(project, root, { baseHash: saved.hash, source: JSON.stringify(data) }, LOCAL_READER);
}

async function publish(page: Page, api: IsolatedApi, project: string) {
  const source = `${api.url}/api/projects/${project}/git/`;
  for (const [action, payload] of [
    ['stage', { all: true }],
    ['commit', { message: 'Publish the import' }],
  ] as const) {
    const response = await fetch(source + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
  }
  await page.getByRole('button', { name: /^Source control/ }).click();
  const panel = page.getByRole('region', { name: 'Source Control' });
  await panel.getByRole('button', { name: 'Publish', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Publish to / });
  await expect(dialog.getByText(/people who can publish the provider/)).toBeVisible();
  const response = page.waitForResponse(result => result.url().endsWith('/git/publish') && result.request().method() === 'POST');
  await dialog.getByRole('button', { name: /^Publish to / }).click();
  const published = await response;
  expect(published.ok()).toBe(true);
  expect(published.request().postDataJSON()).toMatchObject({ disclosureShown: true });
}

async function checkImportedGraphCard(page: Page) {
  // Direct fixture writes do not refresh the browser's document cache.
  await page.reload();
  await fileTab(root, 'Graph')(page);
  const card = page.locator('.full-entity:has(.mesh-imported-origin)').first();
  const origin = card.locator('.mesh-imported-origin');
  const key = page.locator('.mesh-imported-key');
  await expect(origin).toBeVisible();
  await expect(card).toHaveCSS('display', 'grid');
  await expect(card).toHaveCSS('align-content', 'center');
  await expect(card.locator('strong')).toHaveCSS('display', 'block');
  await expect(card.locator('strong')).toHaveCSS('overflow', 'visible');
  await expect(origin).toHaveCSS('white-space', 'normal');
  await expect(origin).toHaveCSS('overflow-wrap', 'anywhere');
  await revealGraphControls(page);
  await expect(key).toHaveCSS('white-space', 'normal');
  const originColor = await origin.evaluate(element => getComputedStyle(element).color);
  await expect(key).toHaveCSS('color', originColor);
  await hideGraphControls(page);
}

async function checkMesh(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(value => {
    document.documentElement.dataset.theme = value;
    localStorage.setItem('workbench.theme', value);
  }, theme);
  const dialog = page.getByRole('dialog', { name: 'Ontology mesh' });
  const provider = dialog.getByRole('button', { name: longProviderName });
  await provider.focus();
  await page.keyboard.press('Enter');
  await expect(provider).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText(/imports from Finance Department/)).toBeVisible();
  const dependent = dialog.getByRole('button', { name: 'Used by' });
  if ((await dependent.getAttribute('aria-expanded')) !== 'true') await dependent.click();
  await expect(dialog.getByText(/^Version [a-f0-9]{40}$/)).toBeVisible();
  expect(await clippedTextProblems(page, '.mesh-view')).toEqual([]);
  expect(await layoutProblems(page)).toEqual([]);
}

const api = await startIsolatedApi({ watch: false });
try {
  const retail = await seed(api);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await routeApi(page, api);
    await page.goto(appUrl());
    await editImport(page, api, retail);
    await publish(page, api, retail);
    await checkImportedGraphCard(page);
    await page.getByRole('complementary', { name: 'Workspace documents' }).getByRole('button', { name: 'Mesh', exact: true }).click();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark'] as const) await checkMesh(page, theme);
    }
    console.log('Ontology mesh browser check passed at 1440, 768 and 390 px in light and dark.');
  } finally {
    await browser.close();
  }
} finally {
  await api.stop();
}
