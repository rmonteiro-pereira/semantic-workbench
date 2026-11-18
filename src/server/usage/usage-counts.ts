// The shape of one stored day of counts and the pure arithmetic over it. No file or clock is used here,
// so the recorder, the store, the migration and the read all share one definition of a count.
import { ADDRESS_MIGRATION_LIMIT } from '../projects/address-migrations';
import type { UsageMeasure } from './usage-counted-operations';

/** Largest value a stored count holds; an increment past it stays at it. */
export const MAX_COUNT = 2 ** 31 - 1;

/** Counts of one item: measure, then operation, then origin, then a whole number of at least 1. */
export type ItemCounts = Record<string, Record<string, Record<string, number>>>;

/**
 * The file kept for one project and one UTC day. It holds no person, client, connection, request,
 * source address, text or snapshot; a test compares these fields with the documentation.
 */
export type CounterDayFile = {
  formatVersion: 1;
  project: string;
  day: string;
  migratedThrough: string | null;
  counts: Record<string, ItemCounts>;
  other?: number;
};

/** One counted request's contribution: an item and the labels it is counted under. */
export type CountKey = { address: string; measure: UsageMeasure; operation: string; origin: string };

/** A day file that holds nothing yet. */
export function emptyDayFile(project: string, day: string): CounterDayFile {
  return { formatVersion: 1, project, day, migratedThrough: null, counts: {} };
}

/** Adds an amount to one cell of an item's counts, saturating at the largest stored value. */
export function addToItem(item: ItemCounts, key: Pick<CountKey, 'measure' | 'operation' | 'origin'>, amount = 1): void {
  const byOperation = (item[key.measure] ??= {});
  const byOrigin = (byOperation[key.operation] ??= {});
  byOrigin[key.origin] = Math.min(MAX_COUNT, (byOrigin[key.origin] ?? 0) + amount);
}

/** Adds an amount for one item of a day, creating its entry. */
export function addCount(counts: Record<string, ItemCounts>, key: CountKey, amount = 1): void {
  addToItem((counts[key.address] ??= {}), key, amount);
}

/** Adds every cell of one item's counts into another's. */
export function mergeItem(into: ItemCounts, from: ItemCounts): void {
  for (const [measure, byOperation] of Object.entries(from)) {
    for (const [operation, byOrigin] of Object.entries(byOperation)) {
      for (const [origin, amount] of Object.entries(byOrigin)) addToItem(into, { measure: measure as UsageMeasure, operation, origin }, amount);
    }
  }
}

/** Adds the counts of a second map into the first, summing items that meet. */
export function mergeCounts(into: Record<string, ItemCounts>, from: Record<string, ItemCounts>): void {
  for (const [address, item] of Object.entries(from)) mergeItem((into[address] ??= {}), item);
}

/** The sum of one measure over an item's counts. */
export function measureTotal(item: ItemCounts, measure: string): number {
  let total = 0;
  for (const byOrigin of Object.values(item[measure] ?? {})) {
    for (const amount of Object.values(byOrigin)) total += amount;
  }
  return total;
}

/** Number of addresses a day file holds. */
export function addressCount(counts: Record<string, ItemCounts>): number {
  return Object.keys(counts).length;
}

/** Most addresses one project keeps for one day; the same size as the address migration history limit. */
export const MAX_ADDRESSES_PER_DAY = ADDRESS_MIGRATION_LIMIT;

/** The sum of every cell of an item's counts. */
export function itemTotal(item: ItemCounts): number {
  let total = 0;
  for (const measure of Object.keys(item)) total += measureTotal(item, measure);
  return total;
}

/**
 * Adds counts to a day. An item that is new once the day holds the most addresses goes to the
 * unaddressed `other` total, so the file stays small and the sum of counts is not lost.
 */
export function mergeIntoDay(file: CounterDayFile, counts: Record<string, ItemCounts>, other = 0, limit = MAX_ADDRESSES_PER_DAY): CounterDayFile {
  const merged: Record<string, ItemCounts> = structuredClone(file.counts);
  let overflow = other;
  for (const [address, item] of Object.entries(counts)) {
    if (!merged[address] && addressCount(merged) >= limit) {
      overflow += itemTotal(item);
      continue;
    }
    mergeItem((merged[address] ??= {}), item);
  }
  const total = Math.min(MAX_COUNT, (file.other ?? 0) + overflow);
  return { ...file, counts: merged, ...(total > 0 ? { other: total } : {}) };
}
