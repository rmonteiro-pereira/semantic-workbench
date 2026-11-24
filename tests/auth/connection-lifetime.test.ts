// Checks that a connection lives and dies with the browser session: sign-out, idle expiry that agent calls do not extend, deactivation, grant changes, restart, and revocation by the person or an Admin.
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { localPrincipal } from '../../src/server/auth/principal';
import { createSessionStore } from '../../src/server/auth/sessions';
import { openConnectionStore } from '../../src/server/connections/connection-store';
import { createConnectionService } from '../../src/server/connections/connection-service';
import { createPendingGrants } from '../../src/server/connections/pending-grants';
import { deriveConnectionKey } from '../../src/server/connections/token-keys';
import { CHALLENGE, RESOURCE, VERIFIER, program } from '../connections/connection-fixture';
import { openConnectionServer, referenceProgram, type ConnectionServer } from '../helpers/connection-server';

const servers: ConnectionServer[] = [];
const roots: string[] = [];
afterEach(() => {
  servers.splice(0).forEach(server => server.close());
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
});
async function open() {
  const server = await openConnectionServer();
  servers.push(server);
  return server;
}

const HOUR = 3_600_000;

/** A service over a real session store and a clock the test moves, so idle expiry can be crossed. */
function timedService() {
  const root = mkdtempSync(join(tmpdir(), 'connection-lifetime-'));
  roots.push(root);
  let clock = 1_000_000;
  const key = deriveConnectionKey(new Uint8Array(32).fill(4));
  const openSessions = () => createSessionStore({ dir: join(root, 'sessions'), key: new Uint8Array(32).fill(5), now: () => clock });
  let sessions = openSessions();
  const grants = createPendingGrants({ key, now: () => clock });
  const audit = createAuditLog({ dir: join(root, 'audit'), now: () => new Date(clock) });
  const principal = { ...localPrincipal(), id: 'alice', name: 'Alice' };
  const build = () =>
    createConnectionService({
      store: openConnectionStore(join(root, 'connections')),
      grants,
      key,
      sessions,
      principalFor: identity => identity,
      programs: () => ({ formatVersion: 1, programs: [program] }),
      audit,
      resource: RESOURCE,
      now: () => clock,
    });
  async function connect(service: ReturnType<typeof build>) {
    const session = await sessions.create({ principal, tokens: { accessToken: 'provider', expiresAt: 9e15 } });
    const code = grants.issue({
      kind: 'code',
      clientId: program.clientId,
      redirectUri: program.redirectUris[0],
      scopes: ['read'],
      resource: RESOURCE,
      codeChallenge: CHALLENGE,
      person: 'alice',
      sessionReference: createHash('sha256').update(session.id).digest('hex'),
      origin: 'mcp',
    });
    const traded = await service.issueFromCode({ code: code.value, clientId: program.clientId, redirectUri: program.redirectUris[0], codeVerifier: VERIFIER, resource: RESOURCE });
    if (!traded.ok) throw new Error('trade refused');
    return { session, tokens: traded.tokens, id: traded.connection };
  }
  /** Starts the session store again, as a restart does, without telling the previous service anything. */
  const restartSessions = () => {
    sessions = openSessions();
  };
  return {
    root,
    get sessions() {
      return sessions;
    },
    restartSessions,
    build,
    connect,
    advance: (milliseconds: number) => (clock += milliseconds),
    audit,
    now: () => clock,
  };
}

test('signing out ends the connection: both tokens fail and the end is audited once', async () => {
  const server = await open();
  const { cookie, tokens } = await server.connect('alice');
  const service = server.auth.connections.service;
  expect((await service.resolve(tokens.access_token)).ok).toBe(true);
  await server.json('/auth/logout', 'POST', cookie);
  expect((await service.resolve(tokens.access_token)).ok).toBe(false);
  expect((await server.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'reference-client', resource: server.resource })).status).toBe(400);
  const month = new Date().toISOString().slice(0, 7);
  const ended = server.auth.audit.entries(month).filter(entry => entry.action === 'connection.ended');
  expect(ended).toHaveLength(1);
  expect(ended[0].reason).toBe('signed-out');
});

