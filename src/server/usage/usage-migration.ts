// Moves stored counts to the addresses their items have now, using the address migration records that
// item addresses already keep. The result is the same however often it is applied.
import { parseAddress, formatAddress } from '../../shared/core/item-address';
import { deletesAddress, migrateAddress, type MigrationRecord } from '../../shared/core/address-migration';
import { mergeItem, type CounterDayFile, type ItemCounts } from './usage-counts';

/** Whether the published history proves the marker already applied to a day. */
export function hasPublishedDayHistory(file: CounterDayFile, records: readonly MigrationRecord[]): boolean {
  return file.migratedThrough === null || records.some(record => record.id === file.migratedThrough);
}

/** The records a file has not seen yet: those after the one it last applied. */
export function recordsAfter(records: readonly MigrationRecord[], migratedThrough: string | null): readonly MigrationRecord[] {
  if (migratedThrough === null) return records;
  const index = records.findIndex(record => record.id === migratedThrough);
  return index < 0 ? records : records.slice(index + 1);
}

/** Follows one address through the records in order; null means an item the records delete. */
function currentAddress(text: string, records: readonly MigrationRecord[]): string | null {
  const parsed = parseAddress(text);
  if (!parsed.ok) return text;
  let address = parsed.address;
  for (const record of records) {
    if (deletesAddress(record, address)) return null;
    address = migrateAddress(address, [record], false);
  }
  return formatAddress(address);
}

/**
 * Applies the records a day file has not seen, dropping counts of deleted items and summing counts
 * of items that now share an address. The file's marker moves to the last record.
 */
export function rekey(file: CounterDayFile, records: readonly MigrationRecord[]): CounterDayFile {
  const pending = recordsAfter(records, file.migratedThrough);
  if (!pending.length) return file;
  const counts: Record<string, ItemCounts> = {};
  for (const [address, item] of Object.entries(file.counts)) {
    const target = currentAddress(address, pending);
    if (target !== null) mergeItem((counts[target] ??= {}), item);
  }
  return { ...file, counts, migratedThrough: pending.at(-1)!.id };
}
