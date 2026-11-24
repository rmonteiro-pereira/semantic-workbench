// Keeps every publication entry point on the same ordered validation path.
import { NotFastForwardError, SnapshotUnreadableError } from './errors';
import { GitError } from './git';

/** The immutable commits participating in a proposed default-branch move. */
export type PublicationCandidate = { repo: string; branch: string; previous: string | null; next: string };
/** A publication refusal throws before the ref or served pointer may move. */
export type PublicationCheck = (candidate: PublicationCandidate) => Promise<void>;
/** Git ancestry, bounded indexing and existing content-guard judgement supplied by the caller. */
export type PublicationCheckDeps = {
  isAncestor: (repo: string, previous: string, next: string) => Promise<boolean>;
  readable: (candidate: PublicationCandidate) => Promise<unknown>;
  beforeReadable?: PublicationCheck;
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
    // The visible-set check reads the candidate first; a candidate Git cannot read within the limits is
    // unreadable here too, while the check's own refusals pass through unchanged.
    ...(deps.beforeReadable ? [unreadableOnGitFailure(deps.beforeReadable)] : []),
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

/** Reports a Git failure inside a check as an unreadable candidate, like the readability check itself does. Only the visible-set check needs this: it is the one check that reads the candidate before readability is proven. */
function unreadableOnGitFailure(check: PublicationCheck): PublicationCheck {
  return async candidate => {
    try {
      await check(candidate);
    } catch (cause) {
      if (cause instanceof GitError) throw new SnapshotUnreadableError(`Cannot publish the candidate snapshot: ${cause.message}`);
      throw cause;
    }
  };
}
