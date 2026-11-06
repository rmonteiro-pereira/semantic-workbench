// Pure rules about trash: what a content guard sees of a deletion, revert or restore, and which entries
// a person may see or restore.
import type { TrashEntry } from './trash';
import type { ContentGuard, FileChange } from '../auth/guards';
import type { AccessScope } from '../auth/authorize';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decode } from './atomic';
import { locationOf, projectFile, type DataLayout } from './paths';
import type { ProjectEntry } from './state';
/** Time window for immediate undo after deletion. */
export function safeReaddir(dir: string) {
  try {
    return readdirSync(dir).filter(n => !n.startsWith('.'));
  } catch {
    return [];
  }
}
/**
 * Judges deleting a file from a set of folders as removing its content. A missing file is left
 * for the delete itself to report.
 */
export function guardDeletion(files: DataLayout, slug: string, path: string, guard: ContentGuard | undefined) {
  if (!guard) return;
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(projectFile(files, slug, path));
  } catch {
    return;
  }
  const deleted = { project: slug, path, before: documentText(bytes), after: null };
  guard([deleted], { operation: 'delete' });
}

/** The file a content guard looks at: the project it belongs to and its path inside that project. */
export type GuardedFile = { slug: string; path: string };

/**
 * Reverting brings the committed text back, which must not undo a guarded change the person may
 * not make. Nothing is demoted: the committed text is restored as it is or not.
 */
export function guardRevert(files: DataLayout, file: GuardedFile, committed: Uint8Array | null, guard: ContentGuard | undefined) {
  if (!guard) return;
  const { slug, path } = file;
  let current: Uint8Array | null = null;
  try {
    current = readFileSync(projectFile(files, slug, path));
  } catch {}
  const before = current ? decode(current) : null;
  const after = committed ? decode(committed) : null;
  guard([{ project: slug, path, before, after }], { operation: 'revert' });
}

/** A file's text, or null when it is binary or not UTF-8, which no guard reads. */
export function documentText(bytes: Uint8Array): string | null {
  if (bytes.subarray(0, 8000).includes(0)) return null;
  try {
    return decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The project of a repository a file belongs to, and its path inside that project, found by the
 * longest member folder, as a pull finds the owner of a changed file. Null outside every member.
 */
function memberPath(members: ProjectEntry[], repoPath: string) {
  const owners = members
    .map(member => {
      const { folder, repo } = locationOf(member);
      return {
        project: member.slug,
        prefix: folder === repo ? '' : folder.slice(repo.length + 1) + '/',
      };
    })
    .filter(owner => repoPath.startsWith(owner.prefix))
    .sort((left, right) => right.prefix.length - left.prefix.length);
  const owner = owners[0];
  return owner ? { project: owner.project, path: repoPath.slice(owner.prefix.length) } : null;
}

/**
 * Every file a project, subproject or repository entry would re-create, as new files of the
 * project each belongs to; a repository's files go to its member projects.
 */
export function payloadChanges(entry: Pick<TrashEntry, 'kind' | 'project' | 'projects'>, dir: string): FileChange[] {
  const payload = join(dir, 'payload');
  const [root] = readdirSync(payload);
  return readdirRecursive(join(payload, root)).flatMap(path => {
    const target = entry.kind === 'repository' ? memberPath(entry.projects ?? [], path) : { project: entry.project, path };
    if (!target) return [];
    const after = documentText(readFileSync(join(payload, root, path)));
    return [{ ...target, before: null, after }];
  });
}

export function readdirRecursive(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
    if (dirent.name === '.git') {
      return [];
    }
    if (dirent.isDirectory()) {
      return readdirRecursive(join(dir, dirent.name), prefix + dirent.name + '/');
    }
    return [prefix + dirent.name];
  });
}

/** The person who deleted an entry restores it as their own; anyone else restores another's. */
export function restoreAction(entry: Pick<TrashEntry, 'deletedBy'>, scope: Pick<AccessScope, 'principal'>): 'restoreOwn' | 'restoreOthers' {
  return entry.deletedBy === scope.principal.id ? 'restoreOwn' : 'restoreOthers';
}

/**
 * Checks every original path before exposing an owned trash entry. An entry without original
 * paths, such as a deleted empty project, is visible to whoever may restore that project.
 */
export function readableTrash(entry: Pick<TrashEntry, 'project' | 'path' | 'deletedBy' | 'paths' | 'copy'>, scope: AccessScope): boolean {
  // An entry from a working copy is its owner's unpublished work, visible to nobody else.
  if (entry.copy && entry.copy !== scope.principal.key) return false;
  const paths = entry.paths ?? (entry.path ? [{ project: entry.project, path: entry.path }] : []);
  const action = restoreAction(entry, scope);
  if (!paths.length) {
    return scope.authorize(action, { type: 'project', project: entry.project }).allow;
  }
  return paths.every(file => scope.view().canRead(file.project, file.path) && scope.authorize(action, { type: 'file', project: file.project, path: file.path }).allow);
}
