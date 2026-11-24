// Checks what an attribute is, what it inherits and that its address is the address of its relationship.
import { expect, test } from 'bun:test';
import { attributesOf, conceptKindLookup, isAttribute, type ConceptShape } from '../../src/shared/attributes/attribute-rule';
import { formatAddress } from '../../src/shared/core/item-address';
import { inspect } from '../../src/shared/core/model';

const concepts: ConceptShape[] = [
  { concept: 'LoyaltyTier', type: 'ValueType' },
  { concept: 'Order', type: 'EntityType' },
  {
    concept: 'Party',
    type: 'EntityType',
    relationships: [{ name: 'name', roles: [{ concept: 'String' }], verbalizes: ['{Party} has {name}'] }],
  },
  {
    concept: 'Customer',
    type: 'EntityType',
    extends: ['Party'],
    relationships: [
      { name: 'tier', roles: [{ concept: 'LoyaltyTier' }], verbalizes: ['{Customer} has {tier}'] },
      { name: 'places', roles: [{ concept: 'Order' }], verbalizes: ['{Customer} places {Order}'] },
      { name: 'meets', roles: [{ concept: 'Order' }, { concept: 'String' }], verbalizes: ['{Customer} meets'] },
      { name: 'lost', roles: [{ concept: 'Ghost' }], verbalizes: ['{Customer} lost'] },
      { name: 'age', roles: [{ concept: 'Integer' }], verbalizes: ['{Customer} has {age}'] },
    ],
  },
];
const lookup = conceptKindLookup(concepts);
const relationshipNamed = (name: string) => (concepts[3].relationships as any[]).find(relationship => relationship.name === name);

test('a role to a value type of the document is an attribute', () => {
  expect(isAttribute(relationshipNamed('tier'), lookup)).toBe(true);
});

test('a role to a built-in value type is an attribute', () => {
  expect(isAttribute(relationshipNamed('age'), lookup)).toBe(true);
});

test('a role to an entity type is not an attribute', () => {
  expect(isAttribute(relationshipNamed('places'), lookup)).toBe(false);
});

test('two roles are not an attribute even when one is a value type', () => {
  expect(isAttribute(relationshipNamed('meets'), lookup)).toBe(false);
});

test('a missing target is not an attribute', () => {
  expect(isAttribute(relationshipNamed('lost'), lookup)).toBe(false);
});

test('the built-in Any concept is an entity type and does not make an attribute', () => {
  expect(isAttribute({ name: 'any', roles: [{ concept: 'Any' }] }, lookup)).toBe(false);
});

test('a lookup that knows imported value types widens the rule', () => {
  const imported = (name: string) => (name === 'Money' ? 'ValueType' : lookup(name));
  expect(isAttribute({ name: 'price', roles: [{ concept: 'Money' }] }, imported)).toBe(true);
});

test('a concept lists its own attributes first and the inherited ones marked with their concept', () => {
  const entries = attributesOf(concepts[3], concepts, lookup);
  expect(entries.map(entry => [entry.name, entry.inheritedFrom])).toEqual([
    ['tier', undefined],
    ['age', undefined],
    ['name', 'Party'],
  ]);
});

test('an extends cycle is followed once and ends', () => {
  const cyclic: ConceptShape[] = [
    { concept: 'A', type: 'EntityType', extends: ['B'], relationships: [{ name: 'a', roles: [{ concept: 'String' }] }] },
    { concept: 'B', type: 'EntityType', extends: ['A'], relationships: [{ name: 'b', roles: [{ concept: 'String' }] }] },
  ];
  expect(attributesOf(cyclic[0], cyclic, conceptKindLookup(cyclic)).map(entry => entry.name)).toEqual(['a', 'b']);
});

test('an attribute has the same item address as its relationship', () => {
  const document = {
    version: '0.2.0.dev0',
    name: 'Retail',
    ontology: [
      { concept: 'LoyaltyTier', type: 'ValueType' },
      { concept: 'Customer', type: 'EntityType', relationships: [{ name: 'tier', roles: [{ concept: 'LoyaltyTier' }], verbalizes: ['{Customer} has {tier}'] }] },
    ],
  };
  const model = inspect(JSON.stringify(document), 'retail.ontology.json');
  const attribute = attributesOf(document.ontology[1], document.ontology, conceptKindLookup(document.ontology))[0];
  const edge = model.edges.find(candidate => candidate.label === 'tier') as any;
  expect(edge).toBeDefined();
  expect(attribute.name).toBe('tier');
  expect(formatAddress(edge.address)).toBe('sw1:#ontology:Retail/concept:Customer/relationship:tier');
  expect(model.edges.filter(candidate => candidate.label === 'tier')).toHaveLength(1);
});
