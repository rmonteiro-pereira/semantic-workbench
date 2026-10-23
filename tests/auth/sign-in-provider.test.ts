// Checks what both sign-in libraries offer alike: on-behalf-of tokens, the provider session and
// login hint kept for sign-out, and a refresh that must bring a new ID token.
import { expect, test } from 'bun:test';
import { decodeJwt } from 'jose';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createMsalProvider } from '../../server/auth/msal-provider';
import { createOidcClient } from '../../server/auth/oidc';
import type { SignInError } from '../../server/auth/sign-in-error';
import { createHandler } from '../../server/handler';
import { TEST_USERS } from '../helpers/auth-identities';
import { authWorkspace } from '../helpers/auth-workspace';
import { entraConfig, signInWith, withEntraProvider } from '../helpers/entra-provider';

const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/user_impersonation';

test('both libraries exchange a person token on their behalf', () =>
  withEntraProvider(async provider => {
    for (const create of [createMsalProvider, createOidcClient]) {
      const client = await create(entraConfig(provider));
      const signedIn = await signInWith(client, provider, 'alice');
      const delegated = await client.onBehalfOf(signedIn.tokens.accessToken, [AZURE_DEVOPS_SCOPE]);
      expect(delegated.expiresAt).toBeGreaterThan(Date.now());
      const claims = decodeJwt(delegated.token);
      expect(claims.aud).toBe('499b84ac-1321-427f-aa17-267ca6975798');
      expect(claims.oid).toBe(TEST_USERS.alice.oid);
    }
  }));

test('both libraries keep the provider session and login hint, and send the hint at sign-out', () =>
  withEntraProvider(async provider => {
    for (const create of [createMsalProvider, createOidcClient]) {
      const config = entraConfig(provider);
      const client = await create(config);
      const signedIn = await signInWith(client, provider, 'alice');
      expect(signedIn.tokens.providerSession?.issuer).toBe(config.oidc.issuer);
      expect(signedIn.tokens.providerSession?.sid).toBeString();
      const hint = signedIn.tokens.loginHint!;
      expect(hint).toBeString();
      expect(new URL(client.logout(signedIn.tokens)).searchParams.get('logout_hint')).toBe(hint);
      expect(new URL(client.logout()).searchParams.has('logout_hint')).toBe(false);
      const refreshed = await client.refresh(signedIn.tokens);
      expect(refreshed.tokens.providerSession).toEqual(signedIn.tokens.providerSession);
    }
  }));

test('an MSAL refresh without a new ID token is refused, so old groups never stay', () =>
  withEntraProvider(
    async provider => {
      const client = await createMsalProvider(entraConfig(provider));
      const signedIn = await signInWith(client, provider, 'alice');
      const refused = await client.refresh(signedIn.tokens).catch((error: SignInError) => error);
      expect((refused as SignInError).reason).toBe('token-invalid');
    },
    { refreshIdToken: 'none' },
  ));

test('a session from before MSAL ends once at refresh, audited as session-upgraded', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
    const handler = createHandler(fixture.ws, auth);
    const origin = 'http://127.0.0.1:4310';
    const start = await handler(new Request(origin + '/auth/login'));
    const attempt = start.headers.getSetCookie()[0].split(';')[0];
    const callback = await provider.authorizeAs('alice', start.headers.get('location')!);
    const response = await handler(new Request(callback, { headers: { Cookie: attempt } }));
    const cookie = response.headers
      .getSetCookie()
      .find(value => value.startsWith('sw-session='))!
      .split(';')[0];
    const sessions = auth.authentication.sessions;
    const session = (await sessions.get(cookie.slice('sw-session='.length), false))!;
    // The shape openid-client stored for Entra: a refresh token and no MSAL cache.
    session.tokens = { ...session.tokens, tokenCache: undefined, refreshToken: 'r', expiresAt: 0 };
    await sessions.update(session);
    const me = await handler(new Request(origin + '/api/me', { headers: { Cookie: cookie } }));
    expect(me.status).toBe(401);
    const dir = join(fixture.root, 'state/audit');
    const entries = readdirSync(dir).flatMap(file =>
      readFileSync(join(dir, file), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
    );
    const ended = entries.find(entry => entry.action === 'sessionEnded');
    expect(ended?.reason).toBe('session-upgraded');
    auth.close();
  }));

test('an MSAL refresh that repeats the sign-in ID token is refused', () =>
  withEntraProvider(
    async provider => {
      const client = await createMsalProvider(entraConfig(provider));
      const signedIn = await signInWith(client, provider, 'alice');
      const refused = await client.refresh(signedIn.tokens).catch((error: SignInError) => error);
      expect((refused as SignInError).reason).toBe('token-invalid');
    },
    { refreshIdToken: 'repeat' },
  ));
