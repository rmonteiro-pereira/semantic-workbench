// A staged migration history becomes visible only when its candidate becomes the published commit.
import { join } from 'node:path';
import type { MigrationRecord } from '../../shared/core/address-migration';
import { ADDRESS_MIGRATION_LIMIT, readAddressMigrations } from '../projects/address-migrations';
import { atomicWriteJson, readJsonFile } from '../projects/atomic';
import type { Git } from '../projects/git';
import { assertSlug, type DataLayout } from '../projects/paths';
import type { PublicationCandidate } from '../projects/publication-checks';
import type { PublishedSnapshots } from '../projects/published-snapshot';
import { LOCAL_READER } from '../projects/reader';
import { modelsOfDocuments, usageAddressExists } from './usage-items';

type Version = { commit: string; records: MigrationRecord[] };
type PublicationHistory = { previous: Version; candidate: Version };

/** Locates the history used to rekey usage for published commits only. */
export function publishedMigrationFile(layout: DataLayout, project: string): string {
  return join(layout.state, 'published-address-migrations', assertSlug(project) + '.json');
}

/** Returns the migrations of the published side, selected by its pinned commit. */
export function publishedMigrationRecords(layout: DataLayout, project: string, commit: string | null | undefined): MigrationRecord[] | null {
  if (!commit) return [];
  try {
    const history = readJsonFile<PublicationHistory>(publishedMigrationFile(layout, project));
    if (!history) return [];
    for (const version of [history.candidate, history.previous]) {
      if (!version || !Array.isArray(version.records) || version.records.length > ADDRESS_MIGRATION_LIMIT) return null;
      if (version.commit === commit) return version.records;
    }
    return null;
  } catch {
    return null;
  }
}

type PublicationInputs = { layout: DataLayout; git: Git; snapshots: PublishedSnapshots };

async function stagedHistories(deps: PublicationInputs, move: PublicationCandidate & { previous: string }) {
  const result = new Map<string, { records: MigrationRecord[]; pending: MigrationRecord[] }>();
  for (const project of deps.snapshots.projectsOf(move.repo)) {
    const records = publishedMigrationRecords(deps.layout, project, move.previous);
    if (!records) throw new Error('Published address migration history is unavailable.');
    const known = new Set(records.map(record => record.id));
    const pending = readAddressMigrations(deps.layout, project, LOCAL_READER).filter(record => !known.has(record.id));
    if (records.length || pending.length) result.set(project, { records, pending });
  }
  return result;
}

/** Stages records proven by both sides of the candidate, before a publication can move its ref. */
export async function stagePublishedMigrations(deps: PublicationInputs, move: PublicationCandidate): Promise<void> {
  if (!move.previous || move.previous === move.next) return;
  const { layout, git, snapshots } = deps;
  const histories = await stagedHistories(deps, { ...move, previous: move.previous });
  if (!histories.size) return;
  const hasNewRecords = [...histories.values()].some(history => history.pending.length);
  const before = hasNewRecords ? modelsOfDocuments(await snapshots.transitionDocuments(move.repo, move.previous)) : new Map();
  const after = hasNewRecords ? modelsOfDocuments(await snapshots.transitionDocuments(move.repo, move.next)) : new Map();
  const directory = join(layout.projects, move.repo);
  const ancestor = new Map<string, boolean>();
  for (const [project, { records, pending }] of histories) {
    const verified = [];
    for (const record of pending) {
      if (!usageAddressExists(before, record.from) || usageAddressExists(after, record.from) || (record.to && !usageAddressExists(after, record.to))) continue;
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.commit)) continue;
      if (!ancestor.has(record.commit)) ancestor.set(record.commit, await git.isAncestor(directory, record.commit, move.next));
      if (ancestor.get(record.commit)) verified.push(record);
    }
    if (!records.length && !verified.length) continue;
    atomicWriteJson(publishedMigrationFile(layout, project), {
      previous: { commit: move.previous, records },
      candidate: { commit: move.next, records: [...records, ...verified] },
    } satisfies PublicationHistory);
  }
}
