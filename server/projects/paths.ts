// Resolves workspace locations and validates project paths. DATA_DIR allows tests to use isolated
// workspaces.
import { lstatSync } from 'node:fs';
import { resolve, sep, join, posix } from 'node:path';
/** Project and repository folders relative to the workspace projects directory. */
export type ProjectLocation = { folder: string; repo: string };
/** Workspace paths and an optional registry lookup for project locations. */
export type DataLayout = {
  root: string;
  projects: string;
  state: string;
  views: string;
  drafts: string;
  journal: string;
  trash: string;
  backup: string;
  cache: string;
  legacyDb: string;
  registry: string;
  legacyIds: string;
  locate?: (slug: string) => ProjectLocation | undefined;
};
/** Resolves storage paths from a root, defaulting to DATA_DIR or the data directory. */
export function dataLayout(
  root = process.env.DATA_DIR || 'data',
  cacheDir: string | null = process.env.SW_CACHE_DIR || null,
): DataLayout {
  const r = resolve(root);
  const state = join(r, 'state');
  return {
    root: r,
    projects: join(r, 'projects'),
    state,
    views: join(state, 'views'),
    drafts: join(state, 'drafts'),
    journal: join(state, 'journal'),
    trash: join(r, 'trash'),
    backup: join(r, 'backup'),
    cache: join(cacheDir ? resolve(cacheDir) : r, 'cache.sqlite'),
    legacyDb: join(r, 'workbench.sqlite'),
    registry: join(state, 'projects.json'),
    legacyIds: join(state, 'legacy-ids.json'),
  };
}
/** Signals an invalid project name, identifier, or unsafe filesystem path. */
export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathError';
  }
}
/** Allowed syntax for a project identifier used in paths and URLs. */
export const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** Validates and returns a project identifier, throwing for invalid input. */
export function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new PathError('Invalid project id.');
  return slug;
}
/** Validates a relative POSIX path, rejecting traversal, absolute paths, and Git metadata. */
export function projectPath(path: unknown): string {
  // Control characters are rejected on purpose: they never belong in a path.
  // oxlint-disable-next-line no-control-regex
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\x00-\x1f\\]/.test(path))
    throw new PathError('Invalid file path.');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path))
    throw new PathError('Absolute paths are not allowed.');
  const parts = path.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..'))
    throw new PathError('Paths may not contain empty, "." or ".." segments.');
  if (parts.some(p => p.toLowerCase() === '.git'))
    throw new PathError('Paths under .git are not allowed.');
  return posix.normalize(path);
}
/** Resolves registry folders, ensuring the project lies within its repository. */
export function locationOf(entry: {
  slug: string;
  folder?: string;
  repo?: string;
}): ProjectLocation {
  assertSlug(entry.slug);
  if (entry.folder === undefined && entry.repo === undefined)
    return { folder: entry.slug, repo: entry.slug };
  const folder = projectPath(entry.folder ?? entry.repo);
  const repo = projectPath(entry.repo ?? folder);
  if (folder !== repo && !folder.startsWith(repo + '/'))
    throw new PathError('A project folder must be its repository folder or lie inside it.');
  return { folder, repo };
}
const located = (layout: DataLayout, slug: string) =>
  layout.locate?.(assertSlug(slug)) ?? { folder: slug, repo: slug };
/** Returns the project folder using the registry or the slug as a fallback. */
export function projectDir(layout: DataLayout, slug: string) {
  return join(layout.projects, located(layout, slug).folder);
}
/** Returns the repository working directory in which the project’s Git commands run. */
export function repoDir(layout: DataLayout, slug: string) {
  return join(layout.projects, located(layout, slug).repo);
}
// Project paths gain this prefix on the way into Git and lose it on the way out.
/** Returns the project’s repository-relative prefix, empty at the repository root. */
export function projectPrefix(layout: DataLayout, slug: string) {
  const { folder, repo } = located(layout, slug);
  return folder === repo ? '' : folder.slice(repo.length + 1) + '/';
}
// A symlink in any existing path segment could escape the project, including links pulled by Git.
// Both reads and writes must use this validation.
/** Returns a contained absolute file path, rejecting existing symlink segments. */
export function projectFile(layout: DataLayout, slug: string, path: string) {
  const dir = projectDir(layout, slug);
  const rel = projectPath(path);
  const file = resolve(dir, rel);
  if (!file.startsWith(dir + sep)) throw new PathError('Path escapes the project folder.');
  assertNoLinks(dir, rel);
  return file;
}
/** Rejects symlinks in existing segments of a path beneath the supplied directory. */
export function assertNoLinks(dir: string, rel: string) {
  let at = dir;
  for (const part of rel.split('/')) {
    at = join(at, part);
    let link = false;
    try {
      link = lstatSync(at).isSymbolicLink();
    } catch {
      return;
    }
    if (link) throw new PathError('Symbolic links are not followed.');
  }
}
/** Trims and validates a display name, excluding an optional current name from conflicts. */
export function projectName(name: unknown, existing: string[] = [], except?: string): string {
  if (typeof name !== 'string') throw new PathError('Project name must be text.');
  const value = name.trim();
  // Control characters are rejected on purpose: they never belong in a name.
  // oxlint-disable-next-line no-control-regex
  if (!value || value.length > 200 || /[\x00-\x1f]/.test(value))
    throw new PathError('Use a project name of 1–200 characters.');
  if (existing.some(n => n !== except && n.toLocaleLowerCase() === value.toLocaleLowerCase()))
    throw new PathError(`A project named "${value}" already exists.`);
  return value;
}
/** Creates an available project identifier by normalizing the name and adding a suffix. */
export function slugify(name: string, taken: Set<string>) {
  const base = (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'project'
  ).replace(/-+$/, '');
  let slug = base;
  let i = 2;
  while (taken.has(slug)) slug = `${base}-${i++}`;
  return assertSlug(slug);
}
/** Adds a numeric suffix until the display name is unique, ignoring case. */
export function uniqueName(name: string, existing: string[]) {
  const lower = new Set(existing.map(n => n.toLocaleLowerCase()));
  let value = name;
  let i = 2;
  while (lower.has(value.toLocaleLowerCase())) value = `${name} (${i++})`;
  return value;
}
/** Adds a numeric suffix before the extension until the file path is available. */
export function disambiguate(path: string, taken: Set<string>) {
  if (!taken.has(path)) return path;
  const slash = path.lastIndexOf('/') + 1;
  const base = path.slice(slash);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = path.slice(0, slash) + `${stem} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
