// Gives each person in server mode their own Git working copy of a repository: a locked
// `git worktree` on a personal branch. The base checkout under projects/ stays detached at the
// default branch and holds the published state; only publishing moves it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BranchInUseError, NotFastForwardError } from './errors';
import { authorship, commitOf, GitError, isBranchName, symbolicBranch, type CommitAuthor, type Git } from './git';
import { USER_KEY, type DataLayout } from './paths';
import { checkOutFolders, sparseFolders } from './sparse-folder';

/** One entry of `git worktree list --porcelain`. */
export type WorktreeEntry = {
  path: string;
  head: string | null;
  branch: string | null;
  locked: boolean;
  /** Its folder is gone; Git may prune the record. */
  prunable: boolean;
};

/** A person who may own working copies: their folder key, branch handle and display name. */
export type CopyOwner = { key: string; handle: string; name: string };

/** What one branch is checked out by: another person's copy, or the published state. */
export type BranchHolder = { key: string | null; name: string };

/** The name the published state is shown under when a branch is held by the base checkout. */
export const PUBLISHED_HOLDER = 'the published state';

/** Where a repository's default branch name is remembered once the base checkout is detached. */
export const DEFAULT_BRANCH_KEY = 'workbench.defaultBranch';

/** The folder of branch names that belong to people's working copies. */
export const PERSONAL_BRANCH_PREFIX = 'work/';

/** The personal branch every working copy starts on. */
export const personalBranch = (handle: string) => PERSONAL_BRANCH_PREFIX + handle;

const foldBranch = (branch: string) => branch.normalize('NFC').toLowerCase();

/** Whether two branch names are one name on a volume that ignores letter case. */
export const sameBranchName = (left: string, right: string) => foldBranch(left) === foldBranch(right);

/** Whether a branch name is some person's personal branch, in whatever letter case. */
export const isPersonalBranch = (branch: string) => foldBranch(branch).startsWith(PERSONAL_BRANCH_PREFIX);

/**
 * Whether a branch is shown to someone whose own personal branch is `own`, or to someone who has
 * none. A remote branch is judged by the name it has on the remote, `origin/work/x` as `work/x`.
 */
export function branchShownTo(branch: string, own: string | null, remote = false) {
  const name = remote ? branch.slice(branch.indexOf('/') + 1) : branch;
  return !isPersonalBranch(name) || (own !== null && sameBranchName(name, own));
}

/** The existing branch a new spelling of a name would be taken for, or undefined. */
export function branchSpelledDifferently(name: string, existing: string[]) {
  if (existing.includes(name)) return undefined;
  return existing.find(other => sameBranchName(other, name));
}

/** Parses `git worktree list --porcelain` into its entries. */
export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), head: null, branch: null, locked: false, prunable: false };
      entries.push(current);
    } else if (current && line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (current && line.startsWith('branch refs/heads/')) current.branch = line.slice(18);
    else if (current && (line === 'locked' || line.startsWith('locked '))) current.locked = true;
    else if (current && (line === 'prunable' || line.startsWith('prunable '))) current.prunable = true;
  }
  return entries;
}

/**
 * Which branches are checked out, and by whom. A copy's folder name is its owner's key; the
 * base checkout holds the default branch for the published state even while it is detached.
 */
export function branchHolders(entries: WorktreeEntry[], copiesRoot: string, defaultBranch: string, people: CopyOwner[]): Map<string, BranchHolder> {
  const holders = new Map<string, BranchHolder>();
  holders.set(defaultBranch, { key: null, name: PUBLISHED_HOLDER });
  for (const copy of copiesOf(entries, copiesRoot)) {
    if (!copy.branch) continue;
    const name = people.find(person => person.key === copy.key)?.name ?? copy.key;
    holders.set(copy.branch, { key: copy.key, name });
  }
  return holders;
}

/** The people's working copies among a repository's worktrees; a pruned-away copy holds nothing. */
export function copiesOf(entries: WorktreeEntry[], copiesRoot: string) {
  return entries.flatMap(entry => {
    if (entry.prunable || !entry.path.startsWith(copiesRoot + '/')) return [];
    const key = entry.path.slice(copiesRoot.length + 1).split('/')[0];
    return USER_KEY.test(key) ? [{ key, dir: entry.path, branch: entry.branch }] : [];
  });
}

/** What the working copy operations need: the data layout, Git, and the people registry. */
export type WorktreeContext = {
  layout: DataLayout;
  git: Git;
  people: () => CopyOwner[];
  /**
   * Each repository's worktree list, kept until a copy is created, removed or switches branch,
   * or the default branch moves, so a project listing does not ask Git again for every project.
   */
  listings?: Map<string, Promise<WorktreeEntry[]>>;
};

