import type { MigrationRecord } from '../../shared/core/address-migration';
import type { DataLayout } from '../projects/paths';

/** Returns the migrations whose records belong to the pinned published side. */
export function publishedMigrationRecords(_layout: DataLayout, _project: string, _commit: string | null | undefined): MigrationRecord[] | null {
  // The authoring journal records the commit before a save, which cannot prove the declaration was published.
  return [];
}
