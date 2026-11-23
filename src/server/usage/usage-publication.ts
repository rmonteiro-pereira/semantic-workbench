// The address history that usage counts follow: the history file committed in the published commit.
// It is the same history published address resolution reads, so counts follow exactly the renames
// and deletions that were published, and a private or unpublished declaration moves nothing.
import { spawnSync } from 'node:child_process';
import type { MigrationRecord } from '../../shared/core/address-migration';
import { ADDRESS_HISTORY_FILE, ADDRESS_MIGRATION_LIMIT, parseAddressHistory } from '../projects/address-migrations';
import { gitEnv } from '../projects/git';
import { projectPrefix, repoDir, type DataLayout } from '../projects/paths';

/** The largest history file read, the same bound the committed history reader applies. A worst-case ceiling for the output buffer, not an expected size. */
const MAX_HISTORY_BYTES = ADDRESS_MIGRATION_LIMIT * 9_000;
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
/** The last few published commits read for each project, since publication moves rarely. */
const cached = new WeakMap<DataLayout, Map<string, { commit: string; records: MigrationRecord[] }[]>>();
const CACHED_COMMITS = 3;

// The recorder flushes synchronously, so the file is read with one bounded synchronous Git call.
function committedHistory(layout: DataLayout, project: string, commit: string): MigrationRecord[] {
  const path = projectPrefix(layout, project) + ADDRESS_HISTORY_FILE;
  const result = spawnSync('git', ['--no-replace-objects', 'cat-file', 'blob', `${commit}:${path}`], {
    cwd: repoDir(layout, project),
    env: { ...gitEnv(), GIT_NO_LAZY_FETCH: '1' },
    timeout: 5000,
    maxBuffer: MAX_HISTORY_BYTES,
  });
  if (result.error) throw new Error('Published address history could not be read.');
  // A published commit without the file has no published renames.
  if (result.status !== 0) {
    const exists = spawnSync('git', ['cat-file', '-e', commit], { cwd: repoDir(layout, project), env: gitEnv(), timeout: 5000 });
    if (exists.status === 0) return [];
    throw new Error('Published address history could not be read.');
  }
  return parseAddressHistory(result.stdout.toString('utf8'));
}

/** Returns the ordered address transitions published in the pinned commit, or null when they cannot be read. */
export function publishedMigrationRecords(layout: DataLayout, project: string, commit: string | null | undefined): MigrationRecord[] | null {
  if (!commit) return [];
  if (!objectId.test(commit)) return null;
  const projects = cached.get(layout) ?? new Map<string, { commit: string; records: MigrationRecord[] }[]>();
  cached.set(layout, projects);
  const recent = projects.get(project) ?? [];
  const known = recent.find(entry => entry.commit === commit);
  if (known) return known.records;
  try {
    const records = committedHistory(layout, project, commit);
    projects.set(project, [{ commit, records }, ...recent].slice(0, CACHED_COMMITS));
    return records;
  } catch {
    return null;
  }
}