test('agent calls do not extend the session and the connection ends with it on schedule', async () => {
  const world = timedService();
  const service = world.build();
  const { session, tokens, id } = await world.connect(service);
  const seenAt = (await world.sessions.get(session.id, false))!.lastSeenAt;
  // A thousand calls spread over the idle window, refreshing the short-lived access token whenever it lapses.
  let access = tokens.accessToken;
  let refresh = tokens.refreshToken;
  for (let call = 0; call < 1000; call++) {
    world.advance(Math.floor((7 * HOUR) / 1000));
    let resolved = await service.resolve(access);
    if (!resolved.ok) {
      const next = await service.refresh({ refreshToken: refresh, clientId: program.clientId, resource: RESOURCE });
      if (!next.ok) throw new Error('refresh refused before the idle limit');
      access = next.tokens.accessToken;
      refresh = next.tokens.refreshToken;
      resolved = await service.resolve(access);
    }
    expect(resolved.ok).toBe(true);
  }
  expect((await world.sessions.get(session.id, false))!.lastSeenAt).toBe(seenAt);
  world.advance(HOUR + 1000);
  expect((await service.refresh({ refreshToken: refresh, clientId: program.clientId, resource: RESOURCE })).ok).toBe(false);
  await world.sessions.sweep();
  expect((await service.resolve(access)).ok).toBe(false);
  expect(service.listAll().find(view => view.id === id)).toMatchObject({ state: 'ended', endReason: 'expired' });
});

test('a restart keeps the connections whose sessions survive and ends the others at the first sweep', async () => {
  const world = timedService();
  const first = world.build();
  const kept = await world.connect(first);
  const lost = await world.connect(first);
  // The session of `lost` ended while the server was down, so no listener heard it.
  rmSync(join(world.root, 'sessions', `${createHash('sha256').update(lost.session.id).digest('hex')}.json`));
  world.restartSessions();
  const second = world.build();
  expect(await second.sweep()).toBe(1);
  expect((await second.resolve(kept.tokens.accessToken)).ok).toBe(true);
  expect(second.listAll().find(view => view.id === lost.id)).toMatchObject({ state: 'ended', endReason: 'session-ended' });
  expect((await second.resolve(lost.tokens.accessToken)).ok).toBe(false);
});

test('a deactivated person loses the connection with the session at once', async () => {
  const server = await open();
  const admin = await server.signIn('dave');
  const { tokens } = await server.connect('alice');
  const users = await (await server.json('/api/admin/users', 'GET', admin)).json();
  const aliceId = users.find((user: { name: string }) => user.name === 'Alice Andrade').id;
  expect((await server.json(`/api/admin/users/${encodeURIComponent(aliceId)}/deactivate`, 'POST', admin, { reason: 'Leave' })).status).toBe(200);
  expect((await server.auth.connections.service.resolve(tokens.access_token)).ok).toBe(false);
  expect(server.auth.connections.service.listAll()[0].state).toBe('ended');
});

test('a grant change reduces the next call and an unrelated project still works', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice', 'read edit');
  const service = server.auth.connections.service;
  const boundary = (server.handler as unknown as { boundary: { availableOperations: (caller: unknown) => string[] } }).boundary;
  const before = await service.resolve(tokens.access_token);
  if (!before.ok) throw new Error('not resolved');
  expect(boundary.availableOperations(before.caller)).toContain('files.save');
  await server.auth.administration.ensure();
  const files = server.auth.administration.files();
  const grants = JSON.parse(files['grants.json']);
  for (const grant of grants.grants) if (grant.roleId === 'editor') grant.roleId = 'viewer';
  await server.auth.administration.write(
    { 'grants.json': JSON.stringify(grants) },
    { author: { name: 'Test Admin', email: 'admin@example.org' }, baseVersion: await server.auth.administration.version(), message: 'grants: Demote editors' },
  );
  const after = await service.resolve(tokens.access_token);
  if (!after.ok) throw new Error('not resolved');
  const available = boundary.availableOperations(after.caller);
  expect(available).not.toContain('files.delete');
  expect(available).toContain('files.read');
  expect(after.caller.principal.grants.every(grant => grant.roleId !== 'editor')).toBe(true);
});

