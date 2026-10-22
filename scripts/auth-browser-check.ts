// Runs the built application through an isolated loopback identity provider.
import { chromium } from '@playwright/test';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { signInChecks, type SignInTarget } from './helpers/sign-in';
import { mockLifecycleChecks, localAuthSmoke } from './auth-lifecycle';

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
        await mockLifecycleChecks(browser, target, mock, api.root);
        await localAuthSmoke(browser);
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
