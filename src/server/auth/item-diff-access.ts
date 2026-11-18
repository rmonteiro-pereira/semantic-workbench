// Gives comparison sides the same visibility rules as saved definitions and Source Control.
import { BadRequestError, HiddenResourceError, NotFoundError, SnapshotUnavailableError, SnapshotUnreadableError } from '../projects/errors';
import { GitError } from '../projects/git';
import { PathError } from '../projects/paths';
import type { Reader } from '../projects/reader';
import { branchShownTo } from '../projects/worktrees';

/** Applies the same project and file visibility to either side of a comparison. */
export function diffFileReadable(reader: Reader, project: string, path: string): boolean {
  return !reader.view || (reader.view.readableProjects.has(project) && reader.view.canRead(project, path));
}

/** Applies Source Control's personal branch visibility before opening any of its objects. */
export function diffBranchReadable(reader: Reader, branch: string, own: string | null, remote = false): boolean {
  return !reader.view || branchShownTo(branch, own, remote);
}

/** Makes absence, denied project access and unreadable sides indistinguishable. */
export async function readDiffSide<T>(reader: Reader, project: string, load: () => Promise<T>): Promise<T> {
  if (reader.view && !reader.view.readableProjects.has(project)) throw new HiddenResourceError();
  try {
    return await load();
  } catch (error) {
    const fileUnavailable = error instanceof Error && 'code' in error && ['EACCES', 'ENOENT', 'ENOTDIR', 'EPERM'].includes(String(error.code));
    if (
      fileUnavailable ||
      error instanceof SnapshotUnavailableError ||
      error instanceof SnapshotUnreadableError ||
      error instanceof NotFoundError ||
      error instanceof GitError ||
      error instanceof PathError ||
      error instanceof BadRequestError
    ) {
      throw new HiddenResourceError();
    }
    throw error;
  }
}
