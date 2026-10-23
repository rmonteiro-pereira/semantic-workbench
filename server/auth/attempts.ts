// Signs short-lived login state and durably consumes each attempt once.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../projects/atomic';
import { SignInError } from './sign-in-error';

/** Browser-bound values needed to complete one authorization code exchange. */
export type SignInAttempt = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  issuedAt: number;
};

/** Restricts post-login navigation to paths within the workbench origin. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const parsed = new URL(value, 'https://workbench.invalid');
  return parsed.origin === 'https://workbench.invalid' && !parsed.pathname.startsWith('//')
    ? parsed.pathname + parsed.search + parsed.hash
    : '/';
}

/** Lifetime shared by the signed attempt, replay ledger and browser cookie. */
export const ATTEMPT_TTL_SECONDS = 600;

/** Creates browser-bound attempt signatures and a restart-safe replay ledger. */
export function createAttemptStore(key: Uint8Array, dir: string, now = Date.now) {
  const sign = (value: string) => createHmac('sha256', key).update(value).digest('base64url');
  return {
    encode(attempt: SignInAttempt) {
      const value = Buffer.from(JSON.stringify(attempt)).toString('base64url');
      return value + '.' + sign(value);
    },
    consume(cookie: string | null): SignInAttempt {
      if (!cookie || cookie.length > 8192) throw new SignInError('attempt-invalid');
      const [value, signature, extra] = cookie.split('.');
      const expected = Buffer.from(sign(value));
      const supplied = Buffer.from(signature ?? '');
      if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        throw new SignInError('attempt-invalid');
      }
      let attempt: SignInAttempt;
      try {
        attempt = JSON.parse(Buffer.from(value, 'base64url').toString());
        if (!attempt || typeof attempt !== 'object') throw new SignInError('attempt-invalid');
      } catch {
        throw new SignInError('attempt-invalid');
      }
      if (
        !['state', 'nonce', 'verifier', 'returnTo'].every(
          field => typeof attempt[field as keyof SignInAttempt] === 'string',
        ) ||
        !Number.isFinite(attempt.issuedAt) ||
        attempt.issuedAt > now() ||
        now() - attempt.issuedAt >= ATTEMPT_TTL_SECONDS * 1000
      ) {
        throw new SignInError('attempt-invalid');
      }
      mkdirSync(dir, { recursive: true });
      for (const filename of readdirSync(dir)) {
        if (
          /^\d+-[a-f0-9]{64}$/.test(filename) &&
          Number(filename.split('-')[0]) + ATTEMPT_TTL_SECONDS * 1000 <= now()
        )
          unlinkSync(join(dir, filename));
      }
      const file = join(dir, attempt.issuedAt + '-' + sha256(attempt.state));
      try {
        closeSync(openSync(file, 'wx', 0o600));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new SignInError('attempt-invalid');
        }
        throw error;
      }
      return attempt;
    },
  };
}
