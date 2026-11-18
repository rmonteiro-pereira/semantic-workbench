// The notes addition: free text for authors that never leaves the authoring format.
import { tesseraPropertyName } from '../format';
import type { AdditionEntry } from '../registry';

/** The longest note, counted in characters. */
export const MAX_NOTE_CHARACTERS = 10_000;

/** Notes are for the people who edit the ontology; the compiler drops them and reports the loss. */
export const NOTES_ADDITION: AdditionEntry = {
  name: tesseraPropertyName('notes'),
  since: 1,
  places: ['root', 'concept', 'relationship'],
  value: {
    description: `a non-empty string of at most ${MAX_NOTE_CHARACTERS.toLocaleString('en-US')} characters`,
    schema: { type: 'string', minLength: 1, maxLength: MAX_NOTE_CHARACTERS },
  },
  disposition: 'drop',
  owner: 'the Tessera format',
};
