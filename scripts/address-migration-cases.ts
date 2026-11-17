/** Exercises migration replay, matching and request ownership through public entry points. */
import assert from 'node:assert/strict';
import type * as AddressMigration from '../src/shared/core/address-migration';
import { parseAddress, formatAddress, type Address } from '../src/shared/core/item-address';

/** Detects reordered or repeated records, stale replay and widened authorization scope. */
export function addressMigrationCase(candidate: typeof AddressMigration) {
  const text = (name: string) => `sw1:p/model.yaml#model:M/dataset:${name}`;
  const parse = (text: string): Address => {
    const result = parseAddress(text);
    assert(result.ok);
    return result.address;
  };
  const record = (from: string, to: string, id: string) => ({ id, kind: 'item' as const, from: text(from), to: text(to), at: '2026-11-16T00:00:00Z', commit: '' });
  const records = [record('A', 'B', '1'), record('B', 'C', '2')];
  const deletion = { ...record('A', 'B', 'deleted'), kind: 'deleted' as const, to: undefined };
  const descendant = parse(text('A') + '/field:Value');
  assert(candidate.deletesAddress(deletion, descendant));
  assert(!candidate.deletesAddress(deletion, parse(text('AGroup'))));
  assert.deepEqual(candidate.historySinceDeletion(descendant, [records[0], deletion, records[1]]), { reset: true, records: [records[1]] });
  assert.equal(formatAddress(candidate.migrateAddress(parse(text('A')), records, false)), text('C'));
  assert.equal(formatAddress(candidate.migrateAddress(parse(text('A')), records, true)), text('A'));
  assert.equal(formatAddress(candidate.migrateAddress(parse(text('AGroup')), records, false)), text('AGroup'));
  assert.equal(formatAddress(candidate.migrateAddress(parse(text('A')), [records[0], { ...records[1], id: '1' }], false)), text('B'));
  assert.deepEqual(candidate.validateDeclaredMigrations([{ kind: 'item', from: text('A'), to: text('B') }], 'other', ['model.yaml']), { ok: false, reason: 'project', index: 0 });
}
