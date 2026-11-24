// The attribute order addition: the order in which a concept's attributes are shown. It defines no attribute.
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** The property name, spelled once for the modules that read the list. */
export const ATTRIBUTE_ORDER_PROPERTY = tesseraPropertyName('attributes');

/** The most names the order list may hold. */
export const MAX_ATTRIBUTE_ORDER_ENTRIES = 200;

/** A list of relationship names. The semantic checks decide whether each name is an attribute of the concept. */
export const ATTRIBUTES_ADDITION: AdditionEntry = {
  name: ATTRIBUTE_ORDER_PROPERTY,
  since: 2,
  places: ['concept'],
  value: {
    description: `a list of at most ${MAX_ATTRIBUTE_ORDER_ENTRIES} relationship names of the concept, in the order they are shown`,
    schema: { type: 'array', maxItems: MAX_ATTRIBUTE_ORDER_ENTRIES, items: { type: 'string', minLength: 1 } },
  },
  disposition: 'drop',
  owner: 'attributes and governance',
};
