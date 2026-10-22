// Exercises grant membership and scope expansion independently of the policy engine.
import { expect, test } from 'bun:test';
import { adminHolders, holdersOfGrant, resolveGrants, type Grant } from '../../server/auth/grants';
import { localPrincipal } from '../../server/auth/principal';

const scope = { kind: 'workspace' } as const;
const group: Grant = {
  id: 'group',
  roleId: 'editor',
  member: { kind: 'group', groupId: 'Sales' },
  scope,
  addedBy: 'test',
  addedAt: '2026-10-21T00:00:00Z',
};
const email: Grant = {
  ...group,
  id: 'email',
  roleId: 'viewer',
  member: { kind: 'email', email: 'a@example.org' },
};
const principal = {
  ...localPrincipal(),
  id: 'person',
  groups: ['sales'],
  verifiedEmail: 'A@Example.org',
};
const options = {
  bootstrap: { emails: [], ids: [] },
  deactivated: [],
  groupMatch: 'case-insensitive' as const,
};

test('group matching follows the provider and verified addresses add a union of grants', () => {
  expect(resolveGrants(principal, [group, email], options).map(grant => grant.grantId)).toEqual([
    'group',
    'email',
  ]);
  expect(resolveGrants(principal, [group], { ...options, groupMatch: 'exact' })).toEqual([]);
  expect(resolveGrants({ ...principal, groupsResolved: 'failed' }, [group], options)).toEqual([]);
  expect(resolveGrants({ ...principal, verifiedEmail: null }, [email], options)).toEqual([]);
});

test('deactivation wins over bootstrap addresses and ids', () => {
  for (const bootstrap of [
    { emails: ['a@example.org'], ids: [] },
    { emails: [], ids: ['person'] },
  ]) {
    expect(resolveGrants(principal, [], { ...options, bootstrap })[0]?.via).toBe('bootstrap');
    expect(
      resolveGrants(principal, [], { ...options, bootstrap, deactivated: ['person'] }),
    ).toEqual([]);
  }
});

const projects = [
  { slug: 'sales', domain: 'sales' },
  { slug: 'lab', domain: null },
];
test('scope expansion excludes domainless projects except explicit grants and Admin', () => {
  expect(holdersOfGrant(group, projects)).toEqual(['editor@workspace', 'editor@sales']);
  expect(
    holdersOfGrant({ ...group, scope: { kind: 'domains', domains: ['sales'] } }, projects),
  ).toEqual(['editor@sales']);
  expect(
    holdersOfGrant(
      { ...group, scope: { kind: 'projects', projects: ['lab', 'missing'] } },
      projects,
    ),
  ).toEqual(['editor@lab', 'explicit@lab']);
  expect(holdersOfGrant({ ...group, roleId: 'admin' }, projects)).toEqual(['admin@workspace']);
  expect(() =>
    holdersOfGrant(
      { ...group, roleId: 'admin', scope: { kind: 'projects', projects: ['sales'] } },
      projects,
    ),
  ).toThrow();
});

test('the Admin guard counts matching recorded people and bootstrap entries separately', () => {
  expect(
    adminHolders([principal], [{ ...email, roleId: 'admin' }], {
      emails: ['other@example.org'],
      ids: ['emergency'],
    }),
  ).toEqual({ ids: ['person'], bootstrapCount: 2 });
});
