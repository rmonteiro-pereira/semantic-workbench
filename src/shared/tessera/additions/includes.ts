/** Registers an ordered list of project-relative part files for ontology units. */
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** Maximum number of parts declared by one root. */
export const MAX_UNIT_PARTS = 200;

/** The property name used by ontology readers. */
export const INCLUDES_PROPERTY = tesseraPropertyName('includes');

/** The shape and compiler disposition of the property. */
export const INCLUDES_ADDITION: AdditionEntry = {
  name: INCLUDES_PROPERTY,
  since: 3,
  places: ['root'],
  value: {
    description: 'an ordered list of project-relative part files',
    schema: { type: 'array', minItems: 1, maxItems: MAX_UNIT_PARTS, uniqueItems: true, items: { type: 'string', minLength: 1 } },
  },
  disposition: 'translate',
  owner: 'multi-file units',
};
