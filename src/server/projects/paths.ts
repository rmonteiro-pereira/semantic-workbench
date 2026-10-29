// Resolves workspace locations and validates project paths. DATA_DIR allows tests to use isolated
// workspaces.
import { lstatSync, readdirSync } from 'node:fs';
import { resolve, sep, join, posix } from 'node:path';
/** Project and repository folders relative to the workspace projects directory. */
export type ProjectLocation = { folder: string; repo: string };
/** Workspace paths and an optional registry lookup for project locations. */
export type DataLayout = {
  root: string;
  projects: string;
  /** Per-person Git working copies in server mode: `worktrees/<userKey>/<repo>/`. */
  worktrees: string;
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
export function dataLayout(root = process.env.DATA_DIR || 'data', cacheDir: string | null = process.env.SW_CACHE_DIR || null): DataLayout {
  const rootDir = resolve(root);
  const state = join(rootDir, 'state');
  return {
    root: rootDir,
    projects: join(rootDir, 'projects'),
    worktrees: join(rootDir, 'worktrees'),
    state,
    views: join(state, 'views'),
    drafts: join(state, 'drafts'),
    journal: join(state, 'journal'),
    trash: join(rootDir, 'trash'),
    backup: join(rootDir, 'backup'),
    cache: join(cacheDir ? resolve(cacheDir) : rootDir, 'cache.sqlite'),
    legacyDb: join(rootDir, 'workbench.sqlite'),
    registry: join(state, 'projects.json'),
    legacyIds: join(state, 'legacy-ids.json'),
  };
}
/** A person's working-copy folder name: `u` and 20 hex digits, so it holds no personal data. */
export const USER_KEY = /^u[0-9a-f]{20}$/;
/**
 * The layout one person's working copies are read and written through. Their repositories sit
 * under `worktrees/<userKey>/` exactly as the published ones sit under `projects/`, so every
 * project path helper below resolves inside the copy without knowing about copies.
 */
export function copyLayout(layout: DataLayout, userKey: string): DataLayout {
  if (!USER_KEY.test(userKey)) throw new PathError('Invalid working copy id.');
  return { ...layout, projects: join(layout.worktrees, userKey) };
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
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\x00-\x1f\\]/.test(path)) throw new PathError('Invalid file path.');
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) throw new PathError('Absolute paths are not allowed.');
  const parts = path.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..')) throw new PathError('Paths may not contain empty, "." or ".." segments.');
  if (parts.some(p => p.toLowerCase() === '.git')) throw new PathError('Paths under .git are not allowed.');
  return posix.normalize(path);
}
/** Resolves registry folders, ensuring the project lies within its repository. */
export function locationOf(entry: { slug: string; folder?: string; repo?: string }): ProjectLocation {
  assertSlug(entry.slug);
  if (entry.folder === undefined && entry.repo === undefined) return { folder: entry.slug, repo: entry.slug };
  const folder = projectPath(entry.folder ?? entry.repo);
  const repo = projectPath(entry.repo ?? folder);
  if (folder !== repo && !folder.startsWith(repo + '/')) throw new PathError('A project folder must be its repository folder or lie inside it.');
  return { folder, repo };
}
const located = (layout: DataLayout, slug: string) => layout.locate?.(assertSlug(slug)) ?? { folder: slug, repo: slug };
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
function containedFile(layout: DataLayout, slug: string, path: string) {
  const dir = projectDir(layout, slug);
  const rel = projectPath(path);
  const file = resolve(dir, rel);
  if (!file.startsWith(dir + sep)) throw new PathError('Path escapes the project folder.');
  assertNoLinks(dir, rel);
  return { dir, rel, file };
}

/**
 * Returns a contained absolute file path for a path a person named, rejecting existing symlink
 * segments and any spelling of an existing name in another letter case.
 */
export function projectFile(layout: DataLayout, slug: string, path: string) {
  const { dir, rel, file } = containedFile(layout, slug, path);
  assertExactCase(dir, rel);
  return file;
}

/**
 * Like projectFile for a path that the scanner kept in the index. The scanner has already refused
 * every path whose spelling differs from the disk's, so the listing of every folder along the way
 * is not read again for each file of a project.
 */
export function indexedFile(layout: DataLayout, slug: string, path: string) {
  return containedFile(layout, slug, path).file;
}

/** Lists the names in a directory; tests pass a fake to stand in for another kind of volume. */
export type DirectoryLister = (directory: string) => string[];

/** A path whose letter case differs from the name on disk, or from a sibling it would alias. */
export class CaseVariantError extends PathError {
  constructor() {
    super('That name differs only in letter case from an existing one.');
    this.name = 'CaseVariantError';
  }
}

const isMissing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');

const foldCase = (name: string) => name.normalize('NFC').toLowerCase();

/**
 * Refuses a path that spells an existing name in another letter case, and a new name that differs
 * from a sibling only in case. A case-insensitive volume, such as Azure Files over SMB, opens
 * `SECRET/plan.yaml` as `secret/plan.yaml`, so a rule written for `secret/**` would not see it.
 */
export function assertExactCase(directory: string, rel: string, list: DirectoryLister = readdirSync): void {
  let at = directory;
  for (const part of rel.split('/')) {
    let names: string[];
    try {
      names = list(at);
    } catch (error) {
      // Nothing exists below a missing directory, so nothing there can collide.
      if (isMissing(error)) return;
      throw error;
    }
    if (!names.includes(part)) {
      if (names.some(name => foldCase(name) === foldCase(part))) throw new CaseVariantError();
      return;
    }
    at = join(at, part);
  }
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
  if (!value || value.length > 200 || /[\x00-\x1f]/.test(value)) throw new PathError('Use a project name of 1–200 characters.');
  if (existing.some(n => n !== except && n.toLocaleLowerCase() === value.toLocaleLowerCase())) throw new PathError(`A project named "${value}" already exists.`);
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
