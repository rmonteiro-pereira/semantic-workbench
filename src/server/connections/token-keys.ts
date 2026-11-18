// Random tokens and the keyed hash that is the only form of them the server stores or looks up.
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Names this key apart from every other key derived from the session secret. */
const CONNECTION_KEY_LABEL = 'sw-connection-tokens';

/** 256 random bits, as for browser session ids. */
const TOKEN_BYTES = 32;

/** The key of the keyed hash, derived from the session secret so rotating that secret also ends every connection. */
export function deriveConnectionKey(sessionKey: Uint8Array): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', sessionKey, '', CONNECTION_KEY_LABEL, 32));
}

/** A new random token. The prefix lets a person or a log scanner tell what kind of value it is. */
export function newToken(prefix = ''): string {
  return prefix + randomBytes(TOKEN_BYTES).toString('base64url');
}

/** A random identifier of 16 bytes, safe in a file name, an audit record and a form field. */
export function newConnectionId(): string {
  return randomBytes(16).toString('base64url');
}

/** The value stored and looked up in place of a token. */
export function keyedHash(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

/** Compares two stored hashes in constant time. */
export function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
