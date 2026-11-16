/** Exercises migration decisions through the public pure API. */
import { expect, test } from 'bun:test';
import { compactMigrations, migrateAddress, migrationRetentionCut, validateDeclaredMigrations, type MigrationRecord } from '../src/shared/core/address-migration';
import { formatAddress, parseAddress, type Address } from '../src/shared/core/item-address';
import { withAddressSeed } from './helpers/seeded-random';

const text = (name: string) =>
  formatAddress({
    grammar: 1,
    form: 'absolute',
    project: 'p',
    document: ['model.yaml'],
    chain: [
      { kind: 'model', name: 'M' },
      { kind: 'dataset', name },
    ],
  });
function address(value: string): Address {
  const parsed = parseAddress(value);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.address;
}
const record = (from: string, to: string, id = from): MigrationRecord => ({ id, kind: 'item', from: text(from), to: text(to), at: '2025-01-01T00:00:00Z', commit: '' });

test('records apply once in append order, terminate on rename back and preserve snapshots and suffixes', () => {
  const records = [record('A', 'B', '1'), record('B', 'A', '2'), record('A', 'C', '3')];
  const source = address(text('A'));
  source.chain.push({ kind: 'field', name: 'a/b' });
  source.snapshot = 'opaque-008';
  expect(formatAddress(migrateAddress(source, records, false))).toBe(text('C') + '/field:a%2Fb@opaque-008');
  expect(migrateAddress(source, records, true)).toBe(source);
  expect(formatAddress(migrateAddress(address(text('AGroup')), records, false))).toBe(text('AGroup'));
  const duplicate = [record('A', 'B', 'same'), record('B', 'C', 'same')];
  expect(formatAddress(migrateAddress(address(text('A')), duplicate, false))).toBe(text('B'));
  expect(formatAddress(migrateAddress(address(text('A')), [record('B', 'C'), record('A', 'B')], false))).toBe(text('B'));
});

test('a deleted prefix ends the chain and resolved input ignores stale history', () => {
  const deleted: MigrationRecord = { id: 'deleted', kind: 'deleted', from: text('B'), at: '2025-01-02T00:00:00Z', commit: '' };
  const records = [record('A', 'B'), deleted, record('B', 'C')];
  expect(formatAddress(migrateAddress(address(text('A')), records, false))).toBe(text('B'));
  expect(formatAddress(migrateAddress(address(text('A')), records, true))).toBe(text('A'));
});

test('declarations are typed at the request boundary and restricted to written project files', () => {
  const declaration = { kind: 'item' as const, from: text('A'), to: text('B') };
  expect(validateDeclaredMigrations(undefined, 'p', [])).toEqual({ ok: true, migrations: [] });
  expect(validateDeclaredMigrations([declaration], 'p', ['model.yaml'])).toEqual({ ok: true, migrations: [declaration] });
  expect(validateDeclaredMigrations([declaration], 'other', ['model.yaml'])).toMatchObject({ ok: false, reason: 'project' });
  expect(validateDeclaredMigrations([declaration], 'p', ['other.yaml'])).toMatchObject({ ok: false, reason: 'document' });
  expect(validateDeclaredMigrations(Array(65).fill(declaration), 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'limit' });
  expect(validateDeclaredMigrations([{ ...declaration, to: declaration.from }], 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'unchanged' });
  expect(validateDeclaredMigrations([{ ...declaration, kind: 'deleted' }], 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'shape' });
  expect(validateDeclaredMigrations([{ ...declaration, to: text('B') + '@snapshot' }], 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'address' });
  expect(validateDeclaredMigrations([{ ...declaration, from: text('A') + '/field:#0' }], 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'volatile' });
  expect(validateDeclaredMigrations([{ ...declaration, kind: 'scope' }], 'p', ['model.yaml'])).toMatchObject({ ok: false, reason: 'scope' });
  const scope = { kind: 'scope' as const, from: 'sw1:p/model.yaml#model:A', to: 'sw1:p/model.yaml#model:B' };
  expect(validateDeclaredMigrations([scope], 'p', ['model.yaml'])).toMatchObject({ ok: true });
});

test('compaction collapses expired chains, retains recent records and expires deleted markers', () => {
  const recent = { ...record('C', 'D', 'recent'), at: '2026-11-16T00:00:00Z' };
  const file = { formatVersion: 1 as const, records: [record('A', 'B'), record('B', 'C'), recent] };
  const compacted = compactMigrations(file, '2026-01-01T00:00:00Z');
  expect(compacted.records).toEqual([{ ...file.records[0], to: text('C') }, recent]);
  expect(compacted.compactedBefore).toBe('2026-01-01T00:00:00Z');
  expect(compactMigrations(compacted, '2026-01-01T00:00:00Z')).toEqual(compacted);
  expect(compactMigrations({ formatVersion: 1, records: [record('A', 'B'), record('B', 'A')] }, '2026')).toMatchObject({ records: [] });
  const deleted: MigrationRecord = { id: 'gone', kind: 'deleted', from: text('C'), at: '2025-01-02T00:00:00Z', commit: '' };
  expect(compactMigrations({ formatVersion: 1, records: [record('A', 'C'), deleted] }, '2026').records).toEqual([]);
  const recentDeleted = { ...deleted, at: '2026-11-16T00:00:00Z' };
  expect(compactMigrations({ formatVersion: 1, records: [recentDeleted] }, '2026-01-01T00:00:00Z').records).toEqual([recentDeleted]);
  expect(migrationRetentionCut(86_400_000 * 400, 365)).toBe(86_400_000 * 35);
  expect(() => migrationRetentionCut(0, 0)).toThrow(RangeError);
});

test('generated histories terminate and a resolving second application is idempotent', () => {
  withAddressSeed(random => {
    for (let index = 0; index < 1000; index++) {
      const records = Array.from({ length: 20 }, (_, position) => record(String(Math.floor(random() * 10)), String(Math.floor(random() * 10)), String(position)));
      const source = address(text(String(Math.floor(random() * 10))));
      source.chain.push({ kind: 'field', name: 'suffix/#' });
      const migrated = migrateAddress(source, records, false);
      expect(migrateAddress(migrated, records, true)).toBe(migrated);
      expect(migrated.chain.at(-1)).toEqual(source.chain.at(-1));
      expect(parseAddress(formatAddress(migrated)).ok).toBe(true);
    }
  });
});
