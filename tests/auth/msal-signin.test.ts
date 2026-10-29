// Drives Entra sign-in through MSAL against the mock provider's Entra-shaped endpoints: the
// library choice, PKCE with state and nonce, claim parity with openid-client, silent refresh,
// sign-out, client credentials and on-behalf-of tokens.
import { expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { decodeJwt, exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createSignInProvider, signInLibrary } from '../../src/server/auth/sign-in-provider';
import { createMsalProvider } from '../../src/server/auth/msal-provider';
import type { SignInError } from '../../src/server/auth/sign-in-error';
import {
  TEST_GROUPS,
  TEST_TENANT_ID,
  TEST_USERS,
  TEST_WORKBENCH_CLIENT,
} from '../helpers/auth-identities';
import { startMockOidc } from '../helpers/mock-oidc';
import { oidcConfig } from '../helpers/server-auth';
import { entraConfig, signInWith, withEntraProvider } from '../helpers/entra-provider';

const AZURE_DEVOPS = '499b84ac-1321-427f-aa17-267ca6975798';

/** Expects a sign-in step to fail with one safe reason. */
async function expectRefused(operation: Promise<unknown>, reason: SignInError['reason']) {
  const error = await operation.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect((error as SignInError | null)?.reason).toBe(reason);
}

test('Entra signs in through MSAL; generic OpenID Connect and Keycloak through openid-client', async () => {
  expect(signInLibrary('entra')).toBe('msal');
  expect(signInLibrary('generic')).toBe('openid-client');
  expect(signInLibrary('keycloak')).toBe('openid-client');
  await withEntraProvider(async provider => {
    const client = await createSignInProvider(entraConfig(provider));
    const url = new URL((await client.login('/')).url);
    expect(url.searchParams.get('x-client-SKU')).toBe('msal.js.node');
  });
  const keycloak = await startMockOidc({ shape: 'keycloak' });
  try {
    const config = oidcConfig(keycloak.issuer, keycloak.graphUrl, 'keycloak');
    const client = await createSignInProvider(config);
    const url = new URL((await client.login('/')).url);
    expect(url.searchParams.has('x-client-SKU')).toBe(false);
  } finally {
    await keycloak.stop();
  }
});

test('MSAL sends PKCE, state and nonce to the Entra endpoints and checks each on return', () =>
  withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const started = await client.login('/catalog?view=one');
    const url = new URL(started.url);
    expect(url.origin + url.pathname).toBe(
      `${provider.origin}/${TEST_TENANT_ID}/oauth2/v2.0/authorize`,
    );
    const challenge = createHash('sha256').update(started.attempt.verifier).digest('base64url');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(started.attempt.state);
    expect(url.searchParams.get('nonce')).toBe(started.attempt.nonce);
    expect(started.attempt.returnTo).toBe('/catalog?view=one');
    const callback = new URL(await provider.authorizeAs('alice', started.url));
    const identity = await client.callback(callback, started.attempt);
    expect(identity.principal.id).toBe(`${TEST_TENANT_ID}:${TEST_USERS.alice.oid}`);
    const exchange = provider.calls.find(call => call.params.grant_type === 'authorization_code');
    expect(exchange?.endpoint).toBe('token');
    await expectRefused(client.callback(callback, started.attempt), 'attempt-invalid');
  }));

test('a wrong state, nonce or verifier, or an error answer, refuses the sign-in', () =>
  withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const answer = async () => {
      const started = await client.login('/');
      const callback = new URL(await provider.authorizeAs('alice', started.url));
      return { started, callback };
    };
    const wrongState = await answer();
    wrongState.callback.searchParams.set('state', 'forged');
    await expectRefused(
      client.callback(wrongState.callback, wrongState.started.attempt),
      'attempt-invalid',
    );
    const noState = await answer();
    noState.callback.searchParams.delete('state');
    await expectRefused(
      client.callback(noState.callback, noState.started.attempt),
      'attempt-invalid',
    );
    const wrongNonce = await answer();
    const nonce = { ...wrongNonce.started.attempt, nonce: 'other' };
    await expectRefused(client.callback(wrongNonce.callback, nonce), 'attempt-invalid');
    const wrongVerifier = await answer();
    const verifier = { ...wrongVerifier.started.attempt, verifier: 'x'.repeat(43) };
    await expectRefused(client.callback(wrongVerifier.callback, verifier), 'attempt-invalid');
    const denied = new URL('http://127.0.0.1:4310/auth/callback?error=access_denied&state=s');
    await expectRefused(client.callback(denied, wrongState.started.attempt), 'attempt-invalid');
  }));

