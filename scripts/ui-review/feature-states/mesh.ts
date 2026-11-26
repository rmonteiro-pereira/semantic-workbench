// Imports and the ontology mesh: the part picker, the Imports section and its editor, the disclosure notice,
// the Mesh view and Used by in six viewports, and the empty and error states.
import type { Page } from '@playwright/test';
import { meshWorkspace } from '../../../tests/helpers/mesh-workspace';
import { startIsolatedApi, type IsolatedApi } from '../../helpers/isolated-api';
import { fileTab, showSidebar } from '../../helpers/screen-tour';
import { openProjectConcept } from './navigation';
import { appPage, attempt, capture, type CaptureSession, type Viewport } from './session';

const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [768, 'light'],
  [390, 'light'],
  [1280, 'dark'],
  [768, 'dark'],
  [390, 'dark'],
];
const SECTION_STATES = ['imports-error', 'import-editor-error', 'imports-populated'] as const;
type SectionState = (typeof SECTION_STATES)[number];

function importsSection(page: Page) {
  return page.getByRole('region', { name: 'Imports', exact: true });
}

/** Fills the import editor with the finance ontology under the alias fin, picking Invoice. */
async function fillImport(page: Page) {
  const imports = importsSection(page);
  await imports.getByRole('radio', { name: /finance/ }).check();
  await imports.getByLabel('Alias', { exact: true }).fill('fin');
  await imports.getByRole('checkbox', { name: 'Invoice', exact: true }).check();
}

async function openMeshView(page: Page) {
  await showSidebar(page);
  await page.getByRole('button', { name: 'Mesh', exact: true }).click();
}

async function captureViewport(session: CaptureSession, api: IsolatedApi, [width, theme]: Viewport) {
  const desktopLight = width === 1280 && theme === 'light';
  const page = await appPage(session, api, width, theme);
  await fileTab('private/customer.yaml', 'Source')(page);
  if (desktopLight) await capture(session, page, 'part-picker', '.mesh-unit-files');
  await openProjectConcept(page, 'retail', 'ontology.yaml', 'Order');
  if (desktopLight) await capture(session, page, 'imports-empty', '.mesh-imports');
  await importsSection(page).getByRole('button', { name: 'Add import', exact: true }).click();
  await fillImport(page);
  await capture(session, page, 'import-editor-populated', '.mesh-imports', theme);
  if (desktopLight) await capture(session, page, 'disclosure', '.mesh-disclosure');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await openMeshView(page);
  const dialog = page.getByRole('dialog', { name: 'Ontology mesh' });
  await dialog.getByRole('button', { name: 'finance', exact: true }).click();
  await dialog.getByRole('button', { name: 'Used by', exact: true }).click();
  await capture(session, page, 'mesh-populated', 'dialog[open]', theme);
  if (desktopLight) await capture(session, page, 'used-by-empty', 'section[aria-label="Used by"]');
  await page.close();
}

async function captureMeshAnswer(session: CaptureSession, api: IsolatedApi, state: 'error' | 'empty') {
  const page = await appPage(session, api);
  await page.route('**/api/mesh', route => route.fulfill({ status: state === 'error' ? 500 : 200, json: { projects: [], links: [] } }));
  await openMeshView(page);
  await page.waitForTimeout(400);
  await capture(session, page, `mesh-${state}`, 'dialog[open]');
  await page.close();
}

async function failRequestsFor(page: Page, state: SectionState) {
  if (state === 'imports-error') await page.route('**/api/projects/*/dependencies', route => route.fulfill({ status: 500, json: {} }));
  if (state === 'import-editor-error') await page.route('**/api/mesh/providers', route => route.fulfill({ status: 500, json: {} }));
}

async function captureSectionState(session: CaptureSession, api: IsolatedApi, state: SectionState) {
  const page = await appPage(session, api);
  await failRequestsFor(page, state);
  await openProjectConcept(page, 'retail', 'ontology.yaml', 'Order');
  const section = importsSection(page);
  if (state !== 'imports-error') await section.getByRole('button', { name: 'Add import', exact: true }).click();
  if (state === 'imports-populated') {
    await fillImport(page);
    await section.getByRole('button', { name: 'Save import', exact: true }).click();
    await section.getByRole('button', { name: 'Edit import fin', exact: true }).waitFor();
  } else {
    await section.getByRole('alert').waitFor();
  }
  await capture(session, page, state, 'section[aria-label="Imports"]');
  await page.close();
}

export async function captureMesh(session: CaptureSession) {
  const fixture = await meshWorkspace('separate');
  fixture.ws.close();
  const api = await startIsolatedApi({ root: fixture.fixture.root, watch: false });
  try {
    for (const viewport of VIEWPORTS) {
      await attempt(session, `mesh-${viewport[0]}-${viewport[1]}`, () => captureViewport(session, api, viewport));
    }
    for (const state of ['error', 'empty'] as const) {
      await attempt(session, `mesh-${state}`, () => captureMeshAnswer(session, api, state));
    }
    for (const state of SECTION_STATES) {
      await attempt(session, state, () => captureSectionState(session, api, state));
    }
  } finally {
    await api.stop();
  }
}
