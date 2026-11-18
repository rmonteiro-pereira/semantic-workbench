/** Proves ownership is independent of aliases and remains compatible with relationship and item locators. */
import { expect, test } from 'bun:test';
import { formatAddress, parseAddress, type Address } from '../../src/shared/core/item-address';
import { relationshipMatches } from '../../src/shared/mappings/relationship-reference';
import { qualifiedConcept, qualifyReferences, rewriteConceptReferences } from '../../src/shared/tessera/qualify';

const finance = { project: 'finance', ontology: 'root.yaml', concept: 'Order' };
const support = { ...finance, project: 'support' };

test('provider identity distinguishes matching concepts and aliases do not change compiled names', () => {
  expect(qualifiedConcept(finance)).toBe('finance~root%2Eyaml~Order');
  expect(qualifiedConcept(support)).not.toBe(qualifiedConcept(finance));
  expect(qualifyReferences(new Map([['fin.Order', finance]]), new Set())('fin.Order')).toBe(qualifyReferences(new Map([['billing.Order', finance]]), new Set())('billing.Order'));
  expect(qualifiedConcept({ ...finance, project: 'finance~ops' })).not.toBe(qualifiedConcept({ ...finance, project: 'finance%7Eops' }));
  expect(() => qualifyReferences(new Map([['fin.Order', finance]]), new Set([qualifiedConcept(finance)]))).toThrow('collides');
});

test('rewrites references while leaving literals, comments and the concept declaration unchanged', () => {
  const name = qualifiedConcept(finance);
  const source = {
    concept: 'RetailOrder',
    extends: ['fin.Order'],
    identify_by: ['fin.Order.code'],
    requires: ["fin.Order.code <> 'fin.Order.code' /* fin.Order.code */"],
    relationships: [{ name: 'related', roles: [{ concept: 'fin.Order' }], requires: ['fin.Order.code > 0'] }],
  };
  const rewrite = qualifyReferences(new Map([['fin.Order', finance]]), new Set(['RetailOrder']));
  expect(rewriteConceptReferences(source, rewrite)).toEqual({
    concept: 'RetailOrder',
    extends: [name],
    identify_by: [`${name}.code`],
    requires: [`"${name}".code <> 'fin.Order.code' /* fin.Order.code */`],
    relationships: [{ name: 'related', roles: [{ concept: name }], requires: [`"${name}".code > 0`] }],
  });
  expect(source.extends).toEqual(['fin.Order']);
});

test('qualified names work with relationship matching and canonical addresses', () => {
  const name = qualifiedConcept(finance);
  const relationship = { name: 'code' };
  const concepts = new Map([[name, { relationships: [relationship] }]]);
  expect(relationshipMatches(concepts, 'Consumer', `${name}.code`).matches).toEqual([{ owner: name, definition: relationship }]);
  const address: Address = { grammar: 1, form: 'document-relative', chain: [{ kind: 'concept', name }] };
  expect(parseAddress(formatAddress(address))).toEqual({ ok: true, address });
});
