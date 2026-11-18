// Checks the S256 proof with the published test vector and the refusals around it.
import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import { isWellFormedChallenge, verifyS256 } from '../../src/server/connections/pkce';

const VECTOR_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const VECTOR_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

test('the published S256 test vector verifies', () => {
  expect(verifyS256(VECTOR_VERIFIER, VECTOR_CHALLENGE)).toBe(true);
});

test('a different verifier does not verify', () => {
  expect(verifyS256(VECTOR_VERIFIER.replace('d', 'e'), VECTOR_CHALLENGE)).toBe(false);
});

test('verifiers shorter than 43 or longer than 128 characters are refused', () => {
  const short = 'a'.repeat(42);
  const long = 'a'.repeat(129);
  expect(verifyS256(short, createHash('sha256').update(short).digest('base64url'))).toBe(false);
  expect(verifyS256(long, createHash('sha256').update(long).digest('base64url'))).toBe(false);
  const longest = 'a'.repeat(128);
  expect(verifyS256(longest, createHash('sha256').update(longest).digest('base64url'))).toBe(true);
});

test('characters outside the unreserved set are refused', () => {
  const verifier = 'a'.repeat(42) + ' ';
  expect(verifyS256(verifier, createHash('sha256').update(verifier).digest('base64url'))).toBe(false);
});

test('the plain method is not accepted: a challenge equal to the verifier fails', () => {
  expect(verifyS256(VECTOR_VERIFIER, VECTOR_VERIFIER)).toBe(false);
});

test('a challenge must be exactly 43 base64url characters', () => {
  expect(isWellFormedChallenge(VECTOR_CHALLENGE)).toBe(true);
  expect(isWellFormedChallenge(VECTOR_CHALLENGE + 'a')).toBe(false);
  expect(isWellFormedChallenge(VECTOR_CHALLENGE.slice(1))).toBe(false);
  expect(isWellFormedChallenge(VECTOR_CHALLENGE.slice(1) + '=')).toBe(false);
});
