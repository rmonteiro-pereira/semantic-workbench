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
