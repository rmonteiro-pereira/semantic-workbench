// Compares parsed item fields, so serialization comments and object key order are irrelevant.
import { boundValue } from './bounds';
import type { FieldChange } from './item-change';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function valueText(value: unknown): string {
  if (value === undefined) return '(absent)';
  if (typeof value === 'string') return value;
  return JSON.stringify(canonical(value));
}

/** Names changed top-level item fields and bounds their displayed values. */
export function fieldChanges(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const fields: FieldChange[] = [];
  for (const field of keys) {
    if (JSON.stringify(canonical(before[field])) === JSON.stringify(canonical(after[field]))) continue;
    fields.push({ field, before: boundValue(valueText(before[field])), after: boundValue(valueText(after[field])) });
  }
  return fields;
}
