// Exercises durable sessions without opening sockets.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createSessionStore, sessionCookie } from '../../src/server/auth/sessions';
import { localPrincipal } from '../../src/server/auth/principal';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-'));
  roots.push(dir);
  let now = 1000;
  const options = { dir, key: new Uint8Array(32).fill(7), now: () => now };
  return { dir, options, advance: (hours: number) => (now += hours * 3600000) };
}
const identity = {
  principal: localPrincipal(),
  tokens: { accessToken: 'secret', expiresAt: 99999 },
};

test('encrypts tokens and survives restart, then removes an ended session', async () => {
  const { dir, options } = fixture();
  const store = createSessionStore(options);
  const session = await store.create(identity);
  expect(Buffer.from(session.id, 'base64url').length).toBe(32);
  const filename = createHash('sha256').update(session.id).digest('hex') + '.json';
  expect(readdirSync(dir)).toEqual([filename]);
  const persisted = readFileSync(join(dir, filename), 'utf8');
  expect(persisted).not.toContain('secret');
  expect(persisted).not.toContain(session.id);
  const restarted = createSessionStore(options);
  expect((await restarted.get(session.id))?.tokens.accessToken).toBe('secret');
  await restarted.end(session.id);
  expect(await restarted.get(session.id)).toBeNull();
  expect(readdirSync(dir)).toEqual([]);
});

test('idle expiry and absolute expiry apply at their boundaries', async () => {
  const { options, advance } = fixture();
  const store = createSessionStore(options);
  const idle = await store.create(identity);
  advance(8);
  expect(await store.get(idle.id)).toBeNull();
  const active = await store.create(identity);
  for (let index = 0; index < 3; index++) {
    advance(7);
    expect(await store.get(active.id)).not.toBeNull();
  }
  advance(3);
  expect(await store.get(active.id)).toBeNull();
});

test('cookie is host-only, secure and inaccessible to scripts except loopback HTTP', () => {
  expect(sessionCookie('id', 'https://workbench.example')).toBe('__Host-sw-session=id; Secure; HttpOnly; SameSite=Lax; Path=/');
  expect(sessionCookie('id', 'http://127.0.0.1:4310')).toBe('sw-session=id; HttpOnly; SameSite=Lax; Path=/');
  expect(() => sessionCookie('id', 'http://workbench.example')).toThrow();
});

test('the wrong encryption key cannot restore a session', async () => {
  const { options } = fixture();
  const session = await createSessionStore(options).create(identity);
  const wrong = createSessionStore({ ...options, key: new Uint8Array(32).fill(8) });
  await expect(wrong.get(session.id)).resolves.toBeNull();
});

test('quick touches write once and the latest in-memory touch sets exact idle expiry', async () => {
  const { dir, options, advance } = fixture();
  const store = createSessionStore(options);
  const session = await store.create(identity);
  const path = join(dir, readdirSync(dir)[0]);
  const original = readFileSync(path, 'utf8');
  advance(1 / 60);
  await store.get(session.id);
  const touched = readFileSync(path, 'utf8');
  expect(touched).not.toBe(original);
  advance(1 / 3600);
  await store.get(session.id);
  expect(readFileSync(path, 'utf8')).toBe(touched);
  advance(8 - 1 / 3600000);
  expect(await store.get(session.id, false)).not.toBeNull();
  advance(1 / 3600000);
  expect(await store.get(session.id, false)).toBeNull();
});

test('a failing ended hook does not prevent the sweep from removing other sessions', async () => {
  const { dir, options, advance } = fixture();
  let ended = 0;
  const store = createSessionStore({
    ...options,
    ended: () => {
      ended++;
      throw new Error('audit unavailable');
    },
  });
  await store.create(identity);
  await store.create(identity);
  advance(8);
  await store.sweep();
  expect(ended).toBe(2);
  expect(readdirSync(dir)).toEqual([]);
});

test('a session waiting for encryption does not block another session file', async () => {
  const { options, advance } = fixture();
  const store = createSessionStore(options);
  const first = await store.create(identity);
  const second = await store.create(identity);
  advance(1);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  const blocked = spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
    started();
    await gate;
    return encrypt(...args);
  });
  const touching = store.get(first.id);
  try {
    await entered;
    const result = await Promise.race([store.get(second.id, false), new Promise<null>(resolve => setTimeout(() => resolve(null), 100))]);
    expect(result?.id).toBe(second.id);
  } finally {
    release();
    await touching;
    blocked.mockRestore();
  }
});
