// Defines workspace errors translated into HTTP responses by the route layer.
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
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
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
    super(
      'A merge is in progress: commit the merge (with every conflict resolved) before committing chosen files.',
    );
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
  constructor(public branch: string) {
    super(`Pull from ${branch} first: publishing must be a fast-forward of ${branch}.`);
    this.name = 'NotFastForwardError';
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
    super(
      `The folder ${folder} does not exist on the remote branch ${branch}. ` +
        'Create it with the first push, or check the spelling.',
    );
    this.name = 'MissingFolderError';
  }
}
