// Removes days of counts older than the retention period and brings the days that stay to current
// addresses. It runs at start and once a day while the server runs; reads never do this work.
import type { MigrationRecord } from '../../shared/core/address-migration';
import { expiredDays } from './usage-retention';
import { hasPublishedDayHistory, rekey } from './usage-migration';
import type { UsageStore } from './usage-store';

/** What compaction needs to know about the instance. */
export type CompactionInput = {
  store: UsageStore;
  /** UTC day today, `yyyy-mm-dd`. */
  today: string;
  retentionDays: number;
  /** Address migration records of a project in order, or null when that history cannot be read. */
  migrationRecords: (project: string) => MigrationRecord[] | null;
};

/** Deletes expired days and rewrites retained days whose addresses are behind; returns what it did. */
export function compactUsage(input: CompactionInput): { deleted: number; rewritten: number } {
  const { store, today, retentionDays } = input;
  let deleted = 0;
  let rewritten = 0;
  for (const project of store.listProjects()) {
    const days = store.listDays(project);
    for (const day of expiredDays(days, today, retentionDays)) {
      store.deleteDay(project, day);
      deleted += 1;
    }
    const records = input.migrationRecords(project);
    if (records === null) continue;
    for (const day of days.filter(candidate => !expiredDays([candidate], today, retentionDays).length)) {
      const read = store.readDay(project, day);
      if (read.status !== 'ok' || !hasPublishedDayHistory(read.file, records)) continue;
      const current = rekey(read.file, records);
      if (current === read.file) continue;
      store.writeDay(current);
      rewritten += 1;
    }
  }
  return { deleted, rewritten };
}
