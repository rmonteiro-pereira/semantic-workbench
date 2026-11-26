// The standard Ossie compile dialog: every check result from unavailable to error, the released state
// in three viewports, and the export dialog and validation panel that lead to it.
import type { Page } from '@playwright/test';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT, MAPPING_TEXT } from '../../../tests/helpers/tessera-repository';
import type { IsolatedApi } from '../../helpers/isolated-api';
import { fileTab } from '../../helpers/screen-tour';
import { openProjectMenuItem } from '../../helpers/project-dialog-tour';
import { appPage, attempt, capture, type CaptureSession, type Viewport } from './session';

const ONTOLOGY = 'retail.ontology.yaml';
const CHECK_STATES = ['unavailable', 'loading', 'nothing-to-do', 'refused', 'loss-1', 'loss-200', 'error'] as const;
type CheckState = (typeof CHECK_STATES)[number];
const RELEASED_VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
];

/** Imports and publishes a three-file project, then asks the real compile check for an answer to reshape. */
async function publishedCheckAnswer(api: IsolatedApi) {
  const files = [
    { path: ONTOLOGY, source: ONTOLOGY_TEXT },
    { path: 'retail.semantic.yaml', source: SEMANTIC_MODEL_TEXT },
    { path: 'retail.mapping.yaml', source: MAPPING_TEXT },
  ];
  const project = await api.ws.importBatch({ name: 'Retail', files }, LOCAL_READER);
  await api.ws.publish(project.slug, LOCAL_READER);
  const response = await api.handler(
    new Request(`http://localhost:5173/api/projects/${project.slug}/compile/check`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'X-SW-Request': '1', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ source: 'published' }),
    }),
  );
  return response.json();
}

// The check answer stays as the server's JSON, because each state rewrites a different part of it.
type CheckAnswer = Awaited<ReturnType<typeof publishedCheckAnswer>>;

function checkAnswerFor(template: CheckAnswer, state: CheckState) {
  const answer = structuredClone(template);
  if (state === 'loss-1' || state === 'loss-200') {
    const count = state === 'loss-1' ? 1 : 200;
    const lossAt = (index: number) => ({ ...template.report.losses[0], pointer: `/ontology/${index}/tessera_notes`, item: `Order${index}` });
    answer.report.losses = Array.from({ length: count }, (_, index) => lossAt(index));
    answer.report.counts = { tessera_notes: count };
  }
  if (state === 'nothing-to-do') {
    answer.result = 'ok';
    answer.report.losses = [];
    answer.report.counts = {};
    answer.files = answer.files.map((file: { treatment: string }) => ({ ...file, treatment: 'copied' }));
  }
  if (state === 'refused') {
    answer.result = 'refused';
    answer.findings = [{ severity: 'error', path: ONTOLOGY, message: 'The definition cannot be compiled.' }];
  }
  return answer;
}

async function openCompile(page: Page) {
  await openProjectMenuItem(page, ONTOLOGY, 'Export project…');
  await page.getByLabel('Files to export').selectOption('standard');
  await page.getByRole('button', { name: 'Review standard Ossie' }).click();
  await page.getByRole('dialog', { name: 'Standard Ossie for Retail' }).waitFor();
}

/** The 200-loss list is also taken in dark and at phone width, where long lists are most likely to break. */
async function captureLossVariants(session: CaptureSession, page: Page) {
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await capture(session, page, 'loss-200', 'dialog[open]', 'dark');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await page.setViewportSize({ width: 390, height: 900 });
  await capture(session, page, 'loss-200', 'dialog[open]');
}

async function captureCheckState(session: CaptureSession, api: IsolatedApi, template: CheckAnswer, state: CheckState) {
  const page = await appPage(session, api);
  // The loading state holds the answer until the image is taken.
  const held = Promise.withResolvers<void>();
  await page.route('**/compile/check', async route => {
    if (state === 'loading') await held.promise;
    if (state === 'unavailable') await route.fulfill({ status: 409, json: { error: 'not-published' } });
    else if (state === 'error') await route.fulfill({ status: 500, json: { error: 'Compile temporarily unavailable.' } });
    else await route.fulfill({ json: checkAnswerFor(template, state) });
  });
  await openCompile(page);
  if (state !== 'loading') await page.locator('.compile-placeholder').waitFor({ state: 'detached' });
  if (state === 'loss-1' || state === 'loss-200') await page.locator('.loss-group summary').first().click();
  await capture(session, page, state, 'dialog[open]');
  if (state === 'loss-200') await captureLossVariants(session, page);
  held.resolve();
  await page.close();
}

async function captureEntryPoints(session: CaptureSession, page: Page) {
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openProjectMenuItem(page, ONTOLOGY, 'Export project…');
  await capture(session, page, 'export-entry', 'dialog[open]');
  await page.keyboard.press('Escape');
  await fileTab(ONTOLOGY, 'Overview')(page);
  await page
    .locator('footer')
    .getByRole('button', { name: /^Validation details/ })
    .click();
  await capture(session, page, 'validation-entry', 'dialog[open]');
}

async function captureReleased(session: CaptureSession, api: IsolatedApi, [width, theme]: Viewport) {
  const page = await appPage(session, api, width, theme);
  await openCompile(page);
  await page.getByRole('button', { name: 'Accept this report' }).click();
  await page.getByText('Accepted. The standard files are ready to download.').waitFor();
  await capture(session, page, 'released', 'dialog[open]', theme);
  if (width === 1280 && theme === 'light') await captureEntryPoints(session, page);
  await page.close();
}

export async function captureCompile(session: CaptureSession, api: IsolatedApi) {
  const template = await publishedCheckAnswer(api);
  for (const state of CHECK_STATES) {
    await attempt(session, state, () => captureCheckState(session, api, template, state));
  }
  for (const viewport of RELEASED_VIEWPORTS) {
    await attempt(session, `released-${viewport[0]}-${viewport[1]}`, () => captureReleased(session, api, viewport));
  }
}
