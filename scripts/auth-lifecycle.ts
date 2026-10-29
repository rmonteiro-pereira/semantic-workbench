// Exercises session changes and event delivery through the running API, not mocked routes.
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import type { MockOidc } from '../tests/helpers/mock-oidc';
import { TEST_GROUPS } from '../tests/helpers/auth-identities';
import { fixtureFiles } from '../tests/helpers/auth-workspace';
import { check, signIn, signOut, type SignInTarget } from './helpers/sign-in';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { waitUntil } from './helpers/processes';

/** Reads cookie-authenticated events until sign-out closes the stream. */
export async function liveUpdateCheck(page: Page, target: SignInTarget, root: string) {
  const cookies = await page.context().cookies(target.url);
  const cookie = cookies.map(entry => `${entry.name}=${entry.value}`).join('; ');
  const controller = new AbortController();
  const response = await fetch(target.url + '/api/events', {
    headers: { cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  let received = '';
  let ended = false;
  const reading = (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        ended = true;
        return;
      }
      received += new TextDecoder().decode(chunk.value);
    }
  })();
  try {
    await waitUntil('stream connected', async () => received.includes(': connected'));
    await observeBrowserEvents(page);
    const file = fixtureFiles('sales-contracts').find(entry => entry.path === 'orders.odcs.yaml')!;
    await appendFile(join(root, 'projects', 'sales-contracts', file.path), '\n');
    await waitUntil('workspace invalidation', async () => /event: (?!access)/.test(received));
    await page.waitForFunction(() => document.documentElement.dataset.authFileEvent === 'received');
    await signOut(page, target);
    await waitUntil('signed-out stream closed', async () => ended);
    assert(received.includes('event: access\ndata: {"reason":"session-ended"}'));
  } finally {
    controller.abort();
    await reading.catch(error => {
      if ((error as Error).name !== 'AbortError') throw error;
    });
  }
}

async function observeBrowserEvents(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const events = new EventSource('/api/events');
        events.onopen = () => resolve();
        events.onerror = () => {
          events.close();
          reject(new Error('Browser event stream failed to connect'));
        };
        events.addEventListener('files', () => {
          document.documentElement.dataset.authFileEvent = 'received';
          events.close();
        });
      }),
  );
}

async function changedGroups(browser: Browser, target: SignInTarget, mock: MockOidc) {
  mock.setLifetimes({ accessToken: 2 });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, target, 'alice');
    mock.setUserGroups('alice', []);
    await waitUntil('group removal at refresh', async () => (await page.request.get(target.url + '/api/me')).status() === 403);
    await page.goto(target.url);
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    assert(mock.calls.some(call => call.endpoint === 'token' && call.params.grant_type === 'refresh_token'));
  } finally {
    mock.setUserGroups('alice', [TEST_GROUPS.salesEditors]);
    mock.setLifetimes({ accessToken: 3600 });
    await context.close();
  }
}

async function failedDirectory(browser: Browser, target: SignInTarget, mock: MockOidc) {
  const context = await browser.newContext();
  const page = await context.newPage();
  mock.fail('graph-check', 'error');
  try {
    await page.goto(target.url);
    await page.getByRole('button', { name: 'Olga Oliveira' }).click();
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await expect(page.locator('main')).toContainText('Group membership could not be resolved.');
    assert.equal((await page.request.get(target.url + '/api/me')).status(), 403);
  } finally {
    mock.fail('graph-check', null);
    await context.close();
  }
}

async function openFileUnlessLeft(page: Page) {
  const project = page.getByRole('treeitem', { name: 'sales-contracts', exact: true });
  try {
    if ((await project.getAttribute('aria-expanded', { timeout: 5000 })) === 'false') {
      await project.getByRole('button', { name: 'sales-contracts', exact: true }).click();
    }
    await project.getByRole('button', { name: 'orders.odcs.yaml', exact: true }).click();
  } catch (error) {
    // Navigation to the provider removed the tree while the steps ran; the URL check decides.
    if (!(error instanceof Error) || !/Timeout|detached|closed|navigat/i.test(error.message)) {
      throw error;
    }
  }
}

async function expiredSession(browser: Browser, target: SignInTarget, mock: MockOidc) {
  // Expire refresh first so rounded access-token expiry cannot keep rotating the session.
  mock.setLifetimes({ accessToken: 6, refreshToken: 1 });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, target, 'alice');
    await waitUntil('session expiry', async () => (await page.request.get(target.url + '/api/me')).status() === 401);
    // The page returns to the provider without a manual reload: either the live-update stream
    // reports the ended session first, or the next file request is answered 401 and the frontend
    // wrapper reloads.
    const provider = new RegExp(target.issuer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!provider.test(page.url())) await openFileUnlessLeft(page);
    await expect(page).toHaveURL(provider);
  } finally {
    mock.setLifetimes({ accessToken: 3600, refreshToken: 86400 });
    await context.close();
  }
}

/** Runs mock-only directory, refresh and expiry controls plus real live-update delivery. */
export async function mockLifecycleChecks(browser: Browser, target: SignInTarget, mock: MockOidc, root: string) {
  const page = await browser.newPage();
  try {
    await signIn(page, target, 'alice');
    await check('live updates and sign-out closes stream', () => liveUpdateCheck(page, target, root));
  } finally {
    await page.close();
  }
  await check('group change at refresh', () => changedGroups(browser, target, mock));
  await check('Graph failure has no membership', () => failedDirectory(browser, target, mock));
  await check('expired session returns to provider', () => expiredSession(browser, target, mock));
}

/** Confirms the built local workspace opens without a person menu or sign-in. */
export async function localAuthSmoke(browser: Browser) {
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  const api = await startAuthApi(url, { mode: 'local' });
  try {
    const page = await browser.newPage();
    try {
      await check('local workspace unchanged', async () => {
        await page.goto(url);
        await expect(page.locator('.workspace-header')).toBeVisible();
        await expect(page.locator('.workspace-sidebar')).toContainText('LOCAL WORKSPACE');
        assert.equal((await (await page.request.get(url + '/api/me')).json()).mode, 'local');
        await expect(page.getByRole('button', { name: 'Person menu' })).toHaveCount(0);
      });
    } finally {
      await page.close();
    }
  } finally {
    await api.stop();
  }
}
