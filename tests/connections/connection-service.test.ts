// Checks every transition of a connection with fakes: issue, refresh, replay, binding, expiry, end and the sweep.
import { afterEach, expect, test } from 'bun:test';
import { ACCESS_TOKEN_LIFETIME_MS } from '../../src/server/connections/connection-transitions';
import { MAX_LIVE_CONNECTIONS_PER_PERSON } from '../../src/server/connections/connection-service';
import { CODE_LIFETIME_MS } from '../../src/server/connections/pending-grants';
import { RESOURCE, connectionFixture, principalNamed, program, referenceOf } from './connection-fixture';

const fixtures: ReturnType<typeof connectionFixture>[] = [];
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.cleanup()));
function open(options: Parameters<typeof connectionFixture>[0] = {}) {
  const fixture = connectionFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function connect(fixture: ReturnType<typeof open>, sessionId = 'session-one') {
  const session = fixture.signIn(sessionId);
  const outcome = await fixture.trade(fixture.codeFor(session));
  if (!outcome.ok) throw new Error(`trade refused: ${outcome.reason}`);
  return { session, tokens: outcome.tokens, id: outcome.connection };
}

test('a code is traded once for tokens and the connection is bound to the session', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  expect(tokens.scope).toBe('read edit');
  expect(tokens.expiresInSeconds).toBe(600);
  const record = fixture.store.get(id)!;
  expect(record).toMatchObject({
    person: 'alice',
    clientId: 'reference-client',
    scopes: ['read', 'edit'],
    resource: RESOURCE,
    sessionReference: referenceOf('session-one'),
    generation: 0,
    state: 'active',
  });
  const resolved = await fixture.service.resolve(tokens.accessToken);
  expect(resolved.ok).toBe(true);
  if (resolved.ok) expect(resolved.caller).toMatchObject({ origin: 'mcp', connection: id, scope: ['read', 'localWrite'] });
});

test('only hashes are stored: no token appears in the record, the audit log or a listing', async () => {
  const fixture = open();
  const { tokens } = await connect(fixture);
  const stored = JSON.stringify(fixture.store.all());
  const listed = JSON.stringify(fixture.service.listAll());
  for (const secret of [tokens.accessToken, tokens.refreshToken]) {
    expect(stored).not.toContain(secret);
    expect(listed).not.toContain(secret);
    expect(fixture.auditText()).not.toContain(secret);
  }
  expect(listed).not.toContain('hash');
  expect(listed).not.toContain(referenceOf('session-one'));
});

