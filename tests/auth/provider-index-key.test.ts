// The provider-session index is keyed apart from the key that encrypts the sessions.
import * as nodeCrypto from 'node:crypto';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localPrincipal } from '../../server/auth/principal';
import { createSessionStore, providerIndexKey } from '../../server/auth/sessions';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

test('the index key is derived from the session key and differs from it', () => {
  const sessionKey = new Uint8Array(32).fill(7);
  const indexKey = providerIndexKey(sessionKey);
  expect(indexKey).toHaveLength(32);
  expect(Buffer.from(indexKey).equals(Buffer.from(sessionKey))).toBe(false);
  expect(Buffer.from(providerIndexKey(sessionKey)).equals(Buffer.from(indexKey))).toBe(true);
  const other = providerIndexKey(new Uint8Array(32).fill(8));
  expect(Buffer.from(other).equals(Buffer.from(indexKey))).toBe(false);
});

test('the store hashes provider session ids with the index key, never the session key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'provider-index-'));
  roots.push(dir);
  const sessionKey = new Uint8Array(32).fill(7);
  const hmac = spyOn(nodeCrypto, 'createHmac');
  try {
    const store = createSessionStore({ dir, key: sessionKey });
    await store.create({
      principal: localPrincipal(),
      tokens: {
        accessToken: 'a',
        expiresAt: Date.now() + 1000,
        providerSession: { issuer: 'https://idp.example', sid: 'provider-session' },
      },
    });
    const keys = hmac.mock.calls.map(call => Buffer.from(call[1] as Uint8Array));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.equals(Buffer.from(sessionKey))).toBe(false);
      expect(key.equals(Buffer.from(providerIndexKey(sessionKey)))).toBe(true);
    }
  } finally {
    hmac.mockRestore();
  }
});
