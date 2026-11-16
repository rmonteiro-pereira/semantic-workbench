/** Exercises rename declarations through the workbench's source-edit decision boundary. */
import { expect, test } from 'bun:test';
import { stringify } from 'yaml';
import { declaredRenames, deletedItemAddresses } from '../src/shared/edit/address-changes';
import { migrateAddress } from '../src/shared/core/address-migration';
import { formatAddress, parseAddress } from '../src/shared/core/item-address';

const location = { project: 'sample', document: ['model.yaml'] };
const before = { name: 'O', ontology: [{ concept: 'A', relationships: [{ name: 'relation' }] }] };

test('an item rename declares its exact stable subtree without rewriting definition references', () => {
  const after = { ...before, ontology: [{ ...before.ontology[0], concept: 'B' }] };
  const changes = declaredRenames(stringify(before), stringify(after), location, ['ontology', 0]);
  expect(changes).toEqual([{ kind: 'item', from: 'sw1:sample/model.yaml#ontology:O/concept:A', to: 'sw1:sample/model.yaml#ontology:O/concept:B' }]);
});

test('scope renames replay in parent order and keep descendant suffixes', () => {
  const source = { ...before, ontology_mappings: [{ name: 'Mapping', semantic_model: { name: 'Old', datasets: [{ name: 'D' }] } }] };
  const target = { ...source, name: 'P', ontology_mappings: [{ ...source.ontology_mappings[0], semantic_model: { ...source.ontology_mappings[0].semantic_model, name: 'New' } }] };
  const changes = declaredRenames(stringify(source), stringify(target), location);
  expect(changes).toHaveLength(2);
  const parsed = parseAddress('sw1:sample/model.yaml#ontology:O/mapping:Mapping/model:Old/dataset:D');
  if (!parsed.ok) throw new Error('Invalid test locator.');
  const records = changes.map((change, index) => ({ ...change, id: String(index), at: '2026-11-16T00:00:00Z', commit: '' }));
  expect(formatAddress(migrateAddress(parsed.address, records, false))).toBe('sw1:sample/model.yaml#ontology:P/mapping:Mapping/model:New/dataset:D');
});

test('reordering named roots and editing under unnamed scopes declare no history', () => {
  const roots = [
    { name: 'A', datasets: [] },
    { name: 'B', datasets: [] },
  ];
  expect(declaredRenames(stringify({ semantic_model: roots }), stringify({ semantic_model: [...roots].reverse() }), location)).toEqual([]);
  expect(declaredRenames(stringify({ ontology: before.ontology }), stringify({ ontology: [{ concept: 'B' }] }), location, ['ontology', 0])).toEqual([]);
  expect(declaredRenames('name: old\n', 'name: new\n', { ...location, document: ['.gitignore'] })).toEqual([]);
});

test('deleting a named subtree records only its stable parent, while positional deletion records nothing', () => {
  expect(deletedItemAddresses(stringify(before), stringify({ ...before, ontology: [] }), location)).toEqual(['sw1:sample/model.yaml#ontology:O/concept:A']);
  expect(deletedItemAddresses(stringify({ ontology: before.ontology }), stringify({ ontology: [] }), location)).toEqual([]);
});
