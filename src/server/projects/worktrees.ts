// Gives each person in server mode their own Git working copy of a repository: a locked
// `git worktree` on a personal branch. The base checkout under projects/ stays detached at the
// default branch and holds the published state; only publishing moves it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Publication, type PublicationAdvance, type PublicationGuard, type PublicationResult } from './publication';
import type { PublicationObserver } from './local-publication';
import { BranchInUseError, NotFastForwardError, PublicationRefChangedError, PublicationAdoptionError } from './errors';
import { authorship, commitOf, GitError, isBranchName, symbolicBranch, type CommitAuthor, type Git } from './git';
import { USER_KEY, type DataLayout } from './paths';
import { log } from '../observability/log';
import { checkOutFolders, sparseFolders } from './sparse-folder';
import { ownsContributionBranch } from '../../shared/proposals/contribution-branch';

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
 * A contribution branch, the personal branch name and a dot and a proposal identifier, is shown
 * to its owner only.
 */
export function branchShownTo(branch: string, own: string | null, remote = false) {
  const name = remote ? branch.slice(branch.indexOf('/') + 1) : branch;
  if (!isPersonalBranch(name)) return true;
  if (own === null) return false;
  return sameBranchName(name, own) || ownsContributionBranch(own, name);
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
  publication: Publication;
  /**
   * Each repository's worktree list, kept until a copy is created, removed or switches branch,
   * or the default branch moves, so a project listing does not ask Git again for every project.
   */
  listings?: Map<string, Promise<WorktreeEntry[]>>;
};

/** A repository has no remembered, remote or attached default branch to adopt. */
export class UnknownDefaultBranchError extends GitError {
  constructor(repository: string) {
    super(`Cannot tell the default branch of ${repository}. Choose its default branch in Git configuration.`);
  }
}

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
 * the remote announces, otherwise an existing configured initial branch, main or master.
 */
async function defaultBranch(context: WorktreeContext, repo: string) {
  const { git } = context;
  const dir = baseDir(context, repo);
  return defaultBranchAt(git, dir, repo);
}

/** Resolves a known default name without treating an arbitrary authoring checkout as published. */
export async function defaultBranchAt(git: Git, dir: string, repo: string) {
  const remembered = await git.configValue(dir, DEFAULT_BRANCH_KEY, 'local');
  if (remembered) return remembered;
  const remote = await git.run(dir, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], {
    readOnly: true,
    allowFailure: true,
  });
  const named = remote.code === 0 ? remote.stdout.trim().replace(/^origin\//, '') : '';
  // The remote chooses this name, so it must be a plain branch name before Git sees it again.
  if (named) {
    if (await isBranchName(git, dir, named)) return named;
    throw new UnknownDefaultBranchError(repo);
  }
  const initial = await git.configValue(dir, 'init.defaultBranch');
  const candidates = [...new Set([initial, 'main', 'master'].filter((branch): branch is string => Boolean(branch)))];
  for (const candidate of candidates) {
    if ((await isBranchName(git, dir, candidate)) && (await commitOf(git, dir, `refs/heads/${candidate}`))) return candidate;
  }
  const checkedOut = await symbolicBranch(git, dir);
  if (checkedOut && candidates.includes(checkedOut) && !(await commitOf(git, dir, 'HEAD'))) return checkedOut;
  throw new UnknownDefaultBranchError(repo);
}

/** Remembers the chosen default name before a checkout or authoring branch can change. */
export async function rememberDefaultBranch(git: Git, directory: string, branch: string): Promise<void> {
  await git.run(directory, ['config', '--local', DEFAULT_BRANCH_KEY, branch]);
}

// The base checkout must not hold the default branch, or a publish would leave its files stale;
// detached at the same commit, its files stay exactly as they are.
async function detachBase(context: WorktreeContext, repo: string) {
  const { git } = context;
  const dir = baseDir(context, repo);
  const branch = await symbolicBranch(git, dir);
  if (!branch) return;
  await rememberDefaultBranch(git, dir, await defaultBranch(context, repo));
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
  const tip = context.publication.recorded(repo) ?? (await commitOf(git, dir, 'refs/heads/' + remembered));
  if (!tip) return;
  const attached = await symbolicBranch(git, dir);
  if (!attached && (await commitOf(git, dir, 'HEAD')) === tip) return;
  await git.run(dir, ['checkout', '-q', '--force', '--detach', tip]);
}

/**
 * Repairs the published checkout after a publication took effect. The branch and pointer have
 * already moved, so a checkout failure is logged and left for the next startup repair instead of
 * reporting a successful publication as failed.
 */
