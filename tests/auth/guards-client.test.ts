// The browser's governance controls follow the same rules as the server's guards.
import { expect, test } from 'bun:test';
import { approvalControl, isProtected, ownsMetric } from '../../src/app/auth/guards-client';
import type { Me } from '../../src/app/auth/useMe';

const bob: Me = {
  mode: 'server',
  name: 'Bob Barros',
  username: 'Bob@Example.org',
  verifiedEmail: 'bob@example.org',
  roles: { workspace: [], projects: {} },
  roleNames: {},
};
const allowed = { can: true, requirement: '' };

test('a metric is the person’s own when its owner names their address or username', () => {
  expect(ownsMetric(bob, ' BOB@example.org ')).toBe(true);
  expect(ownsMetric({ ...bob, verifiedEmail: null, username: 'bobb' }, 'BobB')).toBe(true);
  expect(ownsMetric(bob, 'alice@example.org')).toBe(false);
  expect(ownsMetric(bob, undefined)).toBe(false);
  expect(ownsMetric(null, 'bob@example.org')).toBe(false);
});

test('Approve and Deprecate follow the status and are disabled with the reason', () => {
  const proposed = { status: 'proposed', owner: 'alice@example.org' };
  expect(approvalControl(bob, proposed, allowed)).toEqual({
    action: 'approve',
    label: 'Approve',
    disabled: false,
  });
  const approved = { status: 'approved', owner: 'alice@example.org' };
  expect(approvalControl(bob, approved, allowed)?.label).toBe('Deprecate');
  expect(approvalControl(bob, { status: 'draft' }, allowed)).toBeNull();
  const editor = approvalControl(bob, proposed, { can: false, requirement: 'Requires Steward' });
  expect(editor).toMatchObject({ disabled: true, reason: 'Requires Steward' });
  const own = approvalControl(bob, { status: 'proposed', owner: 'bob@example.org' }, allowed);
  expect(own).toMatchObject({ disabled: true });
  expect(own?.reason).toContain('You own this metric');
});

test('properties at or above the protected level are protected, aliases included', () => {
  const settings = {
    aliases: { pii: 'confidential' as const },
    protectedLevel: 'confidential' as const,
  };
  expect(isProtected('confidential', settings)).toBe(true);
  expect(isProtected('PII', settings)).toBe(true);
  expect(isProtected('restricted', settings)).toBe(true);
  expect(isProtected('internal', settings)).toBe(false);
  expect(isProtected('whatever', settings)).toBe(false);
  expect(isProtected('restricted', undefined)).toBe(false);
});
