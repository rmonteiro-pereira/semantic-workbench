// Defines workspace errors translated into HTTP responses by the route layer.
/** Reports that the branch, the head or a file differs from what a commit was prepared against. */
export class PreconditionError extends Error {
  constructor(public changed: { branch?: { expected: string; actual: string | null }; head?: { expected: string | null; actual: string | null }; files?: string[] }) {
    super('The repository changed since this commit was prepared.');
    this.name = 'PreconditionError';
  }
}
/** Reports a changed base version and carries the current hash and source for conflict handling. */
export class StaleError extends Error {
  constructor(
    public currentHash: string | null,
    public currentSource: string | null,
  ) {
    super('The file changed since this edit started.');
    this.name = 'StaleError';
  }
}
/**
 * Reports a request the caller got wrong, such as a malformed body. Its message is written for
 * the caller, so the HTTP boundary shows it. Any other error is unexpected and stays private.
 */
export class BadRequestError extends Error {
  constructor(
    message: string,
    /** A machine-readable reason sent in the answer, so a protocol caller never has to read the sentence. */
    public code?: RequestFailureCode,
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}
/** The response header that carries a failure's reason, so the status and the body of a legacy answer stay as they were. */
export const FAILURE_CODE_HEADER = 'X-Workbench-Failure';
/** Reasons a route answer names in `FAILURE_CODE_HEADER` besides its status. */
export type RequestFailureCode = 'not-found' | 'git-unavailable' | 'git-refused';
/** The reason a route names for an error, or undefined when the error has no reason a caller may rely on. */
export function failureCodeOf(error: unknown): RequestFailureCode | undefined {
  if (error instanceof NotFoundError) return 'not-found';
  if (error instanceof BadRequestError) return error.code;
  return undefined;
}
/** Reports that Git is not installed or usable, for the operations that need it. */
export class GitUnavailableError extends BadRequestError {
  constructor() {
    super('Git is not available on this machine.', 'git-unavailable');
    this.name = 'GitUnavailableError';
  }
}
/** Reports a missing workspace resource. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
/** Reports an expired undo window while leaving the entry available in trash. */
export class GoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoneError';
  }
}
/** Reports an occupied destination and suggests a free one without overwriting data. */
export class OccupiedError extends Error {
  constructor(
    message: string,
    public suggestion: Record<string, string>,
  ) {
    super(message);
    this.name = 'OccupiedError';
  }
}
/** Rejects selected-file commits during a merge and identifies unresolved conflicts. */
export class MergingError extends Error {
  constructor(public conflicts: string[]) {
    super('A merge is in progress: commit the merge (with every conflict resolved) before committing chosen files.');
    this.name = 'MergingError';
  }
}
/** Reports import paths that require an explicit replace or keep-both choice. */
export class ConflictError extends Error {
  constructor(public conflicts: string[]) {
    super('Files with these names already exist in the project. Choose replace or keep both.');
    this.name = 'ConflictError';
  }
}

/** Conceals an unreadable resource while distinguishing it from an ordinary missing item. */
export class HiddenResourceError extends Error {
  constructor() {
    super('Not found.');
    this.name = 'HiddenResourceError';
  }
}

/** Names the person (or the published state) whose working copy already holds a branch. */
export class BranchInUseError extends Error {
  constructor(
    public branch: string,
    public inUseBy: string,
  ) {
    super(`${branch} is in use by ${inUseBy}.`);
    this.name = 'BranchInUseError';
  }
}

/** Refuses to check out the personal branch of another person. */
export class PersonalBranchError extends Error {
  constructor(public branch: string) {
    super(`${branch} is another person's working branch and cannot be checked out.`);
    this.name = 'PersonalBranchError';
  }
}

/** Refuses a publish whose working copy does not contain the current default branch tip. */
export class NotFastForwardError extends Error {
  constructor(
    public branch: string,
    message = `Pull from ${branch} first: publishing must be a fast-forward of ${branch}.`,
  ) {
    super(message);
    this.name = 'NotFastForwardError';
  }
}

/** A concurrent writer changed the default ref after publication validation. */
export class PublicationRefChangedError extends Error {
  constructor(branch: string) {
    super(`Publishing must be a fast-forward of ${branch}; its ref changed during validation.`);
    this.name = 'PublicationRefChangedError';
  }
}

/** A publish asked of someone who has no working copy of the repository yet. */
export class NothingToPublishError extends Error {
  constructor() {
    super('Nothing to publish: you have not changed this repository.');
    this.name = 'NothingToPublishError';
  }
}

/** Refuses a download whose content exceeds the size limit, before anything is sent. */
export class TooLargeError extends Error {
  constructor(
    message: string,
    public limitBytes: number,
  ) {
    super(message);
    this.name = 'TooLargeError';
  }
}

/** The folder a project should live in does not exist on the remote branch. */
export class MissingFolderError extends Error {
  constructor(
    public folder: string,
    public branch: string,
  ) {
    super(`The folder ${folder} does not exist on the remote branch ${branch}. ` + 'Create it with the first push, or check the spelling.');
    this.name = 'MissingFolderError';
  }
}

/** Explains why immutable published definitions cannot be served. */
export class SnapshotUnavailableError extends Error {
  constructor(
    public reason: 'no-git' | 'no-commit' | 'unavailable',
    options?: ErrorOptions,
  ) {
    super('no published snapshot', options);
    this.name = 'SnapshotUnavailableError';
  }
}

/** Refuses publication when the candidate tree cannot be read completely within its limits. */
export class SnapshotUnreadableError extends Error {
  constructor(message = 'The candidate snapshot is unreadable or exceeds its limits.') {
    super(message);
    this.name = 'SnapshotUnreadableError';
  }
}

/** Refuses publication until an outside default-ref movement is reconciled explicitly. */
export class PendingPublicationError extends Error {
  constructor(commit: string) {
    super(`The default branch moved outside the workbench. Restore it to ${commit} before publishing, or adopt the pending move.`);
    this.name = 'PendingPublicationError';
  }
}

/** Refuses an outside-ref adoption without changing the durable publication. */
export class PublicationAdoptionError extends Error {
  constructor(
    public reason: 'nothing-pending' | 'diverged' | 'changed',
    commit?: string,
  ) {
    const messages = {
      'nothing-pending': 'Nothing to adopt.',
      diverged: `The default branch was moved outside the workbench and no longer contains the published commit. Make it a descendant of ${commit} in Git.`,
      changed: 'The default branch changed during adoption. Review the pending move and try again.',
    };
    super(messages[reason]);
    this.name = 'PublicationAdoptionError';
  }
}
