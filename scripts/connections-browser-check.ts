import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { startAuthApi } from './auth-environment';
import { signIn } from './helpers/sign-in';
import { pkcePair } from '../tests/helpers/connection-server';

const output = 'out/connections';
mkdirSync(output, { recursive: true });
const manifest: string[] = [];

function sparePort(excluded: number[] = []): number {
  for (let port = 5401; port <= 5499; port++) {
    if (excluded.includes(port)) continue;
    try {
      const listener = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } });
      listener.stop(true);
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('No spare development port in the permitted range.');
}

async function capture(page: Page, name: string) {
  const problems = await page.evaluate(() => {
    const failures: string[] = [];
    const area = location.pathname.startsWith('/oauth/') ? 'main *' : '.agent-connections *, .agent-programs *, [role=dialog] *';
    for (const element of document.querySelectorAll<HTMLElement>(area)) {
      if (!element.getClientRects().length) continue;
      const style = getComputedStyle(element);
      if (style.textOverflow === 'ellipsis' || (style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '')) failures.push('clamped text on ' + element.tagName + ' ' + element.className);
      if (element.scrollWidth > element.clientWidth + 2 && ['hidden', 'clip'].includes(style.overflowX)) failures.push('clipped text on ' + element.tagName + ' ' + element.className);
    }
    if (document.documentElement.scrollWidth > innerWidth + 2) failures.push('page overflow');
    return failures;
  });
  assert.deepEqual(problems, [], name);
  await page.screenshot({ path: join(output, name + '.png'), fullPage: true, mask: [page.locator('#credential')] });
  manifest.push(name);
}

const callback = Bun.serve({ hostname: '127.0.0.1', port: sparePort(), fetch: () => new Response('Callback reached') });
const redirect = `http://127.0.0.1:${callback.port}/callback`;
const apiPort = sparePort();
const url = `http://127.0.0.1:${apiPort}`;
const provider = await startMockOidc({ port: sparePort([apiPort]), shape: 'entra', redirectUris: [url + '/auth/callback'], postLogoutRedirectUris: [url + '/auth/signed-out'] });
const program = {
  clientId: 'reference-client',
  name: 'Agent program with a long descriptive name for a team workspace',
  description: 'This program acts as the signed-in person. '.repeat(10),
  redirectUris: [redirect],
  scopes: ['read', 'validate', 'edit', 'commit', 'remote', 'publish'],
  setupNote: 'Use the exact callback address registered for this program. '.repeat(12),
};
const api = await startAuthApi(
  url,
  { issuer: provider.issuer, graphUrl: provider.graphUrl, kind: 'entra' },
  {
    prepare: async root => {
      await Bun.write(join(root, 'admin', 'programs.json'), JSON.stringify({ formatVersion: 1, programs: [program] }));
    },
  },
);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const target = { url, issuer: provider.issuer, graphUrl: provider.graphUrl, kind: 'entra' as const };
const faults: string[] = [];
page.on('pageerror', error => faults.push(error.message));

async function openDialog() {
  await page.goto(url);
  await page.getByRole('button', { name: 'Person menu', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Agent connections', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Agent connections', exact: true })).toBeVisible();
}

async function pageFlow(prefix: string) {
  const pkce = pkcePair();
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: program.clientId,
    redirect_uri: redirect,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    resource: url + '/api/mcp',
    scope: 'read edit remote publish',
  });
  await page.goto(url + '/oauth/authorize?' + query);
  await expect(page.getByRole('heading', { name: 'Connect an agent', exact: true })).toBeVisible();
  await capture(page, prefix + '-consent');
  const [submitted] = await Promise.all([
    page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/oauth/consent'),
    page.getByRole('button', { name: 'Allow', exact: true }).click(),
  ]);
  assert.equal(submitted.headers().origin, url, 'The consent form must preserve the exact origin required by the authentication gate.');
  await expect(page).toHaveURL(new RegExp(`127.0.0.1:${callback.port}/callback`));
  assert(new URL(page.url()).searchParams.has('code'), 'Consent form redirect was blocked');
  await page.goto(url + '/oauth/setup');
  await capture(page, prefix + '-setup');
  await page.getByRole('button', { name: 'Create setup credential', exact: true }).click();
  await expect(page.locator('#credential')).toBeVisible();
  await capture(page, prefix + '-setup-result');
  await page.reload();
  await expect(page.locator('#credential')).toHaveCount(0);
  await page.goto(url + '/oauth/authorize?client_id=missing');
  await capture(page, prefix + '-error');
}

async function navigateAdmin(section: string) {
  const destination = url + '/#/admin/' + section;
  if (page.url() === destination) await page.reload();
  else await page.goto(destination);
}

