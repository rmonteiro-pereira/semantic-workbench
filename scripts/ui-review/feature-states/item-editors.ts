// Untouched item editors use the same example definitions and entry points as the browser checks.
import type { Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { ONTOLOGY_TEXT } from '../../../tests/helpers/tessera-repository';
import type { IsolatedApi } from '../../helpers/isolated-api';
import { openProjectFileTab } from '../../helpers/screen-tour';
import { openProjectConcept } from './navigation';
import { appPage, attempt, capture, type CaptureSession, type Viewport } from './session';

const VIEWPORTS: Viewport[] = [
  [1440, 'light'],
  [390, 'light'],
  [1440, 'dark'],
  [390, 'dark'],
];
const STATES = ['concept-editor', 'metric-editor', 'field-editor', 'attribute-dialog'] as const;
type EditorState = (typeof STATES)[number];

async function openEditor(page: Page, state: EditorState) {
  if (state === 'attribute-dialog') {
    await openProjectConcept(page, 'Retail', 'retail.ontology.yaml', 'Customer');
    await page.getByRole('region', { name: 'Attributes', exact: true }).getByRole('button', { name: 'Add attribute', exact: true }).click();
    return;
  }
  if (state === 'metric-editor') {
    await openProjectFileTab(page, 'Shopping center administration', 'mall.semantic.yaml', 'Metrics');
    await page.getByRole('button', { name: 'Find a metric' }).or(page.getByLabel('Find a metric')).fill('Total GLA');
    await page.getByRole('button', { name: 'Total GLA: explain', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Total GLA', exact: true }).click();
    return;
  }
  const file = state === 'concept-editor' ? 'commerce-business.ossie.yaml' : 'commerce.odcs.yaml';
  const item = state === 'concept-editor' ? 'Customer' : 'customers';
  await openProjectFileTab(page, 'Commerce workspace', file, 'Catalog');
  await page.getByRole('button', { name: `Edit ${item}`, exact: true }).click();
  if (state === 'field-editor') {
    await page.getByRole('dialog', { name: 'Edit customers', exact: true }).getByRole('region', { name: 'Properties' }).getByRole('button', { name: 'Edit email' }).click();
  }
}

async function recordInputs(session: CaptureSession, page: Page, state: EditorState, [width, theme]: Viewport) {
  const inputs = await page.locator('dialog[open]:last-of-type .workbench-dialog').evaluate(root => {
    return [...root.querySelectorAll('input, textarea, select')].map(element => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        name: element.getAttribute('name'),
        label: element.getAttribute('aria-label') ?? element.closest('label')?.textContent?.trim(),
        size: [bounds.width, bounds.height],
        border: style.border,
        background: style.backgroundColor,
        padding: style.padding,
      };
    });
  });
  appendFileSync(join(session.output, 'editor-inputs.jsonl'), JSON.stringify({ file: `${state}-${theme}-${width}.png`, inputs }) + '\n');
}

async function captureEditor(session: CaptureSession, api: IsolatedApi, state: EditorState, viewport: Viewport) {
  const [width, theme] = viewport;
  const page = await appPage(session, api, width, theme);
  try {
    await openEditor(page, state);
    const panel = page.locator('dialog[open]:last-of-type .workbench-dialog');
    await panel.waitFor();
    await panel.evaluate(root => {
      for (const element of [root, ...root.querySelectorAll('*')]) element.scrollTop = 0;
    });
    await capture(session, page, state, 'dialog[open]', theme);
    await recordInputs(session, page, state, viewport);
  } finally {
    await page.close();
  }
}

/** Captures the untouched concept, metric, contract property and attribute editors in both themes and widths. */
export async function captureItemEditors(session: CaptureSession, api: IsolatedApi) {
  await api.ws.loadExample('commerce');
  await api.ws.loadExample('mall');
  await api.ws.importBatch({ name: 'Retail', files: [{ path: 'retail.ontology.yaml', source: ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 2') }] }, LOCAL_READER);
  for (const viewport of VIEWPORTS) {
    for (const state of STATES) {
      if (session.onlyStates && !session.onlyStates.has(state)) continue;
      await attempt(session, `${state}-${viewport[1]}-${viewport[0]}`, () => captureEditor(session, api, state, viewport));
    }
  }
}
