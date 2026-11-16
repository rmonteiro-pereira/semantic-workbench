// Captures local clone and monorepo stages. Usage: bun scripts/ui-review/clone-states.ts OUTPUT.
// SW_BASE_URL selects Vite. Waiting-state interception matches git-setup-browser-check.ts; remotes are temporary local repositories.
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { bareRepository } from '../../tests/helpers/git-fixtures';
import { openCloneDialog } from '../helpers/project-dialog-tour';
import { authViewports } from '../helpers/sign-in';
import { captureThemes, capture, attempt, watchCaptureErrors, failure } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const fixture = bareRepository('monorepo');
const browser = await chromium.launch();
try {
  for (const theme of captureThemes()) {
    for (const [width, height] of authViewports) {
      const api = await startIsolatedApi();
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(4000);
      const identity = { output, mode: 'local', theme, width, height };
      watchCaptureErrors(page, identity);
      let release = () => {};
      try {
        const ready = new Promise<void>(resolve => {
          release = resolve;
        });
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.route('**/api/events', async route => {
          await ready;
          await route.continue({ url: api.url + '/api/events' });
        });
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(800);
        await openCloneDialog(page);
        const dialog = page.getByRole('dialog', { name: 'Clone repository', exact: true });
        await capture(page, identity, 'clone-repository', 'empty');
        await dialog.getByLabel('Repository URL or path').fill(fixture.bare);
        await dialog.getByLabel('Folder in repository').fill('domains/sales');
        await capture(page, identity, 'clone-repository', 'filled');
        await expect(dialog).toContainText('Connecting to workspace updates…');
        await capture(page, identity, 'clone-repository', 'connecting-wait');
        await dialog.getByLabel('Folder in repository').fill('../outside');
        await expect(dialog).toContainText('..');
        await capture(page, identity, 'clone-repository', 'refused');
        await dialog.getByLabel('Folder in repository').fill('domains/sales');
        release();
        await page.unroute('**/api/events');
        await attempt(page, identity, 'clone-repository', 'one-folder-flow', async () => {
          await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
          await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 15000 });
          await capture(page, identity, 'clone-repository', 'cloned-folder-result');
          await dialog.getByRole('button', { name: 'Open project', exact: true }).click();
          await dialog.waitFor({ state: 'hidden', timeout: 5000 });
        });
        await attempt(page, identity, 'sidebar', 'several-projects-one-repository', async () => {
          await openCloneDialog(page);
          await dialog.getByLabel('Repository URL or path').fill(fixture.bare);
          await dialog.getByLabel('Folder in repository').fill('domains/finance');
          await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
          await expect(dialog.getByRole('status')).toContainText('Cloned.', { timeout: 15000 });
          await capture(page, identity, 'clone-repository', 'cloned-folder-result');
          await dialog.getByRole('button', { name: 'Open project', exact: true }).click();
          await dialog.waitFor({ state: 'hidden', timeout: 5000 });
          const open = page.getByRole('button', { name: 'Open workspace', exact: true });
          if (await open.isVisible()) await open.click();
        });
      } catch (error) {
        failure(identity, 'clone-repository', 'stages', error);
      } finally {
        release();
        await page.close();
        await api.stop();
      }
    }
  }
} finally {
  await browser.close();
  fixture.dispose();
}
