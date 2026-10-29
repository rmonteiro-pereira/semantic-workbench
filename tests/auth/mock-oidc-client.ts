// Drives the provider self-tests with a real OpenID client and HTTP grant requests.
import { expect } from 'bun:test';
import * as oidc from 'openid-client';
import { TEST_GROUPS, TEST_USERS, TEST_WORKBENCH_CLIENT } from '../helpers/auth-identities';
import { startMockOidc, type MockOidc, type MockOidcOptions } from '../helpers/mock-oidc';

/** Registered callback used by the self-test client. */
export const callback = 'http://127.0.0.1:4310/auth/callback';
/** Registered sign-out destination used by the self-test client. */
export const signedOut = 'http://127.0.0.1:4310/auth/signed-out';

/** Runs a self-test with a fresh provider and guaranteed cleanup. */
export async function withProvider(run: (provider: MockOidc) => Promise<void>, options: MockOidcOptions = {}) {
  const provider = await startMockOidc(options);
  try {
    await run(provider);
  } finally {
    await provider.stop();
  }
}

async function configuration(provider: MockOidc) {
  return oidc.discovery(new URL(provider.issuer), TEST_WORKBENCH_CLIENT.clientId, TEST_WORKBENCH_CLIENT.secret, undefined, { execute: [oidc.allowInsecureRequests] });
}

/** Builds and completes the browser step using an OpenID client. */
export async function authorization(provider: MockOidc, username = 'alice') {
  const config = await configuration(provider);
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callback,
    scope: 'openid profile email offline_access',
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const redirect = new URL(await provider.authorizeAs(username, url.href));
  return { config, verifier, state, nonce, url, redirect };
}

/** Exchanges a code while checking state, nonce and the PKCE verifier. */
export async function signIn(provider: MockOidc, username = 'alice') {
  const flow = await authorization(provider, username);
  return oidc.authorizationCodeGrant(flow.config, flow.redirect, {
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    pkceCodeVerifier: flow.verifier,
  });
}

/** Sends an authenticated token request for protocol edge cases. */
export function tokenRequest(provider: MockOidc, values: Record<string, string>, client = TEST_WORKBENCH_CLIENT) {
  return fetch(`${provider.issuer}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.secret,
      ...values,
    }),
  });
}

/** Obtains the workbench application token used by Graph self-tests. */
export async function graphToken(provider: MockOidc) {
  const response = await tokenRequest(provider, {
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  expect(response.status).toBe(200);
  return (await response.json()).access_token as string;
}

/** Checks the overage user against a requested set of group ids. */
export function graphCheck(provider: MockOidc, token?: string, ids = [TEST_GROUPS.salesEditors.id]) {
  return fetch(`${provider.graphUrl}/v1.0/users/${TEST_USERS.olga.oid}/checkMemberGroups`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ groupIds: ids }),
  });
}
