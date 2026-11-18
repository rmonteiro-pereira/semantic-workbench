import { addressMigrationFile, loadAddressJournal, type JournalMigration } from './address-migrations';
import { atomicWriteJson, sha256 } from './atomic';
import type { Git } from './git';
import { projectPrefix, type DataLayout } from './paths';

type CommitTransition = { directory: string; branch: string; previous: string | null; commit: string };

function matchesSave(record: JournalMigration, transition: CommitTransition) {
  return !record.committedAt && record.saved?.directory === transition.directory && record.saved.branch === transition.branch && record.commit === (transition.previous ?? '');
}

/** Finds a contiguous sequence of saved changes between the two exact blob versions. */
export function committedFileEdits(path: string, before: Uint8Array | null, after: Uint8Array | null, candidates: readonly JournalMigration[]) {
  if (!after) return [];
  const base = before ? sha256(before) : null;
  let cursor: string | null = sha256(after);
  if (cursor === base) return [];
  const matched = new Set<string>();
  const seen = new Set<string>();
  for (const record of [...candidates].reverse()) {
    const saved = record.saved;
    const edit = saved?.files.find(file => file.path === path);
    if (!saved || !edit || seen.has(saved.id)) continue;
    seen.add(saved.id);
    if (cursor !== edit.after) continue;
    matched.add(saved.id);
    cursor = edit.before;
    if (cursor === base) return candidates.filter(candidate => candidate.saved?.files.some(file => file.path === path) && matched.has(candidate.saved.id));
  }
  return [];
}

/** Keeps records only when every file of their save matches its committed transition. */
export function completeCommittedEdits(candidates: readonly JournalMigration[], matches: readonly JournalMigration[][]) {
  const accepted = new Map<string, number>();
  for (const records of matches) for (const record of records) accepted.set(record.id, (accepted.get(record.id) ?? 0) + 1);
  return candidates.filter(record => record.saved?.files.length && accepted.get(record.id) === record.saved.files.length);
}

async function matchingFileEdits(git: Git, transition: CommitTransition, path: string, prefix: string, candidates: readonly JournalMigration[]) {
  const { directory, previous, commit } = transition;
  const [before, after] = await Promise.all([previous ? git.blob(directory, previous, prefix + path) : null, git.blob(directory, commit, prefix + path)]);
  return committedFileEdits(path, before, after, candidates);
}

/** Binds declarations only when their saved byte sequence is present in this working copy's commit. */
export async function bindAddressMigrations(layout: DataLayout, project: string, git: Git, transition: CommitTransition): Promise<void> {
  const candidates = loadAddressJournal(layout, project).filter(record => matchesSave(record, transition));
  if (!candidates.length) return;
  const paths = [...new Set(candidates.flatMap(record => record.saved!.files.map(file => file.path)))];
  const prefix = projectPrefix(layout, project);
  const matches = await Promise.all(paths.map(path => matchingFileEdits(git, transition, path, prefix, candidates)));
  const bound = completeCommittedEdits(candidates, matches);
  if (!bound.length) return;
  const ids = new Set(bound.map(record => record.id));
  const records = loadAddressJournal(layout, project).map(record => (ids.has(record.id) && !record.committedAt ? { ...record, committedAt: transition.commit } : record));
  atomicWriteJson(addressMigrationFile(layout, project), { formatVersion: 1, records });
}