test('MSAL yields exactly the principal the openid-client path yields', () =>
  withEntraProvider(async provider => {
    const msal = await createMsalProvider(entraConfig(provider));
    const openid = await createOidcClient(entraConfig(provider));
    for (const username of ['alice', 'bob', 'gina', 'olga'] as const) {
      const throughMsal = await signInWith(msal, provider, username);
      const throughOpenid = await signInWith(openid, provider, username);
      expect(throughMsal.principal).toEqual(throughOpenid.principal);
    }
    const olga = await signInWith(msal, provider, 'olga');
    expect(olga.principal.groupOverage).toBe(true);
  }));

test('silent refresh renews the session through MSAL and re-reads the groups', () =>
  withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const signedIn = await signInWith(client, provider, 'alice');
    expect(signedIn.tokens.tokenCache).toBeString();
    expect(signedIn.tokens.refreshToken).toBeUndefined();
    provider.setUserGroups('alice', [TEST_GROUPS.hrViewers]);
    const refreshed = await client.refresh(signedIn.tokens);
    expect(refreshed.principal.groups).toEqual([TEST_GROUPS.hrViewers.id.toLowerCase()]);
    expect(refreshed.tokens.idToken).not.toBe(signedIn.tokens.idToken);
    expect(refreshed.tokens.tokenCache).not.toBe(signedIn.tokens.tokenCache);
    const renewal = provider.calls.filter(call => call.params.grant_type === 'refresh_token');
    expect(renewal.map(call => call.endpoint)).toEqual(['token']);
    const withoutCache = { ...signedIn.tokens, tokenCache: undefined };
    await expectRefused(client.refresh(withoutCache), 'session-upgraded');
    provider.setLifetimes({ refreshToken: -1 });
    const expiring = await signInWith(client, provider, 'alice');
    await expectRefused(client.refresh(expiring.tokens), 'attempt-invalid');
  }));

test('sign-out sends the browser to the Entra logout endpoint and back to the signed-out page', () =>
  withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const signOut = new URL(client.logout());
    expect(signOut.origin + signOut.pathname).toBe(`${provider.endpointBase}/logout`);
    expect(signOut.searchParams.get('client_id')).toBe(TEST_WORKBENCH_CLIENT.clientId);
    const back = 'http://127.0.0.1:4310/auth/signed-out';
    expect(signOut.searchParams.get('post_logout_redirect_uri')).toBe(back);
    const response = await fetch(signOut, { redirect: 'manual' });
    expect(response.headers.get('location')).toBe(back);
  }));

test('a client secret, a certificate or the managed identity authenticate the workbench', async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = await exportPKCS8(keys.privateKey);
  for (const bytes of [32, 20]) {
    const thumbprint = randomBytes(bytes).toString('hex');
    const certificate = { publicKey: await exportSPKI(keys.publicKey), thumbprint };
    // The provider knows no usable secret here, so only the certificate can succeed.
    const options = { clientSecret: 'unused-secret', clientCertificate: certificate };
    await withEntraProvider(async provider => {
      const auth = { kind: 'certificate' as const, privateKey, thumbprint };
      const client = await createMsalProvider(entraConfig(provider, auth));
      expect((await signInWith(client, provider)).principal.name).toBe(TEST_USERS.alice.name);
      expect(decodeJwt(await client.directoryToken()).idtyp).toBe('app');
    }, options);
  }
  await withEntraProvider(
    async provider => {
      const config = entraConfig(provider, { kind: 'managed-identity' });
      const client = await createMsalProvider(config, { assertion: async () => 'platform' });
      expect((await signInWith(client, provider)).principal.name).toBe(TEST_USERS.alice.name);
    },
    { clientSecret: 'unused-secret', federatedAssertion: 'platform' },
  );
  await withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    expect((await signInWith(client, provider)).principal.name).toBe(TEST_USERS.alice.name);
  });
});

test('Graph and on-behalf-of tokens are application tokens MSAL acquires', () =>
  withEntraProvider(async provider => {
    const client = await createMsalProvider(entraConfig(provider));
    const graph = decodeJwt(await client.directoryToken());
    expect(graph.aud).toBe('https://graph.microsoft.com');
    const credentials = provider.calls.find(
      call => call.params.grant_type === 'client_credentials',
    );
    expect(credentials?.params.scope).toContain('https://graph.microsoft.com/.default');
    const signedIn = await signInWith(client, provider, 'alice');
    const delegated = await client.onBehalfOf(signedIn.tokens.accessToken, [
      `${AZURE_DEVOPS}/user_impersonation`,
    ]);
    const claims = decodeJwt(delegated.token);
    expect(delegated.expiresAt).toBeGreaterThan(Date.now());
    expect(claims.aud).toBe(AZURE_DEVOPS);
    expect(claims.oid).toBe(TEST_USERS.alice.oid);
    await expect(
      client.onBehalfOf(await client.directoryToken(), [`${AZURE_DEVOPS}/user_impersonation`]),
    ).rejects.toThrow();
  }));
