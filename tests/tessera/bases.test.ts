// Checks the base table accepts the shipped base and a clean next base and refuses a base that uses a Tessera name.
import { expect, test } from 'bun:test';
import { SUPPORTED_BASES, baseLabel, findBase, registerBase, type SupportedBase } from '../../src/shared/tessera/bases';
import synthetic from '../fixtures/ossie-next-base/synthetic-ontology.json';
import colliding from '../fixtures/ossie-next-base/colliding-ontology.json';

const nextBase = (ontologySchema: object): SupportedBase => ({ version: '0.3.0.dev0', label: baseLabel('0.3.0.dev0', true), draft: true, ontologySchema });

test('the shipped base is labelled as a draft and is accepted by the collision check', () => {
  expect(SUPPORTED_BASES.map(base => base.version)).toEqual(['0.2.0.dev0']);
  expect(SUPPORTED_BASES[0].label).toBe('valid against the bundled Ossie 0.2.0.dev0 draft');
  expect(registerBase([], SUPPORTED_BASES[0])).toHaveLength(1);
});

test('a next base that leaves the Tessera names alone is registered beside the shipped one', () => {
  const table = registerBase(SUPPORTED_BASES, nextBase(synthetic));
  expect(table.map(base => base.version)).toEqual(['0.2.0.dev0', '0.3.0.dev0']);
  expect(findBase(table, '0.3.0.dev0')?.draft).toBe(true);
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
