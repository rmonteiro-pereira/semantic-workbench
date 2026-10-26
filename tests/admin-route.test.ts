import { expect, test } from 'bun:test';
import { adminHash, parseAdminHash } from '../src/app/admin/admin-route';
import { ADMIN_SECTIONS } from '../src/app/admin/admin-sections';

test('every section has an address that reads back to the same section', () => {
  for (const section of ADMIN_SECTIONS) {
    expect(parseAdminHash(adminHash(section.id))).toBe(section.id);
  }
});

test('an address outside Admin means the workspace', () => {
  expect(parseAdminHash('')).toBeNull();
  expect(parseAdminHash('#')).toBeNull();
  expect(parseAdminHash('#/administrator')).toBeNull();
  expect(parseAdminHash('#/files/model.yaml')).toBeNull();
});

test('the bare Admin address and an unknown section open the first section', () => {
  expect(parseAdminHash('#/admin')).toBe('grants');
  expect(parseAdminHash('#/admin/')).toBe('grants');
  expect(parseAdminHash('#/admin/nonsense')).toBe('grants');
});
