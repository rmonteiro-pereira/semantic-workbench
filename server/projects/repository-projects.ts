// Registers the project folders of one Git repository. Several projects can share a repository
// (`domains/sales`, `domains/finance`); each has its own folder, and all share the repository's
// Git history. The rules for which folders qualify live in repositories.ts.
import type { EventTags } from './events';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { atomicWrite, decode, sha256 } from './atomic';
import { BadRequestError, StaleError, NotFoundError } from './errors';
import type { Git } from './git';
import {
  PathError,
  assertNoLinks,
  assertSlug,
  locationOf,
  slugify,
  uniqueName,
  type DataLayout,
} from './paths';
import {
  MANIFEST_FILE,
  MANIFEST_SCHEMA,
  checkProjectFolders,
  detectProjectFolders,
  parseManifest,
  type RepositoryProject,
} from './repositories';
import type { ProjectEntry, createState } from './state';
import { LOCAL_READER, type Reader } from './reader';

/** Workspace services the repository projects need. */
export type RepositoryProjectDeps = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  state: ReturnType<typeof createState>;
  projects: () => ProjectEntry[];
  lock: <Result>(key: string, fn: () => Promise<Result> | Result) => Promise<Result>;
  added: (slugs: string[]) => Promise<void>;
  removed: (slugs: string[]) => void;
  emit: (event: string, data: unknown, tags: EventTags) => void;
  /** Adds the principals who may hear of each tagged project, decided before it is removed. */
  withCurrentReaders: (event: string, tags: EventTags) => EventTags;
  /**
   * Server mode: the folder of the repository a person reads the manifest from or, with
   * `write`, writes it into (their own working copy). Absent: the repository's own folder.
   */
  manifestFolder?: (repo: string, reader: Reader, write: boolean) => Promise<string>;
  /** Server mode: after the manifest was written into a person's copy, such as to commit it. */
  manifestSaved?: (dir: string, reader: Reader) => Promise<void>;
};

/** What a repository offers as projects: its manifest, detected folders and registered ones. */
export type ProjectCandidates = {
  manifest: { projects: RepositoryProject[] } | null;
  manifestError?: string;
  manifestHash: string | null;
  detected: { path: string; files: number }[];
  registered: { slug: string; name: string; path: string }[];
};

function readManifestFile(dir: string) {
  const file = join(dir, MANIFEST_FILE);
  if (!existsSync(file)) return { text: null, hash: null };
  assertNoLinks(dir, MANIFEST_FILE);
  const bytes = readFileSync(file);
  return { text: decode(bytes), hash: sha256(bytes) };
}

// Writes the manifest only when the file on disk is still the version the user saw.
function saveManifest(dir: string, projects: RepositoryProject[], baseHash: unknown) {
  const { text, hash } = readManifestFile(dir);
  if ((baseHash ?? null) !== hash) throw new StaleError(hash, text);
  const content = { schema: MANIFEST_SCHEMA, projects };
  atomicWrite(join(dir, MANIFEST_FILE), JSON.stringify(content, null, 2) + '\n');
}

function checkFolderExists(dir: string, path: string) {
  if (!path) return;
  assertNoLinks(dir, path);
  const folder = join(dir, path);
  if (!existsSync(folder) || !lstatSync(folder).isDirectory())
    throw new PathError(`The folder ${path} does not exist in this repository.`);
}

// Decides the repository's projects after the user's choice: a folder that already has a
// project keeps it (renamed when a name is given); a new folder gets a new project with a free
// name and slug; a project whose folder is not chosen is removed from the workspace.
function planProjects(
  repo: string,
  folders: RepositoryProject[],
  current: ProjectEntry[],
  before: ProjectEntry[],
) {
  const kept = new Map(before.map(project => [pathInRepo(project, repo), project]));
  const names = current.filter(project => !before.includes(project)).map(project => project.name);
  const taken = new Set(current.map(project => project.slug));
  const chosen: ProjectEntry[] = folders.map(folder => {
    const existing = kept.get(folder.path);
    if (existing) return folder.name ? { ...existing, name: folder.name } : existing;
    const name = uniqueName(folder.name ?? (posix.basename(folder.path) || repo), names);
    names.push(name);
    const slug = slugify(name, taken);
    taken.add(slug);
    return {
      slug,
      name,
      createdAt: new Date().toISOString(),
      origin: 'repository',
      folder: folder.path ? `${repo}/${folder.path}` : repo,
      repo,
    };
  });
  const chosenSlugs = new Set(chosen.map(project => project.slug));
  const removed = before.filter(project => !chosenSlugs.has(project.slug));
  const added = chosen.filter(project => !before.some(old => old.slug === project.slug));
  return { chosen, added, removed };
}

// The project's folder relative to its repository root ('' for the root itself).
export function pathInRepo(project: ProjectEntry, repo: string) {
  const folder = locationOf(project).folder;
  return folder === repo ? '' : folder.slice(repo.length + 1);
}