test('a second use of a code ends the connection the first use produced', async () => {
  const fixture = open();
  const session = fixture.signIn('session-one');
  const code = fixture.codeFor(session);
  const first = await fixture.trade(code);
  expect(first.ok).toBe(true);
  expect(await fixture.trade(code)).toMatchObject({ ok: false, reason: 'replayed-credential' });
  if (first.ok) {
    expect(fixture.store.get(first.connection)?.endReason).toBe('code-reuse');
    expect((await fixture.service.resolve(first.tokens.accessToken)).ok).toBe(false);
    expect((await fixture.service.refresh({ refreshToken: first.tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok).toBe(false);
  }
  expect(fixture.auditEntries().filter(entry => entry.action === 'connection.replay')).toHaveLength(1);
});

test('every wrong binding spends the code and is refused', async () => {
  const cases: [string, Partial<Parameters<ReturnType<typeof open>['service']['issueFromCode']>[0]>][] = [
    ['another program', { clientId: 'other-client' }],
    ['another redirect address', { redirectUri: 'http://127.0.0.1:8765/other' }],
    ['another resource', { resource: 'https://wb.example/api/other' }],
    ['a wrong verifier', { codeVerifier: 'w'.repeat(43) }],
    ['a short verifier', { codeVerifier: 'short' }],
  ];
  for (const [label, change] of cases) {
    const fixture = open();
    const session = fixture.signIn('session-one');
    const code = fixture.codeFor(session);
    expect((await fixture.trade(code, change)).ok, label).toBe(false);
    expect((await fixture.trade(code)).ok, `${label}: the code stays spent`).toBe(false);
    expect(fixture.store.all(), label).toHaveLength(0);
  }
});

test('an expired or unknown code is refused', async () => {
  const fixture = open();
  const session = fixture.signIn('session-one');
  const code = fixture.codeFor(session);
  fixture.advance(CODE_LIFETIME_MS);
  expect(await fixture.trade(code)).toMatchObject({ ok: false, reason: 'unknown-credential' });
  expect(await fixture.trade('never-issued')).toMatchObject({ ok: false, reason: 'unknown-credential' });
});

test('a code from a setup credential or the reverse is not accepted', async () => {
  const fixture = open();
  const session = fixture.signIn('session-one');
  const setup = fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['read'] });
  expect(setup.ok).toBe(true);
  if (!setup.ok) return;
  expect(await fixture.trade(setup.credential)).toMatchObject({ ok: false, reason: 'binding-mismatch' });
  const code = fixture.codeFor(session);
  expect(await fixture.service.issueFromSetup({ setupCredential: code, clientId: program.clientId, resource: RESOURCE })).toMatchObject({ ok: false, reason: 'binding-mismatch' });
});

test('a program removed after consent, or one that lost a scope, cannot trade the code', async () => {
  const removed = open();
  const session = removed.signIn('session-one');
  const code = removed.codeFor(session);
  removed.state.programs = { formatVersion: 1, programs: [] };
  expect(await removed.trade(code)).toMatchObject({ ok: false, reason: 'program-not-registered' });
  const narrowed = open();
  const narrowedSession = narrowed.signIn('session-one');
  const narrowedCode = narrowed.codeFor(narrowedSession);
  narrowed.state.programs = { formatVersion: 1, programs: [{ ...program, scopes: ['read'] }] };
  expect(await narrowed.trade(narrowedCode)).toMatchObject({ ok: false, reason: 'program-not-registered' });
  const moved = open();
  const movedSession = moved.signIn('session-one');
  const movedCode = moved.codeFor(movedSession);
  moved.state.programs = { formatVersion: 1, programs: [{ ...program, redirectUris: ['http://127.0.0.1:9999/callback'] }] };
  expect((await moved.trade(movedCode)).ok).toBe(false);
});

test('a trade after the session ended or the person lost access is refused and creates nothing', async () => {
  const ended = open();
  const session = ended.signIn('session-one');
  const code = ended.codeFor(session);
  ended.sessions.clear();
  expect(await ended.trade(code)).toMatchObject({ ok: false, reason: 'session-ended' });
  const denied = open();
  const deniedSession = denied.signIn('session-one');
  const deniedCode = denied.codeFor(deniedSession);
  denied.state.principals.set('alice', principalNamed('alice', { deactivated: true }));
  expect(await denied.trade(deniedCode)).toMatchObject({ ok: false, reason: 'no-access' });
  expect(denied.store.all()).toHaveLength(0);
});

test('a refresh rotates both tokens and retires the old refresh token', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  const refreshed = await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE });
  expect(refreshed.ok).toBe(true);
  if (!refreshed.ok) return;
  expect(refreshed.tokens.accessToken).not.toBe(tokens.accessToken);
  expect(refreshed.tokens.refreshToken).not.toBe(tokens.refreshToken);
  expect(fixture.store.get(id)).toMatchObject({ generation: 1, state: 'active' });
  expect((await fixture.service.resolve(tokens.accessToken)).ok).toBe(false);
  expect((await fixture.service.resolve(refreshed.tokens.accessToken)).ok).toBe(true);
});

test('presenting a retired refresh token ends the connection and the current tokens stop working', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  const refreshed = await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE });
  if (!refreshed.ok) throw new Error('refresh refused');
  const replay = await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE });
  expect(replay).toMatchObject({ ok: false, reason: 'replayed-credential' });
  expect(fixture.store.get(id)).toMatchObject({ state: 'ended', endReason: 'replay' });
  expect((await fixture.service.resolve(refreshed.tokens.accessToken)).ok).toBe(false);
  expect((await fixture.service.refresh({ refreshToken: refreshed.tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok).toBe(false);
  expect(fixture.auditEntries().filter(entry => entry.action === 'connection.replay')).toHaveLength(1);
});

test('a refresh token older than the retired list reads as unknown and revokes nothing', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  let current = tokens;
  for (let round = 0; round < 10; round++) {
    const next = await fixture.service.refresh({ refreshToken: current.refreshToken, clientId: program.clientId, resource: RESOURCE });
    if (!next.ok) throw new Error('refresh refused');
    current = next.tokens;
  }
  expect(await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).toMatchObject({ ok: false, reason: 'unknown-credential' });
  expect(fixture.store.get(id)?.state).toBe('active');
  expect(fixture.store.get(id)?.retiredRefresh).toHaveLength(8);
});

