// Owns publication ordering, durable intent and the atomic default-ref transition.
import { publicationChecks, type PublicationCandidate } from './publication-checks';
import { NotFastForwardError, PendingPublicationError } from './errors';
import type { Git } from './git';
import type { PublishedPointers } from './published-pointer';

/** The old served commit, candidate commit and optional already-moved ref to verify. */
export type PublicationMove = { previous: string | null; next: string; expectedRef?: string | null };
/** A completed publication identifies both immutable commits and the default branch. */
export type PublicationResult = { published: string; previous: string | null; commit: string };
/** Existing governance checks judge the exact immutable commits being advanced. */
export type PublicationGuard = (previous: string | null, next: string) => Promise<void>;
/** Advances a publication while its caller holds the repository's queue. */
export type PublicationAdvance = (repository: string, branch: string, move: PublicationMove, guard: PublicationGuard) => Promise<PublicationResult>;
/** Git, durable state and bounded reads used by every publication entry point. */
export type PublicationDeps = {
  git: Git;
  directory: (repository: string) => string;
  pointers?: PublishedPointers;
  readable: (candidate: PublicationCandidate) => Promise<unknown>;
  supersede: () => void;
  stage?: (stage: 'intent' | 'ref' | 'pointer') => void;
};

/** Creates one repository queue shared by publishing, remote following and outside adoption. */
export function createPublication(deps: PublicationDeps) {
  const active = new Map<string, Promise<unknown>>();
  const advance: PublicationAdvance = async (repository, branch, move, guard) => {
    const { git, pointers } = deps;
    const { previous, next } = move;
    const directory = deps.directory(repository);
    const recorded = pointers?.get(repository)?.commit;
    if (recorded && recorded !== previous) throw new PendingPublicationError(recorded);
    const candidate = { repo: repository, branch, previous, next };
    const checks = publicationChecks({
      isAncestor: (_repository, from, to) => git.isAncestor(directory, from, to),
      readable: deps.readable,
      guard: () => guard(previous, next),
    });
    for (const check of checks) await check(candidate);
    pointers?.intent(repository, branch, next);
    deps.stage?.('intent');
    try {
      const expected = move.expectedRef === undefined ? previous : move.expectedRef;
      const swapped = await git.run(directory, ['update-ref', `refs/heads/${branch}`, next, expected ?? ''], { allowFailure: true });
      if (swapped.code !== 0) throw new NotFastForwardError(branch);
    } catch (error) {
      pointers?.abandon(repository);
      throw error;
    }
    deps.stage?.('ref');
    pointers?.complete(repository, branch, next);
    deps.supersede();
    deps.stage?.('pointer');
    return { published: branch, previous, commit: next };
  };
  function serialized<T>(repository: string, use: (advance: PublicationAdvance) => Promise<T>): Promise<T> {
    const operation = (active.get(repository) ?? Promise.resolve()).catch(() => {}).then(() => use(advance));
    active.set(repository, operation);
    return operation.finally(() => {
      if (active.get(repository) === operation) active.delete(repository);
    });
  }
  return {
    serialized,
    advance: (repository: string, branch: string, move: PublicationMove, guard: PublicationGuard) => serialized(repository, advance => advance(repository, branch, move, guard)),
  };
}
/** The single publication writer and queue of one workspace. */
export type Publication = ReturnType<typeof createPublication>;
