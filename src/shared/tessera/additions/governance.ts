// The governance addition: status, owner, steward, classification and deprecation details of an ontology item.
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** The property name, spelled once for the modules that read the entry. */
export const GOVERNANCE_PROPERTY = tesseraPropertyName('governance');

/** The statuses an ontology item may have. A missing status reads as "not set". */
export const GOVERNANCE_STATUSES = ['proposed', 'approved', 'deprecated'] as const;

/** The keys a governance entry may hold. */
export const GOVERNANCE_KEYS = ['status', 'owner', 'steward', 'classification', 'replaced_by', 'deprecation_reason'] as const;

/** The longest owner, steward and classification, counted in characters. */
export const MAX_GOVERNANCE_NAME_CHARACTERS = 200;

/** The longest deprecation reason, counted in characters. */
export const MAX_DEPRECATION_REASON_CHARACTERS = 2_000;

const shortText = { type: 'string', minLength: 1, maxLength: MAX_GOVERNANCE_NAME_CHARACTERS };

/**
 * The schema checks the type and length of each value. The semantic checks own the rules a schema message would explain badly:
 * the status words, the keys outside the list, the empty entry and the deprecation details, so one mistake gives one finding.
 */
export const GOVERNANCE_ADDITION: AdditionEntry = {
  name: GOVERNANCE_PROPERTY,
  since: 2,
  places: ['concept', 'relationship'],
  value: {
    description: `an object with at least one of ${GOVERNANCE_KEYS.join(', ')}`,
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        owner: shortText,
        steward: shortText,
        classification: shortText,
        replaced_by: { type: 'string', minLength: 1 },
        deprecation_reason: { type: 'string', minLength: 1, maxLength: MAX_DEPRECATION_REASON_CHARACTERS },
      },
    },
  },
  disposition: 'drop',
  owner: 'attributes and governance',
};
