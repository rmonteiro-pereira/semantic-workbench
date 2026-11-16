import { legacyLineageKey, legacyMappingKey } from '../src/shared/core/item-key-adapters';
/** Proves legacy labels are converted by model meaning instead of delimiter guessing. */
import { expect, test } from 'bun:test';
import { adaptItemKey } from '../src/shared/core/item-key-adapters';
import { formatAddress } from '../src/shared/core/item-address';
const location = { project: 'p', document: ['model.yaml'] };
const model = {
  name: 'M',
  datasets: [
    { name: 'a.b', fields: [{ name: 'c' }] },
    { name: 'a', fields: [{ name: 'b.c' }, { name: 'plain' }, { name: 'a/b' }] },
  ],
  relationships: [{ name: 'J' }],
  metrics: [{ name: 'Total' }],
};

test('unique old labels resolve to kind-qualified field dataset metric and join addresses', () => {
  for (const key of ['dataset:a', 'dataset:a/plain', 'field:a.plain', 'a.plain', 'metric:Total', 'join:J', 'dataset:a/a/b']) {
    const result = adaptItemKey(key, model, location);
    expect(result.status).toBe('found');
    if (result.status === 'found') expect(formatAddress(result.address)).toStartWith('sw1:p/model.yaml#model:M/');
  }
});

test('dotted collisions and duplicate scopes are reported without choosing a candidate', () => {
  expect(adaptItemKey('a.b.c', model, location)).toEqual({ status: 'ambiguous' });
  expect(adaptItemKey('field:a.b.c', model, location)).toEqual({ status: 'ambiguous' });
  const duplicate = { semantic_model: [model, { ...model, name: 'Other' }] };
  expect(adaptItemKey('dataset:a', duplicate, location)).toEqual({ status: 'ambiguous' });
  expect(adaptItemKey('dataset:absent', model, location)).toEqual({ status: 'missing' });
});

test('concept paths and aliases require an explicit unambiguous local meaning', () => {
  const ontology = { name: 'O', ontology: [{ concept: 'Party', relationships: [{ name: 'label' }] }] };
  expect(adaptItemKey('concept:Party/label', ontology, location).status).toBe('found');
  expect(adaptItemKey('concept:core:Party', ontology, location)).toEqual({ status: 'qualified' });
  expect(adaptItemKey('concept:core:Party', ontology, location, name => (name === 'core:Party' ? 'Party' : null)).status).toBe('found');
});

test('opening legacy labels never changes the document or its extension values', () => {
  const before = JSON.stringify(model);
  adaptItemKey('a.plain', model, location);
  expect(JSON.stringify(model)).toBe(before);
});

test('staged UI adoption writes only stable legacy center keys', () => {
  const address = {
    grammar: 1 as const,
    form: 'absolute' as const,
    project: 'p',
    document: ['c.yaml'],
    chain: [
      { kind: 'contract' as const, name: 'C' },
      { kind: 'object' as const, name: 'O' },
    ],
  };
  expect(legacyLineageKey(address)).toBe('object:c.yaml#O');
  const mapping = {
    ...address,
    chain: [
      { kind: 'ontology' as const, name: 'O' },
      { kind: 'concept' as const, name: 'C' },
    ],
  };
  expect(legacyMappingKey(mapping)).toBe('concept:C');
  const volatile = { ...mapping, chain: [{ kind: 'ontology' as const, position: 0 }, mapping.chain[1]] };
  expect(legacyMappingKey(volatile)).toBeNull();
  expect(legacyLineageKey(volatile)).toBeNull();
});
