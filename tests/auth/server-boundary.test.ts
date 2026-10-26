// Exercises the real authentication boundary using the mock token edge without sockets.
import { beforeAll, expect, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { oidcTransport } from '../helpers/oidc-transport';
import { authWorkspace } from '../helpers/auth-workspace';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { openAdminRepository } from '../../src/server/auth/admin-repo';
import { TEST_USERS, TEST_TENANT_ID } from '../helpers/auth-identities';
import { createHandler } from '../../src/server/handler';

beforeAll(useDefaultBrand);

test('pages redirect, denied identities stay outside, refresh removes grants, logout ends events', async () => {
  const transport = await oidcTransport();
  using fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const policy = openAdminRepository({ root: fixture.root }).load();
  policy.deactivated.principals.push({
    id: TEST_TENANT_ID + ':' + TEST_USERS.frank.oid,
    at: new Date().toISOString(),
    by: 'admin',
    reason: 'disabled',
  });
  auth.access.reload(policy);
  const handler = createHandler(fixture.ws, auth);
  const origin = transport.config.publicUrl;
  async function signIn(username: string) {
    const first = await handler(new Request(origin + '/catalog?tab=one'));
    expect(first.status).toBe(302);
    const url = first.headers.get('location')!;
    expect(new URL(url).pathname).toBe('/issuer/authorize');
    const callback = transport.authorize(url, username);
    const request = new Request(callback, {
      headers: { Cookie: first.headers.getSetCookie()[0].split(';')[0] },
    });
    const response = await handler(request);
    const cookie = response.headers
      .getSetCookie()
      .find(value => value.startsWith('sw-session='))!
      .split(';')[0];
    return { response, cookie, request };
  }
  try {
    for (const username of ['erin', 'gina', 'frank']) {
      const { response, cookie } = await signIn(username);
      expect(response.headers.get('location')).toBe('/auth/no-access');
      const page = await handler(
        new Request(origin + '/anywhere', {
          headers: { Cookie: cookie },
        }),
      );
      expect(page.headers.get('location')).toBe('/auth/no-access');
      const denied = await handler(
        new Request(origin + '/api/me', {
          headers: { Cookie: cookie },
        }),
      );
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: 'no access' });
    }
    const frank = await signIn('frank');
    policy.deactivated.principals = [];
    auth.access.reload(policy);
    const reactivated = await handler(
      new Request(origin + '/api/me', {
        headers: { Cookie: frank.cookie },
      }),
    );
    expect(reactivated.status).toBe(200);
    const bob = await signIn('bob');
    expect(bob.response.headers.get('location')).toBe('/catalog?tab=one');
    const me = await handler(new Request(origin + '/api/me', { headers: { Cookie: bob.cookie } }));
    expect((await me.json()).roleSources[0].via).toBe('email');
    const replay = await handler(bob.request.clone());
    expect(await replay.text()).toContain('Expired or replayed');

    const alice = await signIn('alice');
    const headers = { Cookie: alice.cookie };
    const stream = await handler(new Request(origin + '/api/events', { headers }));
    const reader = stream.body!.getReader();
    await reader.read();
    const logout = await handler(
      new Request(origin + '/auth/logout', {
        method: 'POST',
        headers: { ...headers, Origin: origin, 'X-SW-Request': '1' },
      }),
    );
    expect(logout.status).toBe(200);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('session-ended');
    expect((await reader.read()).done).toBe(true);
    expect((await handler(new Request(origin + '/api/me', { headers }))).status).toBe(401);

    const refreshed = await signIn('alice');
    const id = refreshed.cookie.split('=')[1];
    const session = (await auth.authentication.sessions.get(id))!;
    session.tokens.expiresAt = 0;
    await auth.authentication.sessions.update(session);
    transport.state.users.alice.groups = [];
    const lost = await handler(
      new Request(origin + '/api/me', {
        headers: { Cookie: refreshed.cookie },
      }),
    );
    expect(lost.status).toBe(403);
    const signedOut = await handler(new Request(origin + '/auth/signed-out'));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get('set-cookie')).toBeNull();
  } finally {
    auth.close();
  }
}, 30000);

test('the auth modules never import HTTP routing, which depends on them', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const modules = readdirSync('src/server/auth').filter(name => name.endsWith('.ts'));
  const importers = modules.filter(name =>
    /from '\.\.\/routes\//.test(readFileSync('src/server/auth/' + name, 'utf8')),
  );
  expect(importers).toEqual([]);
});
