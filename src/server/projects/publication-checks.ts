// Keeps every publication entry point on the same ordered validation path.
import { NotFastForwardError, SnapshotUnreadableError } from './errors';

/** The immutable commits participating in a proposed default-branch move. */
export type PublicationCandidate = { repo: string; branch: string; previous: string | null; next: string };
/** A publication refusal throws before the ref or served pointer may move. */
export type PublicationCheck = (candidate: PublicationCandidate) => Promise<void>;
/** Git ancestry, bounded indexing and existing content-guard judgement supplied by the caller. */
export type PublicationCheckDeps = {
  isAncestor: (repo: string, previous: string, next: string) => Promise<boolean>;
  readable: (candidate: PublicationCandidate) => Promise<unknown>;
  guard: PublicationCheck;
};

/** Orders fast-forward validation, complete bounded reads and content guards. */
export function publicationChecks(deps: PublicationCheckDeps): PublicationCheck[] {
  return [
    async candidate => {
      if (candidate.previous && !(await deps.isAncestor(candidate.repo, candidate.previous, candidate.next))) {
        throw new NotFastForwardError(candidate.branch);
      }
    },
    async candidate => {
      try {
        await deps.readable(candidate);
      } catch (cause) {
        throw new SnapshotUnreadableError(`Cannot publish the candidate snapshot: ${(cause as Error).message}`);
      }
    },
    deps.guard,
  ];
}
