// Checks policy generation and rejects permissions the resource schema cannot support.
import { expect, test } from 'bun:test';
import builtin from '../../policies/builtin-roles.json';
import { compileRoles, RoleError, validateCustomRole } from '../../src/server/auth/role-compiler';
import type { Role } from '../../src/server/auth/grants';

const custom: Role = {
  id: 'r_review',
  name: 'Review',
  description: '',
  permissions: [
    {
      actions: ['edit'],
      conditions: { path: 'finance/**', docType: ['metric'], maxLevel: 'internal' },
    },
    { actions: ['push'], conditions: { branch: 'review/*' } },
  ],
};

test('built-in Admin compiles once and every other role appears in the holder record', () => {
  const compiled = compileRoles(builtin.roles as Role[]);
  expect(Object.keys(compiled.policies).filter(id => id.startsWith('role:admin:'))).toEqual(['role:admin:1']);
  expect(compiled.policies['role:admin:1']).toContain('admin@workspace');
  expect(compiled.holdersFragment).toContain('"viewer"');
  expect(compiled.holdersFragment).not.toContain('"admin"');
});

test('all condition kinds compile against attributes carried by every resource', () => {
  const compiled = compileRoles([custom]);
  expect(compiled.policies['role:r_review:1']).toContain('resource.holders.r_review');
  expect(compiled.policies['role:r_review:1']).toContain('resource.path like "finance/*"');
  expect(compiled.policies['role:r_review:1']).toContain('context.level <= 1');
  expect(compiled.policies['role:r_review:2']).toContain('context.branch like "review/*"');
  expect(compiled.pathGlobs).toEqual(['finance/**']);
});

test('custom roles refuse reserved ids and actions and incompatible conditions', () => {
  for (const id of ['admin', 'viewer', 'editor', 'steward', 'bad-id', 'r_UPPER']) {
    expect(() => validateCustomRole({ ...custom, id })).toThrow(RoleError);
  }
  for (const action of ['admin', 'agentRead', 'unknown']) {
    expect(() => validateCustomRole({ ...custom, permissions: [{ actions: [action] }] } as Role)).toThrow(RoleError);
  }
  for (const conditions of [{ path: '*' }, { docType: ['metric'] }, { maxLevel: 'public' }]) {
    expect(() => validateCustomRole({ ...custom, permissions: [{ actions: ['push'], conditions }] } as Role)).toThrow(RoleError);
  }
  expect(() =>
    validateCustomRole({
      ...custom,
      permissions: [{ actions: ['read'], conditions: { branch: '*' } }],
    }),
  ).toThrow(RoleError);
});
