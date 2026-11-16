// Captures file actions, import refusal, Trash, and visible Git history. Usage: bun scripts/ui-review/file-states.ts OUTPUT.
// SW_BASE_URL selects Vite; every workspace and imported file is temporary.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { authViewports } from '../helpers/sign-in';
import { fileTab, showSidebar, showScreen } from '../helpers/screen-tour';
import { dialogsTourScreens } from '../helpers/dialogs-tour';
import { addProjectItem } from '../helpers/sidebar-menus';
import { capture, attempt, failure, watchCaptureErrors, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();

async function closeDialogs(page: Page) {
  for (let index = 0; index < 3; index++) {
    const dialog = page.locator('dialog[open]').last();
    if (!(await dialog.isVisible())) return;
    const close = dialog.getByRole('button', { name: /^(Cancel|Close|Back)$/ }).first();
    if (await close.isVisible()) await close.click();
    else await page.keyboard.press('Escape');
  }
}

async function fileActions(page: Page, identity: CaptureIdentity) {
  await fileTab('commerce-business.ossie.yaml', 'Overview')(page);
  await showSidebar(page);
  await attempt(page, identity, 'file-move', 'dialog', async () => {
    await showScreen(page, dialogsTourScreens('commerce-business.ossie.yaml')[0]);
  });
  await closeDialogs(page);
  await attempt(page, identity, 'trash', 'empty', async () => {
    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    await page.getByText('Nothing here yet', { exact: true }).waitFor();
  });
  await closeDialogs(page);
  await attempt(page, identity, 'trash', 'undo-toast', async () => {
    await showSidebar(page);
    await page.getByRole('button', { name: 'commerce-business.ossie.yaml', exact: true }).first().hover();
    await page.getByRole('button', { name: 'Delete commerce-business.ossie.yaml', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete commerce-business.ossie.yaml?', exact: true });
    if (await confirmation.isVisible()) {
      await capture(page, identity, 'file-delete', 'confirmation');
      await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    }
    await page.locator('.undo-toast').waitFor();
  });
  await attempt(page, identity, 'trash', 'populated', async () => {
    await showSidebar(page);
    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    await page.getByRole('dialog', { name: 'Trash', exact: true }).getByText('commerce-business.ossie.yaml', { exact: true }).waitFor();
  });
  await closeDialogs(page);
}

async function importAndHistory(page: Page, identity: CaptureIdentity) {
  await attempt(page, identity, 'import', 'refused-file', async () => {
    await (await addProjectItem(page, 'Import files')).click();
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'refused.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not a supported model') });
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog').last()).toBeVisible();
  });
  await closeDialogs(page);
  await fileTab('commerce.odcs.yaml', 'Contract')(page);
  await showSidebar(page);
  await page
    .getByRole('button', { name: /^Source control/ })
    .first()
    .click();
  await attempt(page, identity, 'source-control', 'history-list', async () => {
    await page.getByRole('region', { name: 'History', exact: true }).waitFor();
  });
  await attempt(page, identity, 'source-control', 'branch-menu', async () => {
    const branch = page.getByRole('combobox', { name: 'Branch', exact: true });
    await branch.focus();
    await branch.press('Space');
  });
}

try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of authViewports) {
      const api = await startIsolatedApi();
      await api.ws.loadExample('commerce');
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const identity = { output, mode: 'local', theme, width, height };
      watchCaptureErrors(page, identity);
      page.setDefaultTimeout(5000);
      try {
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(900);
        await fileActions(page, identity);
        await importAndHistory(page, identity);
      } catch (error) {
        failure(identity, 'file-states', 'viewport', error);
      } finally {
        await page.close();
        await api.stop();
      }
    }
  }
} finally {
  await browser.close();
}
