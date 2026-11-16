// Captures fresh persona access surfaces, connected GitHub, and scoped file move. Usage: bun scripts/ui-review/followup-server.ts OUTPUT_ROOT.
// SW_FOLLOWUP_ONLY filters screen/state names. Mock provider, application, and Git fixture bind checked ports 5194, 5193, and 5195; all data is temporary.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { startCredentialGitServer } from '../../tests/auth/credential-git-server';
import { startAuthApi } from '../auth-environment';
import { signIn } from '../helpers/sign-in';
import { showSidebar } from '../helpers/screen-tour';
import { openSettings } from '../helpers/sidebar-menus';
import { withCleanup } from '../helpers/processes';
import { freshCapture, followupViews, type State } from './followup-capture';
import { assertFreePort, fixtureAtPort } from './followup-ports';

const root = process.argv[2];
if (!root) throw new Error('Expected OUTPUT_ROOT');
const directory = mkdtempSync('/tmp/sw-followup-server-');
process.env.DATA_DIR = directory;
const url = 'http://127.0.0.1:5193';
assertFreePort(5193);
assertFreePort(5194);
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 5194, redirectUris: [url + '/auth/callback'] });
const app = { clientId: 'sw-followup-github', clientSecret: crypto.randomUUID(), redirectUri: url + '/auth/github/callback' };
const tokens = new Map<string, string>();
const github = await fixtureAtPort(5195, () => startCredentialGitServer(join(directory, 'github'), async (_username, password) => tokens.get(password) ?? null, app));
const api = await startAuthApi(
  url,
  { ...mock, kind: 'entra' },
  {
    env: { SW_GITHUB_HOST: github.host, SW_GITHUB_CLIENT_ID: app.clientId, SW_GITHUB_CLIENT_SECRET: app.clientSecret },
    prepare: data => {
      const path = join(data, 'admin/settings.json');
      const settings = JSON.parse(readFileSync(path, 'utf8'));
      settings.remote = { ...settings.remote, allowedHosts: [github.host] };
      writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
    },
  },
);
const browser = await chromium.launch();
const target = { url, issuer: mock.endpointBase, kind: 'entra' as const };

async function closeDrawer(page: Page) {
  const close = page.getByRole('button', { name: 'Close workspace drawer', exact: true });
  if (await close.isVisible()) await close.click();
}

function personaStates(user: string): State[] {
  const states: State[] = [
    {
      screen: user + '-admin',
      state: 'direct-address',
      action: async page => {
        await page.goto(url + '/#/admin/grants');
        await page.waitForTimeout(700);
      },
      check: async page => {
        expect(new URL(page.url()).hash).toBe('#/admin/grants');
        const admin = page.locator('.admin-page');
        const text = await page.locator('main').allTextContents();
        return { address: '/#/admin/grants', admin_page: await admin.count(), admin_visible: await admin.isVisible(), text };
      },
    },
  ];
  if (user === 'bob') return states;
  states.push({
    screen: user + '-settings',
    state: 'panel-open',
    action: async page => {
      await openSettings(page);
    },
    check: async page => {
      const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
      await expect(panel).toBeVisible();
      return { panel_open: true, admin_entries: await panel.getByRole('button', { name: 'Admin', exact: true }).count(), text: await panel.innerText() };
    },
  });
  states.push({
    screen: user + '-avatar',
    state: 'menu-open',
    action: async page => {
      await closeDrawer(page);
      await page.getByRole('button', { name: 'Person menu', exact: true }).click();
    },
    check: async page => {
      const menu = page.getByRole('menu').filter({ hasText: /Alice|Carol/ });
      await expect(menu).toBeVisible();
      return { menu_open: true, text: await menu.innerText() };
    },
  });
  return states;
}

const adminStates: State[] = [
  {
    screen: 'admin-connected-accounts',
    state: 'connected-github',
    action: async page => {
      await closeDrawer(page);
      await page.getByRole('button', { name: 'Person menu', exact: true }).click();
      await page.getByRole('menuitem', { name: /^Connected accounts/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Connected accounts', exact: true });
      await expect(dialog).toContainText('Not connected.');
      const token = 'gho_followup_' + crypto.randomUUID().replaceAll('-', '');
      tokens.set(token, 'dave');
      github.consentAs(token);
      await dialog.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
      await page.getByRole('button', { name: 'Person menu', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Person menu', exact: true }).click();
      await page.getByRole('menuitem', { name: /^Connected accounts/ }).click();
      await expect(page.getByRole('dialog', { name: 'Connected accounts', exact: true })).toContainText('Connected for this session.');
    },
    check: async page => {
      const dialog = page.getByRole('dialog', { name: 'Connected accounts', exact: true });
      await expect(dialog).toContainText('Connected for this session.');
      await expect(dialog.getByRole('button', { name: 'Connect GitHub', exact: true })).toHaveCount(0);
      return { connected: true, connect_buttons: await dialog.getByRole('button', { name: 'Connect GitHub', exact: true }).count(), text: await dialog.innerText() };
    },
  },
  {
    screen: 'admin-file-move',
    state: 'dialog-open',
    action: async page => {
      const response = await page.request.get(url + '/api/projects');
      expect(response.ok()).toBe(true);
      const projects = await response.json();
      const project = projects.find((value: { slug: string }) => value.slug === 'shared-reference');
      if (!project) throw new Error('shared-reference fixture project is absent');
      await showSidebar(page);
      const tree = page.getByRole('treeitem', { name: project.name, exact: true });
      if ((await tree.getAttribute('aria-expanded')) === 'false') await tree.getByRole('button', { name: project.name, exact: true }).click();
      await tree.getByRole('button', { name: 'reference.ontology.yaml', exact: true }).click();
      await showSidebar(page);
      await tree.getByRole('button', { name: 'reference.ontology.yaml', exact: true }).hover();
      await tree.getByRole('button', { name: /^Actions for reference\.ontology\.yaml in / }).click();
      await page.getByRole('menuitem', { name: 'Move', exact: true }).click();
    },
    check: async page => {
      await expect(page.getByLabel('Path in that project (folder and file name)')).toBeVisible();
      return { dialog_open: true, text: await page.locator('dialog[open]').innerText() };
    },
  },
];

await withCleanup(
  async () => {
    await browser.close();
    await api.stop();
    await mock.stop();
    await github.stop();
    rmSync(directory, { recursive: true, force: true });
  },
  async () => {
    for (const view of followupViews) {
      for (const user of ['alice', 'carol', 'bob', 'dave'] as const) {
        const states = user === 'dave' ? adminStates : personaStates(user);
        for (const state of states) {
          if (process.env.SW_FOLLOWUP_ONLY && !`${state.screen} ${state.state}`.includes(process.env.SW_FOLLOWUP_ONLY)) continue;
          await freshCapture(
            browser,
            root,
            view,
            state,
            async page => {
              const viewport = page.viewportSize()!;
              await page.setViewportSize({ width: 1440, height: 900 });
              await signIn(page, target, user);
              await page.setViewportSize(viewport);
              await page.goto(url);
              await page.locator('.workspace-header').waitFor();
              await page.waitForTimeout(300);
            },
            { mode: 'server', user },
          );
        }
      }
    }
  },
);
