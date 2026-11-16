// Captures fixture personas and passive authentication pages. Usage: bun scripts/ui-review/server-pages.ts OUTPUT_ROOT.
// Uses built static assets, a temporary server fixture, and a loopback mock provider; no external identity service.
import { chromium } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from '../auth-environment';
import { authViewports, signIn } from '../helpers/sign-in';
import { fileTab, showSidebar } from '../helpers/screen-tour';
import { withCleanup } from '../helpers/processes';
import { capture, attempt, failure, type CaptureIdentity } from './capture-records';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
const output = root + '/screenshots/server-personas';
mkdirSync(output, { recursive: true });
const url = `http://127.0.0.1:${freeAuthPort()}`;
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 0, redirectUris: [url + '/auth/callback'], postLogoutRedirectUris: [url + '/auth/signed-out'] });
const api = await startAuthApi(url, { ...mock, kind: 'entra' });
const browser = await chromium.launch();
const target = { url, issuer: mock.endpointBase, kind: 'entra' as const };

async function personas() {
  for (const theme of ['light', 'dark']) {
    for (const user of ['alice', 'bob', 'carol', 'erin', 'gina'] as const) {
      const context = await browser.newContext({ colorScheme: theme as 'light' | 'dark' });
      await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      try {
        await signIn(page, target, user);
        const widths =
          theme === 'dark'
            ? [[1440, 900]]
            : [
                [1440, 900],
                [390, 844],
              ];
        for (const [width, height] of widths) {
          await page.setViewportSize({ width, height });
          const identity: CaptureIdentity = { output, mode: 'server', theme, user, width, height };
          if (user === 'erin' || user === 'gina') {
            await capture(page, identity, 'no-access', 'landing');
            for (const state of ['avatar-menu', 'contract', 'source-control', 'admin']) failure(identity, state, 'refused', new Error('No-access page replaces workspace for this fixture identity'));
            continue;
          }
          await page.goto(url);
          await page.waitForTimeout(1000);
          await capture(page, identity, 'catalog', 'landing');
          await attempt(page, identity, 'header', 'avatar-menu', async () => {
            const close = page.getByRole('button', { name: 'Close workspace drawer', exact: true });
            if (await close.isVisible()) await close.click();
            await page.getByRole('button', { name: 'Person menu', exact: true }).click();
          });
          await page.keyboard.press('Escape');
          await attempt(page, identity, 'contract', 'opened', async () => {
            const names = await page.locator('.workspace-sidebar button.document span').allTextContents();
            const contract = names.find(name => name.includes('odcs'));
            if (!contract) throw new Error('Fixture exposes no ODCS contract');
            await fileTab(contract, 'Contract')(page);
          });
          await attempt(page, identity, 'source-control', 'opened', async () => {
            await showSidebar(page);
            await page
              .getByRole('button', { name: /Source control/ })
              .first()
              .click();
          });
          await attempt(page, identity, 'admin', 'refused', async () => {
            await page.goto(url + '/#/admin/grants');
            await page.waitForTimeout(800);
            console.log('ADMIN_VISIBILITY', user, width, await page.locator('.admin-page').count(), await page.getByRole('button', { name: 'Admin', exact: true }).count());
          });
        }
      } catch (error) {
        console.log('PERSONA_FAILURE', user, theme, String(error));
        appendFileSync(`${output}/failures.jsonl`, JSON.stringify({ user, theme, error: String(error) }) + '\n');
      } finally {
        await context.close();
      }
    }
  }
}

async function authPages() {
  const output = root + '/screenshots/auth-pages';
  mkdirSync(output, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    for (const [width, height] of authViewports) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const identity = { output, mode: 'auth-page', theme, width, height };
      for (const [screen, path] of [
        ['sign-in', '/auth/login'],
        ['signed-out', '/auth/signed-out'],
        ['sign-in-error', '/auth/callback?error=access_denied'],
      ]) {
        await attempt(page, identity, screen, 'page', async () => {
          await page.goto(url + path);
          await page.waitForTimeout(300);
          console.log('AUTH_PAGE', screen, page.url(), await page.locator('h1').allTextContents());
        });
      }
      await attempt(page, identity, 'mock-provider', 'login', async () => {
        await page.goto(url + '/');
        await page.getByRole('button', { name: 'Alice Andrade', exact: true }).waitFor();
      });
      await attempt(page, identity, 'no-access', 'page', async () => {
        await page.getByRole('button', { name: 'Erin Esteves', exact: true }).click();
        await page.getByRole('heading', { name: 'No access', exact: true }).waitFor();
      });
      await context.close();
    }
  }
}

await withCleanup(
  async () => {
    await browser.close();
    await api.stop();
    await mock.stop();
  },
  async () => {
    await personas();
    await authPages();
  },
);