test('a person with no remaining grant is refused and the connection ends', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice');
  await server.auth.administration.ensure();
  const grants = JSON.parse(server.auth.administration.files()['grants.json']);
  grants.grants = grants.grants.filter((grant: { member: { groupId?: string } }) => grant.member.groupId !== 'Sales Editors');
  await server.auth.administration.write(
    { 'grants.json': JSON.stringify(grants) },
    { author: { name: 'Test Admin', email: 'admin@example.org' }, baseVersion: await server.auth.administration.version(), message: 'grants: Remove editors' },
  );
  expect((await server.auth.connections.service.resolve(tokens.access_token)).ok).toBe(false);
  expect(server.auth.connections.service.listAll()[0]).toMatchObject({ state: 'ended', endReason: 'no-access' });
});

test('the identity provider is never contacted by an agent call', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice');
  const before = server.transport.state.codes.size;
  for (let call = 0; call < 20; call++) await server.auth.connections.service.resolve(tokens.access_token);
  expect(server.transport.state.codes.size).toBe(before);
  expect(referenceProgram.clientId).toBe('reference-client');
});

test('a person lists their own connections and revokes one without touching the others or the browser session', async () => {
  const server = await open();
  const first = await server.connect('alice');
  const second = await server.connect('alice');
  const bob = await server.connect('bob');
  const cookie = first.cookie;
  const list = await (await server.json('/api/connections', 'GET', cookie)).json();
  expect(list).toHaveLength(2);
  expect(list[0]).toMatchObject({ clientId: 'reference-client', programName: 'Protocol reference client', origin: 'mcp', scopes: ['read', 'edit'], state: 'active' });
  expect(Object.keys(list[0]).sort()).toEqual(['clientId', 'createdAt', 'id', 'lastUsedAt', 'origin', 'personName', 'programName', 'scopes', 'state']);
  const target = list.find((view: { id: string }) => view.id !== undefined);
  const revoked = await server.json(`/api/connections/${target.id}`, 'DELETE', cookie);
  expect(revoked.status).toBe(200);
  const service = server.auth.connections.service;
  const results = await Promise.all([service.resolve(first.tokens.access_token), service.resolve(second.tokens.access_token)]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect((await server.json('/api/me', 'GET', cookie)).status).toBe(200);
  expect((await service.resolve(bob.tokens.access_token)).ok).toBe(true);
  const after = await (await server.json('/api/connections', 'GET', cookie)).json();
  expect(after.find((view: { id: string }) => view.id === target.id)).toMatchObject({ state: 'ended', endReason: 'revoked-by-person' });
});

test('another person is told 404 for a connection that is not theirs, as for one that does not exist', async () => {
  const server = await open();
  await server.connect('alice');
  const bob = await server.signIn('bob');
  const [theirs] = server.auth.connections.service.listAll();
  const foreign = await server.json(`/api/connections/${theirs.id}`, 'DELETE', bob);
  const missing = await server.json('/api/connections/AAAAAAAAAAAAAAAAAAAAAA', 'DELETE', bob);
  expect(foreign.status).toBe(404);
  expect(await foreign.text()).toBe(await missing.text());
  expect(missing.status).toBe(404);
  expect(server.auth.connections.service.listAll()[0].state).toBe('active');
  expect(await (await server.json('/api/connections', 'GET', bob)).json()).toEqual([]);
});

test('an Admin lists every connection with the person named, sees no token or hash, and may revoke any', async () => {
  const server = await open();
  const { tokens } = await server.connect('alice');
  const admin = await server.signIn('dave');
  const response = await server.json('/api/admin/connections', 'GET', admin);
  const text = await response.text();
  expect(JSON.parse(text)[0]).toMatchObject({ personName: 'Alice Andrade', clientId: 'reference-client', state: 'active' });
  expect(text).not.toContain(tokens.access_token);
  expect(text).not.toContain(tokens.refresh_token);
  expect(text).not.toMatch(/hash|sessionReference|retired/i);
  const id = JSON.parse(text)[0].id;
  expect((await server.json('/api/admin/connections/AAAAAAAAAAAAAAAAAAAAAA', 'DELETE', admin)).status).toBe(404);
  expect((await server.json(`/api/admin/connections/${id}`, 'DELETE', admin)).status).toBe(200);
  expect((await server.auth.connections.service.resolve(tokens.access_token)).ok).toBe(false);
  expect(server.auth.connections.service.listAll()[0]).toMatchObject({ state: 'ended', endReason: 'revoked-by-admin' });
  const alice = await server.signIn('alice');
  expect((await server.json('/api/admin/connections', 'GET', alice)).status).toBe(403);
});
