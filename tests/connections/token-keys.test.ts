// Checks token generation and the keyed hash.
import { expect, test } from 'bun:test';
import { deriveConnectionKey, keyedHash, newConnectionId, newToken, sameHash } from '../../src/server/connections/token-keys';

const sessionKey = new Uint8Array(32).fill(7);

test('a token has 256 bits in 43 base64url characters and keeps its prefix', () => {
  expect(newToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const prefixed = newToken('swsetup_');
  expect(prefixed.startsWith('swsetup_')).toBe(true);
  expect(prefixed).toHaveLength('swsetup_'.length + 43);
  expect(newToken()).not.toBe(newToken());
});

test('a connection id is 22 base64url characters', () => {
  expect(newConnectionId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

test('the key depends on the session secret only and is not the secret', () => {
  const key = deriveConnectionKey(sessionKey);
  expect(key).toHaveLength(32);
  expect(Buffer.from(key).equals(Buffer.from(deriveConnectionKey(sessionKey)))).toBe(true);
  expect(Buffer.from(key).equals(Buffer.from(sessionKey))).toBe(false);
  expect(Buffer.from(key).equals(Buffer.from(deriveConnectionKey(new Uint8Array(32).fill(8))))).toBe(false);
});

test('the hash is deterministic per key and differs between keys and values', () => {
  const key = deriveConnectionKey(sessionKey);
  const other = deriveConnectionKey(new Uint8Array(32).fill(8));
  expect(keyedHash(key, 'value')).toBe(keyedHash(key, 'value'));
  expect(keyedHash(key, 'value')).not.toBe(keyedHash(other, 'value'));
  expect(keyedHash(key, 'value')).not.toBe(keyedHash(key, 'values'));
  expect(keyedHash(key, 'value')).not.toContain('value');
});

test('comparison accepts equal hashes and refuses differing ones of equal or unequal length', () => {
  const key = deriveConnectionKey(sessionKey);
  const hash = keyedHash(key, 'a');
  expect(sameHash(hash, keyedHash(key, 'a'))).toBe(true);
  expect(sameHash(hash, keyedHash(key, 'b'))).toBe(false);
  expect(sameHash(hash, hash.slice(1))).toBe(false);
  expect(sameHash(hash, hash.slice(0, -1) + (hash.endsWith('A') ? 'B' : 'A'))).toBe(false);
});
