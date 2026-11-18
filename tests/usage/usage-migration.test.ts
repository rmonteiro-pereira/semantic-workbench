// Tests that stored counts follow renames, moves and deletions of items, using the same records and
// pure functions that item addresses already use.
import { describe, expect, test } from 'bun:test';
import { migrateAddress, type MigrationRecord } from '../../src/shared/core/address-migration';
import { formatAddress, parseAddress } from '../../src/shared/core/item-address';
import { rekey, recordsAfter } from '../../src/server/usage/usage-migration';
import { addCount, emptyDayFile, measureTotal, type CounterDayFile } from '../../src/server/usage/usage-counts';

const model = 'sw1:shop/sales.yaml#model:Sales';
const field = (dataset: string, name: string) => `${model}/dataset:${dataset}/field:${name}`;

function record(id: string, kind: MigrationRecord['kind'], from: string, to?: string): MigrationRecord {
  return { id, kind, from, ...(to ? { to } : {}), at: '2026-11-01T00:00:00.000Z', commit: 'c'.repeat(40) };
}

function fileWith(...addresses: [string, number][]): CounterDayFile {
  const file = emptyDayFile('shop', '2026-11-10');
  for (const [address, amount] of addresses) addCount(file.counts, { address, measure: 'workbench-requests', operation: 'agent.context.read', origin: 'http' }, amount);
  return file;
}

const totals = (file: CounterDayFile) => Object.fromEntries(Object.entries(file.counts).map(([address, item]) => [address, measureTotal(item, 'workbench-requests')]));

describe('rekey', () => {
  test('a renamed item keeps its counts under the new address', () => {
    const result = rekey(fileWith([`${model}/metric:revenue`, 4]), [record('m1', 'item', `${model}/metric:revenue`, `${model}/metric:gross_revenue`)]);
    expect(totals(result)).toEqual({ [`${model}/metric:gross_revenue`]: 4 });
    expect(result.migratedThrough).toBe('m1');
  });

  test('a renamed scope carries every item under it', () => {
    const result = rekey(fileWith([field('orders', 'amount'), 2], [`${model}/metric:revenue`, 1]), [record('m1', 'scope', model, 'sw1:shop/sales.yaml#model:Revenue')]);
    expect(totals(result)).toEqual({ 'sw1:shop/sales.yaml#model:Revenue/dataset:orders/field:amount': 2, 'sw1:shop/sales.yaml#model:Revenue/metric:revenue': 1 });
  });

  test('a moved document carries its items to the new path', () => {
    const result = rekey(fileWith([field('orders', 'amount'), 3]), [record('m1', 'document', 'sw1:shop/sales.yaml', 'sw1:shop/models/sales.yaml')]);
    expect(totals(result)).toEqual({ 'sw1:shop/models/sales.yaml#model:Sales/dataset:orders/field:amount': 3 });
  });

  test('counts of items that meet are summed', () => {
    const result = rekey(fileWith([field('orders', 'amount'), 3], [field('orders', 'total'), 5]), [record('m1', 'item', field('orders', 'amount'), field('orders', 'total'))]);
    expect(totals(result)).toEqual({ [field('orders', 'total')]: 8 });
  });

  test('a deleted item and everything under it loses its counts', () => {
    const result = rekey(fileWith([`${model}/dataset:orders`, 1], [field('orders', 'amount'), 2], [field('customers', 'region'), 4]), [record('d1', 'deleted', `${model}/dataset:orders`)]);
    expect(totals(result)).toEqual({ [field('customers', 'region')]: 4 });
  });

  test('a name reused after a deletion does not inherit older counts', () => {
    const records = [record('d1', 'deleted', field('orders', 'amount')), record('m2', 'item', field('orders', 'total'), field('orders', 'amount'))];
    const result = rekey(fileWith([field('orders', 'amount'), 6], [field('orders', 'total'), 1]), records);
    expect(totals(result)).toEqual({ [field('orders', 'amount')]: 1 });
  });

  test('records apply in order, so a chain of renames ends at the last name', () => {
    const records = [record('m1', 'item', field('orders', 'a'), field('orders', 'b')), record('m2', 'item', field('orders', 'b'), field('orders', 'c'))];
    expect(totals(rekey(fileWith([field('orders', 'a'), 2]), records))).toEqual({ [field('orders', 'c')]: 2 });
  });

  test('an unrelated record changes nothing but the marker', () => {
    const result = rekey(fileWith([field('orders', 'amount'), 2]), [record('m1', 'item', field('customers', 'a'), field('customers', 'b'))]);
    expect(totals(result)).toEqual({ [field('orders', 'amount')]: 2 });
    expect(result.migratedThrough).toBe('m1');
  });

  test('a remove and add pair keeps the counts with the removed item and none on the added one', () => {
    const removedOnly = rekey(fileWith([field('orders', 'old'), 3]), [record('r1', 'reconciliation', field('orders', 'unrelated'), field('orders', 'other'))]);
    expect(totals(removedOnly)).toEqual({ [field('orders', 'old')]: 3 });
    const deleted = rekey(fileWith([field('orders', 'old'), 3]), [record('d1', 'deleted', field('orders', 'old'))]);
    expect(totals(deleted)).toEqual({});
  });

  test('matches the pure address function applied by hand', () => {
    const records = [
      record('m1', 'scope', model, 'sw1:shop/sales.yaml#model:Revenue'),
      record('m2', 'item', 'sw1:shop/sales.yaml#model:Revenue/dataset:orders', 'sw1:shop/sales.yaml#model:Revenue/dataset:sales'),
    ];
    const address = field('orders', 'amount');
    const byHand = formatAddress(migrateAddress((parseAddress(address) as { ok: true; address: any }).address, records, false));
    expect(Object.keys(rekey(fileWith([address, 1]), records).counts)).toEqual([byHand]);
  });

  test('applying the same records twice gives the same file', () => {
    const records = [record('m1', 'item', field('orders', 'a'), field('orders', 'b')), record('d1', 'deleted', field('orders', 'gone'))];
    const once = rekey(fileWith([field('orders', 'a'), 2], [field('orders', 'gone'), 1]), records);
    expect(rekey(once, records)).toEqual(once);
  });

  test('returns the file itself when there is nothing new', () => {
    const file = fileWith([field('orders', 'a'), 2]);
    expect(rekey(file, [])).toBe(file);
  });
});

describe('recordsAfter', () => {
  test('starts after the marker, or at the start when the marker is null or unknown', () => {
    const records = [record('a', 'item', field('x', 'a'), field('x', 'b')), record('b', 'item', field('x', 'b'), field('x', 'c'))];
    expect(recordsAfter(records, 'a').map(entry => entry.id)).toEqual(['b']);
    expect(recordsAfter(records, null)).toHaveLength(2);
    expect(recordsAfter(records, 'zzz')).toHaveLength(2);
  });
});
