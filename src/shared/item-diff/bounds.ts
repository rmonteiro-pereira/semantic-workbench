// Bounds response bytes and displayed values without losing exact total change counts.
import type { ItemDiff } from './item-change';

/** Response limits independent of document and snapshot read limits. */
export const DIFF_LIMITS = { items: 2_000, bytes: 2_000_000, valueCharacters: 500 } as const;
/** Limits accepted by the pure response bounding function. */
export type DiffLimits = { items: number; bytes: number; valueCharacters: number };
const omittedValue = '… (value shortened)';

/** Shortens a displayed value while keeping its marker inside the character limit. */
export function boundValue(value: string, limit: number = DIFF_LIMITS.valueCharacters): string {
  const characters = Array.from(value);
  if (characters.length <= limit) return value;
  if (limit < omittedValue.length) throw new RangeError('Value limit must fit the shortening label.');
  return characters.slice(0, limit - omittedValue.length).join('') + omittedValue;
}

/** Cuts a response in deterministic prefix order and reports the exact number omitted. */
export function boundDiff(diff: ItemDiff, limits: DiffLimits = DIFF_LIMITS): ItemDiff {
  const result: ItemDiff = { ...diff, changes: [], omitted: diff.omitted + diff.changes.length };
  const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (size(result) > limits.bytes) throw new RangeError('Comparison metadata exceeds the response byte limit.');
  let changeBytes = 0;
  const envelopeBytes = size(result);
  for (const change of diff.changes) {
    if (result.changes.length >= limits.items) break;
    const bounded = {
      ...change,
      fields: change.fields.map(field => ({ ...field, before: boundValue(field.before, limits.valueCharacters), after: boundValue(field.after, limits.valueCharacters) })),
    };
    const bytes = size(bounded) + (result.changes.length ? 1 : 0);
    // The initial omitted count is largest, so this envelope estimate is conservative.
    if (envelopeBytes + changeBytes + bytes > limits.bytes) break;
    result.changes.push(bounded);
    result.omitted--;
    changeBytes += bytes;
  }
  return result;
}
