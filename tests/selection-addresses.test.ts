/** Verifies address state through the renderer-to-navigation boundary, including source reorder. */
import { expect, test } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { selectionAddress, selectionId, translateWalk } from '../src/app/graph/selection-addresses';

test('selection and neighborhood centers follow names across reorder without changing renderer IDs', () => {
  const original = inspect('name: O\nontology: [{concept: A}, {concept: B}]', 'o.yaml');
  const location = { project: 'p', document: ['o.yaml'] };
  const document = { ...location, entities: original.entities };
  const key = selectionAddress(document, 'ontology/1');
  expect(key).toBe('sw1:p/o.yaml#ontology:O/concept:B');
  const stored = translateWalk({ steps: [{ doc: 'p/o.yaml', center: 'ontology/1', name: 'B' }], index: 0 }, () => document, 'address');
  expect(stored.steps[0].center).toBe(key);
  const rendered = translateWalk(stored, () => document, 'renderer');
  expect(translateWalk(rendered, () => document, 'address', stored).steps[0]).toBe(stored.steps[0]);
  const reordered = { ...location, entities: inspect('name: O\nontology: [{concept: B}, {concept: A}]', 'o.yaml').entities };
  expect(selectionId(reordered, key)).toBe('ontology/0');
  expect(translateWalk(stored, () => reordered, 'renderer').steps[0].center).toBe('ontology/0');
  expect(original.entities[1].id).toBe('ontology/1');
});

test('RDF remains explicitly unaddressable', () => {
  const rdf = inspect('<https://example.org/A> a <http://www.w3.org/2002/07/owl#Class> .', 'a.ttl');
  const document = { project: 'p', document: ['a.ttl'], entities: rdf.entities };
  expect(selectionAddress(document, rdf.entities[0].id)).toBe(rdf.entities[0].id);
});