async function connectionStates(prefix: string, administrator: boolean) {
  const path = administrator ? '/api/admin/connections' : '/api/connections';
  const connection = {
    id: 'test-connection',
    origin: 'acp',
    clientId: program.clientId,
    programName: program.name,
    personName: 'A person with a long display name',
    scopes: program.scopes,
    createdAt: '2026-11-17T12:00:00Z',
    lastUsedAt: '2026-11-17T12:00:00Z',
    state: 'active',
  };
  for (const state of ['empty', 'error', 'long', 'loading']) {
    const release = Promise.withResolvers<void>();
    let revoked = false;
    await page.route('**' + path + '/' + connection.id, async route => {
      assert.equal(route.request().method(), 'DELETE');
      revoked = true;
      await route.fulfill({ json: { ended: true } });
    });
    await page.route('**' + path, async route => {
      if (state === 'loading') await release.promise;
      const rows = state === 'long' ? [{ ...connection, state: revoked ? 'ended' : 'active' }] : [];
      await route.fulfill({ status: state === 'error' ? 500 : 200, json: rows });
    });
    try {
      if (administrator) {
        await navigateAdmin('agent-connections');
        await expect(page.getByRole('heading', { name: 'Agent connections', exact: true })).toBeVisible();
      } else await openDialog();
      const section = page.getByRole(administrator ? 'region' : 'dialog', { name: 'Agent connections', exact: true });
      if (state === 'empty') await expect(section.getByText('No agent connections.', { exact: true })).toBeVisible();
      if (state === 'error') {
        await expect(section.getByRole('alert')).toContainText('Could not load connections.');
        await expect(section.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
      }
      if (state === 'long') {
        await section.getByRole('button', { name: 'Revoke ' + program.name, exact: true }).click();
        const confirmation = page.getByRole('dialog', { name: `Revoke ${program.name}?`, exact: true });
        await expect(confirmation).toContainText(program.clientId);
        await expect(confirmation).toContainText('connected through the agent panel');
      }
      if (state === 'loading') await expect(section.getByRole('status').filter({ hasText: 'Loading connections' })).toBeVisible();
      await capture(page, `${prefix}-${administrator ? 'admin' : 'person'}-${state}`);
      if (state === 'long') {
        await page
          .getByRole('dialog', { name: `Revoke ${program.name}?`, exact: true })
          .getByRole('button', { name: 'Revoke', exact: true })
          .click();
        await expect(section.getByText('Status: ended', { exact: true })).toBeVisible();
      }
    } finally {
      release.resolve();
      await page.unrouteAll({ behavior: 'wait' });
    }
  }
}

async function programStates(prefix: string) {
  for (const state of ['empty', 'error', 'long', 'loading']) {
    const release = Promise.withResolvers<void>();
    await page.route('**/api/admin/programs', async route => {
      if (state === 'loading') await release.promise;
      await route.fulfill({ status: state === 'error' ? 500 : 200, json: { formatVersion: 1, version: 'version', programs: state === 'long' ? [program] : [] } });
    });
    try {
      await navigateAdmin('agent-programs');
      await expect(page.getByRole('heading', { name: 'Agent programs', exact: true })).toBeVisible();
      if (state === 'empty') await expect(page.getByText('No agent programs registered', { exact: true })).toBeVisible();
      if (state === 'error') await expect(page.getByRole('alert').last()).toBeVisible();
      if (state === 'long') {
        // The list comes first; a program's fields open with its Edit button.
        await page.getByRole('button', { name: `Edit ${program.name}`, exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Client ID', exact: true })).toHaveValue(program.clientId);
      }
      if (state === 'loading') await expect(page.getByRole('status').filter({ hasText: 'Loading agent programs' })).toBeVisible();
      await capture(page, prefix + '-programs-' + state);
    } finally {
      release.resolve();
      await page.unrouteAll({ behavior: 'wait' });
    }
  }
}

try {
  await signIn(page, target, 'dave');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const prefix = `${colorScheme}-${width}`;
      await pageFlow(prefix);
      await connectionStates(prefix, false);
      await connectionStates(prefix, true);
      await programStates(prefix);
    }
  }
  assert.deepEqual(faults, []);
  await Bun.write(join(output, 'manifest.json'), JSON.stringify({ screens: manifest, browser: browser.version(), widths: [320, 768, 1280], themes: ['light', 'dark'] }, null, 2));
  console.log(`Connections browser check: ${manifest.length} screens passed; consent redirects, masked setup result, dialog and Admin states.`);
} finally {
  await browser.close();
  await api.stop();
  await provider.stop();
  callback.stop(true);
}
