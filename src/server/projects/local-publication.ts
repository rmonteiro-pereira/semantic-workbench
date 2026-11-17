// Moves local authoring away from the served default ref without replacing working files.
import { GitError, symbolicBranch, type Git } from './git';
import { NothingToPublishError, NotFastForwardError, PublicationRefChangedError, PendingPublicationError, PublicationAdoptionError } from './errors';
import type { PublishedPointers } from './published-pointer';
import { type Publication, type PublicationAdvance, type PublicationGuard } from './publication';
import { defaultBranchAt, rememberDefaultBranch } from './worktrees';

/** Observes the immutable commits considered by one serialized adoption attempt. */
export type PublicationObserver = (previous: string | null, commit: string | null) => void;

/** The branch where local-mode commits go once the default branch is the published one. */
export const LOCAL_AUTHORING_BRANCH = 'work/local';

/** Remembers the default name before a local commit can create or advance its authoring branch. */
export async function prepareLocalCommit(git: Git, directory: string) {
  const branch = await defaultBranchAt(git, directory, 'the local repository');
  await rememberDefaultBranch(git, directory, branch);
  return moveToAuthoringBranch(git, directory, branch);
}

/** Switches a default checkout to authoring while Git preserves staged and unstaged changes. */
export async function moveToAuthoringBranch(git: Git, directory: string, defaultBranch: string) {
  const branch = await symbolicBranch(git, directory);
  if (!branch) throw new GitError('Choose an authoring branch before committing a detached HEAD.');
  if (branch !== defaultBranch) return { branch };
  if (defaultBranch === LOCAL_AUTHORING_BRANCH) throw new GitError(`The default branch is ${LOCAL_AUTHORING_BRANCH}. Choose another authoring branch before committing.`);
  const head = await git.head(directory);
  const authoring = await git.revParse(directory, `refs/heads/${LOCAL_AUTHORING_BRANCH}`);
  if (authoring && (!head || !(await git.isAncestor(directory, head, authoring)))) {
    throw new GitError(`${LOCAL_AUTHORING_BRANCH} has diverged. Choose another authoring branch, or merge the default branch into ${LOCAL_AUTHORING_BRANCH} in Git.`);
  }
  if (!head && !authoring) await git.run(directory, ['symbolic-ref', 'HEAD', `refs/heads/${LOCAL_AUTHORING_BRANCH}`]);
  else await git.run(directory, authoring ? ['switch', LOCAL_AUTHORING_BRANCH] : ['switch', '-c', LOCAL_AUTHORING_BRANCH]);
  return { branch: LOCAL_AUTHORING_BRANCH, movedFrom: defaultBranch };
}

/** The workspace's existing Git, pointer and bounded-read boundaries for local publication. */
export type LocalPublicationDeps = {
  publication: Publication;
  git: Git;
  directory: (repository: string) => string;
  pointers: PublishedPointers;
};

/** Creates serialized local publication operations; compare-and-swap also rejects outside Git races. */
export function createLocalPublication(deps: LocalPublicationDeps) {
  const { publication } = deps;
  async function publish(repository: string, branch: string, guard: PublicationGuard, advance: PublicationAdvance) {
    const { git, pointers } = deps;
    const directory = deps.directory(repository);
    const previous = pointers.get(repository)?.commit ?? null;
    const ref = await git.revParse(directory, `refs/heads/${branch}`);
    if (ref !== previous) throw new PendingPublicationError(previous ?? 'the first published commit');
    const next = await git.head(directory);
    if (!next || next === previous) throw new NothingToPublishError();
    const authoring = await symbolicBranch(git, directory);
    if (!authoring || authoring === branch) throw new GitError('Choose an authoring branch before publishing.');
    try {
      return await advance(repository, branch, { previous, next }, guard);
    } catch (error) {
      if (error instanceof NotFastForwardError) throw new NotFastForwardError(branch, `Publishing must be a fast-forward. Merge ${branch} into ${authoring} first.`);
      throw error;
    }
  }

  async function adopt(repository: string, branch: string, guard: PublicationGuard, advance: PublicationAdvance, observe?: PublicationObserver) {
    const { git, pointers } = deps;
    const directory = deps.directory(repository);
    const previous = pointers.get(repository)?.commit;
    const next = await git.revParse(directory, `refs/heads/${branch}`);
    observe?.(previous ?? null, next);
    if (!previous || !next || previous === next) throw new PublicationAdoptionError('nothing-pending');
    try {
      return await advance(repository, branch, { previous, next, expectedRef: next }, guard);
    } catch (error) {
      if (error instanceof PublicationRefChangedError) throw new PublicationAdoptionError('changed');
      if (error instanceof NotFastForwardError) throw new PublicationAdoptionError('diverged', previous);
      throw error;
    }
  }

  return {
    publishLocal: (repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>) =>
      publication.serialized(repository, advance => publish(repository, branch, guard, advance)),
    adopt: (repository: string, branch: string, guard: (previous: string | null, next: string) => Promise<void>, observe?: PublicationObserver) =>
      publication.serialized(repository, advance => adopt(repository, branch, guard, advance, observe)),
  };
}
