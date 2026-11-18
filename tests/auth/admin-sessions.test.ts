// Exercises administrative session effects with signed mock tokens and direct handler calls.
import { expect, test } from 'bun:test';
import { oidcTransport } from '../helpers/oidc-transport';
import { authWorkspace } from '../helpers/auth-workspace';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createHandler } from '../../src/server/handler';
import { person } from './access-fixture';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore } from '../../src/server/auth/sessions';
import { localPrincipal } from '../../src/server/auth/principal';

test('deactivation closes streams and sessions; reactivation restores the next sign-in', async () => {
  const transport = await oidcTransport('keycloak');
  using fixture = await authWorkspace({ keycloak: true });
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const handler = createHandler(fixture.ws, auth);
  const origin = transport.config.publicUrl;
  async function signIn(username: string) {
    const start = await handler(new Request(origin + '/auth/login'));
    const response = await handler(
      new Request(transport.authorize(start.headers.get('location')!, username), {
        headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    return response.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('sw-session='))!
      .split(';')[0];
  }
  try {
    const admin = await signIn('dave');
    const alice = await signIn('alice');
    const request = (path: string, method = 'GET', body?: unknown) =>
      handler(
        new Request(origin + path, {
          method,
          headers: { Cookie: admin, Origin: origin, 'X-SW-Request': '1' },
          ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const provider = await (await request('/api/admin/provider')).json();
    expect(provider.jwksRefreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const users = await (await request('/api/admin/users')).json();
    const aliceId = users.find((user: any) => user.name === person('alice').name).id;
    const stream = await handler(new Request(origin + '/api/events', { headers: { Cookie: alice } }));
    const reader = stream.body!.getReader();
    await reader.read();
    const disabled = await request('/api/admin/users/' + encodeURIComponent(aliceId) + '/deactivate', 'POST', { reason: 'Leave' });
    expect(disabled.status).toBe(200);
    let frames = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      frames += new TextDecoder().decode(chunk.value);
    }
    expect(frames).toContain('event: access');
    expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: alice } }))).status).toBe(401);
    expect((await (await request('/api/admin/sessions')).json()).some((session: any) => session.principal === aliceId)).toBe(false);
    expect(
      (
        await request('/api/admin/users/' + encodeURIComponent(aliceId) + '/reactivate', 'POST', {
          reason: 'Returned',
        })
      ).status,
    ).toBe(200);
    const renewed = await signIn('alice');
    expect((await handler(new Request(origin + '/api/me', { headers: { Cookie: renewed } }))).status).toBe(200);
    expect(await (await request('/api/admin/groups/' + encodeURIComponent('/Sales Editors'))).json()).toEqual({
      id: '/Sales Editors',
      displayName: '/Sales Editors',
      resolved: true,
    });
  } finally {
    auth.close();
  }
}, 30000);

