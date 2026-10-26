// Decides which folders of a Git repository become projects. A repository can declare them in a
// `.semantic-workbench.json` manifest at its root; otherwise the folders that hold definitions
// are proposed and the user confirms them. These functions only read text and path lists.
import { posix } from 'node:path';
import { PathError, projectPath } from './paths';
import { MANIFEST_FILE, serializationOf } from './scanner';

/** The manifest file at a repository root that declares its project folders. */
export { MANIFEST_FILE };
/** The manifest's schema identifier. */
export const MANIFEST_SCHEMA = 'semantic-workbench/repository/v1';
/** How deep detection looks for project folders below the repository root. */
export const DETECTION_DEPTH = 4;

/** One project folder of a repository: a path relative to its root ('' for the root itself). */
export type RepositoryProject = { path: string; name?: string };
/** A folder detection proposes, with the number of definition files it holds. */
export type DetectedFolder = { path: string; files: number };

/** A manifest that is not valid JSON or does not follow the manifest schema. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

const isAncestor = (folder: string, path: string) =>
  folder === '' || path === folder || path.startsWith(folder + '/');

/** Checks a list of project folders: valid relative paths, none under .git, none inside another,
 * names of 1–200 characters. Returns the list with normalized paths. */
export function checkProjectFolders(projects: unknown): RepositoryProject[] {
  if (!Array.isArray(projects) || !projects.length || projects.length > 200)
    throw new PathError('List 1–200 project folders.');
  const checked = projects.map(project => {
    if (!project || typeof project !== 'object' || Array.isArray(project))
      throw new PathError('Each project is {path, name?}.');
    const { path, name, ...rest } = project as Record<string, unknown>;
    if (Object.keys(rest).length) throw new PathError('Each project is {path, name?}.');
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200))
      throw new PathError('A project name has 1–200 characters.');
    const folder = path === '' ? '' : projectPath(path);
    return name === undefined ? { path: folder } : { path: folder, name: name.trim() };
  });
  for (const [i, outer] of checked.entries())
    for (const [j, inner] of checked.entries())
      if (i !== j && isAncestor(outer.path, inner.path))
        throw new PathError(
          outer.path === inner.path
            ? `The folder ${outer.path || '(root)'} is listed twice.`
            : `Project folders must not nest: ${inner.path} is inside ${outer.path || 'the root'}.`,
        );
  return checked;
}

/** Reads a manifest's text. Throws a ManifestError or PathError that says what is wrong. */
export function parseManifest(text: string): RepositoryProject[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ManifestError(`${MANIFEST_FILE} is not valid JSON.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new ManifestError(`${MANIFEST_FILE} must be an object.`);
  const { schema, projects, ...rest } = data as Record<string, unknown>;
  if (schema !== MANIFEST_SCHEMA)
    throw new ManifestError(`${MANIFEST_FILE} needs "schema": "${MANIFEST_SCHEMA}".`);
  if (Object.keys(rest).length)
    throw new ManifestError(`${MANIFEST_FILE} may hold only "schema" and "projects".`);
  return checkProjectFolders(projects).map(project => {
    if (project.path === '') throw new PathError('A manifest lists folders below the root.');
    return project;
  });
}

/** Proposes project folders from the repository's file list (paths relative to its root, with
 * ignored files already left out). Each folder holding definitions is a candidate, cut to the
 * detection depth; a candidate inside another is dropped, so the set is the smallest one that
 * covers every definition file. */
export function detectProjectFolders(files: string[], depth = DETECTION_DEPTH): DetectedFolder[] {
  const definitions = files.filter(path => {
    const parts = path.split('/');
    if (parts.some(part => part === '.git')) return false;
    const kind = serializationOf(path);
    return kind !== 'unsupported' && kind !== 'gitignore';
  });
  const folderOf = (path: string) => posix.dirname(path).split('/').slice(0, depth).join('/');
  const folders = [
    ...new Set(definitions.map(path => (folderOf(path) === '.' ? '' : folderOf(path)))),
  ];
  const outermost = folders
    .filter(folder => !folders.some(other => other !== folder && isAncestor(other, folder)))
    .sort();
  return outermost.map(folder => ({
    path: folder,
    files: definitions.filter(path => isAncestor(folder, path)).length,
  }));
}
