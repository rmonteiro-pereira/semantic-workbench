// Opaque cursors for paged lists. A cursor is authenticated with a key that exists only in this process and is bound to the query, the order, the state of the list, the caller and a lifetime, so it can neither be forged nor replayed elsewhere.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a cursor stays valid. A person reading pages rarely waits longer. */
export const CURSOR_LIFETIME_MS = 10 * 60 * 1000;

/** What a cursor is bound to. A page request must present the same values it was issued for. */
export type CursorBinding = { query: string; ordering: string; generation: string; principal: string };

export type CursorCodec = {
  issue(position: number, binding: CursorBinding): string;
  /** The position a cursor stands for, or null when it was issued for something else or has expired. */
  open(cursor: string, binding: CursorBinding): number | null;
};

/** Creates a codec with a fresh random key, so a restart expires every cursor. */
export function createCursorCodec(options: { now?: () => number; key?: Buffer } = {}): CursorCodec {
  const now = options.now ?? Date.now;
  const key = options.key ?? randomBytes(32);
  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest();
  return {
    issue(position, binding) {
      const payload = Buffer.from(JSON.stringify({ position, expires: now() + CURSOR_LIFETIME_MS, ...binding })).toString('base64url');
      return `${payload}.${sign(payload).toString('base64url')}`;
    },
    open(cursor, binding) {
      const [payload, mac, extra] = cursor.split('.');
      if (!payload || !mac || extra !== undefined) return null;
      const expected = sign(payload);
      const given = Buffer.from(mac, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      let claim: CursorBinding & { position: number; expires: number };
      try {
        claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      if (claim.expires < now()) return null;
      const same = claim.query === binding.query && claim.ordering === binding.ordering && claim.generation === binding.generation && claim.principal === binding.principal;
      return same && Number.isSafeInteger(claim.position) && claim.position >= 0 ? claim.position : null;
    },
  };
}
