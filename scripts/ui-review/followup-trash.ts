// Captures one UI deletion per fresh temporary workspace. Usage: bun scripts/ui-review/followup-trash.ts OUTPUT_ROOT.
// SW_FOLLOWUP_WIDTH optionally selects one width. SW_BASE_URL defaults to port 5190. The API binds checked port 5192; every state has its own DATA_DIR and context.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { fileTab, showSidebar } from '../helpers/screen-tour';
import { withCleanup } from '../helpers/processes';
import { freshCapture, followupViews, type State } from './followup-capture';
import { fixtureAtPort } from './followup-ports';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
process.env.DATA_DIR = mkdtempSync('/tmp/sw-followup-trash-driver-');
const browser = await chromium.launch();

async function removeFile(page: Page) {
  await fileTab('keep.ontology.yaml', 'Overview')(page);
  await showSidebar(page);
  const row = page.getByRole('treeitem', { name: 'Scratch', exact: true });
  await row.getByRole('button', { name: 'delete.ontology.yaml', exact: true }).hover();
  await row.getByRole('button', { name: 'Delete delete.ontology.yaml', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete delete.ontology.yaml?', exact: true });
  if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.undo-toast')).toContainText('Deleted delete.ontology.yaml');
}

async function openTrash(page: Page) {
  await page.locator('.undo-toast').waitFor({ state: 'hidden', timeout: 15000 });
  await showSidebar(page);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('dialog', { name: 'Trash', exact: true }).waitFor();
}

function trashState(name: string): State {
  return {
    screen: 'trash',
    state: name,
    action: async (page, record) => {
      if (name === 'empty') await fileTab('keep.ontology.yaml', 'Overview')(page);
      else await removeFile(page);
      if (name === 'undo-toast') return;
      await openTrash(page);
      if (name === 'row-actions') {
        const row = page.getByRole('dialog', { name: 'Trash', exact: true }).locator('li').filter({ hasText: 'delete.ontology.yaml' });
        record('inline-row-actions', await row.getByRole('button').allTextContents());
        await row.getByRole('button', { name: 'Delete permanently', exact: true }).click();
      }
    },
    check: async page => {
      if (name === 'undo-toast') {
        await expect(page.locator('.undo-toast')).toContainText('Deleted delete.ontology.yaml');
        return { toast: await page.locator('.undo-toast').innerText(), selected_file: await page.locator('.workspace-title h1').innerText() };
      }
      const dialog = page.getByRole('dialog', { name: 'Trash', exact: true });
      if (name === 'empty') {
        await expect(dialog).toContainText('Nothing here yet');
        return { empty: true, text: await dialog.innerText() };
      }
      const row = dialog.locator('li').filter({ hasText: 'delete.ontology.yaml' });
      await expect(row).toHaveCount(1);
      if (name === 'row-actions') await expect(row.getByRole('button', { name: 'Yes, delete', exact: true })).toBeVisible();
      else await expect(row.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
      return { selected_project: 'Scratch', row: await row.innerText(), actions: await row.getByRole('button').allTextContents() };
    },
  };
}

await withCleanup(
  () => browser.close(),
  async () => {
    for (const view of followupViews) {
      if (process.env.SW_FOLLOWUP_WIDTH && view.width !== Number(process.env.SW_FOLLOWUP_WIDTH)) continue;
      for (const name of ['undo-toast', 'populated', 'row-actions', 'empty']) {
        const data = mkdtempSync('/tmp/sw-followup-trash-');
        process.env.DATA_DIR = data;
        const api = await fixtureAtPort(5192, () => startIsolatedApi({ root: data }));
        try {
          const source = 'name: Scratch\nontology:\n  - concept: Scratch\n    type: EntityType\n';
          await api.ws.importBatch(
            {
              name: 'Scratch',
              files: [
                { path: 'keep.ontology.yaml', source },
                { path: 'delete.ontology.yaml', source: source.replaceAll('Scratch', 'Discard') },
              ],
            },
            LOCAL_READER,
          );
          await freshCapture(browser, root, view, trashState(name), async page => {
            await routeApi(page, api);
            await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
            await page.locator('.workspace-header').waitFor();
          });
        } finally {
          await api.stop();
        }
      }
    }
  },
);
