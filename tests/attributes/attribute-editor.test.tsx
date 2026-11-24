// Checks the attribute section in each of its states and the saved bytes of its operations against a fixture.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { AttributeListView } from '../../src/app/attributes/AttributeList';
import { planAddAttribute, planEditAttribute, planReorderAttributes } from '../../src/app/attributes/attribute-save';
import { DeleteItem } from '../../src/app/edit/DeleteItem';
import { revisionQuestion } from '../../src/app/edit/RevisionConfirmation';
import { orderedAttributes } from '../../src/shared/attributes/attribute-order';
import { attributesOf, conceptKindLookup } from '../../src/shared/attributes/attribute-rule';
import { ADDITIONS_PROJECT_FILES } from '../helpers/tessera-repository';

const source = ADDITIONS_PROJECT_FILES['retail/ontology.yaml'];
const document = parse(source);
const doc = { id: 'p/ontology.yaml', path: 'ontology.yaml', filename: 'ontology.yaml', source };
const CUSTOMER = ['ontology', 2];
const customer = document.ontology[2];
const entries = orderedAttributes(attributesOf(customer, document.ontology, conceptKindLookup(document.ontology)), ['tier', 'email']);
const noop = () => {};
const view = (props: Partial<Parameters<typeof AttributeListView>[0]> = {}) =>
  renderToStaticMarkup(<AttributeListView entries={entries} state={{ kind: 'ready' }} canEdit message="" onAdd={noop} onEdit={noop} onMove={noop} onRemove={noop} {...props} />);

test('the list shows attributes in the order list first, with their types and readings', () => {
  const html = view();
  expect(html.indexOf('tier')).toBeLessThan(html.indexOf('email'));
  expect(html).toContain('LoyaltyTier');
  expect(html).toContain('Customer has tier');
});

test('an empty concept says there are no attributes and offers to add one', () => {
  const html = view({ entries: [] });
  expect(html).toContain('No attributes yet');
  expect(html).toContain('Add attribute');
});

test('loading shows a stable placeholder and an error shows its message and a retry', () => {
  expect(view({ state: { kind: 'loading' } })).toContain('Loading attributes…');
  const html = view({ state: { kind: 'error', message: 'The file could not be read.', retry: noop } });
  expect(html).toContain('The file could not be read.');
  expect(html).toContain('Try again');
});

test('a person who may not edit sees the reason and disabled controls', () => {
  const html = view({ canEdit: false, editNote: 'Requires the Editor role' });
  expect(html).toContain('Requires the Editor role');
  expect(html).toContain('aria-label="Edit tier" disabled');
  expect(html).toContain('<button type="button" disabled');
});

test('creating, renaming, reordering and a refused add write the bytes the operations promise', () => {
  const added = planAddAttribute(doc, document, CUSTOMER, { name: 'phone', valueType: 'String', reading: 'Customer has phone' });
  if ('refusal' in added) throw new Error(added.refusal);
  expect(parse(added.writes[0].source).ontology[2].tessera_attributes).toEqual(['tier', 'email', 'phone']);
  const renamed = planEditAttribute([doc], doc, document, CUSTOMER, 0, { name: 'address', valueType: 'String', reading: 'Customer has address' });
  if ('refusal' in renamed) throw new Error(renamed.refusal);
  expect(parse(renamed.writes[0].source).ontology[2].tessera_attributes).toEqual(['tier', 'address']);
  const moved = planReorderAttributes(doc, CUSTOMER, ['email', 'tier']);
  if ('refusal' in moved) throw new Error(moved.refusal);
  expect(parse(moved.writes[0].source).ontology[2].tessera_attributes).toEqual(['email', 'tier']);
  expect('refusal' in planAddAttribute(doc, document, CUSTOMER, { name: 'bad', valueType: 'Order', reading: 'x' })).toBe(true);
});

test('removing an attribute is the delete confirmation, and deleting a concept says its attributes go with it', () => {
  const props = { doc: { ...doc, project: 'p', hash: 'h' }, base: source, projectDocs: [{ ...doc, project: 'p', hash: 'h' }], onClose: noop, onDeleted: noop };
  const concept = renderToStaticMarkup(<DeleteItem {...props} path={CUSTOMER} kind="concept" name="Customer" />);
  expect(concept).toContain('Its relationships, including its attributes, are removed with it.');
  const attribute = renderToStaticMarkup(<DeleteItem {...props} path={[...CUSTOMER, 'relationships', 0]} kind="ontology-relationship" name="email" owner="Customer" />);
  expect(attribute).not.toContain('including its attributes');
});

test('the order list entry of a removed attribute is removed with it', async () => {
  const { findReferences, removeDependents } = await import('../../src/app/edit/references');
  const path = [...CUSTOMER, 'relationships', 0];
  const references = findReferences({ kind: 'ontology-relationship', name: 'email', docId: doc.id, path, owner: 'Customer' }, [doc]);
  const [removed] = removeDependents(
    [doc],
    [{ docId: doc.id, dependent: { path, label: 'email' } }, ...references.filter(reference => reference.dependent).map(reference => ({ docId: reference.docId, dependent: reference.dependent! }))],
  );
  const result = parse(removed.source).ontology[2];
  expect(result.relationships.map((relationship: any) => relationship.name)).toEqual(['tier', 'places']);
  expect(result.tessera_attributes).toEqual(['tier']);
});

test('the revision question differs for a document at revision 1 and one with no marker', () => {
  expect(revisionQuestion(source)).toBeNull();
  expect(revisionQuestion(source.replace('tessera: 2', 'tessera: 1'))?.title).toBe('Move this file to Tessera 2?');
  expect(revisionQuestion(source.replace('tessera: 2\n', ''))?.title).toBe('Mark this file as Tessera 2?');
});
