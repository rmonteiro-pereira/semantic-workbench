// Conversion captures use the real fixtures and save path; intercepted replies hold transient states and expose failures.
import { expect, type Page, type Route } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDraftValidators } from '../../../src/shared/validation/draft-validators';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT, MAPPING_TEXT } from '../../../tests/helpers/tessera-repository';
import type { IsolatedApi } from '../../helpers/isolated-api';
import { openFile } from '../../helpers/screen-tour';
import { openProjectMenuItem } from '../../helpers/project-dialog-tour';
import { appPage, attempt, capture, type CaptureSession, type Theme, type Viewport } from './session';

const ONTOLOGY = 'retail.ontology.yaml';
const MODEL = 'retail.semantic.yaml';
const STATES = ['loading', 'refused', 'review', 'converting', 'changed', 'error', 'done'] as const;
type State = (typeof STATES)[number];
const VIEWPORTS: Viewport[] = [
  [1440, 'light'],
  [1440, 'dark'],
  [390, 'light'],
  [390, 'dark'],
];
const DIALOG = 'dialog[open]';
const BASE_BUTTON = 'Convert to Ossie 0.3.0 draft';

async function seedProjects(api: IsolatedApi) {
  await loadDraftValidators();
  const files = [
    { path: ONTOLOGY, source: ONTOLOGY_TEXT },
    // The legacy status exercises the explicit draft-to-proposed change in the base preview.
    { path: MODEL, source: SEMANTIC_MODEL_TEXT.replace('"status": "approved"', '"status": "draft"') },
    { path: 'retail.mapping.yaml', source: MAPPING_TEXT },
  ];
  const retail = await api.ws.importBatch({ name: 'Retail', files }, LOCAL_READER);
  await api.ws.publish(retail.slug, LOCAL_READER);
  const draftFiles = ['retail.tessera.yaml', 'sales.ontology.yaml', 'sales.semantic.yaml', 'sales.mapping.yaml'].map(path => ({
    path,
    source: readFileSync(join('tests/fixtures/ossie-0.3', path), 'utf8'),
  }));
  const draft = await api.ws.importBatch({ name: 'Sales draft', files: draftFiles }, LOCAL_READER);
  await api.ws.publish(draft.slug, LOCAL_READER);
}

async function openValidation(page: Page, path: string) {
  await openFile(page, path);
  await page
    .locator('footer')
    .getByRole('button', { name: /^Validation details/ })
    .click();
  await page.getByRole('dialog', { name: 'Validation details', exact: true }).waitFor();
}

async function setViewport(page: Page, width: number, theme: Theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate(value => {
    localStorage.setItem('workbench.theme', value);
    document.documentElement.dataset.theme = value;
  }, theme);
  await page.waitForTimeout(250);
}

async function captureVariants(session: CaptureSession, page: Page, state: string, selector = DIALOG) {
  for (const [width, theme] of VIEWPORTS) {
    await setViewport(page, width, theme);
    if (state.endsWith('-review'))
      await page
        .locator('dialog[open]')
        .last()
        .locator('.dialog-body')
        .evaluate(element => {
          element.scrollTop = 0;
        });
    await capture(session, page, state, selector, theme);
    if (state.endsWith('-review')) {
      await recordDiffIndicators(session, page, state);
      await page
        .locator('dialog[open]')
        .last()
        .locator('.dialog-body')
        .evaluate(element => {
          element.scrollTop = element.scrollHeight;
        });
      await capture(session, page, `${state}-diff`, DIALOG, theme);
    }
  }
}

function failureBody(state: State, path: string) {
  if (state === 'refused')
    return {
      error: 'refused',
      findings: [{ severity: 'error', code: 'conversion-refused', document: path, path: '/', message: 'The definition cannot be converted. Resolve the findings before converting.' }],
    };
  if (state === 'changed') return { error: 'version-changed' };
  return { error: 'conversion-unavailable', message: 'Conversion temporarily unavailable.' };
}

async function interceptConversion(route: Route, state: State, path: string, held: Promise<void>) {
  if (state === 'converting') {
    await held;
    await route.fulfill({ status: 500, json: failureBody('error', path) });
    return;
  }
  if (state === 'done') {
    await route.fallback();
    return;
  }
  const statuses = { refused: 422, changed: 409, error: 500 };
  const status = statuses[state as keyof typeof statuses] ?? 500;
  await route.fulfill({ status, json: failureBody(state, path) });
}

async function waitForState(page: Page, state: State, base: boolean) {
  const dialog = page.getByRole('dialog').last();
  if (state === 'loading') await expect(dialog.getByText('Reviewing the conversion')).toBeVisible();
  if (state === 'review') await expect(dialog.locator('.convert-diff .cm-content').first()).toBeVisible();
  if (state === 'converting') await expect(dialog.getByRole('button', { name: 'Converting', exact: true })).toBeDisabled();
  if (state === 'done') await expect(dialog.getByText(/^Converted\./)).toBeVisible();
  if (state === 'changed') await expect(dialog.getByText(/^The file or the project changed/)).toBeVisible();
  if (state === 'error') await expect(dialog.getByRole('alert')).toHaveText('Conversion temporarily unavailable.');
  if (state === 'refused') {
    const message = base ? 'The file cannot be converted.' : 'The file cannot be converted yet. Fix these findings first.';
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
  }
}

