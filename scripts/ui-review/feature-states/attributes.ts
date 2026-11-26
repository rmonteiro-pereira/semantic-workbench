// Attributes, governance and agent context in the definition details: the empty, long-text and error attribute
// states in four viewports, a deprecated and a read-only item, and a long agent context.
import type { Page } from '@playwright/test';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { ONTOLOGY_TEXT } from '../../../tests/helpers/tessera-repository';
import type { IsolatedApi } from '../../helpers/isolated-api';
import { openConcept } from './navigation';
import { appPage, attempt, capture, readOnlyServer, type CaptureSession, type Viewport } from './session';

const PROJECT = 'retail';
const ONTOLOGY = 'retail.ontology.yaml';
// Attributes are a Tessera 2 feature, so the shared fixture is lifted to that version.
const SOURCE = ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 2');
const LONG_NAME = 'a_very_long_attribute_name_without_a_break_'.repeat(3);
const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [360, 'light'],
  [1280, 'dark'],
  [360, 'dark'],
];

async function writeOntology(api: IsolatedApi, source: string) {
  const saved = api.ws.readFile(PROJECT, ONTOLOGY);
  await api.ws.saveFile(PROJECT, ONTOLOGY, { baseHash: saved.hash, source }, LOCAL_READER);
}

async function addLongAttribute(page: Page) {
  const attributes = page.locator('aside[aria-label="Definition details"]').getByRole('region', { name: 'Attributes' });
  await attributes.getByRole('button', { name: 'Add attribute' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an attribute to Customer' });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(LONG_NAME);
  await dialog.getByRole('button', { name: 'Add attribute', exact: true }).click();
  await attributes.getByText(LONG_NAME, { exact: true }).waitFor();
  return attributes;
}

/** Makes every file save fail, then tries to rename the attribute so the edit dialog shows its error. */
async function failAttributeSave(page: Page) {
  await page.route('**/api/projects/*/files/**', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 500, json: { error: 'Attribute could not be saved.' } });
    else await route.fallback();
  });
  const editDialog = page.getByRole('dialog', { name: `Edit attribute ${LONG_NAME}`, exact: true });
  await editDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('phone');
  await page.getByRole('button', { name: 'Save attribute', exact: true }).click();
  await editDialog.getByRole('alert').waitFor();
}

async function captureAttributeFlow(session: CaptureSession, api: IsolatedApi, [width, theme]: Viewport) {
  await writeOntology(api, SOURCE);
  const page = await appPage(session, api, width, theme);
  await openConcept(page, ONTOLOGY, 'Customer');
  if (width === 1280 && theme === 'light') await capture(session, page, 'attributes-empty', 'section[aria-label="Attributes"]');
  const attributes = await addLongAttribute(page);
  await capture(session, page, 'attributes-populated-long-text', 'section[aria-label="Attributes"]', theme);
  await attributes.getByRole('button', { name: `Edit ${LONG_NAME}`, exact: true }).click();
  await failAttributeSave(page);
  await capture(session, page, 'attribute-error', 'dialog[open]', theme);
  await page.close();
}

async function captureGovernance(session: CaptureSession, api: IsolatedApi, state: 'deprecated' | 'read-only') {
  const intercept = state === 'read-only' ? readOnlyServer(api) : undefined;
  const page = await appPage(session, api, 1280, 'light', intercept);
  await openConcept(page, ONTOLOGY, 'Customer');
  await capture(session, page, state, 'section[aria-label="Governance"]');
  await page.close();
}

async function captureAgentContext(session: CaptureSession, api: IsolatedApi) {
  const page = await appPage(session, api);
  await openConcept(page, ONTOLOGY, 'Customer');
  const context = page.getByRole('region', { name: 'Agent context', exact: true });
  await context
    .locator('label')
    .filter({ has: page.getByText('Instructions', { exact: true }) })
    .locator('textarea')
    .fill('Prefer the published customer definition. '.repeat(12));
  await context.getByRole('button', { name: 'Save agent context', exact: true }).click();
  await page.waitForTimeout(500);
  await capture(session, page, 'agent-context-populated-long-text', '.agent-context-fields');
  await page.close();
}

/** With onlyAgentContext set, only the agent context is captured, to retake that one image. */
export async function captureAttributes(session: CaptureSession, api: IsolatedApi, onlyAgentContext = false) {
  await api.ws.importBatch({ name: 'Retail', files: [{ path: ONTOLOGY, source: SOURCE }] }, LOCAL_READER);
  if (!onlyAgentContext) {
    for (const viewport of VIEWPORTS) {
      await attempt(session, `attributes-${viewport[0]}-${viewport[1]}`, () => captureAttributeFlow(session, api, viewport));
    }
  }
  await writeOntology(api, SOURCE.replace('\n  - concept: Customer\n', '\n  - concept: Customer\n    tessera_governance: {status: deprecated}\n'));
  if (!onlyAgentContext) {
    for (const state of ['deprecated', 'read-only'] as const) {
      await attempt(session, state, () => captureGovernance(session, api, state));
    }
  }
  await attempt(session, 'agent-context', () => captureAgentContext(session, api));
}