/** Refuses a publish while the published checkout has changes, which a publish would overwrite. */
export class BaseChangedError extends GitError {
  constructor(repo: string) {
    super(`The published checkout of ${repo} has changes; nothing was published.`);
  }
}

const baseDir = ({ layout }: WorktreeContext, repo: string) => join(layout.projects, repo);
const copyDir = ({ layout }: WorktreeContext, key: string, repo: string) => join(layout.worktrees, key, repo);
const copyExists = (context: WorktreeContext, key: string, repo: string) => existsSync(join(copyDir(context, key, repo), '.git'));

/**
 * The repository's default branch: remembered once the base was detached, otherwise the branch
 * the base has checked out, otherwise the remote's default branch.
 */
async function defaultBranch(context: WorktreeContext, repo: string) {
  const { git } = context;
  const dir = baseDir(context, repo);
  const remembered = await git.configValue(dir, DEFAULT_BRANCH_KEY, 'local');
  if (remembered) return remembered;
  const checkedOut = await symbolicBranch(git, dir);
  if (checkedOut) return checkedOut;
  const remote = await git.run(dir, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], {
    readOnly: true,
    allowFailure: true,
  });
  const named = remote.code === 0 ? remote.stdout.trim().replace(/^origin\//, '') : '';
  // The remote chooses this name, so it must be a plain branch name before Git sees it again.
  if (named && (await isBranchName(git, dir, named))) return named;
  throw new GitError(`Cannot tell the default branch of ${repo}: its checkout is detached.`);
}

// The base checkout must not hold the default branch, or a publish would leave its files stale;
// detached at the same commit, its files stay exactly as they are.
async function detachBase(context: WorktreeContext, repo: string) {
  const { git } = context;
  const dir = baseDir(context, repo);
  const branch = await symbolicBranch(git, dir);
  if (!branch) return;
  await git.run(dir, ['config', '--local', DEFAULT_BRANCH_KEY, branch]);
  if (await commitOf(git, dir, 'HEAD')) await git.run(dir, ['checkout', '-q', '--detach']);
}

/**
 * Puts the published checkout back at the tip of its default branch after a stop between moving
 * the branch and moving the files. Nobody edits it, so its files are replaced as they are.
 */
async function repairBase(context: WorktreeContext, repo: string) {
  const { git } = context;
  const dir = baseDir(context, repo);
  const remembered = await git.configValue(dir, DEFAULT_BRANCH_KEY, 'local');
  if (!remembered) return;
  const tip = await commitOf(git, dir, 'refs/heads/' + remembered);
  if (!tip) return;
  const attached = await symbolicBranch(git, dir);
  if (!attached && (await commitOf(git, dir, 'HEAD')) === tip) return;
  await git.run(dir, ['checkout', '-q', '--force', '--detach', 'refs/heads/' + remembered]);
}

async function listed(context: WorktreeContext, repo: string) {
  const cached = context.listings?.get(repo);
  if (cached) return cached;
  const list = ['worktree', 'list', '--porcelain'];
  const listing = context.git.run(baseDir(context, repo), list, { readOnly: true }).then(result => parseWorktreeList(result.stdout));
  context.listings?.set(repo, listing);
  // A failed listing is asked again next time.
  listing.catch(() => context.listings?.delete(repo));
  return listing;
}

async function holders(context: WorktreeContext, repo: string, published?: string) {
  return branchHolders(await listed(context, repo), context.layout.worktrees, published ?? (await defaultBranch(context, repo)), context.people());
}

/** Refuses a branch that another copy, or the published state, has checked out. */
async function assertFree(context: WorktreeContext, repo: string, key: string, branch: string) {
  const holder = (await holders(context, repo)).get(branch);
  if (holder && holder.key !== key) throw new BranchInUseError(branch, holder.name);
}