/** Creates the service that lists and registers a repository's project folders. */
export function createRepositoryProjects(deps: RepositoryProjectDeps) {
  const { layout, state } = deps;
  const repoPath = (repo: string) => join(layout.projects, assertSlug(repo));
  const inRepo = (repo: string, projects = deps.projects()) =>
    projects.filter(project => locationOf(project).repo === repo);

  function checkRepository(repo: string) {
    if (!deps.gitAvailable) throw new BadRequestError('Git is not available on this machine.');
    if (!inRepo(assertSlug(repo)).length) throw new NotFoundError('Repository not found.');
    if (!existsSync(join(repoPath(repo), '.git'))) throw new NotFoundError('Not a Git repository.');
    return repoPath(repo);
  }

  // Where a person reads or writes the manifest: their own copy in server mode, else the
  // repository folder itself.
  async function manifestDir(repo: string, reader: Reader, write: boolean) {
    const dir = checkRepository(repo);
    return deps.manifestFolder ? deps.manifestFolder(repo, reader, write) : dir;
  }

  async function candidates(repo: string, reader: Reader = LOCAL_READER) {
    const dir = checkRepository(repo);
    const { text, hash } = readManifestFile(await manifestDir(repo, reader, false));
    let manifest: ProjectCandidates['manifest'] = null;
    let manifestError: string | undefined;
    if (text !== null)
      try {
        manifest = { projects: parseManifest(text) };
      } catch (e) {
        manifestError = (e as Error).message;
      }
    const found: ProjectCandidates = {
      manifest,
      ...(manifestError ? { manifestError } : {}),
      manifestHash: hash,
      detected: detectProjectFolders(await deps.git.lsFiles(dir)),
      registered: inRepo(repo).map(project => ({
        slug: project.slug,
        name: project.name,
        path: pathInRepo(project, repo),
      })),
    };
    return found;
  }

  /** Makes exactly these folders the repository's projects. Folders already registered keep
   * their project; projects whose folder is left out are removed from the workspace, and no file
   * is deleted. */
  async function register(
    repo: string,
    requested: unknown,
    options: { saveManifest?: boolean; manifestBaseHash?: unknown } = {},
    reader: Reader = LOCAL_READER,
  ) {
    const dir = checkRepository(repo);
    const folders = checkProjectFolders(requested);
    for (const folder of folders) checkFolderExists(dir, folder.path);
    if (options.saveManifest && folders.some(folder => folder.path === ''))
      throw new PathError('A manifest lists folders below the root.');
    // In server mode the manifest is a change like any other: it goes into the person's copy,
    // committed there, and reaches the published state when they publish.
    const target = options.saveManifest ? await manifestDir(repo, reader, true) : dir;
    return deps.lock('registry', async () => {
      if (options.saveManifest) {
        saveManifest(target, folders, options.manifestBaseHash);
        if (target !== dir) await deps.manifestSaved?.(target, reader);
      }
      const current = deps.projects();
      const before = inRepo(repo, current);
      const { chosen, added, removed } = planProjects(repo, folders, current, before);
      const next = [...current.filter(project => !before.includes(project)), ...chosen];
      const removedSlugs = removed.map(project => project.slug);
      // Added projects are judged on delivery; removed ones only before they leave the registry.
      const { readers } = deps.withCurrentReaders('projects', { projects: removedSlugs });
      forget(next, removedSlugs);
      await deps.added(added.map(project => project.slug));
      deps.emit(
        'projects',
        {
          added: added.map(project => project.slug),
          removed: removedSlugs,
          renamed: [],
        },
        { projects: [...added, ...removed].map(project => project.slug), readers },
      );
      return {
        projects: chosen.map(project => ({
          slug: project.slug,
          name: project.name,
          folder: locationOf(project).folder,
        })),
      };
    });
  }

  // Takes projects out of the workspace in the registry, with the watcher, index and event.
  function forget(next: ProjectEntry[], slugs: string[]) {
    state.writeRegistry(next);
    deps.removed(slugs);
  }

  /** Takes a subfolder project out of the workspace; its folder, history and drafts stay. Only a
   * project that shares its repository with another can be removed, so no repository is left
   * on disk without a project that shows it. */
  function remove(slug: string) {
    return deps.lock('registry', () => {
      const current = deps.projects();
      const project = current.find(entry => entry.slug === assertSlug(slug));
      if (!project) throw new NotFoundError('Project not found.');
      const { repo } = locationOf(project);
      if (inRepo(repo, current).length < 2)
        throw new PathError(
          'This is the only project of its repository. Delete it instead, or choose its folders in Projects in this repository….',
        );
      const tags = deps.withCurrentReaders('projects', { projects: [slug] });
      forget(
        current.filter(entry => entry !== project),
        [slug],
      );
      deps.emit('projects', { added: [], removed: [slug], renamed: [] }, tags);
      return { removed: slug };
    });
  }

  /** After a clone: registers the projects a manifest declares, or proposes folders. A manifest
   * that cannot be applied is reported and the repository stays one project. */
  async function adoptClone(repo: string) {
    const found = await candidates(repo);
    if (!found.manifest)
      return {
        candidates: found.detected,
        ...(found.manifestError ? { manifestError: found.manifestError } : {}),
      };
    try {
      const registered = await register(repo, found.manifest.projects);
      return {
        manifest: found.manifest,
        projects: registered.projects.map(project => project.slug),
      };
    } catch (e) {
      return { candidates: found.detected, manifestError: (e as Error).message };
    }
  }

  return { candidates, register, remove, adoptClone };
}
