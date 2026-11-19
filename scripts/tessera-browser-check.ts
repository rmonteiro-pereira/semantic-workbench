// Checks in the browser that an author can edit a Tessera ontology: the format is named, a misspelled property is reported with its fix, and nothing overlaps or is cut.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { editorValue, fillEditor } from './helpers/code-editor';
import { layoutProblems } from './helpers/layout-geometry';
import { clippedTextProblems } from './helpers/clipped-text';
import { LOCAL_READER } from '../src/server/projects/reader';

const FILE = 'retail.ontology.yaml';
const TESSERA_SOURCE = `tessera: 1
version: 0.2.0.dev0
name: Retail
ontology:
  - concept: Order
    type: EntityType
    description: A customer order.
  - concept: Customer
    type: EntityType
`;

// The workspace is a temporary data root, so the real workspace is never touched.
const api = await startIsolatedApi({ watch: false });
await api.ws.importBatch({ name: 'Retail', files: [{ path: FILE, source: TESSERA_SOURCE }] }, LOCAL_READER);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);

const footer = page.locator('footer');
const validationDialog = page.getByRole('dialog', { name: 'Validation details' });
const editor = page.getByRole('textbox', { name: 'Definition source' });

async function openValidationDetails() {
  await footer.getByRole('button', { name: /^Validation details/ }).click();
  await validationDialog.waitFor();
}

async function closeValidationDetails() {
  await validationDialog.getByRole('button', { name: 'Close' }).click();
}

async function expectCleanLayout(label: string) {
  expect(await layoutProblems(page), `${label}: layout`).toEqual([]);
  expect(await clippedTextProblems(page), `${label}: clipped text`).toEqual([]);
}

try {
  await page.goto(appUrl());
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: FILE, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
  await expect(editor).toBeVisible();

  // The valid document names its format and is not "not validated".
  await footer.getByText('Structure checked').waitFor();
  await openValidationDetails();
  await validationDialog.getByText('Tessera 1 on Ossie 0.2.0.dev0 · 0 errors · 0 warnings').waitFor();
  expect(await validationDialog.getByText('Not validated').count()).toBe(0);
  expect(await validationDialog.getByRole('button', { name: /Validate as/ }).count()).toBe(0);
  await expectCleanLayout('valid document');
  await closeValidationDetails();

  // Adding a note keeps the document valid.
  const withNote = TESSERA_SOURCE.replace('    description: A customer order.\n', '    description: A customer order.\n    tessera_notes: Ask finance before adding a Return concept.\n');
  await fillEditor(editor, withNote);
  await footer.getByText('Structure checked').waitFor();
  await openValidationDetails();
  await validationDialog.getByText('Tessera 1 on Ossie 0.2.0.dev0 · 0 errors · 0 warnings').waitFor();
  await closeValidationDetails();

  // A misspelled property is reported with its code, its place and how to fix it.
  await fillEditor(editor, withNote.replace('tessera_notes', 'tessera_note'));
  await footer.getByText('Validation failed').waitFor();
  await openValidationDetails();
  await validationDialog.getByText('Error · tessera-property').waitFor();
  await validationDialog.getByText(/tessera_note is not a Tessera property/).waitFor();
  await validationDialog.getByText('How to fix: Check the spelling against the registered properties').waitFor();
  await expectCleanLayout('misspelled property');
  await closeValidationDetails();

  // Fixing the spelling restores the label.
  await fillEditor(editor, withNote);
  await footer.getByText('Structure checked').waitFor();
  await openValidationDetails();
  await validationDialog.getByText('Tessera 1 on Ossie 0.2.0.dev0 · 0 errors · 0 warnings').waitFor();
  await expectCleanLayout('fixed document');
  await closeValidationDetails();
  expect(await editorValue(editor)).toBe(withNote);
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS the Tessera ontology is edited, reported and fixed in the browser');
} finally {
  await browser.close();
  await api.stop();
}
