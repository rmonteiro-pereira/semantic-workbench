import { expect, test } from 'bun:test';
import { BINDINGS_SHOWN, bindingCountText, datasetLineages, jsonPointer, showAllBindingsLabel } from '../src/app/mappings/binding-lineage';

const evidence = { documentId: 'doc', filename: 'shop.mapping.yaml', revision: 1, path: ['concept_mappings', 0, 'object_mappings', 1, 'expression'] };

const context = {
  bindings: [
    { id: 'b1', concept: 'Order', rootConcept: 'Order', relationships: [], expression: 'orders.id', condition: undefined, fields: ['o.id'], metrics: [], evidence },
    {
      id: 'b2',
      concept: 'Customer',
      rootConcept: 'Order',
      relationships: ['placedBy'],
      expression: 'customers.id',
      condition: { op: 'equals' },
      fields: ['c.id', 'c.name', 'o.id'],
      metrics: [],
      evidence,
    },
    { id: 'b3', concept: 'Order', rootConcept: 'Order', relationships: [], expression: 'missing.field', condition: undefined, fields: ['gone'], metrics: [], evidence },
  ],
  fields: [
    { id: 'o.id', dataset: 'orders', name: 'id' },
    { id: 'c.id', dataset: 'customers', name: 'id' },
    { id: 'c.name', dataset: 'customers', name: 'name' },
  ],
  datasets: [{ name: 'orders', source: 'shop.orders' }, { name: 'customers' }],
};

test('a JSON pointer joins the path and escapes slashes and tildes', () => {
  expect(jsonPointer(['concept_mappings', 0, 'expression'])).toBe('/concept_mappings/0/expression');
  expect(jsonPointer(['a/b', '~'])).toBe('/a~1b/~0');
  expect(jsonPointer([])).toBe('');
});

test('bindings are grouped by the dataset whose fields they read, in first-seen order', () => {
  const groups = datasetLineages(context as never);
  expect(groups.map(group => group.dataset)).toEqual(['orders', 'customers']);
  expect(groups[0]).toMatchObject({ source: 'shop.orders' });
  expect(groups[0]!.bindings.map(binding => binding.id)).toEqual(['b1', 'b2']);
  expect(groups[1]).toMatchObject({ source: 'Unresolved' });
  expect(groups[1]!.bindings.map(binding => binding.id)).toEqual(['b2']);
});

test('a binding chain runs from concept through field and dataset to the physical source', () => {
  const [orders, customers] = datasetLineages(context as never);
  expect(orders!.bindings[0]!.steps).toEqual([
    { label: 'Concept', value: 'Order' },
    { label: 'Field', value: 'orders.id' },
    { label: 'Dataset', value: 'orders' },
    { label: 'Physical source', value: 'shop.orders' },
  ]);
  expect(customers!.bindings[0]!.steps.map(step => step.value)).toEqual(['Order', 'placedBy', 'Customer', 'customers.id, customers.name', 'customers', 'Unresolved']);
});

test('a binding carries its expression, condition flag and where the mapping file says it', () => {
  const [orders] = datasetLineages(context as never);
  expect(orders!.bindings[0]).toMatchObject({ expression: 'orders.id', conditional: false, filename: 'shop.mapping.yaml', pointer: '/concept_mappings/0/object_mappings/1/expression' });
  expect(orders!.bindings[1]!.conditional).toBe(true);
});

test('the dataset block shows two bindings before Show all and counts them in words', () => {
  expect(BINDINGS_SHOWN).toBe(2);
  expect(bindingCountText(1)).toBe('1 binding');
  expect(bindingCountText(19)).toBe('19 bindings');
  expect(showAllBindingsLabel(19, 'purchase_order')).toBe('Show all 19 bindings in purchase_order');
});
