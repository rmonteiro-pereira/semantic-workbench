// Moves a project into a folder of its repository, or to another folder, as an explicit step the
// person previews and confirms first. A project that lives in the root of its own repository
// moves its files under the folder in a recorded commit, so history is never rewritten. A
// project that already lives in a folder of a sparse checkout changes which folder is checked out.
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestError, MissingFolderError, NotFoundError } from './errors';
import { GitError, type Git } from './git';
import type { Journal } from './journal';
import { assertNoLinks, locationOf, repoDir, type DataLayout } from './paths';
import type { Reader } from './reader';
import { pathInRepo } from './repository-projects';
import { BlockedError, blockers } from './scm';
import { folderExistsAt, limitToFolders, repositoryFolder, sparseFolders } from './sparse-folder';
import type { ProjectEntry } from './state';

/** How many of the moved files a preview lists; the count always covers them all. */
export const PREVIEW_LIMIT = 50;

/** One file as it is now and where it will be. */
export type FileMove = { from: string; to: string };

/** What confirming would do, for the person to read first. */
export type FolderPreview = {
  /**
   * `none`: the project already lives there. `move`: its files move under the folder. `finish`:
   * an earlier move put the files there but stopped before recording it. `change`: another
   * folder of a sparse checkout is checked out.
   */
  kind: 'none' | 'move' | 'finish' | 'change';
  /** The folder the project lives in now; empty when it fills its repository. */
  current: string;
  folder: string;
  moves: FileMove[];
  moveCount: number;
  /** For `change`: whether the checked-out branch already has the folder. */
  existsOnBranch: boolean;
  /** Why confirming is refused right now, such as unsaved edits or uncommitted changes. */
  blocked?: { reason: BlockedError['reason']; paths: string[] };
};

/** Workspace services the folder change needs. */
export type ProjectFolderDeps = {
  layout: DataLayout;
  git: Git;
  journal: Journal;
  projects: () => ProjectEntry[];
  lock: <Result>(key: string, fn: () => Promise<Result> | Result) => Promise<Result>;
  /** The lock that file saves of a project take, so a move never meets a save half way. */
  projectLockKey: (slug: string) => string;
  registrySteps: (stateStaging: string, next: ProjectEntry[]) => { from: string; to: string }[];
  drafts: (slug: string) => string[];
  /** Rescans the project and tells open tabs, after its folder changed. */
  refreshed: (slug: string) => Promise<void>;
};

/** The pure part of a preview: where each of a project's files will be under the folder. */
export function plannedMoves(files: string[], folder: string): FileMove[] {
  return files.map(from => ({ from, to: `${folder}/${from}` }));
}

/** Message of the commit that records the move. */
export const moveMessage = (folder: string) => `Move the project into ${folder}`;

// Moving a project works on the person's own checkout; server mode makes the per-person working
// copies by cloning the folder instead.
function assertLocalMode(reader: Reader) {
  if (reader.view !== undefined || reader.copy !== undefined)
    throw new NotFoundError(
      'Choosing a folder for an existing project works in local mode. Clone the folder instead.',
    );
}

