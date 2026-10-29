import type { AutosaveStatus } from '../projects/autosave';

/** Says why Commit is off when the open project has no change to commit. */
export const NOTHING_TO_COMMIT = 'Nothing to commit. Edit a file first.';

/**
 * Tells whether the project has nothing to commit: no uncommitted file and no edit still on its
 * way to the file. An edit that is pending or saving counts, so Commit does not flicker off while
 * the first change is being saved.
 */
export function hasNothingToCommit(uncommittedFiles: number, saveStatus: AutosaveStatus) {
  const settled = saveStatus === 'clean' || saveStatus === 'saved';
  return uncommittedFiles === 0 && settled;
}

/** Says why Commit is off while the open file's save needs action (see `saveNeedsAction`). */
export const SAVE_FAILED = 'Commit is off until the file is saved. Open the save state to see why.';
