// Exercises the published comparison and branch dialog in a disposable workbench.
import { chromium, expect, type Locator, type Page, type Route } from '@playwright/test';
import { itemDiffBaselineWorkspace } from '../tests/helpers/item-diff-baseline';
import { appUrl } from './helpers/base-url';
import { editorValue, fillEditor } from './helpers/code-editor';
import { checkItemMarks, itemDiffCardGeometry, itemDiffStructure, itemDiffToolbarSignature, itemDiffTab, expectItemDiffOverlay, setItemDiffOverlay } from './helpers/item-diff-browser';
import { routeApi, startIsolatedApi, type IsolatedApi } from './helpers/isolated-api';
import { hideGraphControls, revealGraphControls } from './helpers/graph-options';
import { openSyncDialog } from './helpers/sync-dialog';
import { LOCAL_READER } from '../src/server/projects/reader';

const project = 'finance';
const file = 'finance.ontology.yaml';
const heldBranch = 'item/held-by-other-copy';
const fixture = await itemDiffBaselineWorkspace();
fixture.ws.close();
const api = await startIsolatedApi({ root: fixture.root });
const repository = `${api.root}/projects/${project}`;
const primary = api.ws.state.published().repositories[project].branch;
const browser = await chromium.launch();
const errors: string[] = [];
const unexpectedPush: string[] = [];
function sh(directory: string, args: string[]) {
  const result = Bun.spawnSync(['git', '-C', directory, '-c', 'user.name=Workbench test', '-c', 'user.email=workbench@example.test', ...args]);
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

const recorded = await Bun.file('tests/fixtures/item-diff/baseline.json').json();

function mainFile(page: Page) {
  return page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: file, exact: true });
}

async function serveBrowser(page: Page, publishControls = false) {
  let failReview = publishControls;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/git\/(push|push-default|sync)$/.test(new URL(request.url()).pathname)) unexpectedPush.push(request.url());
  });
  await routeApi(page, api, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname + url.search;
    if (url.pathname.endsWith('/item-diff')) {
      if (failReview && url.searchParams.get('to')?.startsWith('branch:')) {
        failReview = false;
        await route.fulfill({ status: 503, json: { error: 'Comparison temporarily unavailable.' } });
        return true;
      }
      const response = await api.handler(new Request('http://localhost:5173' + path, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
      await route.fulfill({ status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers) });
      return true;
    }
    if (publishControls && url.pathname === '/api/projects') {
      const response = await api.handler(new Request('http://localhost:5173' + path));
      const projects = await response.json();
      for (const entry of projects) {
        if (entry.slug === project) {
          entry.copy = { branch: entry.branch, defaultBranch: primary, inUseBranches: [{ branch: heldBranch, inUseBy: 'Another editor' }] };
        }
      }
      await route.fulfill({ json: projects });
      return true;
    }
    return false;
  });
  await page.goto(appUrl());
  if (!(await mainFile(page).isVisible()))
    await page
      .getByRole('button', { name: /open workspace|show workspace/i })
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
  await mainFile(page).click();
}