async function recordDiffIndicators(session: CaptureSession, page: Page, state: string) {
  const indicators = await page.locator('.convert-diff').evaluate(root => {
    const selectors = ['.cm-changedLine', '.cm-insertedLine', '.cm-deletedLine', '.cm-deletedChunk', '.cm-insertedText', '.cm-deletedText'];
    return selectors.map(selector => {
      const elements = [...root.querySelectorAll(selector)];
      return {
        selector,
        count: elements.length,
        samples: elements.slice(0, 3).map(element => ({
          text: element.textContent?.slice(0, 120),
          label: element.getAttribute('aria-label'),
          role: element.getAttribute('role'),
          colour: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        })),
      };
    });
  });
  appendFileSync(join(session.output, 'diff-indicators.jsonl'), JSON.stringify({ state, width: page.viewportSize()!.width, indicators }) + '\n');
}

async function captureConversion(session: CaptureSession, api: IsolatedApi, state: State, base: boolean) {
  const page = await appPage(session, api, 1440);
  const held = Promise.withResolvers<void>();
  const path = base ? MODEL : ONTOLOGY;
  const prefix = base ? 'draft-base' : 'convert';
  try {
    await page.route('**/compile/convert', route => interceptConversion(route, state, path, held.promise));
    if (!base && (state === 'loading' || state === 'refused')) {
      await page.route('**/compile/check', async route => {
        if (state === 'loading') await held.promise;
        await route.fulfill({ status: 422, json: failureBody('refused', path) });
      });
    }
    await openValidation(page, path);
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: base ? BASE_BUTTON : 'Convert to standard', exact: true })
      .click();
    const submits = ['converting', 'done', 'changed', 'error'];
    if (base && state === 'refused') submits.push('refused');
    if (submits.includes(state)) {
      await page.getByRole('dialog').last().getByRole('checkbox').check();
      await page
        .getByRole('dialog')
        .last()
        .getByRole('button', { name: base ? BASE_BUTTON : 'Convert to standard', exact: true })
        .click();
    }
    await waitForState(page, state, base);
    const variants = state === 'review' || (!base && state === 'done');
    if (variants) await captureVariants(session, page, `${prefix}-${state}`);
    else await capture(session, page, `${prefix}-${state}`, DIALOG);
    if (!base && state === 'done') {
      await page.getByRole('dialog').last().getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('dialog', { name: 'Validation details', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await captureVariants(session, page, 'convert-editor', 'main');
    }
  } finally {
    held.resolve();
    await page.close();
  }
}

async function captureDraftLabels(session: CaptureSession, api: IsolatedApi) {
  const page = await appPage(session, api, 1440);
  try {
    await openValidation(page, MODEL);
    await expect(page.getByRole('button', { name: BASE_BUTTON, exact: true })).toBeVisible();
    await captureVariants(session, page, 'draft-validation-02');
    await page.keyboard.press('Escape');
    await openValidation(page, 'sales.ontology.yaml');
    await expect(page.locator('.validation-report')).toContainText('0 errors');
    await captureVariants(session, page, 'draft-validation-03');
    await page.keyboard.press('Escape');
    await setViewport(page, 1440, 'light');
    await openProjectMenuItem(page, 'retail.tessera.yaml', 'Export project…');
    await page.getByLabel('Files to export').selectOption('standard');
    await page.getByRole('button', { name: 'Review standard Ossie' }).click();
    await expect(page.getByRole('button', { name: 'Accept this report' })).toBeVisible();
    await expect(page.getByRole('dialog').last()).toContainText('Ossie 0.3.0 draft');
    await captureVariants(session, page, 'draft-compile-ready');
  } finally {
    await page.close();
  }
}

/** Captures standard conversion, draft-base conversion and the version labels through their ordinary entry points. */
export async function captureConvert(session: CaptureSession, api: IsolatedApi) {
  session.imageLimit = Math.min(session.imageLimit, 50);
  await seedProjects(api);
  await attempt(session, 'draft-labels', () => captureDraftLabels(session, api));
  for (const base of [false, true]) {
    for (const state of STATES) {
      const prefix = base ? 'draft-base' : 'convert';
      if (base && state === 'loading') {
        appendFileSync(
          join(session.output, 'missing.jsonl'),
          JSON.stringify({
            state: 'draft-base-loading',
            reason: 'BaseConvertView has no loading state. startBaseReview runs synchronously without an API request.',
          }) + '\n',
        );
        continue;
      }
      await attempt(session, `${prefix}-${state}`, () => captureConversion(session, api, state, base));
    }
  }
}
