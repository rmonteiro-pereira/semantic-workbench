// Exercises the last human administrator invariant using recorded sign-in times.
import { expect, test } from 'bun:test';
import { checkLastAdmin, isBootstrapAdmin } from '../../server/auth/admin-guard';
import { emptyAccessConfig } from '../../server/auth/access-config';
import { localPrincipal } from '../../server/auth/principal';

const user = {
  ...localPrincipal(),
  kind: 'person' as const,
  id: 'person',
  verifiedEmail: 'Admin@Example.org',
  groups: ['Admins'],
  lastSignInAt: '2026-10-21T00:00:00Z',
};
const options = {
  users: [user],
  bootstrap: { emails: [], ids: [] },
  sessionLifetimeHours: 24,
  now: new Date('2026-10-21T12:00:00Z'),
  groupMatch: 'exact' as const,
};
test('removing or deactivating the last recent Admin is refused unless bootstrap remains', () => {
  const config = emptyAccessConfig();
  config.grants = [
    {
      id: 'admin',
      roleId: 'admin',
      member: { kind: 'group', groupId: 'Admins' },
      scope: { kind: 'workspace' },
      addedAt: user.lastSignInAt,
      addedBy: 'test',
    },
  ];
  expect(checkLastAdmin(config, options)).toEqual({ ok: true });
  const absent = structuredClone(config);
  absent.grants = [];
  const narrowed = structuredClone(config);
  narrowed.grants[0].scope = { kind: 'domains', domains: ['sales'] };
  const deactivated = structuredClone(config);
  deactivated.deactivated.principals = [
    { id: user.id, at: user.lastSignInAt, by: 'test', reason: '' },
  ];
  const email = structuredClone(config);
  email.grants[0].member = { kind: 'email', email: 'admin@example.org' };
  expect(checkLastAdmin(email, options)).toEqual({ ok: true });
  email.grants = [];
  for (const next of [absent, narrowed, deactivated, email]) {
    expect(checkLastAdmin(next, options)).toEqual({ ok: false, reason: 'last-admin' });
    expect(
      checkLastAdmin(next, { ...options, bootstrap: { ids: ['emergency'], emails: [] } }),
    ).toEqual({ ok: true });
  }
  expect(checkLastAdmin(config, { ...options, now: new Date('2026-10-23Z') }).ok).toBe(false);
});
test('bootstrap accepts only a verified address or exact stable id', () => {
  const bootstrap = { emails: ['admin@example.org'], ids: ['person'] };
  expect(isBootstrapAdmin(user, bootstrap)).toBe(true);
  expect(isBootstrapAdmin({ ...user, id: 'other' }, bootstrap)).toBe(true);
  expect(isBootstrapAdmin({ ...user, verifiedEmail: null }, bootstrap)).toBe(true);
  expect(isBootstrapAdmin({ ...user, id: 'PERSON', verifiedEmail: null }, bootstrap)).toBe(false);
});

test('Admin group matching uses the provider rule even for names shaped like directory ids', () => {
  const config = emptyAccessConfig();
  config.grants = [
    {
      id: 'admin',
      roleId: 'admin',
      member: { kind: 'group', groupId: 'ADMIN' },
      scope: { kind: 'workspace' },
      addedBy: 'test',
      addedAt: user.lastSignInAt,
    },
  ];
  const users = [{ ...user, groups: ['admin'] }];
  expect(checkLastAdmin(config, { ...options, users, groupMatch: 'exact' }).ok).toBe(false);
  expect(checkLastAdmin(config, { ...options, users, groupMatch: 'case-insensitive' }).ok).toBe(
    true,
  );
});