async function compareRecordedGraph(page: Page) {
  await itemDiffTab(page, 'Graph');
  await expectItemDiffOverlay(page, true);
  await setItemDiffOverlay(page, false);
  await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(5, { timeout: 60000 });
  await expect(page.locator('.full-graph-loading')).toHaveCount(0);
  await expect.poll(() => itemDiffStructure(page.locator('.full-graph'))).toEqual(recorded.dom.fullGraph);
  expect(await itemDiffToolbarSignature(page, '.full-graph-tools')).toBe(recorded.dom.fullGraphToolbar);
  await itemDiffTab(page, 'Catalog');
  await expect.poll(() => itemDiffStructure(page.locator('.catalog'))).toEqual(recorded.dom.catalog);
  await page
    .locator('.catalog-card', { hasText: 'Customer' })
    .getByRole('button', { name: /View details/ })
    .click();
  const details = page.locator('aside[aria-label="Definition details"]');
  await details.getByRole('region', { name: 'Attributes' }).waitFor();
  await expect.poll(() => itemDiffStructure(details)).toEqual(recorded.dom.entityDetails);
  await details
    .locator('.related-edges')
    .getByRole('button', { name: /purchases/ })
    .click();
  await details.locator('.relationship-details').waitFor();
  await expect.poll(() => itemDiffStructure(details)).toEqual(recorded.dom.relationshipDetails);
  await details.getByRole('button', { name: 'Close details', exact: true }).click();
  await itemDiffTab(page, 'Neighborhood');
  await expect(page.locator('.neighborhood-canvas .react-flow__node')).not.toHaveCount(0);
  await expect.poll(() => itemDiffStructure(page.locator('.neighborhood-canvas'))).toEqual(recorded.dom.neighborhoodGraph);
  expect(await itemDiffToolbarSignature(page, '.neighborhood-tools')).toBe(recorded.dom.neighborhoodToolbar);
  await page.getByRole('button', { name: /^Source control/ }).click();
  function publicationStructure(value: unknown) {
    return JSON.stringify(value).replace(/ @ [a-f0-9]{7}/g, ' @ <commit>');
  }
  await expect.poll(async () => publicationStructure(await itemDiffStructure(page.getByLabel('Published snapshot')))).toBe(publicationStructure(recorded.dom.publish));
  console.log('PASS overlay off matches six recorded DOM structures and two expanded toolbars');
}

async function writeOverlayFixture(target: IsolatedApi) {
  const { ws } = target;
  const existing = ws.readFile(project, file);
  const source = existing.source.replace('  - concept: Retired\n    type: EntityType', '  - concept: Invoice\n    type: EntityType');
  await ws.saveFile(project, file, { baseHash: existing.hash, source }, LOCAL_READER);
}

// Switching a Show item lays the graph out again, and until that finishes every card waits at the
// same starting point. The reference positions are read only once the cards have spread out.
async function settledCardGeometry(page: Page) {
  await expect.poll(async () => new Set((await itemDiffCardGeometry(page)).map(card => card[3])).size).toBeGreaterThan(1);
  return itemDiffCardGeometry(page);
}

async function checkComparisonLegend(page: Page) {
  await revealGraphControls(page);
  await page.getByRole('button', { name: 'Unpublished comparison details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unpublished comparison', exact: true });
  const legend = dialog.locator('.item-overlay-legend');
  await expect(legend).toHaveCSS('display', 'inline-flex');
  await expect(legend).toHaveCSS('align-items', 'baseline');
  await expect(legend).toHaveCSS('flex-wrap', 'wrap');
  await expect(legend).toHaveCSS('gap', '5px');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await hideGraphControls(page);
}

async function checkViewport(width: number, scheme: 'light' | 'dark') {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
  try {
    await page.addInitScript(theme => localStorage.setItem('workbench.theme', theme), scheme);
    await serveBrowser(page);
    await itemDiffTab(page, 'Graph');
    await checkItemMarks(page);
    await checkComparisonLegend(page);
    await setItemDiffOverlay(page, false);
    await expect(page.locator('.full-graph .item-change-mark')).toHaveCount(0);
    await expect(page.locator('.full-graph-loading')).toHaveCount(0);
    const off = await settledCardGeometry(page);
    await setItemDiffOverlay(page, true);
    await checkItemMarks(page);
    await setItemDiffOverlay(page, false);
    await expect(page.locator('.full-graph-loading')).toHaveCount(0);
    await expect.poll(() => itemDiffCardGeometry(page)).toEqual(off);
    console.log(`PASS ${width}px ${scheme} labels, dashed outlines, text geometry and stable unmarked cards`);
  } finally {
    await page.close();
  }
}

