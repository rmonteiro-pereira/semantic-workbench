// Checks the display order of attributes and the functions that keep the order list in step with edits.
import { expect, test } from 'bun:test';
import { orderAfterAdd, orderAfterMove, orderAfterRemove, orderAfterRename, orderedAttributes, orderListOf } from '../../src/shared/attributes/attribute-order';
import type { AttributeEntry } from '../../src/shared/attributes/attribute-rule';

const entry = (name: string, inheritedFrom?: string): AttributeEntry => ({ name, relationship: {}, relationshipIndex: 0, valueType: 'String', inheritedFrom });
const fileOrder = [entry('a'), entry('b'), entry('c'), entry('p', 'Party')];

test('a document without a list shows attributes in file order', () => {
  expect(orderedAttributes(fileOrder, []).map(attribute => attribute.name)).toEqual(['a', 'b', 'c', 'p']);
});

test('listed attributes come first in list order and the rest follow in file order', () => {
  expect(orderedAttributes(fileOrder, ['c', 'a']).map(attribute => attribute.name)).toEqual(['c', 'a', 'b', 'p']);
});

test('a name in the list that is no attribute is skipped and a repeated name is shown once', () => {
  expect(orderedAttributes(fileOrder, ['ghost', 'b', 'b']).map(attribute => attribute.name)).toEqual(['b', 'a', 'c', 'p']);
});

test('adding keeps a document without a list without one and appends to an existing list', () => {
  expect(orderAfterAdd(undefined, 'd')).toBeUndefined();
  expect(orderAfterAdd(['a'], 'd')).toEqual(['a', 'd']);
  expect(orderAfterAdd(['a', 'd'], 'd')).toEqual(['a', 'd']);
});

test('renaming rewrites the entry in place', () => {
  expect(orderAfterRename(['a', 'b'], 'b', 'bee')).toEqual(['a', 'bee']);
  expect(orderAfterRename(undefined, 'b', 'bee')).toBeUndefined();
});

test('removing drops the entry and an empty list becomes no list', () => {
  expect(orderAfterRemove(['a', 'b'], 'a')).toEqual(['b']);
  expect(orderAfterRemove(['a'], 'a')).toBeUndefined();
});

test('moving swaps with the neighbour and stops at the ends', () => {
  expect(orderAfterMove(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
  expect(orderAfterMove(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  expect(orderAfterMove(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
});

test('the list of a concept is read as text entries only', () => {
  expect(orderListOf({ tessera_attributes: ['a', 3, 'b'] })).toEqual(['a', 'b']);
  expect(orderListOf({})).toEqual([]);
});
