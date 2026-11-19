// Exercises exact address pairing and ordered explicit migration through the pure entry point.
import { expect, test } from 'bun:test';
import { compareItems } from '../../src/shared/item-diff/compare-items';
import type { DiffItem } from '../../src/shared/item-diff/item-change';
import type { MigrationRecord } from '../../src/shared/core/address-migration';

const prefix = 'sw1:finance/finance.yaml#ontology:Finance/concept:';
function item(name: string, data: Record<string, unknown> = {}, path = 'finance.yaml'): DiffItem {
  return { address: prefix.replace('finance.yaml', path) + name, name, kind: 'concept', path, data: { concept: name, ...data } };
}
function migration(from: DiffItem, to: DiffItem, id = 'rename'): MigrationRecord {
  return { id, from: from.address, to: to.address, kind: 'item', at: '2026-11-17T00:00:00Z', commit: '' };
}

test('reports added, removed and changed items and leaves unchanged items out', () => {
  const result = compareItems([item('Old'), item('Same'), item('Edited')], [item('New'), item('Same'), item('Edited', { description: 'New text' })]);
  expect(result.map(change => [change.name, change.state])).toEqual([
    ['Edited', 'changed'],
    ['New', 'added'],
    ['Old', 'removed'],
  ]);
  expect(result[0].fields).toEqual([{ field: 'description', before: '(absent)', after: 'New text' }]);
});

test('recorded rename is one change while outside renames are remove and add', () => {
  const before = item('Customer');
  const after = item('Customers');
  expect(compareItems([before], [after], [migration(before, after)])).toMatchObject([{ state: 'changed', address: after.address, previousAddress: before.address }]);
  expect(compareItems([before], [after]).map(change => change.state)).toEqual(['removed', 'added']);
  expect(compareItems([before], [item('Buyer')]).map(change => change.state)).toEqual(['added', 'removed']);
});

test('recorded document moves preserve descendants and report both addresses', () => {
  const before = item('Customer');
  const after = item('Customer', {}, 'moved.yaml');
  const record = { ...migration(before, after), kind: 'document' as const, from: 'sw1:finance/finance.yaml', to: 'sw1:finance/moved.yaml' };
  expect(compareItems([before], [after], [record])).toMatchObject([{ state: 'changed', address: after.address, previousAddress: before.address }]);
  expect(compareItems([before], [after])).toHaveLength(2);
});

test('duplicate addresses are reported with their candidate count and never paired', () => {
  const result = compareItems([item('Order'), item('Order', { description: 'Other' })], [item('Order')]);
  expect(result).toMatchObject([{ state: 'changed', ambiguous: 2, fields: [] }]);
  expect(compareItems([item('Old')], [item('New'), item('New')], [migration(item('Old'), item('New'))])).toMatchObject([{ ambiguous: 2 }, { state: 'removed' }]);
});

test('nameless items pair at their positional locator', () => {
  const before = { ...item('Ignored'), address: prefix + 'Customer/relationship:email/role:#0', kind: 'role', name: 'Role 1', data: { concept: 'String' } };
  const after = { ...before, data: { concept: 'Integer' } };
  expect(compareItems([before], [after])).toMatchObject([{ kind: 'role', state: 'changed', fields: [{ field: 'concept', before: 'String', after: 'Integer' }] }]);
});

test('a deletion stops migration replay and colliding migration targets are never guessed', () => {
  const before = item('Old');
  const after = item('New');
  const renamed = migration(before, after);
  const deleted: MigrationRecord = { ...renamed, id: 'delete', kind: 'deleted', from: after.address, to: undefined };
  expect(compareItems([before], [after], [renamed, deleted])).toHaveLength(2);
  expect(compareItems([before, item('Older')], [after], [renamed, migration(item('Older'), after, 'other')])).toHaveLength(3);
});

test('a recorded rename still pairs its destination when a new item reuses the old address', () => {
  const before = item('Customer', { description: 'Original buyer' });
  const renamed = item('Buyer', { description: 'Original buyer' });
  const reused = item('Customer', { description: 'Replacement buyer' });
  const result = compareItems([before], [renamed, reused], [migration(before, renamed)]);
  expect(result.map(change => [change.name, change.state])).toEqual([
    ['Buyer', 'changed'],
    ['Customer', 'added'],
  ]);
  expect(result[0].previousAddress).toBe(before.address);
});
