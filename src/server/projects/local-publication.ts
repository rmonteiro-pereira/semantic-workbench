// Moves local authoring away from the served default ref without replacing working files.
import { GitError, symbolicBranch, type Git } from './git';
import { NothingToPublishError, NotFastForwardError, PendingPublicationError, PublicationAdoptionError } from './errors';
import { publicationChecks, type PublicationCandidate } from './publication-checks';
import type { PublishedPointers } from './published-pointer';
import { defaultBranchAt, DEFAULT_BRANCH_KEY } from './worktrees';

/** Remembers the default name before a local commit can create or advance its authoring branch. */
export async function prepareLocalCommit(git: Git, directory: string) {
  const branch = await defaultBranchAt(git, directory, 'the local repository');
  await git.run(directory, ['config', '--local', DEFAULT_BRANCH_KEY, branch]);
  return moveToAuthoringBranch(git, directory, branch);
}

/** Switches a default checkout to authoring while Git preserves staged and unstaged changes. */
export async function moveToAuthoringBranch(git: Git, directory: string, defaultBranch: string) {
  const branch = await symbolicBranch(git, directory);
  if (!branch) throw new GitError('Choose an authoring branch before committing a detached HEAD.');
  if (branch !== defaultBranch) return { branch };
  const head = await git.head(directory);
  const authoring = await git.revParse(directory, 'refs/heads/work/local');
  if (authoring && (!head || !(await git.isAncestor(directory, head, authoring)))) {
    throw new GitError('work/local has diverged. Choose another authoring branch, or merge the default branch into work/local in Git.');
  }
  if (!head && !authoring) await git.run(directory, ['symbolic-ref', 'HEAD', 'refs/heads/work/local']);
  else await git.run(directory, authoring ? ['switch', 'work/local'] : ['switch', '-c', 'work/local']);
  return { branch: 'work/local', movedFrom: defaultBranch };
}

/** The workspace's existing Git, pointer and bounded-read boundaries for local publication. */
export type LocalPublicationDeps = {
  git: Git;
  directory: (repository: string) => string;
  pointers: PublishedPointers;
  readable: (candidate: PublicationCandidate) => Promise<unknown>;
  supersede: () => void;
};

/** Creates serialized local publication operations; compare-and-swap also rejects outside Git races. */
export function createLocalPublication(deps: LocalPublicationDeps) {
  const active = new Map<string, Promise<unknown>>();
  async function publish(repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>) {
    const { git, pointers } = deps;
    const directory = deps.directory(repository);
    const previous = pointers.get(repository)?.commit ?? null;
    const ref = await git.revParse(directory, `refs/heads/${branch}`);
    if (ref !== previous) throw new PendingPublicationError(previous ?? 'the first published commit');
    const next = await git.head(directory);
    if (!next || next === previous) throw new NothingToPublishError();
    const authoring = await symbolicBranch(git, directory);
    if (!authoring || authoring === branch) throw new GitError('Choose an authoring branch before publishing.');
    const candidate = { repo: repository, branch, previous, next };
    const checks = publicationChecks({ isAncestor: (_repository, from, to) => git.isAncestor(directory, from, to), readable: deps.readable, guard: () => guard(previous, next) });
    try {
      for (const check of checks) await check(candidate);
    } catch (error) {
      if (error instanceof NotFastForwardError) throw new NotFastForwardError(branch, `Merge ${branch} into ${authoring} first.`);
      throw error;
    }
    pointers.intent(repository, branch, next);
    const swapped = await git.run(directory, ['update-ref', `refs/heads/${branch}`, next, previous ?? ''], { allowFailure: true });
    if (swapped.code !== 0) throw new NotFastForwardError(branch);
    pointers.complete(repository, branch, next);
    deps.supersede();
    return { published: branch, previous, commit: next };
  }
  async function adopt(repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>) {
    const { git, pointers } = deps;
    const directory = deps.directory(repository);
    const previous = pointers.get(repository)?.commit;
    const next = await git.revParse(directory, `refs/heads/${branch}`);
    if (!previous || !next || previous === next) throw new PublicationAdoptionError('nothing-pending');
    const candidate = { repo: repository, branch, previous, next };
    const checks = publicationChecks({ isAncestor: (_repository, from, to) => git.isAncestor(directory, from, to), readable: deps.readable, guard: () => guard(previous, next) });
    try {
      for (const check of checks) await check(candidate);
    } catch (error) {
      if (error instanceof NotFastForwardError) throw new PublicationAdoptionError('diverged', previous);
      throw error;
    }
    if (pointers.get(repository)?.commit !== previous) throw new PublicationAdoptionError('changed');
    pointers.intent(repository, branch, next);
    const verified = await git.run(directory, ['update-ref', `refs/heads/${branch}`, next, next], { allowFailure: true });
    if (verified.code !== 0) throw new PublicationAdoptionError('changed');
    pointers.complete(repository, branch, next);
    deps.supersede();
    return { published: branch, previous, commit: next };
  }
  function serialized<T>(repository: string, run: () => Promise<T>) {
    const operation = (active.get(repository) ?? Promise.resolve()).catch(() => {}).then(run);
    active.set(repository, operation);
    return operation.finally(() => {
      if (active.get(repository) === operation) active.delete(repository);
    });
  }
  return {
    publishLocal: (repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>) => serialized(repository, () => publish(repository, branch, guard)),
    adopt: (repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>) => serialized(repository, () => adopt(repository, branch, guard)),
  };
}
