// Tests sorting list rows by traffic with ties kept in their existing order.
import { expect, test } from 'bun:test';
import { sortByTraffic } from '../src/app/usage/usage-sort';

test('puts the busiest rows first', () => {
  const rows = [
    { name: 'a', count: 1 },
    { name: 'b', count: 9 },
    { name: 'c', count: 4 },
  ];
  expect(sortByTraffic(rows, row => row.count).map(row => row.name)).toEqual(['b', 'c', 'a']);
});

test('keeps rows with equal counts, including zero, in the order they came', () => {
  const rows = ['d', 'a', 'c', 'b', 'e'].map(name => ({ name, count: name === 'c' ? 3 : 0 }));
  expect(sortByTraffic(rows, row => row.count).map(row => row.name)).toEqual(['c', 'd', 'a', 'b', 'e']);
});

test('does not change the list it was given', () => {
  const rows = [{ count: 1 }, { count: 2 }];
  const before = [...rows];
  sortByTraffic(rows, row => row.count);
  expect(rows).toEqual(before);
});
