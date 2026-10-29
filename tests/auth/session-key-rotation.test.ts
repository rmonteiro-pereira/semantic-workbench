// A changed SW_SESSION_KEY or a damaged session file ends the sessions it affects and nothing
// else: the server starts, other sessions work, and the people sign in again.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore } from '../../src/server/auth/sessions';
import { localPrincipal } from '../../src/server/auth/principal';
import { sessionCookieOf, signInContext } from '../helpers/sign-in-context';
import { configureLogging } from '../../src/server/observability/log';
import { useQuietLogging } from '../helpers/quiet-logging';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function storeOptions(key: number) {
  const dir = mkdtempSync(join(tmpdir(), 'session-rotation-'));
  roots.push(dir);
  return { dir, key: new Uint8Array(32).fill(key) };
}
const identity = {
  principal: localPrincipal(),
  tokens: { accessToken: 'secret', expiresAt: Date.now() + 100000 },
};

test('a session written under another key reads as absent and its file is deleted', async () => {
  const { dir, key } = storeOptions(7);
  const session = await createSessionStore({ dir, key }).create(identity);
  const log = spyOn(console, 'error').mockImplementation(() => {});
  configureLogging({ level: 'warn', format: 'text' });
  try {
    const rotated = createSessionStore({ dir, key: new Uint8Array(32).fill(8) });
    expect(await rotated.get(session.id)).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
    expect(log.mock.calls.flat().join('\n')).toContain('session-unreadable');
    expect(await rotated.end(session.id)).toBeNull();
  } finally {
    log.mockRestore();
    useQuietLogging();
  }
});

test('a corrupt record is discarded instead of failing the store', async () => {
  const { dir, key } = storeOptions(7);
  const store = createSessionStore({ dir, key });
  const session = await store.create(identity);
  const file = readdirSync(dir)[0];
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const damage of ['not json', '{"formatVersion":2}', '{"formatVersion":1,"iv":"AA"}']) {
      writeFileSync(join(dir, file), damage);
      const fresh = createSessionStore({ dir, key });
      expect(await fresh.get(session.id)).toBeNull();
      expect(readdirSync(dir)).toEqual([]);
      writeFileSync(join(dir, file), damage);
    }
  } finally {
    log.mockRestore();
  }
});

test('the sweep and the start-up index go past unreadable records to the readable ones', async () => {
  const { dir, key } = storeOptions(7);
  const old = await createSessionStore({ dir, key: new Uint8Array(32).fill(6) }).create(identity);
  const store = createSessionStore({ dir, key });
  const current = await store.create(identity);
  expect(readdirSync(dir)).toHaveLength(2);
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const restarted = createSessionStore({ dir, key });
    await restarted.indexStored();
    expect(readdirSync(dir)).toHaveLength(1);
    expect(await restarted.get(current.id)).not.toBeNull();
    expect(await restarted.get(old.id)).toBeNull();
    await createSessionStore({ dir, key: new Uint8Array(32).fill(5) }).create(identity);
    await restarted.sweep();
    expect(await restarted.get(current.id)).not.toBeNull();
    expect(readdirSync(dir)).toHaveLength(1);
  } finally {
    log.mockRestore();
  }
});

test('after the key rotates the server starts, old cookies are signed out and sign-in works', async () => {
  using context = await signInContext();
  const oldCookie = sessionCookieOf(await context.signIn());
  const rotated = { ...context.transport.config, sessionKey: Buffer.alloc(32, 9) };
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const restarted = await context.restart(rotated);
    const stale = await restarted.handler(
      new Request(context.origin + '/api/me', { headers: { Cookie: oldCookie } }),
    );
    expect(stale.status).toBe(401);
    const again = await restarted.handler(
      new Request(context.origin + '/api/me', { headers: { Cookie: oldCookie } }),
    );
    expect(again.status).toBe(401);
    expect(readdirSync(join(context.fixture.root, 'state/sessions'))).toEqual([]);
  } finally {
    log.mockRestore();
  }
});

test('a callback that still carries a cookie of the old key completes the sign-in', async () => {
  using context = await signInContext();
  const oldCookie = sessionCookieOf(await context.signIn());
  const rotated = { ...context.transport.config, sessionKey: Buffer.alloc(32, 9) };
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const restarted = await context.restart(rotated);
    const first = await restarted.handler(new Request(context.origin + '/auth/login'));
    const attempt = first.headers.getSetCookie()[0].split(';')[0];
    const callback = context.transport.authorize(first.headers.get('location')!, 'bob');
    const response = await restarted.handler(
      new Request(callback, { headers: { Cookie: `${attempt}; ${oldCookie}` } }),
    );
    expect(response.status).toBe(302);
    const fresh = sessionCookieOf(response);
    const me = await restarted.handler(
      new Request(context.origin + '/api/me', { headers: { Cookie: fresh } }),
    );
    expect(me.status).toBe(200);
  } finally {
    log.mockRestore();
  }
});
