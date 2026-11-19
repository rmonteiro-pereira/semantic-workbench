// Checks that renaming a relationship finds every reference a person could have written, leaves a same-name relationship alone and names a reference it cannot rewrite.
import { expect, test } from 'bun:test';
import { findReferences, rewriteReferences, unrewritableReferences, type ProjectDoc } from '../../src/app/edit/references';

const ONTOLOGY: ProjectDoc = {
  id: 'p/retail.ontology.yaml',
  path: 'retail.ontology.yaml',
  filename: 'retail.ontology.yaml',
  source: [
    'name: Retail',
    'ontology:',
    '  - concept: Customer',
    '    type: EntityType',
    '    identify_by: [email]',
    '    tessera_attributes: [tier, email]',
    '    requires: [email IS NOT NULL, Order.email IS NOT NULL]',
    '    relationships:',
    '      - name: email',
    '        roles: [{concept: String}]',
    '        verbalizes: [Customer has email]',
    '      - name: tier',
    '        roles: [{concept: String}]',
    '        verbalizes: [Customer has tier]',
    '  - concept: Order',
    '    type: EntityType',
    '    derived_by: [Customer.email == Order.email]',
    '    requires: [email IS NOT NULL]',
    '    relationships:',
    '      - name: email',
    '        roles: [{concept: String}]',
    '        verbalizes: [Order has email]',
    '',
  ].join('\n'),
};

const MAPPING: ProjectDoc = {
  id: 'p/retail.mapping.yaml',
  path: 'retail.mapping.yaml',
  filename: 'retail.mapping.yaml',
  source: [
    'ontology_ref: {name: Retail}',
    'concept_mappings:',
    '  - concept: Customer',
    '    object_mappings:',
    '      - referent_mappings:',
    '          - relationship: email',
    '            expression: c.email',
    '  - concept: Order',
    '    object_mappings:',
    '      - referent_mappings:',
    '          - relationship: email',
    '            expression: o.email',
    '',
  ].join('\n'),
};

const TARGET = { kind: 'ontology-relationship' as const, name: 'email', docId: ONTOLOGY.id, path: ['ontology', 0, 'relationships', 0] };

function renamed(): Record<string, string> {
  const references = findReferences(TARGET, [ONTOLOGY, MAPPING]);
  const written = rewriteReferences([ONTOLOGY, MAPPING], references, 'address');
  return Object.fromEntries(written.map(document => [document.docId, document.source]));
}

test('a rename finds the identifier, the order list, the expressions and the mapping key of the same concept', () => {
  const places = findReferences(TARGET, [ONTOLOGY, MAPPING]).map(reference => reference.where.split(' ')[0] + ':' + reference.excerpt);
  expect(places.length).toBe(5);
  const sources = renamed();
  const ontology = sources[ONTOLOGY.id];
  expect(ontology).toContain('identify_by: [address]');
  expect(ontology).toContain('tessera_attributes: [tier, address]');
  expect(ontology).toContain('requires: [address IS NOT NULL, Order.email IS NOT NULL]');
  expect(sources[MAPPING.id]).toContain('relationship: address\n            expression: c.email');
});

test('a qualified reference to this relationship is rewritten and one to the same-name relationship on another concept is not', () => {
  const ontology = renamed()[ONTOLOGY.id];
  expect(ontology).toContain('derived_by: [Customer.address == Order.email]');
  expect(ontology).toContain('requires: [email IS NOT NULL]\n    relationships:\n      - name: email\n        roles: [{concept: String}]\n        verbalizes: [Order has email]');
});

test('the mapping key of the other concept keeps its name', () => {
  expect(renamed()[MAPPING.id]).toContain('relationship: email\n            expression: o.email');
});

test('an ambiguous mapping reference through two parents is named so the save can be refused', () => {
  const ambiguousOntology: ProjectDoc = {
    ...ONTOLOGY,
    source: [
      'name: Retail',
      'ontology:',
      '  - concept: Left',
      '    type: EntityType',
      '    relationships:',
      '      - name: code',
      '        roles: [{concept: String}]',
      '        verbalizes: [Left has code]',
      '  - concept: Right',
      '    type: EntityType',
      '    relationships:',
      '      - name: code',
      '        roles: [{concept: String}]',
      '        verbalizes: [Right has code]',
      '  - concept: Both',
      '    type: EntityType',
      '    extends: [Left, Right]',
      '',
    ].join('\n'),
  };
  const mapping: ProjectDoc = {
    ...MAPPING,
    source: [
      'ontology_ref: {name: Retail}',
      'concept_mappings:',
      '  - concept: Both',
      '    object_mappings:',
      '      - referent_mappings:',
      '          - relationship: code',
      '            expression: b.code',
      '',
    ].join('\n'),
  };
  const target = { kind: 'ontology-relationship' as const, name: 'code', docId: ambiguousOntology.id, path: ['ontology', 0, 'relationships', 0] };
  expect(unrewritableReferences(target, [ambiguousOntology, mapping])).toEqual([{ file: 'retail.mapping.yaml', line: 6, excerpt: '- relationship: code' }]);
  expect(unrewritableReferences(TARGET, [ONTOLOGY, MAPPING])).toEqual([]);
});
