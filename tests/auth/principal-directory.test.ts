// Checks directory membership replacement and tenant isolation outside token parsing tests.
import { expect, test } from 'bun:test';
import { localPrincipal, normalizeClaims, withDirectoryGroups } from '../../server/auth/principal';

test('directory results replace groups without changing identity or retaining stale membership', () => {
  const principal = { ...localPrincipal(), groupOverage: true };
  const resolved = withDirectoryGroups(principal, ['ABC']);
  expect(resolved.groups).toEqual(['abc']);
  expect(resolved.groupsResolved).toBe('directory');
  expect(resolved.id).toBe(principal.id);
  expect(withDirectoryGroups(resolved, null).groups).toEqual([]);
  expect(withDirectoryGroups(resolved, null).groupsResolved).toBe('failed');
  expect(principal.groups).toEqual([]);
});

test('Entra claims from another tenant cannot establish an identity', () => {
  expect(() =>
    normalizeClaims(
      { tid: 'other', oid: 'object' },
      { provider: 'entra', tenantId: 'expected', groupClaim: 'groups' },
    ),
  ).toThrow();
});