async function repairBaseAfterPublication(context: WorktreeContext, repo: string, commit: string) {
  try {
    await repairBase(context, repo);
  } catch (error) {
    log.error('publication.base-repair-failed', { repository: repo, commit, detail: error instanceof Error ? error.message : String(error) });
  }
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
async function moveDefault(context: WorktreeContext, repo: string, move: { branch: string; previous: string | null; next: string }, check: PublicationGuard, advance: PublicationAdvance) {
  const { branch, previous, next } = move;
  const result = await advance(repo, branch, { previous, next }, baseGuard(context, repo, check));
  await repairBaseAfterPublication(context, repo, result.commit);
  context.listings?.delete(repo);
  return result;
}

function baseGuard(context: WorktreeContext, repository: string, guard: PublicationGuard): PublicationGuard {
  return async (previous, next) => {
    const changed = await context.git.run(baseDir(context, repository), ['status', '--porcelain'], { readOnly: true });
    if (changed.stdout.trim()) throw new BaseChangedError(repository);
    await guard(previous, next);
  };
}

async function adopt(context: WorktreeContext, repository: string, guard: PublicationGuard, advance: PublicationAdvance, observe?: PublicationObserver) {
  const branch = await defaultBranch(context, repository);
  const previous = context.publication.recorded(repository);
  const next = await commitOf(context.git, baseDir(context, repository), `refs/heads/${branch}`);
  observe?.(previous ?? null, next);
  if (!previous || !next || previous === next) throw new PublicationAdoptionError('nothing-pending');
  try {
    const result = await advance(repository, branch, { previous, next, expectedRef: next }, baseGuard(context, repository, guard));
    await repairBaseAfterPublication(context, repository, result.commit);
    context.listings?.delete(repository);
    return result;
  } catch (error) {
    if (error instanceof PublicationRefChangedError) throw new PublicationAdoptionError('changed');
    if (error instanceof NotFastForwardError) throw new PublicationAdoptionError('diverged', previous);
    throw error;
  }
}

/**
 * Fast-forwards the default branch to the copy's HEAD with a compare-and-swap, then moves the
 * published state to it. A copy that does not contain the current tip is refused.
 */
async function publish(context: WorktreeContext, repo: string, key: string, check: PublicationGuard, advance: PublicationAdvance) {
  const { git } = context;
  const branch = await defaultBranch(context, repo);
  const next = await commitOf(git, copyDir(context, key, repo), 'HEAD');
  if (!next) throw new GitError('Commit your changes before publishing.');
  const previous = await commitOf(git, baseDir(context, repo), 'refs/heads/' + branch);
  return moveDefault(context, repo, { branch, previous, next }, check, advance);
}

/** What a promotion does inside the repository queue, before and after the default branch moves. */
export type PromotionHooks = { before?: (previous: string | null) => Promise<void>; after?: (result: PublicationResult) => Promise<void> };

/**
 * Moves the default branch to a commit that is not in anyone's copy, the tip of a proposal, through
 * the same move a publish makes. `before` runs first in the queue and may refuse; `after` runs in
 * the queue once the branch has moved, so nothing else can interleave with the bookkeeping.
 */
async function promote(context: WorktreeContext, repo: string, tip: string, check: PublicationGuard, advance: PublicationAdvance, hooks: PromotionHooks) {
  const { git } = context;
  const branch = await defaultBranch(context, repo);
  const previous = await commitOf(git, baseDir(context, repo), 'refs/heads/' + branch);
  await hooks.before?.(previous);
  const result = await moveDefault(context, repo, { branch, previous, next: tip }, check, advance);
  await hooks.after?.(result);
  return result;
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
async function followRemote(context: WorktreeContext, repo: string, remote: string, check: PublicationGuard, advance: PublicationAdvance) {
  const move = await remoteAhead(context, repo, remote);
  if (!move) return null;
  try {
    return await moveDefault(context, repo, move, check, advance);
  } catch (error) {
    if (error instanceof NotFastForwardError || error instanceof PublicationRefChangedError || error instanceof BaseChangedError) return null;
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
    publish: (repo: string, key: string, check: (previous: string | null, next: string) => Promise<void>) =>
      context.publication.serialized(repo, advance => publish(context, repo, key, check, advance)),
    promote: (repo: string, tip: string, check: PublicationGuard, hooks: PromotionHooks) => context.publication.serialized(repo, advance => promote(context, repo, tip, check, advance, hooks)),
    adopt: (repo: string, guard: PublicationGuard, observe?: PublicationObserver) => context.publication.serialized(repo, advance => adopt(context, repo, guard, advance, observe)),
    remoteAhead: (repo: string, remote: string) => remoteAhead(context, repo, remote),
    followRemote: (repo: string, remote: string, check: (previous: string | null, next: string) => Promise<void>) =>
      context.publication.serialized(repo, advance => followRemote(context, repo, remote, check, advance)),
    mergeDefault: (repo: string, key: string, author: CommitAuthor | undefined, check: (tip: string) => Promise<void>) => mergeDefault(context, repo, key, author, check),
    remove: (repo: string, key: string) => remove(context, repo, key),
  };
}

/** Per-person working copy operations of one workspace. */
export type Worktrees = ReturnType<typeof createWorktrees>;
