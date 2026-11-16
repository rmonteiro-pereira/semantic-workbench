/** Keeps the public grammar counts and kind table aligned with executable conformance data. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { addressKinds } from '../src/shared/core/address-kinds';
import fixtures from './fixtures/addresses/conformance.json';

test('the public kind table and fixture counts cover the closed registry', () => {
  const document = readFileSync('docs/item-addresses.md', 'utf8');
  const count = fixtures.valid.length + fixtures.invalid.length + fixtures.hostile.length;
  expect(document).toContain(`**${Object.keys(addressKinds).length} kinds**`);
  expect(document).toContain(`**${count} fixtures**`);
  expect(document.replace(/\s+/g, ' ')).toContain(`${fixtures.valid.length} valid, ${fixtures.invalid.length} invalid and ${fixtures.hostile.length} hostile-name`);
  for (const [kind, rule] of Object.entries(addressKinds)) {
    const value = rule.nameField ? rule.nameField + ' when usable; positional otherwise' : 'positional';
    expect(document).toContain(`| ${kind} | ${rule.parents.join(', ')} | ${value} |`);
  }
});
