// Proof Key for Code Exchange with the S256 method, the only one the authorization server accepts.
import { createHash, timingSafeEqual } from 'node:crypto';

/** A verifier is 43 to 128 characters of the unreserved set of RFC 7636. */
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

/** The SHA-256 digest of any verifier is 43 characters of base64url without padding. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Whether a value can be a challenge produced by the S256 method. */
export function isWellFormedChallenge(challenge: string): boolean {
  return CHALLENGE_PATTERN.test(challenge);
}

/** Whether the verifier hashes to the challenge. Both values are checked for shape first, and the comparison takes the same time wherever they differ. */
export function verifyS256(verifier: string, challenge: string): boolean {
  if (!VERIFIER_PATTERN.test(verifier) || !isWellFormedChallenge(challenge)) return false;
  const expected = createHash('sha256').update(verifier).digest('base64url');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(challenge));
}
