/** Demonstrates independent consumers using only public locator operations. */
import { expect, test } from 'bun:test';
import fixtures from './fixtures/addresses/conformance.json';
import { formatAddress, hasPrefix, parseAddress, replacePrefix, resolveAddress, type Address } from '../src/shared/core/item-address';
import { migrateAddress, type MigrationRecord } from '../src/shared/core/address-migration';

function parsed(text: string): Address {
  const result = parseAddress(text);
  if (!result.ok) throw new Error('Consumer received an invalid locator.');
  return result.address;
}

function diff(before: readonly string[], after: readonly string[], records: MigrationRecord[] = []) {
  const remaining = new Set(after);
  const removed: string[] = [];
  const renamed: [string, string][] = [];
  for (const key of before) {
    const next = formatAddress(migrateAddress(parsed(key), records, remaining.has(key)));
    if (!remaining.delete(next)) removed.push(key);
    else if (key !== next) renamed.push([key, next]);
  }
  return { removed, added: [...remaining], renamed };
}

test('a toy pointer round-trips all valid conformance entries through public functions', () => {
  const base = parsed('sw1:sample/model.yaml#model:M');
  for (const fixture of fixtures.valid) {
    const pointer = parsed(fixture.text);
    expect(formatAddress(pointer)).toBe(fixture.canonical);
    const resolved = resolveAddress(pointer, base);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.address.form).toBe('absolute');
  }
});

test('a toy usage counter moves a subtree without conflating adjacent names', () => {
  const scope = parsed('sw1:p/a.yaml#model:M/dataset:Customer');
  const target = parsed('sw1:p/a.yaml#model:M/dataset:Client');
  const keys = [formatAddress(scope) + '/field:id', formatAddress(scope) + '/field:a.b', formatAddress(scope) + 'Group/field:id'];
  const counts = new Map(keys.map((key, index) => [key, index + 1]));
  const moved = new Map([...counts].map(([key, count]) => [formatAddress(replacePrefix(parsed(key), scope, target)), count]));
  expect([...moved].filter(([key]) => hasPrefix(parsed(key), target)).reduce((sum, [, count]) => sum + count, 0)).toBe(3);
  expect(moved.get(keys[2])).toBe(3);
});

test('a toy diff treats external edits as remove plus add until explicit reconciliation', () => {
  const before = 'sw1:p/a.yaml#model:M/dataset:Old';
  const after = 'sw1:p/a.yaml#model:M/dataset:New';
  expect(diff([before], [after])).toEqual({ removed: [before], added: [after], renamed: [] });
  const reconciliation: MigrationRecord = { id: 'operation:0', kind: 'reconciliation', from: before, to: after, at: '2026-11-16T00:00:00Z', commit: '' };
  expect(diff([before], [after], [reconciliation])).toEqual({ removed: [], added: [], renamed: [[before, after]] });
  expect(diff([before], [before], [reconciliation])).toEqual({ removed: [], added: [], renamed: [] });
});
