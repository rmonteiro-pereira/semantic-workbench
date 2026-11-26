// Long Admin values are shown whole: one-line fields wrap, and a typed person ID is written out with its owner.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WrappingField, singleLine } from '../src/app/admin/WrappingField';
import { personEcho } from '../src/app/admin/AccessCheckSection';
import type { AdminUser } from '../src/app/admin/types';

const longAddress = 'international-semantic-governance-and-analytical-interoperability@example.org';

test('a one-line field renders as a wrapping text box holding the whole value', () => {
  const html = renderToStaticMarkup(<WrappingField aria-label="Steward" value={longAddress} onValueChange={() => {}} />);
  expect(html).toContain('<textarea');
  expect(html).toContain('rows="1"');
  expect(html).toContain('class="admin-wrapping-field"');
  expect(html).toContain(longAddress);
});

test('pasted line breaks become spaces, since the value stays one line', () => {
  expect(singleLine('first\nsecond\r\nthird')).toBe('first second third');
});

test('a typed person ID is written out as the person it belongs to, or whole when unknown', () => {
  const alice = { id: 'tenant:alice', name: 'Alice Andrade', verifiedEmail: 'alice@example.org' } as AdminUser;
  const program = { id: 'tenant:program', name: 'Catalog sync', verifiedEmail: null } as AdminUser;
  expect(personEcho([alice, program], 'tenant:alice')).toBe('Alice Andrade · alice@example.org');
  expect(personEcho([alice, program], 'tenant:program')).toBe('Catalog sync');
  expect(personEcho([alice], 'tenant:someone-not-signed-in-with-a-very-long-identifier')).toBe('tenant:someone-not-signed-in-with-a-very-long-identifier');
  expect(personEcho([alice], '')).toBe('');
});
