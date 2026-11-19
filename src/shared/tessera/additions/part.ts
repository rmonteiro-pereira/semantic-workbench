/** Registers the part marker for ontology units. */
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** The property name used by ontology readers. */
export const PART_PROPERTY = tesseraPropertyName('part');

/** The shape and compiler disposition of the property. */
export const PART_ADDITION: AdditionEntry = {
  name: PART_PROPERTY,
  since: 3,
  places: ['root'],
  value: { description: 'the part marker', schema: { const: true } },
  disposition: 'translate',
  owner: 'multi-file units',
};
