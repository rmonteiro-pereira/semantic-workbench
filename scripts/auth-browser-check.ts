// Runs the built application through an isolated loopback identity provider. The provider uses
// Entra's endpoint layout, so the server signs people in through MSAL as it does against Entra.
import assert from 'node:assert/strict';
import { chromium, type Browser } from '@playwright/test';
import { TEST_GROUPS } from '../tests/helpers/auth-identities';
import { startMockOidc, type MockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { freeLoopbackPort } from './helpers/processes';
import { agentBearerChecks, check, readVisibilityChecks, roleControlChecks, signIn, signInChecks, type SignInTarget } from './helpers/sign-in';
import { mockLifecycleChecks, localAuthSmoke } from './auth-lifecycle';
import { governanceChecks } from './auth-governance';
import { remoteCredentialChecks } from './auth-remote-check';
import { exportProjectChecks } from './helpers/export-server-checks';

/** Confirms MSAL drove the sign-ins, at Entra's authorize and token endpoints. */
function msalCheck(mock: MockOidc) {
  const authorize = mock.calls.filter(call => call.endpoint === 'authorize');
  assert(authorize.length > 0, 'No sign-in reached the provider');
  for (const call of authorize) assert.equal(call.params['x-client-SKU'], 'msal.js.node');
  assert(mock.calls.some(call => call.params.grant_type === 'authorization_code'));
}

/** Signs a person in, then signs them out at the provider, which must end the session. */
async function providerSignOutCheck(browser: Browser, target: SignInTarget, mock: MockOidc) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, target, 'carol');
    assert.equal((await page.request.get(target.url + '/api/me')).status(), 200);
    const statuses = await mock.signOutAtProvider('carol');
    assert(statuses.length > 0 && statuses.every(status => status === 200));
    assert.equal((await page.request.get(target.url + '/api/me')).status(), 401);
  } finally {
    await context.close();
  }
}

/** Runs the mock suite without Vite or an external identity service. */
export async function authBrowserCheck() {
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  // Connect GitHub runs against its own server, configured with a GitHub app.
  const excluded = [5173, 5180, 4310, Number(new URL(url).port)];
  const remoteUrl = `http://127.0.0.1:${freeLoopbackPort(excluded)}`;
  const mock = await startMockOidc({
    shape: 'entra',
    layout: 'entra',
    port: 0,
    redirectUris: [url + '/auth/callback', remoteUrl + '/auth/callback'],
    postLogoutRedirectUris: [url + '/auth/signed-out', remoteUrl + '/auth/signed-out'],
    frontChannelLogoutUri: url + '/auth/front-channel-logout',
  });
  try {
    const api = await startAuthApi(url, { ...mock, kind: 'entra' });
    try {
      const browser = await chromium.launch({ headless: true });
      try {
        // Entra's authorize, token and logout endpoints sit beside the issuer, not under it.
        const target: SignInTarget = { url, issuer: mock.endpointBase, kind: 'entra' };
        await signInChecks(browser, target);
        await check('sign-in through MSAL at the Entra endpoints', async () => msalCheck(mock));
        await check('provider sign-out ends the session through the front channel', () => providerSignOutCheck(browser, target, mock));
        await roleControlChecks(browser, target);
        await agentBearerChecks(browser, target);
        await governanceChecks(browser, target);
        // The second server needs the issuer itself, not the endpoint prefix the browser sees.
        const remoteProvider = { issuer: mock.issuer, kind: 'entra' as const };
        await remoteCredentialChecks(browser, { ...target, url: remoteUrl }, remoteProvider);
        await mockLifecycleChecks(browser, target, mock, api.root);
        await localAuthSmoke(browser);
        mock.setUserGroups('alice', [TEST_GROUPS.salesViewers]);
        await readVisibilityChecks(browser, target);
        await exportProjectChecks(browser, target, api.root);
      } finally {
        await browser.close();
      }
    } finally {
      await api.stop();
    }
  } finally {
    await mock.stop();
  }
}

if (import.meta.main) await authBrowserCheck();
