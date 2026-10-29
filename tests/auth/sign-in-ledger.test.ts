// The replay ledger is pruned on a timer, not on every sign-in.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../src/server/projects/atomic';
import { ATTEMPT_TTL_SECONDS, createAttemptStore } from '../../src/server/auth/attempts';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createOidcClient } from '../../src/server/auth/oidc';
import { authWorkspace } from '../helpers/auth-workspace';
import { oidcTransport } from '../helpers/oidc-transport';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function ledger(now: () => number) {
  const dir = mkdtempSync(join(tmpdir(), 'attempt-ledger-'));
  roots.push(dir);
  const store = createAttemptStore(new Uint8Array(32).fill(3), dir, now);
  const entry = (issuedAt: number) => `${issuedAt}-${sha256(String(issuedAt))}`;
  return { dir, store, entry };
}

function attempt(issuedAt: number, state: string) {
  return { state, nonce: 'n', verifier: 'v', returnTo: '/', issuedAt };
}

const ttlMilliseconds = ATTEMPT_TTL_SECONDS * 1000;

test('prune deletes expired ledger entries and keeps the live ones', () => {
  const now = 10_000_000;
  const { dir, store, entry } = ledger(() => now);
  const expired = entry(now - ttlMilliseconds);
  const live = entry(now - ttlMilliseconds + 1);
  writeFileSync(join(dir, expired), '');
  writeFileSync(join(dir, live), '');
  writeFileSync(join(dir, 'unrelated.txt'), '');
  store.prune();
  expect(readdirSync(dir).sort()).toEqual([live, 'unrelated.txt'].sort());
});

test('prune on a ledger that does not exist yet does nothing', () => {
  const { dir, store } = ledger(() => 1);
  rmSync(dir, { recursive: true });
  expect(() => store.prune()).not.toThrow();
});

test('consuming an attempt does not scan the ledger', () => {
  const now = 10_000_000;
  const { dir, store, entry } = ledger(() => now);
  const expired = entry(now - ttlMilliseconds);
  writeFileSync(join(dir, expired), '');
  const cookie = store.encode(attempt(now - 1000, 'state-1'));
  expect(store.consume(cookie).state).toBe('state-1');
  expect(readdirSync(dir)).toContain(expired);
});

test('an attempt is still consumed only once', () => {
  const now = 10_000_000;
  const { store } = ledger(() => now);
  const cookie = store.encode(attempt(now - 1000, 'state-2'));
  store.consume(cookie);
  expect(() => store.consume(cookie)).toThrow();
});

const PRUNE_INTERVAL_MS = 60_000;

/** Runs `start` while recording the callbacks of one-minute intervals, then restores timers. */
async function recordingMinuteIntervals<T>(start: () => Promise<T>) {
  const callbacks = new Map<unknown, () => void>();
  const original = globalThis.setInterval;
  globalThis.setInterval = ((callback: () => void, milliseconds: number) => {
    const timer = original(callback, milliseconds);
    if (milliseconds === PRUNE_INTERVAL_MS) callbacks.set(timer, callback);
    return timer;
  }) as typeof setInterval;
  try {
    return { started: await start(), callbacks };
  } finally {
    globalThis.setInterval = original;
  }
}

test('server authentication prunes the ledger at start-up and on a timer, until it closes', async () => {
  const transport = await oidcTransport();
  using fixture = await authWorkspace();
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const ledgerDir = join(fixture.root, 'state/auth-attempts');
  mkdirSync(ledgerDir, { recursive: true });
  const staleEntry = (age: number) => `${Date.now() - ttlMilliseconds - age}-${sha256(String(age))}`;
  writeFileSync(join(ledgerDir, staleEntry(1)), '');
  const { started: auth, callbacks } = await recordingMinuteIntervals(() => createServerAuthentication(fixture.ws, transport.config, client));
  expect(readdirSync(ledgerDir)).toEqual([]);
  expect(callbacks.size).toBe(1);
  writeFileSync(join(ledgerDir, staleEntry(2)), '');
  const [timer, prune] = [...callbacks.entries()][0];
  prune();
  expect(readdirSync(ledgerDir)).toEqual([]);
  const cleared: unknown[] = [];
  const clearInterval = spyOn(globalThis, 'clearInterval').mockImplementation(handle => {
    cleared.push(handle);
  });
  try {
    auth.close();
  } finally {
    clearInterval.mockRestore();
  }
  expect(cleared).toContain(timer);
});