async function branchFrom(page: Page, locator: Locator, proposal: string) {
  await locator.getByRole('button', { name: 'Start a branch for this item', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a branch for this item' });
  const name = dialog.getByRole('textbox', { name: 'New branch name' });
  await expect(name).toHaveValue(proposal);
  const held = dialog.locator('option', { hasText: heldBranch + ' (in use by Another editor)' });
  await expect(held).toHaveAttribute('disabled', '');
  await name.fill('bad..branch');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('not a valid branch name');
  await expect(name).toHaveValue('bad..branch');
  await name.fill(proposal);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => sh(repository, ['branch', '--show-current']).trim()).toBe(proposal);
}

async function comparisonNotice(page: Page, expected: string) {
  await revealGraphControls(page);
  await page.getByRole('button', { name: 'Unpublished comparison details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unpublished comparison', exact: true });
  await expect(dialog.locator('.item-overlay-status')).toContainText(expected);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await hideGraphControls(page);
}

async function branchAndPublish(page: Page) {
  sh(repository, ['branch', heldBranch]);
  await serveBrowser(page, true);
  await itemDiffTab(page, 'Graph');
  await comparisonNotice(page, 'Branch: ' + sh(repository, ['branch', '--show-current']).trim());
  await itemDiffTab(page, 'Catalog');
  await page
    .locator('.catalog-card', { hasText: 'Customer' })
    .getByRole('button', { name: /View details/ })
    .click();
  const details = page.locator('aside[aria-label="Definition details"]');
  await branchFrom(page, details, 'item/customer');
  await branchFrom(page, details.locator('.attribute-row', { hasText: 'email' }), 'item/email');
  await details
    .locator('.related-edges')
    .getByRole('button', { name: /purchases/ })
    .click();
  await branchFrom(page, details, 'item/purchases');
  await details.getByRole('button', { name: 'Close details', exact: true }).click();
  await itemDiffTab(page, 'Source');
  const editor = page.getByRole('textbox', { name: 'Definition source' });
  const response = page.waitForResponse(reply => reply.url().includes('/files/' + file) && reply.request().method() === 'PUT');
  await fillEditor(editor, (await editorValue(editor)).replace('A buyer.', 'An edited buyer.'));
  expect((await response).status()).toBe(200);
  await itemDiffTab(page, 'Graph');
  await expect(page.locator('.full-graph .item-change-mark').filter({ hasText: 'Not published: changed' })).toBeVisible();
  await comparisonNotice(page, 'The comparison now follows branch item/purchases.');
  await page.getByRole('button', { name: /^Source control/ }).click();
  await page.getByRole('button', { name: 'Stage all', exact: true }).click();
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Edit customer on an item branch');
  await page.getByRole('button', { name: 'Commit to item/purchases', exact: true }).click();
  await expect(page.locator('.scm')).toContainText('Committed');
  await itemDiffTab(page, 'Graph');
  await comparisonNotice(page, 'Branch item/purchases moved. The comparison used the updated branch.');
  await page.getByRole('button', { name: /^Source control/ }).click();
  const sync = await openSyncDialog(page);
  await sync.getByRole('button', { name: 'Publish to ' + primary }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish to ' + primary + '?' });
  const review = confirm.getByRole('region', { name: 'Publication changes' });
  await expect(review).toContainText('Comparison temporarily unavailable.');
  await expect(confirm.getByRole('button', { name: 'Publish to ' + primary })).toBeEnabled();
  await review.getByRole('button', { name: 'Try again' }).click();
  await expect(review).toContainText('An edited buyer.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Sync' }).getByRole('button', { name: 'Close' }).click();
  const branch = page.getByRole('combobox', { name: 'Branch', exact: true });
  await branch.selectOption(primary);
  await expect(branch).toHaveValue(primary);
  await itemDiffTab(page, 'Graph');
  await expectItemDiffOverlay(page, false);
  await comparisonNotice(page, 'The comparison now follows branch ' + primary + '.');
  await expect(page.locator('.full-graph .item-change-mark')).toHaveCount(0);
  expect(unexpectedPush).toEqual([]);
  console.log('PASS item branches, held names, overlay refresh and publication review with retry and no push');
}

try {
  const baseline = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await serveBrowser(baseline);
  await compareRecordedGraph(baseline);
  await baseline.close();
  await writeOverlayFixture(api);
  for (const scheme of ['light', 'dark'] as const) for (const width of [1440, 390]) await checkViewport(width, scheme);
  sh(repository, ['restore', '--', '.']);
  sh(repository, ['switch', primary]);
  const journey = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await branchAndPublish(journey);
  await journey.close();
  expect(errors).toEqual([]);
} finally {
  await browser.close();
  await api.stop();
  fixture.dispose();
}
