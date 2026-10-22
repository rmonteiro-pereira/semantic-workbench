// Drives Connect GitHub in the browser: the Connected accounts dialog, the prompt a push without
// an account shows, and the push that continues after consent, against a loopback Git server.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { startAuthApi } from './auth-environment';
import { check, signIn, type SignInTarget } from './helpers/sign-in';
import { layoutProblems } from './helpers/layout-geometry';
import { screenshotPath } from './helpers/screenshots';
import {
  startCredentialGitServer,
  type CredentialGitServer,
} from '../tests/auth/credential-git-server';

const GITHUB_APP = { clientId: 'sw-github-browser', clientSecret: 'github-browser-secret' };
const VIEWPORTS = [
  [390, 844],
  [1440, 900],
] as const;

// Checks control geometry and keeps a screenshot at the phone and desktop sizes.
async function remoteGeometry(page: Page, name: string) {
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    assert.deepEqual(await layoutProblems(page), [], `${name} at ${width}×${height}`);
    await page.screenshot({ path: screenshotPath(`/tmp/workbench-auth-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

// The fixture allows the stand-in GitHub host and points Sales metrics at it.
function allowGitHub(root: string, github: CredentialGitServer) {
  const file = join(root, 'admin', 'settings.json');
  const settings = JSON.parse(readFileSync(file, 'utf8'));
  settings.remote = { ...settings.remote, allowedHosts: [github.host] };
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  const remote = github.repository('team/metrics.git');
  const project = join(root, 'projects', 'sales-metrics');
  const added = Bun.spawnSync(['git', 'remote', 'add', 'origin', remote], { cwd: project });
  assert.equal(added.exitCode, 0, added.stderr.toString());
}

async function openAccounts(page: Page) {
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Connected accounts/ }).click();
  return page.getByRole('dialog', { name: 'Connected accounts' });
}

async function openSourceControl(page: Page, target: SignInTarget) {
  const projects = await (await page.request.get(target.url + '/api/projects')).json();
  const project = projects.find((item: { slug: string }) => item.slug === 'sales-metrics');
  const tree = page.getByRole('treeitem', { name: project.name, exact: true });
  if ((await tree.getAttribute('aria-expanded')) === 'false') {
    await tree.getByRole('button', { name: project.name, exact: true }).click();
  }
  await tree.getByRole('button', { name: project.files[0].path, exact: true }).click();
  await page.getByRole('button', { name: 'Source control', exact: false }).click();
}

async function connectFlow(page: Page, target: SignInTarget, github: CredentialGitServer) {
  await signIn(page, target, 'alice');
  const dialog = await openAccounts(page);
  await expect(dialog).toContainText('Not connected.');
  await expect(dialog.getByRole('button', { name: 'Connect GitHub' })).toBeVisible();
  await remoteGeometry(page, 'connected-accounts');
  await dialog.getByRole('button', { name: 'Close' }).click();
  // Sales metrics protects main, so Alice pushes a branch of her own.
  const switched = await page.request.post(target.url + '/api/projects/sales-metrics/git/switch', {
    headers: { Origin: target.url, 'X-SW-Request': '1' },
    data: { branch: 'alice-browser', create: true },
  });
  assert.equal(switched.status(), 200);
  await openSourceControl(page, target);
  await page.getByRole('button', { name: 'Push', exact: true }).click();
  const prompt = page.getByRole('alert').filter({ hasText: 'Connect your GitHub account' });
  await expect(prompt).toBeVisible();
  assert.equal(github.requests.length, 0, 'Nothing reaches GitHub before consent');
  await remoteGeometry(page, 'connect-prompt');
  return prompt;
}

/** Connects GitHub from the push prompt and checks that the push then continues as Alice. */
export async function remoteCredentialChecks(browser: Browser, target: SignInTarget) {
  const gitRoot = mkdtempSync(join(tmpdir(), 'workbench-auth-remote-'));
  const tokens = new Map<string, string>();
  const github = startCredentialGitServer(
    join(gitRoot, 'github'),
    async (_user, password) => tokens.get(password) ?? null,
    { ...GITHUB_APP, redirectUri: target.url + '/auth/github/callback' },
  );
  const api = await startAuthApi(
    target.url,
    { issuer: target.issuer, kind: 'entra' },
    {
      env: {
        SW_GITHUB_HOST: github.host,
        SW_GITHUB_CLIENT_ID: GITHUB_APP.clientId,
        SW_GITHUB_CLIENT_SECRET: GITHUB_APP.clientSecret,
      },
      prepare: root => allowGitHub(root, github),
    },
  );
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    let prompt: Locator | undefined;
    await check('remote: a push without GitHub asks to connect', async () => {
      prompt = await connectFlow(page, target, github);
    });
    await check('remote: the push continues after GitHub consent', async () => {
      const token = 'gho_browser_' + crypto.randomUUID().replaceAll('-', '');
      tokens.set(token, 'alice');
      github.consentAs(token);
      await prompt!.getByRole('button', { name: 'Connect GitHub' }).click();
      await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
      await openSourceControl(page, target);
      await expect(page.getByRole('status').filter({ hasText: 'Push finished' })).toBeVisible();
      const pushes = github.requests.filter(request => request.service === 'git-receive-pack');
      assert.equal(pushes.at(-1)?.identity, 'alice');
      const dialog = await openAccounts(page);
      await expect(dialog).toContainText('Connected for this session.');
      await expect(dialog.getByRole('button', { name: 'Connect GitHub' })).toHaveCount(0);
      await remoteGeometry(page, 'connected-github');
    });
  } finally {
    await context.close();
    await api.stop();
    await github.stop();
    rmSync(gitRoot, { recursive: true, force: true });
  }
}
