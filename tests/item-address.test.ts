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

import { displayName, formatAddress, hasPrefix, parseAddress, replacePrefix, resolveAddress, type Address, type AddressFailure } from '../src/shared/core/item-address';

function parsed(text: string): Address {
  const result = parseAddress(text);
  if (!result.ok) throw new Error(result.reason);
  return result.address;
}

test('all canonical fixtures parse and format without losing names', () => {
  for (const entry of [...fixtures.valid, ...fixtures.hostile]) {
    expect(parseAddress(entry.text)).toEqual({ ok: true, address: entry.parsed as Address });
    expect(formatAddress(entry.parsed as Address)).toBe(entry.canonical);
  }
  for (const entry of fixtures.invalid) expect(parseAddress(entry.text)).toEqual({ ok: false, reason: entry.reason as AddressFailure });
});

test('formatting rejects unaddressable structures at the boundary', () => {
  const address = parsed('sw1:p/a#concept:x');
  expect(() => formatAddress({ ...address, project: '' })).toThrow('empty');
  expect(() => formatAddress({ ...address, document: ['..'] })).toThrow('form');
  expect(() => formatAddress({ ...address, chain: [{ kind: 'concept', name: '' }] })).toThrow('empty');
  expect(() => formatAddress({ ...address, chain: [{ kind: 'concept', name: '\uD800' }] })).toThrow('encoding');
  expect(() => formatAddress({ ...address, chain: Array.from({ length: 33 }, () => address.chain[0]) })).toThrow('depth');
  expect(() => formatAddress({ ...address, chain: [{ kind: 'concept', name: 'x'.repeat(4096) }] })).toThrow('length');
});

test('relative resolution requires an absolute base and preserves the intended location', () => {
  const base = parsed('sw1:p/a#ontology:Example');
  expect(resolveAddress(parsed('sw1:#concept:C'))).toEqual({ ok: false, reason: 'form' });
  expect(resolveAddress(parsed('sw1:#concept:C'), parsed('sw1:p'))).toEqual({ ok: false, reason: 'form' });
  expect(resolveAddress(parsed('sw1:#concept:C'), base)).toEqual({ ok: true, address: parsed('sw1:p/a#concept:C') });
  expect(resolveAddress(parsed('sw1:/b#concept:C'), base)).toEqual({ ok: true, address: parsed('sw1:p/b#concept:C') });
  expect(resolveAddress(base)).toEqual({ ok: true, address: base });
});

test('prefix replacement matches whole segments and keeps descendants and snapshots', () => {
  const from = parsed('sw1:p/a#ontology:O/concept:Customer');
  const to = parsed('sw1:p/a#ontology:O/concept:Client');
  const child = parsed('sw1:p/a#ontology:O/concept:Customer/relationship:email@v1');
  expect(formatAddress(replacePrefix(child, from, to))).toBe('sw1:p/a#ontology:O/concept:Client/relationship:email@v1');
  expect(hasPrefix(parsed('sw1:p/a#ontology:O/concept:CustomerGroup'), from)).toBe(false);
  expect(hasPrefix(parsed('sw1:p/ab#ontology:O/concept:Customer'), from)).toBe(false);
  expect(displayName(child)).toBe('email');
});

test('the maximum length and depth are inclusive and parsing stays bounded', () => {
  const boundary = 'sw1:' + 'p'.repeat(4092);
  const start = performance.now();
  expect(parseAddress(boundary).ok).toBe(true);
  expect(performance.now() - start).toBeLessThan(10);
  expect(parseAddress(boundary + 'p')).toEqual({ ok: false, reason: 'length' });
  expect(parseAddress('sw1:p/a#' + Array.from({ length: 32 }, () => 'concept:x').join('/')).ok).toBe(true);
});
