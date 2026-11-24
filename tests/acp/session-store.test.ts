// A person sees only their own session, a replaced session ends with its reason, and the clock expires and then forgets sessions.
import { expect, test } from 'bun:test';
import { createSessionStore } from '../../src/server/acp/session-store';
import { ENDED_RETENTION_MS, WAITING_LIMIT_MS, type EndReason } from '../../src/server/acp/panel-session';
import { createVersionRecords } from '../../src/server/acp/version-records';

function store() {
  let time = 1_000;
  const ended: [string, EndReason][] = [];
  const instance = createSessionStore({ now: () => time, onEnded: (session, reason) => ended.push([session.id, reason]) });
  return { instance, ended, advance: (milliseconds: number) => (time += milliseconds) };
}
const scope = ['read', 'localWrite'] as const;

function created(instance: ReturnType<typeof store>['instance'], owner: string, confirmReplace = false) {
  const result = instance.create({ owner, scope, confirmReplace });
  if (!result.ok) throw new Error('expected a session');
  return result.session;
}

test('a new session waits with a code of eight unambiguous characters and a connection id', () => {
  const { instance } = store();
  const session = created(instance, 'ana');
  expect(session.timing.state).toBe('waiting');
  expect(session.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
  expect(session.connection).toMatch(/^acp-[A-Za-z0-9]{12}$/);
  expect(session.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

test('another person finds nothing, exactly as for an unknown id', () => {
  const { instance } = store();
  const session = created(instance, 'ana');
  expect(instance.find(session.id, 'ana')).toBe(session);
  expect(instance.find(session.id, 'bruno')).toBeUndefined();
  expect(instance.find('no-such-id', 'ana')).toBeUndefined();
  expect(instance.find(session.id, 'bruno')).toEqual(instance.find('no-such-id', 'bruno'));
});

test('a second session needs confirmation and replaces the first with the reason replaced', () => {
  const { instance, ended } = store();
  const first = created(instance, 'ana');
  expect(instance.create({ owner: 'ana', scope })).toEqual({ ok: false, reason: 'needs-confirmation' });
  expect(first.timing.state).toBe('waiting');
  const second = created(instance, 'ana', true);
  expect(first.timing.endReason).toBe('replaced');
  expect(second.timing.state).toBe('waiting');
  expect(ended).toEqual([[first.id, 'replaced']]);
  expect(created(instance, 'bruno').owner).toBe('bruno');
});

test('a person whose session ended may start another without confirming', () => {
  const { instance } = store();
  const first = created(instance, 'ana');
  instance.end(first, 'closed');
  expect(instance.create({ owner: 'ana', scope }).ok).toBe(true);
});

test('the code works once, in any letter case, and only while waiting', () => {
  const { instance } = store();
  const session = created(instance, 'ana');
  const code = session.code!;
  expect(instance.consumeCode(session, 'WRONGCODE')).toBe(false);
  expect(instance.consumeCode(session, code.toLowerCase())).toBe(true);
  expect(instance.consumeCode(session, code)).toBe(false);
  expect(session.code).toBeUndefined();
});

test('ending clears the code and ends only once', () => {
  const { instance, ended } = store();
  const session = created(instance, 'ana');
  instance.end(session, 'closed');
  instance.end(session, 'flood');
  expect(session.code).toBeUndefined();
  expect(session.timing.endReason).toBe('closed');
  expect(ended).toHaveLength(1);
});

test('sign-out ends every session of the person and a revoked connection ends its session', () => {
  const { instance } = store();
  const ana = created(instance, 'ana');
  const bruno = created(instance, 'bruno');
  instance.endConnection(bruno.connection, 'revoked');
  expect(bruno.timing.endReason).toBe('revoked');
  instance.endAllOf('ana', 'sign-out');
  expect(ana.timing.endReason).toBe('sign-out');
});

test('the sweep ends a session nobody joined, then forgets it after the retention', () => {
  const { instance, advance } = store();
  const session = created(instance, 'ana');
  advance(WAITING_LIMIT_MS);
  instance.sweep();
  expect(session.timing.endReason).toBe('no-agent');
  expect(instance.size).toBe(1);
  advance(ENDED_RETENTION_MS);
  instance.sweep();
  expect(instance.size).toBe(0);
  expect(instance.find(session.id, 'ana')).toBeUndefined();
});

test('version records are bounded and the least recently used file is forgotten first', () => {
  const records = createVersionRecords(3);
  records.set('p', 'a', 'v1');
  records.set('p', 'b', 'v2');
  records.set('p', 'c', 'v3');
  expect(records.get('p', 'a')).toBe('v1');
  records.set('p', 'd', 'v4');
  expect(records.get('p', 'b')).toBeUndefined();
  expect(records.get('p', 'a')).toBe('v1');
  expect(records.size).toBe(3);
  records.forget('p', 'a');
  expect(records.get('p', 'a')).toBeUndefined();
});
