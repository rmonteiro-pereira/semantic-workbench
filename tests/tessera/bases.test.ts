// Checks the base table accepts the shipped bases and a clean next base and refuses a base that uses a Tessera name.
import { expect, test } from 'bun:test';
import { loadDraftValidators } from '../../src/shared/validation/draft-validators';
import { SUPPORTED_BASES, baseLabel, findBase, registerBase, type SupportedBase } from '../../src/shared/tessera/bases';
import synthetic from '../fixtures/ossie-next-base/synthetic-ontology.json';
import colliding from '../fixtures/ossie-next-base/colliding-ontology.json';

const nextBase = (ontologySchema: object): SupportedBase => ({ version: '0.4.0.dev0', name: 'Ossie 0.4.0 draft', label: baseLabel('0.4.0.dev0', true), draft: true, ontologySchema, validators: {} });

test('the shipped bases are labelled as drafts and are accepted by the collision check', () => {
  expect(SUPPORTED_BASES.map(base => base.version)).toEqual(['0.2.0.dev0', '0.3.0.dev0']);
  expect(SUPPORTED_BASES[0].label).toBe('valid against the bundled Ossie 0.2.0.dev0 draft');
  expect(SUPPORTED_BASES[1].label).toBe('valid against the bundled Ossie 0.3.0 draft');
  expect(SUPPORTED_BASES.every(base => base.draft)).toBe(true);
  expect(registerBase(registerBase([], SUPPORTED_BASES[0]), SUPPORTED_BASES[1])).toHaveLength(2);
});

test('the 0.3 draft base checks each Tessera revision with its own derived validator', async () => {
  await loadDraftValidators();
  const base = findBase(SUPPORTED_BASES, '0.3.0.dev0')!;
  const document = { tessera: 1, version: '0.3.0.dev0', name: 'Retail', ontology: [{ concept: 'Order', type: 'EntityType', annotations: { source: 'owl' } }] };
  expect(base.validators[1]!(document)).toBe(true);
  expect(base.validators[1]!({ ...document, version: '0.2.0.dev0' })).toBe(false);
  expect(findBase(SUPPORTED_BASES, '0.2.0.dev0')!.validators[1]!({ ...document, version: '0.2.0.dev0' })).toBe(false);
});

test('a next base that leaves the Tessera names alone is registered beside the shipped one', () => {
  const table = registerBase(SUPPORTED_BASES, nextBase(synthetic));
  expect(table.map(base => base.version)).toEqual(['0.2.0.dev0', '0.3.0.dev0', '0.4.0.dev0']);
  expect(findBase(table, '0.4.0.dev0')?.draft).toBe(true);
  expect(findBase(table, '0.1.0')).toBeUndefined();
});

test('a base whose schema defines a Tessera property is refused with the property named', () => {
  expect(() => registerBase(SUPPORTED_BASES, nextBase(colliding))).toThrow('tessera_flag at OntologyComponent');
});

test('a base that defines the marker key at the root is refused', () => {
  const withMarker = structuredClone(synthetic) as Record<string, any>;
  withMarker.properties.tessera = { type: 'integer' };
  expect(() => registerBase(SUPPORTED_BASES, nextBase(withMarker))).toThrow('tessera at the document root');
});

test('the same version cannot be registered twice', () => {
  expect(() => registerBase(SUPPORTED_BASES, SUPPORTED_BASES[0])).toThrow('already a Tessera base');
});
