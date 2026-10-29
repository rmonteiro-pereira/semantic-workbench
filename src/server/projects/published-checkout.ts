// Brings the published checkout of a repository back to a clean state at start-up in server mode.
// Files deleted in local mode were moved to the trash without a commit, so the checkout reports
// them as deleted, and a publish refuses to move files over a checkout that has changes.
import type { Git } from './git';

/** The published checkout has changes other than deletions recorded in the trash. */
export class PublishedCheckoutChangedError extends Error {
  constructor(
    public repo: string,
    public paths: string[],
  ) {
    super(`The published checkout of ${repo} has changes that are not deletions kept in the trash: ` + `${paths.join(', ')}. Commit or discard them in data/projects/${repo} and start again.`);
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
  log: (line: string) => void;
}): Promise<string[]> {
  const { git, dir, repo, trashed } = options;
  const { entries } = await git.status(dir);
  const explained: string[] = [];
  const unexplained: string[] = [];
  for (const entry of entries) {
    const deletion = !entry.untracked && !entry.conflicted && isDeletion(entry.index) && isDeletion(entry.worktree) && (entry.index === 'D' || entry.worktree === 'D');
    if (deletion && trashed.has(entry.path)) explained.push(entry.path);
    else unexplained.push(entry.path);
  }
  if (unexplained.length) throw new PublishedCheckoutChangedError(repo, unexplained);
  if (!explained.length) return [];
  await git.run(dir, ['restore', '--staged', '--worktree', '--', ...explained]);
  options.log(JSON.stringify({ type: 'published-checkout-restored', repo, paths: explained }));
  return explained;
}
