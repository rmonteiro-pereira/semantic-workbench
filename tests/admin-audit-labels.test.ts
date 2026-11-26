// The audit list shows rule and action codes in words, keeping the code itself as the title.
import { expect, test } from 'bun:test';
import { auditLabel } from '../src/app/admin/helpers';

test('rule codes read as words instead of internal tokens', () => {
  expect(auditLabel('role:admin:1')).toBe('Role: Admin');
  expect(auditLabel('scope:read')).toBe('Permission: Read');
  expect(auditLabel('connection.issued')).toBe('Connection issued');
  expect(auditLabel('signIn')).toBe('Signed in');
});
