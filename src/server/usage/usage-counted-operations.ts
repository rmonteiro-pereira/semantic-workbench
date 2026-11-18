// Parses the checked-in table of operations whose answers add to usage counters. An operation that is
// not in the table is never counted.
import table from '../../../policies/usage-counted-operations.json';

/** Names the rule that turns an operation's answer into the items it concerns. */
export const ITEM_RULES = ['context-items', 'plan-items', 'metric'] as const;
/** One item rule from {@link ITEM_RULES}. */
export type ItemRule = (typeof ITEM_RULES)[number];

/** What a count measures; a later measure of imported query counts is a separate series. */
export const USAGE_MEASURES = ['workbench-requests'] as const;
/** One measure from {@link USAGE_MEASURES}. */
export type UsageMeasure = (typeof USAGE_MEASURES)[number];

/** One counted operation: its inventory id, how its items are found and what a count means. */
export type CountedOperation = { operation: string; items: ItemRule; measure: UsageMeasure };

/** Refuses a table that names an unknown rule or measure or lists an operation twice. */
export class CountedOperationsError extends Error {}

/** Validates the table into typed entries. */
export function parseCountedOperations(value: unknown): CountedOperation[] {
  const rows = (value as { operations?: unknown } | null)?.operations;
  if (!Array.isArray(rows)) throw new CountedOperationsError('The counted operations table needs an operations list.');
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const { operation, items, measure } = (row ?? {}) as Record<string, unknown>;
    if (typeof operation !== 'string' || !operation) throw new CountedOperationsError(`Row ${index}: operation must be an inventory id.`);
    if (seen.has(operation)) throw new CountedOperationsError(`Row ${index}: ${operation} is listed twice.`);
    seen.add(operation);
    if (!ITEM_RULES.includes(items as ItemRule)) throw new CountedOperationsError(`Row ${index}: unknown item rule.`);
    if (!USAGE_MEASURES.includes(measure as UsageMeasure)) throw new CountedOperationsError(`Row ${index}: unknown measure.`);
    return { operation, items: items as ItemRule, measure: measure as UsageMeasure };
  });
}

/** The checked-in table, validated before anything can use it. */
export const countedOperations = parseCountedOperations(table);

/** Finds the counting rule of an operation, or undefined when the operation is not counted. */
export function countedOperation(operationId: string): CountedOperation | undefined {
  return countedOperations.find(entry => entry.operation === operationId);
}
