// Tests foreign key column pairing and compatibility with existing fields.
import { test, expect } from 'bun:test';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import {
  odcsForeignKeys,
  odcsExternalForeignKeys,
  odcsReferenceIssues,
} from '../src/shared/odcs/foreign-keys';
// Foreign keys column to column: fromColumns/toColumns are property paths of the referencing and
// referenced objects, paired by position.
const table = (name: string, properties: any[], extra: any = {}) => ({
  name,
  id: name + '_obj',
  logicalType: 'object',
  properties: [
    { name: 'id', id: name + '_id', logicalType: 'integer', primaryKey: true },
    ...properties,
  ],
  ...extra,
});
const pairs = (data: any) =>
  odcsForeignKeys(data).map(k => ({
    from: k.from,
    to: k.to,
    fromColumns: k.fromColumns,
    toColumns: k.toColumns,
  }));
test('property-level key: from is the property, to the referenced object.property', () => {
  const data = {
    schema: [
      table('customers', []),
      table('orders', [
        { name: 'customer_id', relationships: [{ type: 'foreignKey', to: 'customers.id' }] },
      ]),
    ],
  };
  expect(pairs(data)).toEqual([
    { from: 1, to: 0, fromColumns: ['customer_id'], toColumns: ['id'] },
  ]);
  // Existing fields keep their values.
  expect(odcsForeignKeys(data)[0]).toMatchObject({
    label: 'customer_id',
    path: ['schema', 1, 'properties', 1, 'relationships', 0],
  });
});
test('schema-level single and composite keys pair by position', () => {
  const data = {
    schema: [
      table('a', [{ name: 'x' }, { name: 'y' }]),
      table('b', [{ name: 'ax' }, { name: 'ay' }], {
        relationships: [
          { type: 'foreignKey', from: 'b.ax', to: 'a.x' },
          { type: 'foreignKey', from: ['b.ax', 'b.ay'], to: ['a.x', 'a.y'] },
        ],
      }),
    ],
  };
  expect(pairs(data)).toEqual([
    { from: 1, to: 0, fromColumns: ['ax'], toColumns: ['x'] },
    { from: 1, to: 0, fromColumns: ['ax', 'ay'], toColumns: ['x', 'y'] },
  ]);
  expect(odcsForeignKeys(data)[1].label).toBe('ax, ay');
});
test('fully qualified references resolve object and property ids', () => {
  const data = {
    schema: [
      table('customers', [{ name: 'code', id: 'cust_code' }]),
      table('orders', [{ name: 'cc' }], {
        relationships: [
          {
            type: 'foreignKey',
            from: 'schema/orders_obj/properties/orders_id',
            to: 'schema/customers_obj/properties/cust_code',
          },
        ],
      }),
    ],
  };
  expect(pairs(data)).toEqual([{ from: 1, to: 0, fromColumns: ['id'], toColumns: ['code'] }]);
  const byName = {
    schema: [
      table('customers', [{ name: 'code' }]),
      table('orders', [
        { name: 'cc', relationships: [{ to: 'schema/customers/properties/code' }] },
      ]),
    ],
  };
  expect(pairs(byName)).toEqual([{ from: 1, to: 0, fromColumns: ['cc'], toColumns: ['code'] }]);
});
test('nested target paths keep parent.child', () => {
  const data = {
    schema: [
      table('people', [{ name: 'address', logicalType: 'object', properties: [{ name: 'zip' }] }]),
      table('visits', [{ name: 'zip', relationships: [{ to: 'people.address.zip' }] }]),
    ],
  };
  expect(pairs(data)).toEqual([
    { from: 1, to: 0, fromColumns: ['zip'], toColumns: ['address.zip'] },
  ]);
});
test('unequal composite arity keeps the key but pairs no columns and reports a finding', () => {
  const data = {
    schema: [
      table('a', [{ name: 'x' }, { name: 'y' }]),
      table('b', [{ name: 'ax' }], {
        relationships: [{ type: 'foreignKey', from: ['b.ax'], to: ['a.x', 'a.y'] }],
      }),
    ],
  };
  expect(pairs(data)).toEqual([{ from: 1, to: 0, fromColumns: [], toColumns: [] }]);
  expect(odcsReferenceIssues(data)).toEqual([
    {
      path: '/schema/1/relationships/0/to',
      message:
        'Composite foreign key pairs 1 source column with 2 target columns; both lists must have the same length.',
    },
  ]);
});
test('external references are listed separately and never resolved', () => {
  const data = {
    schema: [
      table('orders', [
        {
          name: 'customer_id',
          relationships: [{ to: 'crm.odcs.yaml#/schema/customers/properties/id' }],
        },
      ]),
    ],
  };
  expect(odcsForeignKeys(data)).toEqual([]);
  expect(odcsExternalForeignKeys(data)).toEqual([
    {
      from: 0,
      fromColumns: ['customer_id'],
      reference: 'crm.odcs.yaml#/schema/customers/properties/id',
      path: ['schema', 0, 'properties', 1, 'relationships', 0],
    },
  ]);
  expect(odcsReferenceIssues(data)).toEqual([]);
});
test('every UBL key has one column pair and the target column exists', () => {
  const data = parse(readFileSync('public/examples/ubl/ubl.odcs.yaml', 'utf8'));
  const keys = odcsForeignKeys(data);
  expect(keys.length).toBe(401);
  for (const k of keys) {
    expect(k.fromColumns.length).toBe(1);
    expect(k.toColumns.length).toBe(1);
    expect(data.schema[k.to].properties.some((p: any) => p.name === k.toColumns[0])).toBe(true);
    expect(data.schema[k.from].properties.some((p: any) => p.name === k.fromColumns[0])).toBe(true);
  }
});
