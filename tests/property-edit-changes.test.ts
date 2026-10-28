// Tests which attributes the property edit dialog writes.
import { describe, expect, test } from 'bun:test';
import { changesOf, draftOf } from '../src/app/odcs/PropertyEditors';

const property = { name: 'amount', logicalType: 'number', required: true, description: 'Amount.' };

describe('property edit changes', () => {
  test('an untouched form changes nothing', () => {
    expect(changesOf(property, draftOf(property), true)).toEqual([]);
  });

  test('only the edited attributes are listed, and clearing a value removes the key', () => {
    const draft = { ...draftOf(property), required: false, unique: true, description: '  ' };
    expect(changesOf(property, draft, true)).toEqual([
      { key: 'required', value: undefined },
      { key: 'unique', value: true },
      { key: 'description', value: undefined },
    ]);
  });

  test('a classification change is dropped for people who may not classify', () => {
    const draft = { ...draftOf(property), classification: 'public' };
    expect(changesOf(property, draft, false)).toEqual([]);
    expect(changesOf(property, draft, true)).toEqual([{ key: 'classification', value: 'public' }]);
  });
});