test('a refresh for another program or resource is refused and leaves the connection alone', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  expect((await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: 'other-client', resource: RESOURCE })).ok).toBe(false);
  expect((await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: 'https://wb.example/api/other' })).ok).toBe(false);
  expect(fixture.store.get(id)).toMatchObject({ state: 'active', generation: 0 });
  expect((await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok).toBe(true);
});

test('two refreshes with one token cannot both succeed', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  const trade = { refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE };
  const results = await Promise.all([fixture.service.refresh(trade), fixture.service.refresh(trade)]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(fixture.store.get(id)?.state).toBe('ended');
});

test('an access token stops at its lifetime and the refresh token still works until the session ends', async () => {
  const fixture = open();
  const { tokens } = await connect(fixture);
  fixture.advance(ACCESS_TOKEN_LIFETIME_MS - 1);
  expect((await fixture.service.resolve(tokens.accessToken)).ok).toBe(true);
  fixture.advance(1);
  expect((await fixture.service.resolve(tokens.accessToken)).ok).toBe(false);
  expect((await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok).toBe(true);
});

test('an unknown token resolves to nothing', async () => {
  const fixture = open();
  await connect(fixture);
  expect((await fixture.service.resolve('not-a-token')).ok).toBe(false);
  expect((await fixture.service.resolve('')).ok).toBe(false);
});

test('ending the session ends its connections with the right reason, once, and audits them', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  const heard: string[] = [];
  fixture.service.onConnectionEnded(ended => heard.push(`${ended.connectionId}:${ended.reason}`));
  fixture.endSession('session-one', 'sign-out');
  expect(fixture.store.get(id)).toMatchObject({ state: 'ended', endReason: 'signed-out' });
  expect(heard).toEqual([`${id}:signed-out`]);
  fixture.endSession('session-one', 'sign-out');
  expect(heard).toHaveLength(1);
  expect((await fixture.service.resolve(tokens.accessToken)).ok).toBe(false);
  expect((await fixture.service.refresh({ refreshToken: tokens.refreshToken, clientId: program.clientId, resource: RESOURCE })).ok).toBe(false);
  expect(fixture.auditEntries().filter(entry => entry.action === 'connection.ended')).toHaveLength(1);
  expect(fixture.store.get(id)).toMatchObject({ access: null, refresh: null, retiredRefresh: [] });
});

test('the reason of a session end is kept: expiry and other ends', async () => {
  const expired = open();
  const first = await connect(expired);
  expired.endSession('session-one', 'expired');
  expect(expired.store.get(first.id)?.endReason).toBe('expired');
  const other = open();
  const second = await connect(other);
  other.endSession('session-one', 'admin');
  expect(other.store.get(second.id)?.endReason).toBe('session-ended');
});

test('deactivation, lost grants and a removed program end the connection at the next call', async () => {
  const deactivated = open();
  const one = await connect(deactivated);
  deactivated.state.principals.set('alice', principalNamed('alice', { deactivated: true }));
  expect((await deactivated.service.resolve(one.tokens.accessToken)).ok).toBe(false);
  expect(deactivated.store.get(one.id)?.endReason).toBe('deactivated');
  const noGrants = open();
  const two = await connect(noGrants);
  noGrants.state.principals.set('alice', principalNamed('alice', { grants: [] }));
  expect((await noGrants.service.resolve(two.tokens.accessToken)).ok).toBe(false);
  expect(noGrants.store.get(two.id)?.endReason).toBe('no-access');
  const removed = open();
  const three = await connect(removed);
  removed.state.programs = { formatVersion: 1, programs: [] };
  expect((await removed.service.resolve(three.tokens.accessToken)).ok).toBe(false);
  expect(removed.store.get(three.id)?.endReason).toBe('program-removed');
  const narrowed = open();
  const four = await connect(narrowed);
  narrowed.state.programs = { formatVersion: 1, programs: [{ ...program, scopes: ['read'] }] };
  expect((await narrowed.service.resolve(four.tokens.accessToken)).ok).toBe(false);
  expect(narrowed.store.get(four.id)?.endReason).toBe('scope-removed');
});

