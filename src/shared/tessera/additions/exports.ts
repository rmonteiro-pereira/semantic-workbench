/** Registers a list of public concept names for ontology units. */
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** The property name used by ontology readers. */
export const EXPORTS_PROPERTY = tesseraPropertyName('exports');

/** The shape and compiler disposition of the property. */
export const EXPORTS_ADDITION: AdditionEntry = {
  name: EXPORTS_PROPERTY,
  since: 3,
  places: ['root'],
  value: { description: 'a list of public concept names', schema: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } } },
  disposition: 'drop',
  owner: 'multi-file units',
};
