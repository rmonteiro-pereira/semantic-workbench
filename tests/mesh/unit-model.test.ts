/** Checks combined model identity and original ownership across ontology parts. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { formatAddress } from '../../src/shared/core/item-address';
import { inspect } from '../../src/shared/core/model';
import { combineUnit } from '../../src/shared/tessera/unit-model';
import { readUnitStructure } from '../../src/shared/tessera/unit-structure';

function model(folder: string, paths: string[]) {
  const documents = paths.map(path => ({
    path,
    data: JSON.parse(readFileSync(`tests/fixtures/tessera/mesh/units/${folder}/${path}`, 'utf8')),
  }));
  const { units, findings } = readUnitStructure(documents);
  expect(findings).toEqual([]);
  const combined = combineUnit(units[0]);
  const { tessera_includes: _includes, tessera: _marker, ...standard } = combined.ontology;
  return { ...combined, inspected: inspect(JSON.stringify(standard)) };
}

test('split and unsplit ontologies have the same concepts, edges and item identities', () => {
  const split = model('three-parts', ['returns.yaml', 'ontology.yaml', 'customers.json', 'orders.yaml']);
  const single = model('one-file-twin', ['ontology.yaml']);
  expect(split.ontology.ontology).toEqual(single.ontology.ontology);
  expect(split.inspected.entities).toEqual(single.inspected.entities);
  expect(split.inspected.edges).toEqual(single.inspected.edges);
});

test('cross-part references resolve and nested items keep their source file', () => {
  const split = model('three-parts', ['ontology.yaml', 'orders.yaml', 'returns.yaml', 'customers.json']);
  const order = split.inspected.entities.find(entity => entity.name === 'Order')!;
  const customer = split.inspected.entities.find(entity => entity.name === 'Customer')!;
  const relationship = split.inspected.edges.find(edge => edge.source === order.id && edge.target === customer.id)!;
  expect(split.itemFiles.get(formatAddress(relationship.address))).toBe('orders.yaml');
  expect(split.itemFiles.get(formatAddress(order.address))).toBe('orders.yaml');
  expect(split.itemFiles.get(formatAddress(customer.address))).toBe('customers.json');
});
