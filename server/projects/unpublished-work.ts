// Keeps people's work that is not on the default branch when what it touches leaves the
// workspace: each copy's unpublished changes become a patch in the trash entry, and the copies
// lose the deleted repository or folder. Also counts that work for a delete confirmation.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './atomic';
import type { Git } from './git';
import type { State } from './state';
import type { CopyRemoval, UnpublishedWork } from './trash';
import type { WorkingCopies } from './working-copies';
import { commitOf, type Worktrees } from './worktrees';

/** What keeping unpublished work needs from the workspace that composes it. */
export type UnpublishedWorkDeps = {
  git: Git;
  gitAvailable: boolean;
  worktrees: Worktrees;
  copies: WorkingCopies;
  state: State;
  repoOf: (slug: string) => string;
  /** A project's folder inside its repository; empty for the repository itself. */
  folderOf: (slug: string) => string;
};

function concatenate(parts: Uint8Array[]) {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

// The files a copy holds that the default branch does not: changed, committed or untracked.
// `folder` limits it to one subproject; empty means the whole repository.
async function unpublishedDiff(deps: UnpublishedWorkDeps, repo: string, copy: string, folder = '') {
  const { git } = deps;
  const branch = await deps.worktrees.defaultBranch(repo);
  const against = await commitOf(git, copy, 'refs/heads/' + branch);
  const within = folder ? [folder] : [];
  const others = ['ls-files', '-z', '--others', '--exclude-standard', '--', ...within];
  const untracked = (await git.run(copy, others, { readOnly: true })).stdout.split('\0');
  return { against, untracked: untracked.filter(Boolean), within };
}

/**
 * A person's work that is not on the default branch, as one binary patch against it, untracked
 * files included. Null when there is none.
 */
async function unpublishedPatch(
  deps: UnpublishedWorkDeps,
  repo: string,
  copy: string,
  folder = '',
) {
  const { git } = deps;
  const { against, untracked, within } = await unpublishedDiff(deps, repo, copy, folder);
  const parts: Uint8Array[] = [];
  if (against) {
    const diff = ['diff', '--binary', against, '--', ...within];
    const tracked = await git.run(copy, diff, { readOnly: true });
    parts.push(tracked.bytes);
  }
  for (const path of untracked) {
    const added = ['diff', '--binary', '--no-index', '--', '/dev/null', path];
    parts.push((await git.run(copy, added, { readOnly: true, allowFailure: true })).bytes);
  }
  const patch = concatenate(parts);
  return patch.length ? patch : null;
}

/** How many files of a copy differ from the default branch. */
async function unpublishedFiles(
  deps: UnpublishedWorkDeps,
  repo: string,
  copy: string,
  folder = '',
) {
  const { against, untracked, within } = await unpublishedDiff(deps, repo, copy, folder);
  const changed = new Set(untracked);
  if (against) {
    const names = ['diff', '--name-only', '-z', against, '--', ...within];
    const diff = await deps.git.run(copy, names, { readOnly: true });
    for (const path of diff.stdout.split('\0').filter(Boolean)) changed.add(path);
  }
  return changed.size;
}

const nameOf = (deps: UnpublishedWorkDeps, key: string) =>
  deps.copies.owners().find(person => person.key === key)?.name ?? key;

/**
 * Before a deletion goes to the trash: keeps each person's unpublished work on what is deleted
 * in the entry folder as a patch, with the count of their drafts there. A whole repository's
 * copies are unlocked; a subproject's folder is noted for removal from each copy. Copies are
 * found from Git itself, so a person missing from the registry keeps their work too.
 */
async function archiveCopies(
  deps: UnpublishedWorkDeps,
  released: Map<string, string[]>,
  removed: CopyRemoval,
  entryDir: string,
) {
  const kept: UnpublishedWork[] = [];
  if (!deps.gitAvailable) return kept;
  const { repo, folder } = removed;
  const projects = new Set(removed.projects);
  const copies = folder
    ? await deps.worktrees.copies(repo)
    : await deps.worktrees.releaseCopies(repo);
  released.set(
    entryDir,
    copies.map(copy => (folder ? join(copy.dir, folder) : copy.dir)),
  );
  for (const copy of copies) {
    const patch = await unpublishedPatch(deps, repo, copy.dir, folder);
    const drafts = deps.state
      .ownerState(copy.key)
      .drafts()
      .filter(draft => projects.has(draft.project)).length;
    if (!patch && !drafts) continue;
    const file = `unpublished/${copy.key}.patch`;
    if (patch) atomicWrite(join(entryDir, file), patch);
    const name = nameOf(deps, copy.key);
    kept.push({ userKey: copy.key, name, patch: patch ? file : '', drafts });
  }
  return kept;
}

// Once the deletion is in the trash, what it took leaves the copies too. A removed repository's
// unlocked records are pruned the next time anyone creates a copy of it; a removed subproject
// shows as deleted files in each copy, as it does in the published checkout.
function removeCopies(released: Map<string, string[]>, entryDir: string) {
  for (const dir of released.get(entryDir) ?? []) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  released.delete(entryDir);
}

/** How much of each person's work on a project is not published yet. */
async function unpublishedWork(deps: UnpublishedWorkDeps, slug: string) {
  if (!deps.gitAvailable) return [];
  const repo = deps.repoOf(slug);
  const folder = deps.folderOf(slug);
  const work = [];
  for (const copy of await deps.worktrees.copies(repo)) {
    const changes = await unpublishedFiles(deps, repo, copy.dir, folder);
    if (changes) work.push({ name: nameOf(deps, copy.key), changes });
  }
  return work;
}

/** Creates the operations that keep and count people's unpublished work. */
export function createUnpublishedWork(deps: UnpublishedWorkDeps) {
  // The copy folders of each deletion on its way to the trash, removed once it is there.
  const released = new Map<string, string[]>();
  return {
    unpublishedWork: (slug: string) => unpublishedWork(deps, slug),
    archiveCopies: (removed: CopyRemoval, entryDir: string) =>
      archiveCopies(deps, released, removed, entryDir),
    removeCopies: (entryDir: string) => removeCopies(released, entryDir),
  };
}
