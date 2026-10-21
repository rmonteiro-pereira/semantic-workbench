// Tests resolution of contract references.
import { test, expect } from 'bun:test';
import { stringify } from 'yaml';
import { validateInput } from '../src/input';
import { inspect } from '../src/model';
import { documentKeys, entityKeys } from '../src/references';
const contract = (schema: any[]) =>
  stringify({
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: 'c1',
    version: '1.0.0',
    status: 'active',
    name: 'FK test',
    schema,
  });
const table = (name: string, properties: any[], extra: any = {}) => ({
  name,
  id: name + '_obj',
  logicalType: 'object',
  properties: [{ name: 'id', logicalType: 'integer', primaryKey: true }, ...properties],
  ...extra,
});
test('ODCS property-level, schema-level and fully qualified foreign keys become relationships', () => {
  const m = inspect(
    contract([
      table('customers', []),
      table(
        'orders',
        [
          {
            name: 'customer_id',
            logicalType: 'integer',
            relationships: [{ type: 'foreignKey', to: 'customers.id' }],
          },
          { name: 'sold_by', logicalType: 'integer' },
        ],
        {
          relationships: [
            {
              type: 'foreignKey',
              from: 'orders.sold_by',
              to: 'schema/customers_obj/properties/id',
            },
          ],
        },
      ),
    ]),
    'c.odcs.yaml',
  );
  expect(m.edges.map(e => [e.source, e.target, e.label, e.data.kind])).toEqual([
    ['schema/1', 'schema/0', 'customer_id', 'Foreign key'],
    ['schema/1', 'schema/0', 'sold_by', 'Foreign key'],
  ]);
  expect(m.edges[0].data.path).toEqual(['schema', 1, 'properties', 1, 'relationships', 0]);
});
test('ODCS references to other contract files are external; unknown local targets are errors', () => {
  const external = validateInput(
    contract([
      table('orders', [
        {
          name: 'customer_id',
          logicalType: 'integer',
          relationships: [{ to: 'crm.odcs.yaml#/schema/customers/properties/id' }],
        },
      ]),
    ]),
    'c.odcs.yaml',
  );
  expect(external.valid).toBe(true);
  expect(external.model!.edges).toEqual([]);
  const dangling = validateInput(
    contract([
      table('orders', [
        { name: 'customer_id', logicalType: 'integer', relationships: [{ to: 'customers.id' }] },
      ]),
    ]),
    'c.odcs.yaml',
  );
  expect(dangling.valid).toBe(false);
  expect(dangling.issues[0]).toMatchObject({
    code: 'reference',
    path: '/schema/0/properties/1/relationships/0/to',
  });
});
test('shared references match a QName IRI with the expanded IRI used by another document', () => {
  const ontology = inspect(
    stringify({
      version: '0.2.0.dev0',
      name: 'O',
      prefixes: { core: 'https://example.org/core#' },
      ontology: [{ concept: 'Party', type: 'EntityType', iri: 'core:Party' }],
    }),
    'o.yaml',
  );
  const odcs = inspect(
    contract([
      table('parties', [], {
        authoritativeDefinitions: [
          { type: 'businessDefinition', url: 'https://example.org/core#Party' },
        ],
      }),
    ]),
    'c.odcs.yaml',
  );
  expect(entityKeys(ontology.entities[0], ontology)).toContain('https://example.org/core#Party');
  expect(entityKeys(ontology.entities[0], ontology).some(k => documentKeys(odcs).has(k))).toBe(
    true,
  );
  expect(entityKeys(odcs.entities[0], odcs).some(k => documentKeys(ontology).has(k))).toBe(true);
});
