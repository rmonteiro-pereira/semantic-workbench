// Runs the built application through an isolated loopback identity provider.
import { chromium } from '@playwright/test';
import { TEST_GROUPS } from '../tests/helpers/auth-identities';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import {
  agentBearerChecks,
  readVisibilityChecks,
  roleControlChecks,
  signInChecks,
  type SignInTarget,
} from './helpers/sign-in';
import { mockLifecycleChecks, localAuthSmoke } from './auth-lifecycle';
import { governanceChecks } from './auth-governance';

/** Runs the mock suite without Vite or an external identity service. */
export async function authBrowserCheck() {
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  const mock = await startMockOidc({
    shape: 'entra',
    port: 0,
    redirectUris: [url + '/auth/callback'],
    postLogoutRedirectUris: [url + '/auth/signed-out'],
  });
  try {
    const api = await startAuthApi(url, { ...mock, kind: 'entra' });
    try {
      const browser = await chromium.launch({ headless: true });
      try {
        const target: SignInTarget = { url, issuer: mock.issuer, kind: 'entra' };
        await signInChecks(browser, target);
        await roleControlChecks(browser, target);
        await agentBearerChecks(browser, target);
        await governanceChecks(browser, target);
        await mockLifecycleChecks(browser, target, mock, api.root);
        await localAuthSmoke(browser);
        mock.setUserGroups('alice', [TEST_GROUPS.salesViewers]);
        await readVisibilityChecks(browser, target);
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
