import type { AutosaveStatus } from '../projects/autosave';
import { saveNeedsAction } from '../projects/autosave';

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

/** Says why Commit is off while the open file could not be saved. */
export const SAVE_FAILED = 'Commit is off until the file is saved. Open the save state to see why.';

/** Tells whether the open file's save failed, which switches Commit off until it is fixed. */
export function saveBlocksCommit(saveStatus: AutosaveStatus) {
  return saveNeedsAction(saveStatus);
}
