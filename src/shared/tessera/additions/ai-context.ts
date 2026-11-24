// The agent context addition: text for agents that is kept with an item in the authoring format and read from the published snapshot only.
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';
import { MAX_NOTE_CHARACTERS } from './notes';

/** The property name, spelled once for the modules that read the context. */
export const AI_CONTEXT_PROPERTY = tesseraPropertyName('ai_context');

/** The longest text in an agent context, counted in characters. It is the same limit as a note. */
export const MAX_CONTEXT_CHARACTERS = MAX_NOTE_CHARACTERS;

const contextText = { type: 'string', maxLength: MAX_CONTEXT_CHARACTERS };
const contextTexts = { type: 'array', items: contextText };

/** The same two shapes as the standard ai_context: a text, or instructions with synonyms and examples. */
export const AI_CONTEXT_ADDITION: AdditionEntry = {
  name: AI_CONTEXT_PROPERTY,
  since: 2,
  places: ['concept', 'relationship'],
  value: {
    description: `a text, or an object with instructions, synonyms and examples, each text at most ${MAX_CONTEXT_CHARACTERS.toLocaleString('en-US')} characters`,
    // One schema with both type keywords, not oneOf, so a wrong value gives one finding.
    schema: {
      type: ['string', 'object'],
      maxLength: MAX_CONTEXT_CHARACTERS,
      properties: { instructions: contextText, synonyms: contextTexts, examples: contextTexts },
      additionalProperties: false,
    },
  },
  disposition: 'drop',
  owner: 'attributes and governance',
};
