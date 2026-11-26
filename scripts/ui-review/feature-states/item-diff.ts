// Unpublished item changes: the graph overlay in three viewports, one node per change kind, the branch control,
// the comparison dialog's empty, loading, error and long-name states, and the publication review.
import type { Page } from '@playwright/test';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { itemDiffBaselineWorkspace } from '../../../tests/helpers/item-diff-baseline';
import { startIsolatedApi, type IsolatedApi } from '../../helpers/isolated-api';
import { fileTab, showSidebar } from '../../helpers/screen-tour';
import { revealGraphControls } from '../../helpers/graph-options';
import { openConcept } from './navigation';
import { appPage, attempt, capture, realAnswer, type CaptureSession, type Viewport } from './session';

const ONTOLOGY = 'finance.ontology.yaml';
const LONG_NAME = 'A_very_long_definition_name_'.repeat(12);
const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
];
const COMPARISON_STATES = ['empty', 'loading', 'error', 'long-names'] as const;
type ComparisonState = (typeof COMPARISON_STATES)[number];

/** Renaming Retired to Invoice gives the saved file one added, one changed and one removed item. */
async function saveOneOfEachChange(api: IsolatedApi) {
  const original = api.ws.readFile('finance', ONTOLOGY);
  const source = original.source.replace('  - concept: Retired\n    type: EntityType', '  - concept: Invoice\n    type: EntityType');
  await api.ws.saveFile('finance', ONTOLOGY, { baseHash: original.hash, source }, LOCAL_READER);
}

/** Crops one changed node by marking it, because graph nodes have no stable selector of their own. */
async function captureChangedNode(session: CaptureSession, page: Page, kind: string) {
  await page
    .locator('.full-entity')
    .filter({ has: page.getByText(`Not published: ${kind}`, { exact: true }) })
    .first()
    .evaluate(element => element.setAttribute('data-capture-state', 'selected'));
  await capture(session, page, kind, '[data-capture-state=selected]');
  await page.locator('[data-capture-state=selected]').evaluate(element => element.removeAttribute('data-capture-state'));
}

async function captureOverlay(session: CaptureSession, api: IsolatedApi, [width, theme]: Viewport) {
  const page = await appPage(session, api, width, theme);
  await fileTab(ONTOLOGY, 'Graph')(page);
  await page.locator('.item-change-mark').first().waitFor();
  // The layout settles after the marks appear.
  await page.waitForTimeout(1200);
  await capture(session, page, 'overlay', '.full-graph', theme);
  if (width === 1280 && theme === 'light') {
    for (const kind of ['added', 'changed', 'removed']) await captureChangedNode(session, page, kind);
    await openConcept(page, ONTOLOGY, 'Customer');
    await page.getByRole('button', { name: 'Start a branch for this item', exact: true }).first().click();
    await capture(session, page, 'branch-control', 'dialog[open]');
  }
  await page.close();
}

function reshapeComparison(answer: { changes: { name: string }[]; counts: object; omitted: number; notCompared: unknown[] }, state: ComparisonState) {
  if (state === 'empty') {
    answer.changes = [];
    answer.counts = { added: 0, changed: 0, removed: 0 };
    answer.omitted = 0;
    answer.notCompared = [];
  }
  if (state === 'long-names') answer.changes = answer.changes.map(change => ({ ...change, name: LONG_NAME }));
  return answer;
}

async function waitForComparisonState(page: Page, state: ComparisonState) {
  const dialog = page.getByRole('dialog', { name: 'Unpublished comparison', exact: true });
  if (state === 'empty') await dialog.getByText('No unpublished item changes.', { exact: true }).first().waitFor();
  if (state === 'loading') await dialog.getByText('Comparing saved items.', { exact: true }).first().waitFor();
  if (state === 'error') await dialog.getByRole('alert').waitFor();
  if (state === 'long-names') await dialog.getByText(LONG_NAME, { exact: true }).first().waitFor();
}

async function captureComparison(session: CaptureSession, api: IsolatedApi, state: ComparisonState) {
  // The loading state holds the answer until the image is taken.
  const held = Promise.withResolvers<void>();
  const page = await appPage(session, api, 1280, 'light', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/item-diff')) return false;
    if (state === 'loading') await held.promise;
    if (state === 'error') {
      await route.fulfill({ status: 503, json: { error: 'Comparison temporarily unavailable.' } });
      return true;
    }
    await route.fulfill({ json: reshapeComparison(await realAnswer(api, url.pathname + url.search), state) });
    return true;
  });
  await fileTab(ONTOLOGY, 'Graph')(page);
  await revealGraphControls(page);
  await page.getByRole('button', { name: 'Unpublished comparison details', exact: true }).click();
  await waitForComparisonState(page, state);
  await capture(session, page, `comparison-${state}`, 'dialog[open]');
  held.resolve();
  await page.close();
}

/** Reports the published snapshot one commit behind, so the Publish review has something to show. */
async function capturePublicationReview(session: CaptureSession, api: IsolatedApi) {
  const page = await appPage(session, api, 1280, 'light', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/git/status')) return false;
    const answer = await realAnswer(api, path);
    if (answer.published && answer.published.state !== 'none') answer.published.ahead = 1;
    await route.fulfill({ json: answer });
    return true;
  });
  await fileTab(ONTOLOGY, 'Graph')(page);
  await showSidebar(page);
  await page.getByRole('button', { name: /^Source control/ }).click();
  await page.getByRole('region', { name: 'Source Control' }).getByLabel('Published snapshot').getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('region', { name: 'Publication changes', exact: true }).waitFor();
  await capture(session, page, 'publication-review', 'dialog[open]');
  await page.close();
}

export async function captureItemDiff(session: CaptureSession) {
  const fixture = await itemDiffBaselineWorkspace();
  fixture.ws.close();
  const api = await startIsolatedApi({ root: fixture.root, watch: false });
  try {
    await saveOneOfEachChange(api);
    for (const viewport of VIEWPORTS) {
      await attempt(session, `overlay-${viewport[0]}-${viewport[1]}`, () => captureOverlay(session, api, viewport));
    }
    for (const state of COMPARISON_STATES) {
      await attempt(session, `comparison-${state}`, () => captureComparison(session, api, state));
    }
    await attempt(session, 'publication-review', () => capturePublicationReview(session, api));
  } finally {
    await api.stop();
  }
}
