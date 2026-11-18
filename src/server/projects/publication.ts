// Owns publication ordering, durable intent and the atomic default-ref transition.
import { operationStep } from '../auth/operation-execution';
import { publicationChecks, type PublicationCandidate } from './publication-checks';
import { PublicationRefChangedError, PendingPublicationError } from './errors';
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
  pointers: PublishedPointers;
  /** A successful validation may return a release callback for its active candidate index. */
  readable: (candidate: PublicationCandidate) => Promise<unknown>;
  supersede: () => void;
  /** Persists side data indexed by the candidate commit before anything can publish it. */
  stage?: (stage: 'intent' | 'ref' | 'pointer') => void;
};

/** Creates one repository queue shared by publishing, remote following and outside adoption. */
export function createPublication(deps: PublicationDeps) {
  const active = new Map<string, Promise<unknown>>();
  // The ordered checks of a move, and the callback that releases the candidate index they build.
  function prepare(repository: string, branch: string, move: PublicationMove, guard: PublicationGuard) {
    const { git } = deps;
    const { previous, next } = move;
    const directory = deps.directory(repository);
    const candidate = { repo: repository, branch, previous, next };
    let release: (() => void) | undefined;
    const checks = publicationChecks({
      isAncestor: (_repository, from, to) => git.isAncestor(directory, from, to),
      readable: async candidate => {
        const validated = await deps.readable(candidate);
        if (typeof validated === 'function') release = validated as () => void;
      },
      guard: () => guard(previous, next),
    });
    return { candidate, checks, release: () => release?.() };
  }
  const advance: PublicationAdvance = (repository, branch, move, guard) =>
    operationStep('publication.advance', async () => {
      const { git, pointers } = deps;
      const { previous, next } = move;
      const directory = deps.directory(repository);
      const recorded = pointers.get(repository)?.commit;
      if (recorded && recorded !== previous) throw new PendingPublicationError(recorded);
      const { candidate, checks, release } = prepare(repository, branch, move, guard);
      try {
        for (const check of checks) await check(candidate);
        pointers.intent(repository, branch, next);
        deps.stage?.('intent');
        try {
          const expected = move.expectedRef === undefined ? previous : move.expectedRef;
          const swapped = await git.run(directory, ['update-ref', `refs/heads/${branch}`, next, expected ?? ''], { allowFailure: true });
          if (swapped.code !== 0) throw new PublicationRefChangedError(branch);
        } catch (error) {
          operationStep('publication.abandon', () => {
            pointers.abandon(repository);
          });
          throw error;
        }
        deps.stage?.('ref');
        pointers.complete(repository, branch, next);
        deps.supersede();
        deps.stage?.('pointer');
        return { published: branch, previous, commit: next };
      } finally {
        release();
      }
    });
  // Runs the checks a publication would run and moves nothing, so a promotion can be judged first.
  async function check(repository: string, branch: string, move: PublicationMove, guard: PublicationGuard) {
    const { candidate, checks, release } = prepare(repository, branch, move, guard);
    try {
      for (const step of checks) await step(candidate);
    } finally {
      release();
    }
  }
  function serialized<T>(repository: string, use: (advance: PublicationAdvance) => Promise<T>): Promise<T> {
    const operation = (active.get(repository) ?? Promise.resolve()).catch(() => {}).then(() => use(advance));
    active.set(repository, operation);
    return operation.finally(() => {
      if (active.get(repository) === operation) active.delete(repository);
    });
  }
  return {
    /** The durable pointer record of a repository, including one that has no commit yet. */
    pointer: (repository: string) => deps.pointers.get(repository),
    /** The commit the durable pointer says is published, if any. */
    recorded: (repository: string) => deps.pointers.get(repository)?.commit,
    /** Finishes or drops an interrupted publication by comparing its intent with the branch tip. */
    recover: (repository: string, ref: string | null) =>
      operationStep('publication.recover', () => deps.pointers.reconcile(repository, ref, (from, to) => deps.git.isAncestor(deps.directory(repository), from, to))),
    /** Records the first published commit of a repository that already had default-branch history. */
    adoptInitial: (repository: string, branch: string, commit: string) =>
      operationStep('publication.adopt-initial', () => {
        deps.pointers.complete(repository, branch, commit);
      }),
    serialized,
    check,
    advance: (repository: string, branch: string, move: PublicationMove, guard: PublicationGuard) => serialized(repository, advance => advance(repository, branch, move, guard)),
  };
}
/** The single publication writer and queue of one workspace. */
export type Publication = ReturnType<typeof createPublication>;
