/** Checks the versioned registry and the portable conformance fixture schema. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { addressKinds, editableAddressKinds } from '../src/shared/core/address-kinds';
import { kindLabel } from '../src/shared/edit/item-model';
import fixtures from './fixtures/addresses/conformance.json';

test('every editable kind maps to a registered address kind', () => {
  expect(Object.keys(editableAddressKinds).sort()).toEqual(Object.keys(kindLabel).sort());
  for (const kind of Object.values(editableAddressKinds)) expect(Object.hasOwn(addressKinds, kind)).toBe(true);
});

test('the kind registry agrees with every row of the versioned grammar contract', () => {
  const contract = readFileSync('specs/009-item-addresses/contracts/address-grammar.md', 'utf8');
  const table = contract.split('## Kind registry (version 1)')[1].split('The registry is code')[0];
  const rows = [...table.matchAll(/^\| `([^`]+)` \|.*$/gm)];
  expect(rows.map(row => row[1]).sort()).toEqual(Object.keys(addressKinds).sort());
  for (const row of rows) {
    const kind = row[1] as keyof typeof addressKinds;
    const cells = row[0].split('|').map(cell => cell.trim());
    const rule = addressKinds[kind];
    expect(cells[4].replaceAll('`', '')).toBe(rule.nameField ?? 'none');
    expect(cells[5]).toBe(rule.named ? 'yes' : 'position');
    for (const parent of rule.parents) expect(cells[3]).toContain(parent);
  }
});

test('every conformance fixture has the portable entry fields', () => {
  expect(Object.keys(fixtures).sort()).toEqual(['hostile', 'invalid', 'valid']);
  for (const entry of [...fixtures.valid, ...fixtures.invalid, ...fixtures.hostile]) {
    expect(typeof entry.text).toBe('string');
    if ('reason' in entry) {
      expect(typeof entry.reason).toBe('string');
    } else {
      expect(entry.canonical).toBe(entry.text);
      expect(entry.parsed.grammar).toBe(1);
      expect(Array.isArray(entry.parsed.chain)).toBe(true);
    }
  }
});
