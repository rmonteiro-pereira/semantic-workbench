/** Registers a list of provider declarations with explicit concept allow-lists for ontology units. */
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** Maximum number of imports declared by one root. */
export const MAX_UNIT_IMPORTS = 50;

/** The property name used by ontology readers. */
export const IMPORTS_PROPERTY = tesseraPropertyName('imports');

/** The shape and compiler disposition of the property. */
export const IMPORTS_ADDITION: AdditionEntry = {
  name: IMPORTS_PROPERTY,
  since: 3,
  places: ['root'],
  value: {
    description: 'a list of provider declarations with explicit concept allow-lists',
    schema: {
      type: 'array',
      maxItems: MAX_UNIT_IMPORTS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['project', 'alias', 'concepts'],
        properties: {
          project: { type: 'string', minLength: 1 },
          ontology: { type: 'string', minLength: 1 },
          alias: { type: 'string', pattern: '^[A-Za-z0-9_]+$' },
          concepts: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          version: { oneOf: [{ const: 'latest' }, { type: 'object', required: ['pin'], additionalProperties: false, properties: { pin: { type: 'string', minLength: 1 } } }] },
        },
      },
    },
  },
  disposition: 'translate',
  owner: 'multi-file units',
};
