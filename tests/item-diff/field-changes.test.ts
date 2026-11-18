// Checks semantic fields after the shared parser has removed serialization noise.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { fieldChanges } from '../../src/shared/item-diff/field-changes';

test('comments, key order, indentation and line endings are not field changes', () => {
  const original = parse('name: Customer\ndescription: A buyer.\nroles: [{concept: String}]\n');
  for (const source of [
    '# Comment\nname: Customer\ndescription: A buyer. # More text\nroles: [{concept: String}]\n',
    'roles: [{concept: String}]\ndescription: A buyer.\nname: Customer\n',
    'name: Customer\ndescription: A buyer.\nroles:\n    - concept: String\n',
    'name: Customer\r\ndescription: A buyer.\r\nroles: [{concept: String}]\r\n',
  ])
    expect(fieldChanges(original, parse(source))).toEqual([]);
});

test('description, additions and inheritance are named with their values', () => {
  expect(fieldChanges({ description: 'Before' }, { description: 'After' })).toEqual([{ field: 'description', before: 'Before', after: 'After' }]);
  expect(fieldChanges({ tessera_notes: 'Old' }, { tessera_notes: 'New' })).toEqual([{ field: 'tessera_notes', before: 'Old', after: 'New' }]);
  expect(fieldChanges({ extends: ['A'] }, { extends: ['B'] })).toEqual([{ field: 'extends', before: '["A"]', after: '["B"]' }]);
  expect(fieldChanges({ roles: [{ concept: 'A', multiplicity: 'one' }] }, { roles: [{ multiplicity: 'one', concept: 'A' }] })).toEqual([]);
});

test('absent, null and empty values stay distinct, and long values are shortened', () => {
  expect(fieldChanges({}, { description: '' })).toEqual([{ field: 'description', before: '(absent)', after: '' }]);
  expect(fieldChanges({ description: null }, {})).toEqual([{ field: 'description', before: 'null', after: '(absent)' }]);
  expect(fieldChanges({}, { description: 'x'.repeat(1000) })[0].after).toHaveLength(500);
});
