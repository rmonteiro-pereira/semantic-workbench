// Prints JSON the same way every time, so equal data always gives equal bytes and equal digests.

/** Compares two strings by UTF-16 code unit, so the order never depends on the machine's locale. */
export function compareText(first: string, second: string): number {
  if (first < second) return -1;
  return first > second ? 1 : 0;
}

/** Returns a copy with every object's keys in sorted order, at every depth. Arrays keep their order. */
export function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([first], [second]) => compareText(first, second));
  return Object.fromEntries(entries.map(([key, child]) => [key, withSortedKeys(child)]));
}

/** Prints sorted keys, two-space indent, LF and one final newline. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(withSortedKeys(value), null, 2) + '\n';
}
