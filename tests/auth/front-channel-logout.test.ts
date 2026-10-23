// Checks provider-initiated sign-out: the provider names its session, and the workbench ends the
// sessions it started, without a cookie, for the configured issuer only, after a restart too.
import { expect, spyOn, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createSessionStore } from '../../server/auth/sessions';
import { createHandler } from '../../server/handler';
import { authWorkspace } from '../helpers/auth-workspace';
import type { MockOidc } from '../helpers/mock-oidc';
import { entraConfig, withEntraProvider } from '../helpers/entra-provider';
import { tempDataDir } from '../helpers/temp-data-dir';

const origin = 'http://127.0.0.1:4310';

async function signedIn(handler: ReturnType<typeof createHandler>, provider: MockOidc) {
  const start = await handler(new Request(origin + '/auth/login'));
  const attempt = start.headers.getSetCookie()[0].split(';')[0];
  const callback = await provider.authorizeAs('alice', start.headers.get('location')!);
  const response = await handler(new Request(callback, { headers: { Cookie: attempt } }));
  const cookie = response.headers
    .getSetCookie()
    .find(value => value.startsWith('sw-session='))!
    .split(';')[0];
  return { cookie, id: cookie.slice('sw-session='.length) };
}

function auditEntries(root: string) {
  const dir = join(root, 'state/audit');
  return readdirSync(dir).flatMap(file =>
    readFileSync(join(dir, file), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line)),
  );
}

test('the provider ends the sessions its session started, without a cookie', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const config = entraConfig(provider);
    const auth = await createServerAuthentication(fixture.ws, config);
    const handler = createHandler(fixture.ws, auth);
    const alice = await signedIn(handler, provider);
    const session = (await auth.authentication.sessions.get(alice.id, false))!;
    const sid = session.tokens.providerSession!.sid;
    expect(session.tokens.providerSession!.issuer).toBe(config.oidc.issuer);
    const logout = (iss: string, value: string) =>
      handler(
        new Request(
          `${origin}/auth/front-channel-logout?${new URLSearchParams({ iss, sid: value })}`,
        ),
      );
    const me = () =>
      handler(new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }));
    for (const [iss, value] of [
      ['https://attacker.example/v2.0', sid],
      [config.oidc.issuer, ''],
      [config.oidc.issuer, 'unknown'],
    ]) {
      const ignored = await logout(iss, value);
      expect(ignored.status).toBe(200);
      expect(await ignored.text()).toBe('');
      expect((await me()).status).toBe(200);
    }
    const ended = await logout(config.oidc.issuer, sid);
    expect(ended.status).toBe(200);
    expect(await ended.text()).toBe('');
    expect(ended.headers.get('cache-control')).toBe('no-store');
    expect(ended.headers.get('content-security-policy')).toContain(
      `frame-ancestors ${provider.origin}`,
    );
    expect((await me()).status).toBe(401);
    const page = await handler(new Request(origin + '/auth/signed-out'));
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const entries = auditEntries(fixture.root);
    expect(entries.some(entry => entry.action === 'signOut' && entry.outcome === 'ok')).toBe(true);
    const sessionEnded = entries.find(entry => entry.action === 'sessionEnded');
    expect(sessionEnded?.reason).toBe('provider-signed-out');
    expect(JSON.stringify(entries)).not.toContain(sid);
    auth.close();
  }));

test('the provider session index survives a restart', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const config = entraConfig(provider);
    const first = await createServerAuthentication(fixture.ws, config);
    const alice = await signedIn(createHandler(fixture.ws, first), provider);
    const sid = (await first.authentication.sessions.get(alice.id, false))!.tokens.providerSession!
      .sid;
    first.close();
    const restarted = await createServerAuthentication(fixture.ws, config);
    const handler = createHandler(fixture.ws, restarted);
    const query = new URLSearchParams({ iss: config.oidc.issuer, sid });
    await handler(new Request(`${origin}/auth/front-channel-logout?${query}`));
    const me = await handler(
      new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }),
    );
    expect(me.status).toBe(401);
    restarted.close();
  }));

test('the session store finds sessions by provider session and forgets ended ones', async () => {
  const directory = tempDataDir('provider-sessions-');
  try {
    const key = new Uint8Array(32).fill(3);
    const store = createSessionStore({ dir: directory.root, key });
    const providerSession = { issuer: 'https://issuer/v2.0', sid: 'provider-session' };
    const principal = { id: 'person', name: 'Person' } as never;
    const tokens = { accessToken: 'a', expiresAt: Date.now() + 60_000, providerSession };
    const one = await store.create({ principal, tokens });
    const two = await store.create({ principal, tokens });
    const other = await store.create({
      principal,
      tokens: { ...tokens, providerSession: { ...providerSession, sid: 'other' } },
    });
    const stored = readdirSync(directory.root).map(name =>
      readFileSync(join(directory.root, name), 'utf8'),
    );
    expect(stored.join('')).not.toContain('provider-session');
    const ended = await store.endByProviderSession(
      providerSession.issuer,
      providerSession.sid,
      'x',
    );
    expect(ended).toHaveLength(2);
    expect(await store.get(two.id)).toBeNull();
    expect(await store.get(one.id)).toBeNull();
    expect(await store.get(other.id)).not.toBeNull();
    expect(await store.endByProviderSession('https://other/v2.0', 'other', 'x')).toEqual([]);
    await store.end(other.id);
    expect(await store.endByProviderSession(providerSession.issuer, 'other', 'x')).toEqual([]);
  } finally {
    directory.cleanup();
  }
});

test('Entra may leave the issuer out; the session id alone then ends the session', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const auth = await createServerAuthentication(fixture.ws, entraConfig(provider));
    const handler = createHandler(fixture.ws, auth);
    const alice = await signedIn(handler, provider);
    const session = (await auth.authentication.sessions.get(alice.id, false))!;
    const query = new URLSearchParams({ sid: session.tokens.providerSession!.sid });
    const response = await handler(new Request(`${origin}/auth/front-channel-logout?${query}`));
    expect(response.status).toBe(200);
    const me = await handler(
      new Request(origin + '/api/me', { headers: { Cookie: alice.cookie } }),
    );
    expect(me.status).toBe(401);
    auth.close();
  }));

test('a failure while ending sessions still answers the same empty 200 and logs no sid', () =>
  withEntraProvider(async provider => {
    using fixture = await authWorkspace();
    const config = entraConfig(provider);
    const auth = await createServerAuthentication(fixture.ws, config);
    const handler = createHandler(fixture.ws, auth);
    const failing = spyOn(auth.authentication.sessions, 'endByProviderSession');
    failing.mockImplementation(async () => {
      throw new Error('store unavailable');
    });
    const logged = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const query = new URLSearchParams({ iss: config.oidc.issuer, sid: 'secret-provider-sid' });
      const response = await handler(new Request(`${origin}/auth/front-channel-logout?${query}`));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
      const lines = logged.mock.calls.map(call => call.join(' ')).join('\n');
      expect(lines).toContain('front-channel-logout-failed');
      expect(lines).not.toContain('secret-provider-sid');
    } finally {
      logged.mockRestore();
      failing.mockRestore();
      auth.close();
    }
  }));