/** Creates the person's copy on first use, on `work/<handle>` from the default branch. */
async function ensure(context: WorktreeContext, repo: string, owner: CopyOwner) {
  const { git } = context;
  const dir = copyDir(context, owner.key, repo);
  if (copyExists(context, owner.key, repo)) return { dir, created: false };
  await detachBase(context, repo);
  const base = baseDir(context, repo);
  // A copy removed with its project leaves locked records behind; they would hold its branch.
  await git.run(base, ['worktree', 'unlock', dir], { allowFailure: true });
  await git.run(base, ['worktree', 'prune']);
  const branch = personalBranch(owner.handle);
  const start = await defaultBranch(context, repo);
  await assertFree(context, repo, owner.key, branch);
  // A repository checked out only in a folder gives every copy the same folder, set in the copy's
  // own configuration, and the files arrive after that, so nothing else is ever written to disk.
  const folders = await sparseFolders(git, base);
  const held = folders.length ? ['--no-checkout'] : [];
  if (await commitOf(git, base, 'refs/heads/' + branch)) {
    await git.run(base, ['worktree', 'add', '-q', ...held, dir, branch]);
  } else if (await commitOf(git, base, 'refs/heads/' + start)) {
    await git.run(base, ['worktree', 'add', '-q', ...held, '-b', branch, dir, start]);
  } else {
    // A repository without any commit has no default branch to start from yet.
    await git.run(base, ['worktree', 'add', '-q', '--orphan', '-b', branch, dir]);
  }
  if (folders.length) await checkOutFolders(git, dir, folders);
  await git.run(base, ['worktree', 'lock', '--reason', 'Semantic Workbench working copy', dir]);
  context.listings?.delete(repo);
  return { dir, created: true };
}

/**
 * Moves the default branch from `previous` to `next` and the published checkout with it. A
 * changed published checkout, a move that is not a fast-forward, or someone else moving the
 * branch first is refused, and nothing changes. `check` judges the exact commits before the move.
 */
async function moveDefault(context: WorktreeContext, repo: string, move: { branch: string; previous: string | null; next: string }, check: (previous: string | null, next: string) => Promise<void>) {
  const { git } = context;
  const { branch, previous, next } = move;
  const base = baseDir(context, repo);
  // Moving the published files must not fail after the branch moved, so a changed base, new
  // files included, is refused before anything changes.
  const changed = await git.run(base, ['status', '--porcelain'], { readOnly: true });
  if (changed.stdout.trim()) throw new BaseChangedError(repo);
  if (previous && previous !== next) {
    const ancestor = await git.run(base, ['merge-base', '--is-ancestor', previous, next], {
      readOnly: true,
      allowFailure: true,
    });
    if (ancestor.code !== 0) throw new NotFastForwardError(branch);
  }
  // The commits judged are the ones published: the swap below fails if the branch moved.
  await check(previous, next);
  if (previous !== next) {
    // The old value makes the update fail when someone else published meanwhile.
    const swap = ['update-ref', 'refs/heads/' + branch, next, previous ?? ''];
    const swapped = await git.run(base, swap, { allowFailure: true });
    if (swapped.code !== 0) throw new NotFastForwardError(branch);
  }
  try {
    await git.run(base, ['checkout', '-q', '--force', '--detach', 'refs/heads/' + branch]);
  } catch (error) {
    // The branch already moved; the published files follow it now or at the next start.
    await repairBase(context, repo).catch(() => {});
    throw error;
  }
  context.listings?.delete(repo);
  return { published: branch, commit: next, previous };
}

/**
 * Fast-forwards the default branch to the copy's HEAD with a compare-and-swap, then moves the
 * published state to it. A copy that does not contain the current tip is refused.
 */
async function publish(context: WorktreeContext, repo: string, key: string, check: (previous: string | null, next: string) => Promise<void>) {
  const { git } = context;
  const branch = await defaultBranch(context, repo);
  const next = await commitOf(git, copyDir(context, key, repo), 'HEAD');
  if (!next) throw new GitError('Commit your changes before publishing.');
  const previous = await commitOf(git, baseDir(context, repo), 'refs/heads/' + branch);
  return moveDefault(context, repo, { branch, previous, next }, check);
}

/**
 * The move a fetch could make: the default branch to the remote's, when that is a fast-forward.
 * Null when the remote is not ahead or has diverged.
 */
async function remoteAhead(context: WorktreeContext, repo: string, remote: string) {
  const { git } = context;
  const branch = await defaultBranch(context, repo);
  const base = baseDir(context, repo);
  const next = await commitOf(git, base, `refs/remotes/${remote}/${branch}`);
  const previous = await commitOf(git, base, 'refs/heads/' + branch);
  if (!next || next === previous) return null;
  if (previous) {
    const ancestor = await git.run(base, ['merge-base', '--is-ancestor', previous, next], {
      readOnly: true,
      allowFailure: true,
    });
    if (ancestor.code !== 0) return null;
  }
  return { branch, previous, next };
}