test('the sweep ends what no longer fits and removes old ended records', async () => {
  const fixture = open();
  const { id } = await connect(fixture, 'session-one');
  const other = await connect(fixture, 'session-two');
  fixture.sessions.delete(referenceOf('session-one'));
  expect(await fixture.service.sweep()).toBe(1);
  expect(fixture.store.get(id)?.endReason).toBe('session-ended');
  expect(fixture.store.get(other.id)?.state).toBe('active');
  fixture.advance(8 * 24 * 3_600_000);
  await fixture.service.sweep();
  expect(fixture.store.get(id)).toBeUndefined();
});

test('the resolve of a call never writes the last-used time more than once a minute', async () => {
  const fixture = open();
  const { tokens, id } = await connect(fixture);
  fixture.advance(30_000);
  await fixture.service.resolve(tokens.accessToken);
  expect(fixture.store.get(id)?.lastUsedAt).toBe(1_000_000);
  fixture.advance(30_000);
  await fixture.service.resolve(tokens.accessToken);
  expect(fixture.store.get(id)?.lastUsedAt).toBe(1_060_000);
});

test('ending is idempotent and a person may hold only so many live connections', async () => {
  const fixture = open();
  const { id } = await connect(fixture);
  expect(fixture.service.end(id, 'revoked-by-person')).toBe(true);
  expect(fixture.service.end(id, 'revoked-by-admin')).toBe(false);
  expect(fixture.store.get(id)?.endReason).toBe('revoked-by-person');
  const session = fixture.signIn('session-two');
  for (let count = 0; count < MAX_LIVE_CONNECTIONS_PER_PERSON; count++) expect((await fixture.trade(fixture.codeFor(session))).ok).toBe(true);
  expect(await fixture.trade(fixture.codeFor(session))).toMatchObject({ ok: false, reason: 'connection-limit' });
  expect(fixture.service.liveConnections('alice')).toBe(MAX_LIVE_CONNECTIONS_PER_PERSON);
});

test('a setup credential makes the same connection, once, and its failures are the same', async () => {
  const fixture = open();
  const session = fixture.signIn('session-one');
  const created = fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['read', 'validate'] });
  if (!created.ok) throw new Error('not created');
  const trade = { setupCredential: created.credential, clientId: program.clientId, resource: RESOURCE };
  const first = await fixture.service.issueFromSetup(trade);
  expect(first.ok).toBe(true);
  if (first.ok) expect(fixture.store.get(first.connection)).toMatchObject({ scopes: ['read', 'validate'], sessionReference: referenceOf('session-one'), origin: 'mcp' });
  const second = await fixture.service.issueFromSetup(trade);
  expect(second.ok).toBe(false);
  if (first.ok) expect(fixture.store.get(first.connection)?.state).toBe('ended');
  expect(fixture.auditText()).not.toContain(created.credential);
  const foreign = fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['read'] });
  if (!foreign.ok) throw new Error('not created');
  expect((await fixture.service.issueFromSetup({ setupCredential: foreign.credential, clientId: 'other-client', resource: RESOURCE })).ok).toBe(false);
  const orphan = fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['read'] });
  if (!orphan.ok) throw new Error('not created');
  fixture.endSession('session-one');
  expect((await fixture.service.issueFromSetup({ setupCredential: orphan.credential, clientId: program.clientId, resource: RESOURCE })).ok).toBe(false);
});

test('a connection refuses unsupported transport origins and scopes outside the program', async () => {
  const fixture = open();
  const session = fixture.signIn('session-one');
  expect(fixture.service.createConnectionForSession({ session, clientId: 'nobody', scopes: ['read'] })).toEqual({ ok: false, reason: 'program-not-registered' });
  expect(fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['publish'] })).toEqual({ ok: false, reason: 'scope-not-allowed' });
  const created = fixture.service.createConnectionForSession({ session, clientId: program.clientId, scopes: ['read'], origin: 'acp' });
  if (!created.ok) throw new Error('not created');
  await expect(fixture.service.issueFromSetup({ setupCredential: created.credential, clientId: program.clientId, resource: RESOURCE })).rejects.toThrow('requires operation and audit support');
  expect(fixture.store.all()).toEqual([]);
});

test('work opened through a connection is told when it ends', async () => {
  const fixture = open();
  const { id } = await connect(fixture);
  const signal = fixture.service.endSignal(id);
  expect(signal.aborted).toBe(false);
  fixture.service.end(id, 'revoked-by-person');
  expect(signal.aborted).toBe(true);
  expect(fixture.service.endSignal(id).aborted).toBe(true);
});
