// The agent context an author edits as three separate fields, and the entry an agent receives from it.
import { MAX_CONTEXT_CHARACTERS } from '../tessera/additions/ai-context';

/** The three fields of the form. Synonyms and examples are one per line. */
export type ContextFields = { instructions: string; synonyms: string; examples: string };

function lines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/** Reads a stored value, which is a text or an object, into the three fields. A plain text becomes the instructions. */
export function fieldsOfContext(value: unknown): ContextFields {
  if (typeof value === 'string') return { instructions: value, synonyms: '', examples: '' };
  const entry = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const listOf = (field: unknown) => (Array.isArray(field) ? field.filter(item => typeof item === 'string').join('\n') : '');
  return { instructions: typeof entry.instructions === 'string' ? entry.instructions : '', synonyms: listOf(entry.synonyms), examples: listOf(entry.examples) };
}

/** Builds the stored value from the fields: a text when only instructions are given, an object otherwise, and nothing when all are empty. */
export function contextOfFields(fields: ContextFields): string | Record<string, unknown> | undefined {
  const synonyms = lines(fields.synonyms);
  const examples = lines(fields.examples);
  const instructions = fields.instructions.trim();
  if (!synonyms.length && !examples.length) return instructions || undefined;
  return { ...(instructions ? { instructions } : {}), ...(synonyms.length ? { synonyms } : {}), ...(examples.length ? { examples } : {}) };
}

/** The problem with the fields, or nothing: every text is at most as long as the format allows. */
export function contextProblem(fields: ContextFields): string | null {
  const texts = [fields.instructions, ...lines(fields.synonyms), ...lines(fields.examples)];
  const tooLong = texts.find(text => text.length > MAX_CONTEXT_CHARACTERS);
  return tooLong ? `Each text can have at most ${MAX_CONTEXT_CHARACTERS.toLocaleString('en-US')} characters, and one has ${tooLong.length.toLocaleString('en-US')}.` : null;
}
