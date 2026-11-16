// Structural identity copies must not acquire authenticated caller provenance.
import { expect, test } from 'bun:test';
import { assertMinted, mintCaller, type Caller } from '../../src/server/auth/caller';
import { localPrincipal } from '../../src/server/auth/principal';

test('only the minted caller has authenticated provenance', () => {
  const identity: Caller = { principal: localPrincipal(), origin: 'http' };
  const caller = mintCaller(identity);
  expect(() => assertMinted(caller)).not.toThrow();
  expect(() => assertMinted(identity)).toThrow('not minted');
  expect(() => assertMinted({ ...caller })).toThrow('not minted');
  expect(() => assertMinted(structuredClone(caller))).toThrow('not minted');
  expect(() => assertMinted({ principal: localPrincipal(), origin: 'http' })).toThrow('not minted');
  expect(Object.isFrozen(caller)).toBe(true);
});
