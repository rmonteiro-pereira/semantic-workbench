// Decides what a flush writes: the day already on disk, moved to current addresses, plus the counts
// the memory holds. The decision is a pure function, so a failing disk or a damaged file is a plain
// input rather than a special case in the recorder.
import type { MigrationRecord } from '../../shared/core/address-migration';
import { emptyDayFile, mergeIntoDay, type CounterDayFile } from './usage-counts';
import { hasPublishedDayHistory, rekey } from './usage-migration';
import type { DayRead } from './usage-store';

/** What a flush of one project and day should do. */
export type FlushDecision = { action: 'write'; file: CounterDayFile } | { action: 'keep-memory'; reason: 'damaged-file' | 'migrations-unavailable' };

/**
 * Moves disk and memory from their recorded migration positions to the newest published addresses
 * before merging.
 */
export function decideFlush(existing: DayRead, memory: CounterDayFile, records: readonly MigrationRecord[] | null): FlushDecision {
  if (existing.status === 'damaged') return { action: 'keep-memory', reason: 'damaged-file' };
  if (records === null || !hasPublishedDayHistory(memory, records) || (existing.status === 'ok' && !hasPublishedDayHistory(existing.file, records))) {
    return { action: 'keep-memory', reason: 'migrations-unavailable' };
  }
  const base = existing.status === 'ok' ? rekey(existing.file, records) : emptyDayFile(memory.project, memory.day);
  const latest = records.at(-1)?.id ?? base.migratedThrough;
  const rekeyed = rekey(memory, records);
  const merged = mergeIntoDay(base, rekeyed.counts, rekeyed.other ?? 0);
  return { action: 'write', file: { ...merged, migratedThrough: latest } };
}
