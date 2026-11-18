// Checks the relationship target choices end with the built-in concepts and that a relationship to one saves and validates.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { applyPatches } from '../../src/shared/editor/patch';
import { fieldsFor, newItem, relationshipTargetChoices } from '../../src/shared/edit/item-model';
import { valuePatches } from '../../src/shared/edit/yaml-patch';
import { validateInput } from '../../src/shared/validation/input';

const SOURCE = 'version: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n';

test('the declared concepts come first and the eight built-ins follow in order', () => {
  const choices = relationshipTargetChoices(['Customer', 'Order']);
  expect(choices.slice(0, 2)).toEqual(['Customer', 'Order']);
  expect(choices.slice(2)).toEqual(['Any', 'Boolean', 'Date', 'DateTime', 'Decimal', 'Float', 'Integer', 'String']);
});

test('a declared concept with a built-in name is not listed twice', () => {
  const choices = relationshipTargetChoices(['String']);
  expect(choices.filter(name => name === 'String')).toHaveLength(1);
  expect(choices[0]).toBe('String');
});

test('the target field of the relationship form uses the target choices and the extends field does not', () => {
  const choices = { concepts: ['Order'], datasets: [], metrics: [] };
  const target = fieldsFor('ontology-relationship', choices).find(field => field.key === 'target');
  expect(target?.options).toContain('String');
  const extendsField = fieldsFor('concept', choices).find(field => field.key === 'extends');
  expect(extendsField?.options).toEqual(['Order']);
});

test('a relationship to String saves and validates', () => {
  const relationship = newItem('ontology-relationship', { name: 'total_text', target: 'String', verbalizes: ['Order has total_text'] });
  const saved = applyPatches(SOURCE, valuePatches(SOURCE, ['ontology', 0, 'relationships'], [relationship]));
  expect(parse(saved).ontology[0].relationships[0].roles).toEqual([{ concept: 'String' }]);
  const result = validateInput(saved, 'retail.ontology.yaml');
  expect(result.valid).toBe(true);
  expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
});
