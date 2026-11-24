// Checks that a concept created with an IRI keeps it, through the same patch writer the add form uses.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { applyPatches } from '../../src/shared/editor/patch';
import { fieldsFor, newItem } from '../../src/shared/edit/item-model';
import { insertPatches } from '../../src/shared/edit/yaml-patch';
import { validateInput } from '../../src/shared/validation/input';

const SOURCE = 'version: 0.2.0.dev0\nname: Retail\nprefixes:\n  ex: http://example.com/retail#\nontology:\n  - concept: Order\n    type: EntityType\n';

test('a concept made with an IRI is saved with it and reads back', () => {
  const concept = newItem('concept', { concept: 'Customer', type: 'EntityType', iri: 'ex:Customer' });
  expect(concept).toEqual({ concept: 'Customer', type: 'EntityType', iri: 'ex:Customer' });
  const saved = applyPatches(SOURCE, insertPatches(SOURCE, ['ontology'], concept));
  expect(parse(saved).ontology[1].iri).toBe('ex:Customer');
  expect(validateInput(saved, 'retail.ontology.yaml').valid).toBe(true);
});

test('an empty IRI is left out and the form still offers the field', () => {
  expect(newItem('concept', { concept: 'Customer', iri: '' })).toEqual({ concept: 'Customer', type: 'EntityType' });
  expect(fieldsFor('concept', { concepts: [], datasets: [], metrics: [] }).map(field => field.key)).toContain('iri');
});