/**
 * After a fetch: moves the default branch to the remote's through the publish path, with `check`
 * judging the commits it brings. Null when nothing could move, such as a changed checkout or
 * someone publishing first.
 */
async function followRemote(context: WorktreeContext, repo: string, remote: string, check: (previous: string | null, next: string) => Promise<void>) {
  const move = await remoteAhead(context, repo, remote);
  if (!move) return null;
  try {
    return await moveDefault(context, repo, move, check);
  } catch (error) {
    if (error instanceof NotFastForwardError || error instanceof BaseChangedError) return null;
    throw error;
  }
}

/** Merges the default branch into the person's branch, authored by the person. */
async function mergeDefault(context: WorktreeContext, repo: string, key: string, author: CommitAuthor | undefined, check: (tip: string) => Promise<void>) {
  const { git } = context;
  const branch = await defaultBranch(context, repo);
  const copy = copyDir(context, key, repo);
  // The commit judged is the one merged, even if someone publishes in between.
  const tip = (await git.run(copy, ['rev-parse', 'refs/heads/' + branch])).stdout.trim();
  await check(tip);
  const signed = authorship(author);
  const current = (await symbolicBranch(git, copy)) ?? 'HEAD';
  const message = ['-m', `Merge ${branch} into ${current}`];
  // A merge cannot take --trailer, so the trailer is the message's last paragraph.
  if (author) message.push('-m', signed.trailer[1]);
  const merge = [...signed.config, 'merge', '--no-ff', '--no-edit', ...message];
  return git.run(copy, [...merge, tip], {
    allowFailure: true,
    env: signed.env,
  });
}

/**
 * Before a repository goes to the trash: unlocks every copy of it, so Git may prune their
 * records once the copies' folders are removed. Returns the copies found.
 */
async function releaseCopies(context: WorktreeContext, repo: string) {
  const copies = copiesOf(await listed(context, repo), context.layout.worktrees);
  context.listings?.delete(repo);
  for (const copy of copies) {
    const unlock = ['worktree', 'unlock', copy.dir];
    await context.git.run(baseDir(context, repo), unlock, { allowFailure: true });
  }
  return copies;
}

/** Unlocks and removes one copy; its personal branch stays in the repository. */
async function remove(context: WorktreeContext, repo: string, key: string) {
  if (!copyExists(context, key, repo)) return;
  const base = baseDir(context, repo);
  const dir = copyDir(context, key, repo);
  await context.git.run(base, ['worktree', 'unlock', dir], { allowFailure: true });
  await context.git.run(base, ['worktree', 'remove', '--force', '--force', dir]);
  context.listings?.delete(repo);
}

/** Creates, lists, publishes and removes the per-person working copies of repositories. */
export function createWorktrees(options: Omit<WorktreeContext, 'listings'>) {
  const context: WorktreeContext = { ...options, listings: new Map() };
  return {
    /** Forgets the cached worktree list after a branch switch in one of the copies. */
    branchesMoved: (repo: string) => context.listings?.delete(repo),
    baseDir: (repo: string) => baseDir(context, repo),
    copyDir: (key: string, repo: string) => copyDir(context, key, repo),
    exists: (key: string, repo: string) => copyExists(context, key, repo),
    defaultBranch: (repo: string) => defaultBranch(context, repo),
    repairBase: (repo: string) => repairBase(context, repo),
    /** Who holds each branch; `published` saves reading the default branch again. */
    holders: (repo: string, published?: string) => holders(context, repo, published),
    /** The people's copies of a repository, as Git lists them. */
    copies: async (repo: string) => copiesOf(await listed(context, repo), context.layout.worktrees),
    releaseCopies: (repo: string) => releaseCopies(context, repo),
    ensure: (repo: string, owner: CopyOwner) => ensure(context, repo, owner),
    assertFree: (repo: string, key: string, branch: string) => assertFree(context, repo, key, branch),
    publish: (repo: string, key: string, check: (previous: string | null, next: string) => Promise<void>) => publish(context, repo, key, check),
    remoteAhead: (repo: string, remote: string) => remoteAhead(context, repo, remote),
    followRemote: (repo: string, remote: string, check: (previous: string | null, next: string) => Promise<void>) => followRemote(context, repo, remote, check),
    mergeDefault: (repo: string, key: string, author: CommitAuthor | undefined, check: (tip: string) => Promise<void>) => mergeDefault(context, repo, key, author, check),
    remove: (repo: string, key: string) => remove(context, repo, key),
  };
}

/** Per-person working copy operations of one workspace. */
export type Worktrees = ReturnType<typeof createWorktrees>;
