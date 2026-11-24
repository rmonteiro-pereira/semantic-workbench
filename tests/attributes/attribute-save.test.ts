// Checks the planned file text of attribute changes: add, edit, rename, reorder and the refusals, with the bytes of everything else kept.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { planAddAttribute, planEditAttribute, planReorderAttributes } from '../../src/app/attributes/attribute-save';
import type { ProjectDoc } from '../../src/app/edit/references';
import { withRevision } from '../../src/shared/tessera/revision-edit';

const SOURCE = [
  'tessera: 2',
  'version: 0.2.0.dev0',
  'name: Retail',
  'ontology:',
  '  - concept: LoyaltyTier',
  '    type: ValueType',
  '  - concept: Customer',
  '    type: EntityType',
  '    # the order people read first',
  '    tessera_attributes: [tier, email]',
  '    relationships:',
  '      - name: email',
  '        roles: [{concept: String}]',
  '        verbalizes: [Customer has email]',
  '      - name: tier',
  '        roles: [{concept: LoyaltyTier}]',
  '        verbalizes: [Customer has tier]',
  '',
].join('\n');

const doc: ProjectDoc = { id: 'p/retail.ontology.yaml', path: 'retail.ontology.yaml', filename: 'retail.ontology.yaml', source: SOURCE };
const document = parse(SOURCE);
const CONCEPT = ['ontology', 1];
const input = { name: 'phone', valueType: 'String', reading: 'Customer has phone' };

function writtenSource(plan: ReturnType<typeof planAddAttribute>): string {
  if ('refusal' in plan) throw new Error(plan.refusal);
  return plan.writes.find(write => write.docId === doc.id)!.source;
}

test('adding keeps every other byte and appends to an existing order list', () => {
  const source = writtenSource(planAddAttribute(doc, document, CONCEPT, input));
  expect(parse(source).ontology[1].tessera_attributes).toEqual(['tier', 'email', 'phone']);
  expect(parse(source).ontology[1].relationships[2]).toEqual({ name: 'phone', roles: [{ concept: 'String' }], verbalizes: ['Customer has phone'] });
  expect(source).toContain('    # the order people read first');
});

test('adding to a concept without an order list does not create one', () => {
  const plain = SOURCE.replace('    # the order people read first\n    tessera_attributes: [tier, email]\n', '');
  const source = writtenSource(planAddAttribute({ ...doc, source: plain }, parse(plain), CONCEPT, input));
  expect(source).not.toContain('tessera_attributes');
});

test('a type that is not a value type, a repeated name and a missing reading are refused', () => {
  const refusal = (value: Partial<typeof input>) => {
    const plan = planAddAttribute(doc, document, CONCEPT, { ...input, ...value });
    return 'refusal' in plan ? plan.refusal : '';
  };
  expect(refusal({ valueType: 'Customer' })).toContain('not a value type');
  expect(refusal({ valueType: 'Any' })).toContain('not a value type');
  expect(refusal({ name: 'email' })).toContain('already has a relationship named email');
  expect(refusal({ reading: ' ' })).toContain('reading sentence');
  expect(refusal({ name: '' })).toContain('name');
});

test('renaming rewrites the order list and the identifier list and leaves the rest', () => {
  const identified = SOURCE.replace('    type: EntityType\n', '    type: EntityType\n    identify_by: [email]\n');
  const identifiedDoc = { ...doc, source: identified };
  const plan = planEditAttribute([identifiedDoc], identifiedDoc, parse(identified), CONCEPT, 0, { name: 'address', valueType: 'String', reading: 'Customer has address' });
  if ('refusal' in plan) throw new Error(plan.refusal);
  const parsed = parse(plan.writes[0].source);
  expect(parsed.ontology[1].identify_by).toEqual(['address']);
  expect(parsed.ontology[1].tessera_attributes).toEqual(['tier', 'address']);
  expect(parsed.ontology[1].relationships[0]).toEqual({ name: 'address', roles: [{ concept: 'String' }], verbalizes: ['Customer has address'] });
});

test('editing the type and description without renaming writes one file', () => {
  const plan = planEditAttribute([doc], doc, document, CONCEPT, 1, { name: 'tier', valueType: 'String', reading: 'Customer has tier', description: 'The tier name.', multiplicity: 'ManyToOne' });
  if ('refusal' in plan) throw new Error(plan.refusal);
  expect(plan.writes).toHaveLength(1);
  expect(parse(plan.writes[0].source).ontology[1].relationships[1]).toMatchObject({ roles: [{ concept: 'String' }], description: 'The tier name.', multiplicity: 'ManyToOne' });
});

test('reordering writes the whole shown order', () => {
  const source = writtenSource(planReorderAttributes(doc, CONCEPT, ['email', 'tier']));
  expect(parse(source).ontology[1].tessera_attributes).toEqual(['email', 'tier']);
});

test('a rename that a mapping names ambiguously is refused with the file and line', () => {
  const ambiguous: ProjectDoc = {
    ...doc,
    source: SOURCE.replace(
      '  - concept: LoyaltyTier',
      '  - concept: Both\n    type: EntityType\n    extends: [Customer, Other]\n  - concept: Other\n    type: EntityType\n    relationships:\n      - name: email\n        roles: [{concept: String}]\n        verbalizes: [Other has email]\n  - concept: LoyaltyTier',
    ),
  };
  const mapping: ProjectDoc = {
    id: 'p/retail.mapping.yaml',
    path: 'retail.mapping.yaml',
    filename: 'retail.mapping.yaml',
    source: 'ontology_ref: {name: Retail}\nconcept_mappings:\n  - concept: Both\n    object_mappings:\n      - referent_mappings:\n          - relationship: email\n            expression: b.email\n',
  };
  const ontology = parse(ambiguous.source);
  const customerIndex = ontology.ontology.findIndex((concept: any) => concept.concept === 'Customer');
  const plan = planEditAttribute([ambiguous, mapping], ambiguous, ontology, ['ontology', customerIndex], 0, { name: 'address', valueType: 'String', reading: 'Customer has address' });
  expect('refusal' in plan && plan.refusal).toContain('retail.mapping.yaml:6');
});

test('reordering a revision 1 document writes the list only after the revision is raised, so the text is valid', () => {
  const older = SOURCE.replace('tessera: 2', 'tessera: 1').replace('    # the order people read first\n    tessera_attributes: [tier, email]\n', '');
  const olderDoc = { ...doc, source: older };
  const unraised = planReorderAttributes(olderDoc, CONCEPT, ['email', 'tier']);
  expect('refusal' in unraised && unraised.refusal).toContain('revision 2');
  const raised = planReorderAttributes(olderDoc, CONCEPT, ['email', 'tier'], text => withRevision(text, 'a.yaml'));
  if ('refusal' in raised) throw new Error(raised.refusal);
  expect(parse(raised.writes[0].source).tessera).toBe(2);
  expect(parse(raised.writes[0].source).ontology[1].tessera_attributes).toEqual(['email', 'tier']);
});
