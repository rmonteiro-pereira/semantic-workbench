// Captures empty workspaces, empty documents, imports, and trash. Usage: bun scripts/ui-review/empty-states.ts OUTPUT.
// SW_BASE_URL selects Vite; only temporary fixtures are changed.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { authViewports } from '../helpers/sign-in';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { fileTab, showSidebar } from '../helpers/screen-tour';
import { addProjectItem } from '../helpers/sidebar-menus';
import { capture, attempt, watchCaptureErrors, failure } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of authViewports) {
      const api = await startIsolatedApi();
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const identity = { output, mode: 'local', theme, width, height };
      watchCaptureErrors(page, identity);
      page.setDefaultTimeout(4000);
      try {
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(1000);
        await capture(page, identity, 'workspace', 'first-run-empty');
        await api.ws.createProject('Empty project');
        await page.reload();
        await page.waitForTimeout(600);
        await capture(page, identity, 'workspace', 'project-no-files');
        try {
          await api.ws.importBatch(
            {
              name: 'Empty models',
              files: [
                { path: 'empty.ontology.yaml', source: 'name: Empty ontology\nontology: []\n' },
                { path: 'empty.odcs.yaml', source: 'apiVersion: v3.1.0\nkind: DataContract\nid: empty-contract\nname: Empty contract\nversion: 1.0.0\nstatus: active\nschema: []\n' },
              ],
            },
            LOCAL_READER,
          );
          await page.reload();
          await page.waitForTimeout(600);
          for (const [file, tab, screen] of [
            ['empty.ontology.yaml', 'Graph', 'full-graph'],
            ['empty.ontology.yaml', 'Neighborhood', 'neighborhood'],
            ['empty.odcs.yaml', 'Graph', 'contract-lineage'],
          ]) {
            await attempt(page, identity, screen, 'empty', () => fileTab(file, tab)(page));
          }
        } catch (error) {
          for (const screen of ['full-graph', 'neighborhood', 'contract-lineage']) failure(identity, screen, 'empty', error);
          await api.ws.loadExample('commerce');
          await page.reload();
          await page.waitForTimeout(600);
        }
        await attempt(page, identity, 'import', 'empty', async () => {
          await (await addProjectItem(page, 'Import files')).click();
        });
        await attempt(page, identity, 'import', 'file-chosen', async () => {
          await page
            .locator('input[type=file]')
            .first()
            .setInputFiles({ name: 'sample.ontology.yaml', mimeType: 'text/yaml', buffer: Buffer.from('name: Sample\nontology: []\n') });
        });
        await page.keyboard.press('Escape');
        await attempt(page, identity, 'import', 'refused-file', async () => {
          await (await addProjectItem(page, 'Import files')).click();
          await page
            .locator('input[type=file]')
            .first()
            .setInputFiles({ name: 'not-a-model.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not a model') });
        });
        await page.keyboard.press('Escape');
        await attempt(page, identity, 'trash', 'empty', async () => {
          await showSidebar(page);
          await page.getByRole('button', { name: 'Trash', exact: true }).click();
        });
        await page.keyboard.press('Escape');
        await attempt(page, identity, 'file-delete', 'confirmation', async () => {
          await showSidebar(page);
          await page.getByRole('button', { name: 'commerce-business.ossie.yaml', exact: true }).first().hover();
          await page.getByRole('button', { name: 'Delete commerce-business.ossie.yaml', exact: true }).click();
        });
        await attempt(page, identity, 'trash', 'undo-toast', async () => {
          await page.getByRole('dialog', { name: 'Delete commerce-business.ossie.yaml?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
          await page.locator('.undo-toast').waitFor();
        });
        await attempt(page, identity, 'trash', 'populated', async () => {
          await showSidebar(page);
          await page.getByRole('button', { name: 'Trash', exact: true }).click();
        });
      } catch (error) {
        failure(identity, 'empty-workspace', 'stages', error);
      } finally {
        await page.close();
        await api.stop();
      }
    }
  }
} finally {
  await browser.close();
}
