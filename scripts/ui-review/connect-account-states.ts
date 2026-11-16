import { tmpdir } from 'node:os';
// Captures account connection prompts and the passive connection-error page. Usage: bun scripts/ui-review/connect-account-states.ts OUTPUT.
// Uses the existing credential Git server fixture, loopback mock identity, and a temporary DATA_DIR; no external service.
import { chromium } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startCredentialGitServer } from '../../tests/auth/credential-git-server';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from '../auth-environment';
import { authViewports, signIn } from '../helpers/sign-in';
import { showSidebar } from '../helpers/screen-tour';
import { runSyncAction } from '../helpers/sync-dialog';
import { capture, attempt, watchCaptureErrors } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'sw-capture-connect-'));
process.env.DATA_DIR = directory;
const url = `http://127.0.0.1:${freeAuthPort()}`;
const app = { clientId: 'sw-capture-github', clientSecret: crypto.randomUUID(), redirectUri: url + '/auth/github/callback' };
const github = startCredentialGitServer(join(directory, 'github'), async () => null, app);
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 0, redirectUris: [url + '/auth/callback'] });
const api = await startAuthApi(
  url,
  { ...mock, kind: 'entra' },
  {
    env: { SW_GITHUB_HOST: github.host, SW_GITHUB_CLIENT_ID: app.clientId, SW_GITHUB_CLIENT_SECRET: app.clientSecret },
    prepare: root => {
      const path = join(root, 'admin', 'settings.json');
      const settings = JSON.parse(readFileSync(path, 'utf8'));
      settings.remote = { ...settings.remote, allowedHosts: [github.host] };
      writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
      const added = Bun.spawnSync(['git', 'remote', 'add', 'origin', github.repository('team/metrics.git')], { cwd: join(root, 'projects', 'sales-metrics') });
      if (added.exitCode) throw new Error('Could not attach the local credential Git fixture');
    },
  },
);
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme: theme });
    await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await signIn(page, { url, issuer: mock.endpointBase, kind: 'entra' }, 'alice');
    const switched = await page.request.post(url + '/api/projects/sales-metrics/git/switch', {
      headers: { Origin: url, 'X-SW-Request': '1' },
      data: { branch: 'capture-account-' + theme, create: true },
    });
    if (!switched.ok()) throw new Error(`Temporary branch refused: ${switched.status()}`);
    for (const [width, height] of authViewports) {
      await page.setViewportSize({ width, height });
      const identity = { output, mode: 'server', theme, width, height, user: 'alice' };
      watchCaptureErrors(page, identity);
      await page.goto(url);
      await page.waitForTimeout(600);
      await attempt(page, identity, 'connected-accounts', 'prompt', async () => {
        await page.getByRole('button', { name: 'Person menu', exact: true }).click();
        await page.getByRole('menuitem', { name: /^Connected accounts/ }).click();
        await page.getByRole('dialog', { name: 'Connected accounts', exact: true }).waitFor();
      });
      await page.keyboard.press('Escape');
      await attempt(page, identity, 'connect-account', 'push-prompt', async () => {
        await showSidebar(page);
        const project = page.getByRole('treeitem', { name: 'sales-metrics', exact: true });
        if ((await project.getAttribute('aria-expanded')) === 'false') await project.getByRole('button', { name: 'sales-metrics', exact: true }).click();
        await project.locator('button.document').first().click();
        await showSidebar(page);
        await page
          .getByRole('button', { name: /^Source control/ })
          .first()
          .click();
        await runSyncAction(page, 'Publish branch');
        await page.getByRole('alert').filter({ hasText: 'Connect your GitHub account' }).waitFor();
      });
      await attempt(page, { ...identity, mode: 'auth-page' }, 'connect-failed', 'page', async () => {
        await page.goto(url + '/auth/github/callback');
        await page.getByRole('heading', { name: 'GitHub not connected', exact: true }).waitFor();
      });
      await capture(page, { ...identity, mode: 'auth-page' }, 'connect-error', 'resting');
    }
    await context.close();
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
  await github.stop();
  rmSync(directory, { recursive: true, force: true });
}