/** Creates the preview and apply steps for a project's folder in its repository. */
export function createProjectFolders(deps: ProjectFolderDeps) {
  const { layout, git } = deps;

  function entryOf(slug: string) {
    const entry = deps.projects().find(project => project.slug === slug);
    if (!entry) throw new NotFoundError('Project not found.');
    return entry;
  }

  // The registry with this project living in the folder of its repository.
  function withFolder(entry: ProjectEntry, folder: string) {
    const { repo } = locationOf(entry);
    return deps
      .projects()
      .map(project =>
        project.slug === entry.slug ? { ...project, folder: `${repo}/${folder}`, repo } : project,
      );
  }

  async function situation(slug: string) {
    const entry = entryOf(slug);
    const dir = repoDir(layout, slug);
    const { repo } = locationOf(entry);
    const checkedOut = await sparseFolders(git, dir);
    const current = pathInRepo(entry, repo);
    const siblings = deps.projects().filter(project => locationOf(project).repo === repo);
    return { entry, dir, repo, checkedOut, current, siblings: siblings.map(it => it.slug) };
  }
  type Place = Awaited<ReturnType<typeof situation>>;

  // Unsaved edits and uncommitted changes block, and so do untracked files of the folder being
  // left, which a sparse checkout would leave on disk outside every project.
  async function blockedBy(slug: string, place: Place, leaving: string) {
    const { entries } = await git.status(place.dir);
    const blocked = blockers(deps.drafts(slug), entries);
    if (blocked) return { reason: blocked.reason, paths: blocked.paths };
    const left = entries
      .filter(entry => entry.untracked && leaving !== '' && entry.path.startsWith(leaving + '/'))
      .map(entry => entry.path);
    return left.length ? { reason: 'dirty' as const, paths: left } : undefined;
  }

  async function preview(slug: string, requested: unknown, reader: Reader): Promise<FolderPreview> {
    assertLocalMode(reader);
    const folder = repositoryFolder(requested);
    if (!folder) throw new BadRequestError('Give the folder of the repository.');
    const place = await situation(slug);
    if (place.siblings.length > 1)
      throw new BadRequestError(
        'This project shares its repository with other projects. Clone the folder instead.',
      );
    if (place.checkedOut.length) return previewChange(slug, place, folder);
    if (place.current === folder) return previewFinish(slug, place, folder);
    if (place.current)
      throw new BadRequestError('This project already lives in a folder of its repository.');
    const moves = plannedMoves(await git.lsFiles(place.dir), folder);
    const blocked = await blockedBy(slug, place, '');
    return {
      kind: 'move',
      current: '',
      folder,
      moves: moves.slice(0, PREVIEW_LIMIT),
      moveCount: moves.length,
      existsOnBranch: false,
      ...(blocked ? { blocked } : {}),
    };
  }

  // The files are in the folder and the registry says so, but the move was never recorded and the
  // checkout never limited to the folder.
  async function previewFinish(slug: string, place: Place, folder: string): Promise<FolderPreview> {
    const recorded = await folderExistsAt(git, place.dir, 'HEAD', folder);
    return {
      kind: recorded ? 'none' : 'finish',
      current: folder,
      folder,
      moves: [],
      moveCount: 0,
      existsOnBranch: recorded,
      ...(deps.drafts(slug).length
        ? { blocked: { reason: 'drafts' as const, paths: deps.drafts(slug) } }
        : {}),
    };
  }

  async function previewChange(slug: string, place: Place, folder: string): Promise<FolderPreview> {
    const repaired = place.current === folder && place.checkedOut.join() === folder;
    const blocked = await blockedBy(slug, place, repaired ? '' : place.current);
    return {
      kind: repaired ? 'none' : 'change',
      current: place.current,
      folder,
      moves: [],
      moveCount: 0,
      existsOnBranch: await folderExistsAt(git, place.dir, 'HEAD', folder),
      ...(blocked ? { blocked } : {}),
    };
  }

  // The entries of the repository folder that move under the folder, never Git's own data.
  const movableEntries = (dir: string) => readdirSync(dir).filter(name => name !== '.git');

  // Everything goes into a staging folder shaped like the result, then its first level takes its
  // place, so a folder named like an existing top-level entry works and a rollback puts every
  // file back where it was.
  async function moveFiles(place: Place, folder: string) {
    if (!(await git.identity(place.dir)))
      throw new GitError('Set your Git identity first: the move is recorded in a commit.');
    const op = deps.journal.newId();
    const staging = join(place.dir, `.move-${op}`);
    const stateStaging = join(layout.state, `.staging-${op}`);
    const top = folder.split('/')[0];
    const entries = movableEntries(place.dir);
    // A project without files still gets its folder.
    if (!entries.length) mkdirSync(join(staging, folder), { recursive: true });
    const steps = [
      ...entries.map(name => ({ from: join(place.dir, name), to: join(staging, folder, name) })),
      { from: join(staging, top), to: join(place.dir, top) },
      ...deps.registrySteps(stateStaging, withFolder(place.entry, folder)),
    ];
    deps.journal.run('project-folder', steps, [staging, stateStaging], op);
    await finishMove(place.dir, folder);
  }

  // Records a move whose files are already in the folder: the old paths are deleted and the new
  // ones untracked. Only the paths Git tracked are staged, then the checkout is limited to the
  // folder. Running it again after a stop in the middle does the rest.
  async function finishMove(dir: string, folder: string) {
    const { entries } = await git.status(dir);
    const tracked = entries
      .filter(entry => !entry.untracked && (entry.index === 'D' || entry.worktree === 'D'))
      .map(entry => entry.path)
      .filter(path => !path.startsWith(folder + '/'));
    if (tracked.length) {
      await git.stage(dir, tracked);
      await git.stage(
        dir,
        tracked.map(path => `${folder}/${path}`),
      );
    }
    // A stop after staging and before the commit leaves the move staged, which counts too.
    const staged = (await git.status(dir)).entries.some(
      entry => !entry.untracked && entry.index !== '.',
    );
    if (staged) await git.commit(dir, moveMessage(folder));
    await limitToFolders(git, dir, [folder]);
  }

  // The registry follows first, so a stop before the checkout moves leaves a state that running
  // the change again repairs.
  async function changeFolder(place: Place, folder: string, create: boolean) {
    const exists = await folderExistsAt(git, place.dir, 'HEAD', folder);
    if (!exists && !create) throw new MissingFolderError(folder, 'the current branch');
    const op = deps.journal.newId();
    const stateStaging = join(layout.state, `.staging-${op}`);
    const steps = deps.registrySteps(stateStaging, withFolder(place.entry, folder));
    deps.journal.run('project-folder', steps, [stateStaging], op);
    await limitToFolders(git, place.dir, [folder]);
    if (!exists) {
      assertNoLinks(place.dir, folder);
      mkdirSync(join(place.dir, folder), { recursive: true });
    }
  }

  // Runs the action while no save, move or other registry change of the repository's projects
  // can interleave: the projects' locks in sorted order, then the registry's.
  async function exclusively<Result>(slugs: string[], action: () => Promise<Result>) {
    const keys = slugs.map(deps.projectLockKey).sort();
    const nest = (index: number): Promise<Result> =>
      index === keys.length
        ? Promise.resolve(deps.lock('registry', action))
        : Promise.resolve(deps.lock(keys[index], () => nest(index + 1)));
    return nest(0);
  }

  /** Applies a previewed change. Refused while unsaved edits or uncommitted changes exist. */
  async function apply(
    slug: string,
    requested: unknown,
    options: { createFolder?: boolean },
    reader: Reader,
  ) {
    assertLocalMode(reader);
    const folder = repositoryFolder(requested);
    return exclusively([slug], async () => {
      const shown = await preview(slug, folder, reader);
      if (shown.kind === 'none') return shown;
      if (shown.blocked) throw new BlockedError(shown.blocked.reason, shown.blocked.paths);
      const place = await situation(slug);
      if (shown.kind === 'move') await moveFiles(place, shown.folder);
      else if (shown.kind === 'finish') await finishMove(place.dir, shown.folder);
      else await changeFolder(place, shown.folder, options.createFolder === true);
      await deps.refreshed(slug);
      return shown;
    });
  }

  return { preview, apply };
}

/** Previews and applies a project's folder in its repository. */
export type ProjectFolders = ReturnType<typeof createProjectFolders>;
