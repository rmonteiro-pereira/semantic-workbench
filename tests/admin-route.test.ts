import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminAccessNotice } from '../src/app/admin/AdminHost';
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

test('non-admin direct addresses have an explanation and a workspace link', () => {
  const html = renderToStaticMarkup(createElement(AdminAccessNotice));
  expect(html).toContain('Admin requires the Admin role');
  expect(html).toContain('href="#"');
  expect(html).toContain('Back to workspace');
});
