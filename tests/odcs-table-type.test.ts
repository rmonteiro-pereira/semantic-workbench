import { expect, test } from 'bun:test';
import { tableTypeBadge } from '../src/app/odcs/ContractOverview';

test('an ordinary table shows no type badge, whichever of the usual types it declares', () => {
  expect(tableTypeBadge({ physicalType: 'table', logicalType: 'object' })).toBe('');
  expect(tableTypeBadge({ logicalType: 'object' })).toBe('');
  expect(tableTypeBadge({ physicalType: 'Table' })).toBe('');
  expect(tableTypeBadge({})).toBe('');
});

test('a view or any other unusual type is named in the badge', () => {
  expect(tableTypeBadge({ physicalType: 'view', logicalType: 'object' })).toBe('view');
  expect(tableTypeBadge({ physicalType: 'materialized view' })).toBe('materialized view');
  expect(tableTypeBadge({ physicalType: 'table', logicalType: 'array' })).toBe('array');
});