test('an access change ends only the live-update streams of the people it affects', async () => {
  const transport = await oidcTransport('keycloak');
  using fixture = await authWorkspace({ keycloak: true });
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const handler = createHandler(fixture.ws, auth);
  const origin = transport.config.publicUrl;
  async function signIn(username: string) {
    const start = await handler(new Request(origin + '/auth/login'));
    const response = await handler(
      new Request(transport.authorize(start.headers.get('location')!, username), {
        headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    return response.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('sw-session='))!
      .split(';')[0];
  }
  async function openStream(cookie: string) {
    const stream = await handler(new Request(origin + '/api/events', { headers: { Cookie: cookie } }));
    const reader = stream.body!.getReader();
    await reader.read();
    return reader;
  }
  try {
    const admin = await signIn('dave');
    const bobStream = await openStream(await signIn('bob'));
    const aliceStream = await openStream(await signIn('alice'));
    const request = async (path: string, method = 'GET', body?: unknown) =>
      handler(
        new Request(origin + path, {
          method,
          headers: { Cookie: admin, Origin: origin, 'X-SW-Request': '1' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const current = await (await request('/api/admin/grants')).json();
    const grants = current.grants.filter((grant: any) => grant.id !== 'g-bob');
    const { dryRunId } = await (await request('/api/admin/policies/dry-run', 'POST', { grants })).json();
    const saved = await request('/api/admin/grants', 'PUT', {
      grants,
      dryRunId,
      baseVersion: current.version,
    });
    expect(saved.status).toBe(200);
    let frames = '';
    while (true) {
      const chunk = await bobStream.read();
      if (chunk.done) break;
      frames += new TextDecoder().decode(chunk.value);
    }
    expect(frames).toContain('event: access\ndata: {"reason":"changed"}');
    // Alice's stream may still carry her suggestion count; it must stay open without an access
    // frame.
    let aliceFrames = '';
    let aliceOpen = true;
    while (aliceOpen) {
      const next = await Promise.race([aliceStream.read(), new Promise<null>(resolve => setTimeout(() => resolve(null), 200))]);
      if (next === null) break;
      if (next.done) aliceOpen = false;
      else aliceFrames += new TextDecoder().decode(next.value);
    }
    expect(aliceOpen).toBe(true);
    expect(aliceFrames).not.toContain('event: access');
    await aliceStream.cancel();
  } finally {
    auth.close();
  }
}, 30000);

test('a project created into a domain reaches the open stream of the domain Steward', async () => {
  const transport = await oidcTransport('keycloak');
  using fixture = await authWorkspace({ keycloak: true });
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const handler = createHandler(fixture.ws, auth);
  const origin = transport.config.publicUrl;
  async function signIn(username: string) {
    const start = await handler(new Request(origin + '/auth/login'));
    const response = await handler(
      new Request(transport.authorize(start.headers.get('location')!, username), {
        headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    return response.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('sw-session='))!
      .split(';')[0];
  }
  try {
    const admin = await signIn('dave');
    const steward = await signIn('bob');
    const stream = await handler(new Request(origin + '/api/events', { headers: { Cookie: steward } }));
    const reader = stream.body!.getReader();
    await reader.read();
    // Carol views only HR, so she has no grant on the new project's domain.
    const outsider = await handler(new Request(origin + '/api/events', { headers: { Cookie: await signIn('carol') } }));
    const outsiderReader = outsider.body!.getReader();
    await outsiderReader.read();
    const created = await handler(
      new Request(origin + '/api/projects', {
        method: 'POST',
        headers: { Cookie: admin, Origin: origin, 'X-SW-Request': '1' },
        body: JSON.stringify({ name: 'Sales forecasts', domain: 'sales' }),
      }),
    );
    expect(created.status).toBe(200);
    const { slug } = await created.json();
    const announcement = `"added":["${slug}"]`;
    let frames = '';
    const deadline = Date.now() + 5000;
    while (!frames.includes(announcement) && Date.now() < deadline) {
      const next = await Promise.race([reader.read(), new Promise<null>(resolve => setTimeout(() => resolve(null), 500))]);
      if (next === null) continue;
      if (next.done) break;
      frames += new TextDecoder().decode(next.value);
    }
    expect(frames).toContain('event: projects');
    expect(frames).toContain(announcement);
    await reader.cancel();
    let outsiderFrames = '';
    while (true) {
      const next = await Promise.race([outsiderReader.read(), new Promise<null>(resolve => setTimeout(() => resolve(null), 500))]);
      if (next === null || next.done) break;
      outsiderFrames += new TextDecoder().decode(next.value);
    }
    expect(outsiderFrames).not.toContain(announcement);
    await outsiderReader.cancel();
  } finally {
    auth.close();
  }
}, 30000);

function referenceStore() {
  const dir = mkdtempSync(join(tmpdir(), 'session-reference-'));
  let now = 1000;
  const store = createSessionStore({ dir, key: new Uint8Array(32).fill(5), now: () => now });
  const identity = { principal: localPrincipal(), tokens: { accessToken: 'token', expiresAt: 99999 } };
  const referenceOf = (id: string) => createHash('sha256').update(id).digest('hex');
  return { dir, store, identity, referenceOf, advance: (hours: number) => (now += hours * 3600000) };
}

test('a lookup by reference leaves the last-seen time unchanged', async () => {
  const { dir, store, identity, referenceOf, advance } = referenceStore();
  try {
    const session = await store.create(identity);
    advance(1);
    for (let call = 0; call < 50; call++) expect(await store.getByReference(referenceOf(session.id))).not.toBeNull();
    expect((await store.get(session.id, false))!.lastSeenAt).toBe(1000);
    expect(await store.getByReference('not-a-reference')).toBeNull();
    expect(await store.getByReference('0'.repeat(64))).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a session that reaches its idle limit ends on schedule even when found by reference', async () => {
  const { dir, store, identity, referenceOf, advance } = referenceStore();
  try {
    const session = await store.create(identity);
    const ended: string[] = [];
    store.onEnded((reference, reason) => ended.push(`${reference}:${reason}`));
    advance(7);
    expect(await store.getByReference(referenceOf(session.id))).not.toBeNull();
    advance(1);
    expect(await store.getByReference(referenceOf(session.id))).toBeNull();
    expect(ended).toEqual([`${referenceOf(session.id)}:expired`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every way a session is removed calls the end listener once', async () => {
  const { dir, store, identity, referenceOf, advance } = referenceStore();
  try {
    const ended: string[] = [];
    store.onEnded((_reference, reason) => ended.push(reason));
    const signedOut = await store.create(identity);
    await store.end(signedOut.id);
    const byAdmin = await store.create({ ...identity, principal: { ...localPrincipal(), id: 'someone' } });
    await store.endPrincipal('someone');
    const swept = await store.create(identity);
    advance(9);
    await store.sweep();
    const viaGet = await store.create(identity);
    advance(9);
    await store.get(viaGet.id);
    expect(ended).toEqual(['sign-out', 'admin', 'expired', 'expired']);
    expect(await store.get(byAdmin.id)).toBeNull();
    expect(await store.get(swept.id)).toBeNull();
    expect(referenceOf(signedOut.id)).toHaveLength(64);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing listener does not stop the others and a removed listener hears nothing', async () => {
  const { dir, store, identity } = referenceStore();
  try {
    const heard: string[] = [];
    store.onEnded(() => {
      throw new Error('listener failure');
    });
    const stop = store.onEnded((_reference, reason) => heard.push(reason));
    await store.end((await store.create(identity)).id);
    stop();
    await store.end((await store.create(identity)).id);
    expect(heard).toEqual(['sign-out']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
