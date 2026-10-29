// Tests contract history comparisons, including property renames.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { canonical, diffContracts, diffObject, flattenProperties, lastChange } from '../src/app/odcs/odcs-diff';
const base = parse(readFileSync('public/examples/commerce/commerce.odcs.yaml', 'utf8'));
const clone = () => structuredClone(base);
const orders = (c: any) => c.schema.find((o: any) => o.name === 'orders');
test('identical versions, and key order, are no change', () => {
  expect(diffContracts(base, clone())).toEqual({ contract: [], objects: [] });
  expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
});
test('added, removed and changed properties with each changed attribute, types included', () => {
  const next = clone();
  const o = orders(next);
  o.properties.find((p: any) => p.name === 'amount').logicalType = 'string';
  o.properties.find((p: any) => p.name === 'status').required = false;
  o.properties = o.properties.filter((p: any) => p.name !== 'order_date');
  o.properties.push({ name: 'currency', logicalType: 'string' });
  o.description = 'Changed.';
  const d = diffContracts(base, next);
  expect(d.objects).toHaveLength(1);
  const od = d.objects[0];
  expect(od.object).toBe('orders');
  expect(od.kind).toBe('changed');
  expect(od.attributes).toEqual([
    {
      attribute: 'description',
      before: 'Placed orders. Cancelled orders are retained; totals are in USD.',
      after: 'Changed.',
    },
  ]);
  expect(od.properties).toEqual([
    { path: 'order_date', kind: 'removed', changes: [] },
    {
      path: 'amount',
      kind: 'changed',
      changes: [{ attribute: 'logicalType', before: 'number', after: 'string' }],
    },
    {
      path: 'status',
      kind: 'changed',
      changes: [{ attribute: 'required', before: true, after: false }],
    },
    { path: 'currency', kind: 'added', changes: [] },
  ]);
});
test('physical type, keys, relationships and classification changes are all reported', () => {
  const next = clone();
  const p = orders(next).properties.find((x: any) => x.name === 'customer_id');
  p.physicalType = 'BIGINT';
  p.primaryKey = true;
  p.classification = 'internal';
  p.relationships[0].to = 'customers.name';
  expect(diffObject(base, next, 'orders')!.properties[0].changes.map(c => c.attribute)).toEqual(['classification', 'physicalType', 'primaryKey', 'relationships']);
});
test('objects added and removed, contract-level attributes, nested properties by dotted path, matching by id', () => {
  const next = clone();
  next.schema = next.schema.filter((o: any) => o.name !== 'products');
  next.schema.push({ name: 'refunds', properties: [{ name: 'refund_id' }] });
  next.version = '1.1.0';
  const d = diffContracts(base, next);
  expect(d.contract).toEqual([{ attribute: 'version', before: '1.0.0', after: '1.1.0' }]);
  expect(d.objects.map(o => [o.object, o.kind, o.properties.length])).toEqual([
    ['products', 'removed', 3],
    ['refunds', 'added', 1],
  ]);
  const tree = [
    { name: 'address', logicalType: 'object', properties: [{ name: 'street' }] },
    { name: 'tags', logicalType: 'array', items: { logicalType: 'string' } },
  ];
  expect(flattenProperties(tree).map(x => x.path)).toEqual(['address', 'address.street', 'tags', 'tags[]']);
  const changed = structuredClone(tree);
  changed[0].properties![0] = { name: 'street', logicalType: 'string' } as any;
  expect(diffContracts({ schema: [{ name: 'o', properties: tree }] }, { schema: [{ name: 'o', properties: changed }] }).objects[0].properties).toEqual([
    {
      path: 'address.street',
      kind: 'changed',
      changes: [{ attribute: 'logicalType', before: undefined, after: 'string' }],
    },
  ]);
  // With ids on both sides, a renamed property is one change, not a removal and an addition.
  const a = { schema: [{ id: 'o1', name: 'o', properties: [{ id: 'p1', name: 'old' }] }] };
  const b = { schema: [{ id: 'o1', name: 'o', properties: [{ id: 'p1', name: 'new' }] }] };
  expect(diffContracts(a, b).objects[0].properties).toEqual([
    {
      path: 'new',
      kind: 'changed',
      changes: [
        { attribute: 'path', before: 'old', after: 'new' },
        { attribute: 'name', before: 'old', after: 'new' },
      ],
    },
  ]);
});
test('last change of an object across newest-first versions', () => {
  const v1 = clone();
  const v2 = clone();
  orders(v2).properties[0].description = 'v2';
  const v3 = structuredClone(v2);
  v3.schema.find((o: any) => o.name === 'customers').description = 'v3';
  const versions = [
    { commit: 'c3', data: v3 },
    { commit: 'c2', data: v2 },
    { commit: 'c1', data: v1 },
  ];
  expect(lastChange(versions, 'orders')?.commit).toBe('c2');
  expect(lastChange(versions, 'customers')?.commit).toBe('c3');
  expect(lastChange(versions, 'products')?.commit).toBe('c1');
  expect(lastChange(versions, 'nope')).toBeNull();
});
