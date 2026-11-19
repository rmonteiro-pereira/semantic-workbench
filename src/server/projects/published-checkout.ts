// Brings the published checkout of a repository back to a clean state at start-up in server mode.
// Files deleted in local mode were moved to the trash without a commit, so the checkout reports
// them as deleted, and a publish refuses to move files over a checkout that has changes.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Git } from './git';

/** The published checkout has changes other than deletions recorded in the trash. */
export class PublishedCheckoutChangedError extends Error {
  constructor(
    public repo: string,
    public paths: string[],
  ) {
    super(`The published checkout of ${repo} has changes that are not deletions kept in the trash: ${paths.join(', ')}. Commit or discard them in data/projects/${repo} and start again.`);
    this.name = 'PublishedCheckoutChangedError';
  }
}

const isDeletion = (code: string) => code === 'D' || code === '.';

/**
 * Restores from HEAD the files that the checkout reports deleted and that a copy-less trash entry
 * explains, and returns them. Any other change is refused with its paths. A clean checkout, as
 * after a first run, changes nothing, so running it again is harmless.
 */
export async function restoreTrashedDeletions(options: {
  git: Git;
  dir: string;
  repo: string;
  /** Repository-relative paths of files that copy-less trash entries hold. */
  trashed: Set<string>;
  /** Bookkeeping whose exact change the restored deletion records explain. */
  historyChanges?: (restored: readonly string[]) => Promise<readonly string[]>;
  log: (line: string) => void;
}): Promise<string[]> {
  const { git, dir, repo, trashed } = options;
  const { entries } = await git.status(dir);
  const explained = entries
    .filter(entry => {
      const deletion = !entry.untracked && !entry.conflicted && isDeletion(entry.index) && isDeletion(entry.worktree) && (entry.index === 'D' || entry.worktree === 'D');
      return deletion && trashed.has(entry.path);
    })
    .map(entry => entry.path);
  const explainedPaths = new Set(explained);
  const history = new Set(explained.length ? await options.historyChanges?.(explained) : []);
  const unexplained = entries.filter(entry => !explainedPaths.has(entry.path) && (!history.has(entry.path) || (entry.index !== '.' && !entry.untracked))).map(entry => entry.path);
  if (unexplained.length) throw new PublishedCheckoutChangedError(repo, unexplained);
  if (!explained.length) return [];
  const restorePaths = [...explained];
  // Remove the merge rule first so a retry can still identify the deletion from its records.
  const bookkeeping = entries.filter(candidate => history.has(candidate.path)).sort((left, right) => left.path.localeCompare(right.path));
  for (const entry of bookkeeping) {
    if (entry.untracked) rmSync(join(dir, entry.path));
    else restorePaths.push(entry.path);
  }
  await git.run(dir, ['restore', '--staged', '--worktree', '--', ...restorePaths]);
  options.log(JSON.stringify({ type: 'published-checkout-restored', repo, paths: explained }));
  return explained;
}
