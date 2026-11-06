// Moves deleted files and project folders into journaled trash without rewriting Git history.
// Restoration refuses occupied paths and suggests a free alternative.
import { archivePersonalState, clearPersonalDrafts } from './personal-state';
import type { EventTags } from './events';
import type { Reader } from './reader';
import { projectLockKey } from './working-copies';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWrite, atomicWriteJson, decode, readJsonFile, sha256 } from './atomic';
import { BadRequestError, HiddenResourceError, NotFoundError, StaleError } from './errors';
import type { IndexedFile } from './suggestions';
import type { WorkingCopies } from './working-copies';
import { JournalCrash, type Journal } from './journal';
import { assertSlug, locationOf, projectDir, projectFile, projectPath, type DataLayout } from './paths';
import type { ProjectEntry, State } from './state';
import { createTrashRestore } from './trash-restore';
import { guardDeletion, guardRevert, readdirRecursive, safeReaddir } from './trash-access';
export { guardDeletion, guardRevert, payloadChanges, readableTrash, restoreAction, type GuardedFile } from './trash-access';
/** Time window for immediate undo after deletion. */
export const UNDO_MS = 10_000;
/** Metadata needed to restore a deleted file or project and its associated state. */
export type TrashEntry = {
  paths?: { project: string; path: string }[];
  formatVersion: 1;
  entryId: string;
  // A subproject is a project folder inside a shared repository; a repository entry holds a whole
  // repository with several projects, moved once when the workspace is cleared.
  kind: 'file' | 'project' | 'subproject' | 'repository';
  project: string;
  projectName: string;
  path?: string;
  deletedAt: string;
  // The person who deleted it; absent for local mode and entries written before attribution.
  deletedBy?: string;
  // The working copy a file was deleted from in server mode; absent for the published state.
  copy?: string;
  // Each person's work on a deleted project that was never published, kept as a patch.
  unpublished?: UnpublishedWork[];
  hash?: string;
  undoUntil: string;
  batchId: string | null;
  view?: unknown;
  registry?: Omit<ProjectEntry, 'slug' | 'name'>;
  repo?: string;
  projects?: ProjectEntry[];
};
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Creates a time-sortable identifier from a 48-bit timestamp and 80 random bits. */
export function ulid(now = Date.now()) {
  let time = '';
  let remaining = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}
/**
 * What a deletion takes out of people's working copies: a whole repository (`folder` empty), or
 * one subproject folder inside it, and the projects it holds.
 */
export type CopyRemoval = { repo: string; folder: string; projects: string[] };
/** One person's unpublished work on a deleted project, kept in its trash entry. */
export type UnpublishedWork = { userKey: string; name: string; patch: string; drafts: number };
/** Workspace services and optional clock used by journaled trash operations. */
export type TrashContext = {
  layout: DataLayout;
  /** Where a person's working copy keeps its files; absent where there are no copies. */
  copyLayout?: (copy: string) => DataLayout;
  state: State;
  journal: Journal;
  lock: <T>(key: string, fn: () => Promise<T> | T) => Promise<T>;
  projects: () => ProjectEntry[];
  registrySteps: (stateStaging: string, next: ProjectEntry[]) => { from: string; to: string }[];
  afterFiles: (slug: string, copy: string | null) => Promise<unknown>;
  /**
   * The key of the copy a person's change goes to, made on first use; null where they have none
   * (local mode, agent clients), which means the published state.
   */
  writeCopy?: (reader: Reader, slug: string) => Promise<string | null>;
  /**
   * Before a deletion leaves the workspace: stores each person's unpublished work on what goes
   * in the entry folder. Absent in local mode tests.
   */
  archiveCopies?: (removed: CopyRemoval, entryDir: string) => Promise<UnpublishedWork[]>;
  /** After the deletion is in the trash: removes what went from people's working copies. */
  removeCopies?: (entryDir: string) => void;
  forgetProject: (slug: string) => void;
  adoptProject: (slug: string) => Promise<void>;
  createProject: (name: string, origin: string, files: { path: string; source: string }[]) => Promise<ProjectEntry>;
  emit: (event: string, data: unknown, tags: EventTags) => void;
  /** Adds the principals who may hear of each tagged project, decided before it is removed. */
  withCurrentReaders: (event: string, tags: EventTags) => EventTags;
  now?: () => number;
};
type DeletionUnit = { kind: 'project' | 'subproject'; project: ProjectEntry } | { kind: 'repository'; repo: string; projects: ProjectEntry[] };

const isSubproject = (project: ProjectEntry) => {
  const { folder, repo } = locationOf(project);
  return folder !== repo;
};

// What one deletion moves. A subproject moves alone while another project of its repository
// stays; when every project of a repository goes (Clear, or deleting its last project), the
// repository folder, with its Git history, moves once, so no repository is left without a project.
function deletionUnits(deleted: ProjectEntry[], all: ProjectEntry[]): DeletionUnit[] {
  const units: DeletionUnit[] = [];
  const repositories = new Map<string, ProjectEntry[]>();
  for (const project of deleted) {
    if (!isSubproject(project)) units.push({ kind: 'project', project });
    else {
      const repo = locationOf(project).repo;
      repositories.set(repo, [...(repositories.get(repo) ?? []), project]);
    }
  }
  for (const [repo, members] of repositories) {
    const leaving = new Set(members.map(project => project.slug));
    const staying = all.filter(project => locationOf(project).repo === repo && !leaving.has(project.slug));
    if (staying.length) for (const project of members) units.push({ kind: 'subproject', project });
    else units.push({ kind: 'repository', repo, projects: members });
  }
  return units;
}
/** Creates deletion and restoration operations that preserve recoverable content and state. */
export function createTrash(ctx: TrashContext) {
  const { layout, state, journal, lock } = ctx;
  // The published files, or one person's working copy of them.
  function filesOf(copy: string | null) {
    if (!copy) return layout;
    if (!ctx.copyLayout) throw new BadRequestError('This workspace has no working copies.');
    return ctx.copyLayout(copy);
  }
  const now = ctx.now ?? Date.now;
  function entryTags(entry: TrashEntry): EventTags {
    // An entry from a person's working copy concerns their unpublished work alone.
    const copy = entry.copy ? { copy: entry.copy } : {};
    if (entry.deletedBy) {
      return { owner: entry.deletedBy, projects: [entry.project], paths: entry.paths, ...copy };
    }
    return {
      projects: [entry.project],
      paths: entry.path ? [{ project: entry.project, path: entry.path }] : undefined,
    };
  }
  function emitEntry(entry: TrashEntry, undoUntil?: string, tags = entryTags(entry)) {
    ctx.emit('trash', { entries: [entry.entryId], ...(undoUntil ? { undoUntil } : {}) }, tags);
  }
  const dirOf = (id: string) => {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new NotFoundError('Trash entry not found.');
    return join(layout.trash, id);
  };
  const read = (id: string) => {
    const dir = dirOf(id);
    const trashEntry = readJsonFile<TrashEntry>(join(dir, 'entry.json'));
    if (!trashEntry || !existsSync(join(dir, 'payload'))) throw new NotFoundError('Trash entry not found.');
    return { e: trashEntry, dir };
  };
  const registryEntry = (slug: string) => {
    const projectEntry = ctx.projects().find(p => p.slug === slug);
    if (!projectEntry) throw new NotFoundError('Project not found.');
    return projectEntry;
  };
  const newEntry = (fields: Omit<TrashEntry, 'formatVersion' | 'entryId' | 'deletedAt' | 'undoUntil'>, at: number): TrashEntry => ({
    formatVersion: 1,
    entryId: ulid(at),
    deletedAt: new Date(at).toISOString(),
    undoUntil: new Date(at + UNDO_MS).toISOString(),
    ...fields,
  });
  // A guard, given in server mode, refuses deleting a file that holds an approved metric or a
  // protected property for someone who may not change them.
  async function deleteFile(slug: string, path: string, deletedBy: string | undefined, { guard }: Reader, copy: string | null = null) {
    const relativePath = projectPath(path);
    const project = registryEntry(assertSlug(slug));
    return lock(projectLockKey(slug, copy), async () => {
      const file = projectFile(filesOf(copy), slug, relativePath);
      let bytes: Uint8Array;
      try {
        bytes = readFileSync(file);
      } catch {
        throw new NotFoundError('File not found.');
      }
      guardDeletion(filesOf(copy), slug, relativePath, guard);
      const view = state.view(slug).files[relativePath];
      const trashEntry = newEntry(
        {
          kind: 'file',
          ...(deletedBy ? { deletedBy, paths: [{ project: slug, path: relativePath }] } : {}),
          ...(copy ? { copy } : {}),
          project: slug,
          projectName: project.name,
          path: relativePath,
          hash: sha256(bytes),
          batchId: null,
          ...(view !== undefined ? { view } : {}),
        },
        now(),
      );
      const dir = dirOf(trashEntry.entryId);
      atomicWriteJson(join(dir, 'entry.json'), trashEntry);
      const steps = [{ from: file, to: join(dir, 'payload', posix.basename(relativePath)) }];
      if (existsSync(state.draftFile(slug, relativePath))) steps.push({ from: state.draftFile(slug, relativePath), to: join(dir, 'draft.json') });
      steps.push(...archivePersonalState(state, slug, relativePath, join(dir, 'personal')));
      try {
        journal.run('delete', steps);
      } catch (err) {
        rmSync(dir, { recursive: true, force: true });
        throw err;
      }
      if (view !== undefined) {
        const files = { ...state.view(slug).files };
        delete files[relativePath];
        state.writeView(slug, files);
      }
      await ctx.afterFiles(slug, copy);
      emitEntry(trashEntry, trashEntry.undoUntil);
      return { entryId: trashEntry.entryId, undoUntil: trashEntry.undoUntil };
    });
  }
  // Check the base hash before journaling the current file into trash and committed bytes into
  // place. A file absent from the last commit goes to trash without a replacement.
  async function revertFile(slug: string, path: string, baseHash: string | null, committed: Uint8Array | null, { owner: deletedBy, guard }: Reader, copy: string | null = null) {
    const relativePath = projectPath(path);
    const project = registryEntry(assertSlug(slug));
    const files = filesOf(copy);
    return lock(projectLockKey(slug, copy), async () => {
      const file = projectFile(files, slug, relativePath);
      let current: Uint8Array | null = null;
      try {
        current = readFileSync(file);
      } catch {}
      const currentHash = current ? sha256(current) : null;
      if (baseHash !== currentHash) throw new StaleError(currentHash, current ? decode(current) : null);
      if (!current && !committed) throw new NotFoundError('The file is neither on disk nor in the last commit.');
      guardRevert(files, { slug, path: relativePath }, committed, guard);
      const at = now();
      const opId = journal.newId();
      const staging = join(files.projects, `.staging-${opId}`);
      const steps: { from: string; to: string }[] = [];
      let entry: TrashEntry | null = null;
      let entryDir = '';
      try {
        if (current) {
          const view = state.view(slug).files[relativePath];
          entry = newEntry(
            {
              kind: 'file',
              ...(deletedBy ? { deletedBy, paths: [{ project: slug, path: relativePath }] } : {}),
              ...(copy ? { copy } : {}),
              project: slug,
              projectName: project.name,
              path: relativePath,
              hash: currentHash!,
              batchId: null,
              ...(view !== undefined ? { view } : {}),
            },
            at,
          );
          entryDir = dirOf(entry.entryId);
          atomicWriteJson(join(entryDir, 'entry.json'), entry);
          steps.push({ from: file, to: join(entryDir, 'payload', posix.basename(relativePath)) });
        }
        if (committed) {
          const staged = join(staging, 'head');
          atomicWrite(staged, committed);
          steps.push({ from: staged, to: file });
        }
        steps.push(...clearPersonalDrafts(state, slug, [relativePath], staging, copy ?? undefined));
        journal.run('revert', steps, [staging], opId);
      } catch (err) {
        if (err instanceof JournalCrash) throw err;
        rmSync(staging, { recursive: true, force: true });
        if (entryDir) rmSync(entryDir, { recursive: true, force: true });
        throw err;
      }
      await ctx.afterFiles(slug, copy);
      if (entry) emitEntry(entry, entry.undoUntil);
      return { hash: committed ? sha256(committed) : null, trashEntry: entry?.entryId ?? null };
    });
  }
  // Projects (and Clear) are removed together with their registry entries in one journal.
  // Deleting a subproject moves only its folder; the shared repository then shows the deletion
  // as uncommitted changes. Clear moves a repository that holds subprojects once, as a whole.
  async function deleteProjects(slugs: string[], batchId: string | null, deletedBy?: string) {
    return lock('registry', async () => {
      const current = ctx.projects();
      for (const slug of slugs) registryEntry(slug);
      const at = now();
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const entries: TrashEntry[] = [];
      const steps: { from: string; to: string }[] = [];
      const archived: string[] = [];
      let removal: { projects: EventTags; entries: EventTags[] } | undefined;
      try {
        for (const unit of deletionUnits(slugs.map(registryEntry), current)) {
          const fields = unitEntry(unit, batchId);
          const members = unit.kind === 'repository' ? unit.projects : [unit.project];
          const paths = deletedBy
            ? members.flatMap(project =>
                readdirRecursive(projectDir(layout, project.slug))
                  .filter(path => !path.startsWith('.git/'))
                  .map(path => ({ project: project.slug, path })),
              )
            : [];
          const trashEntry = newEntry({ ...fields, ...(deletedBy ? { deletedBy, paths } : {}) }, at);
          const dir = dirOf(trashEntry.entryId);
          entries.push(trashEntry);
          // Each person's unpublished work is kept with the entry before their copies go.
          const unpublished = (await ctx.archiveCopies?.(copyRemoval(unit), dir)) ?? [];
          if (unpublished.length) trashEntry.unpublished = unpublished;
          archived.push(dir);
          atomicWriteJson(join(dir, 'entry.json'), trashEntry);
          steps.push(...unitSteps(unit, dir));
          for (const member of members) {
            steps.push(...archivePersonalState(state, member.slug, undefined, join(dir, 'personal')));
          }
        }
        steps.push(
          ...ctx.registrySteps(
            stateStaging,
            current.filter(p => !slugs.includes(p.slug)),
          ),
        );
        removal = removalTags(slugs, entries);
        for (const slug of slugs) ctx.forgetProject(slug);
        journal.run(batchId ? 'clear' : 'delete', steps, [stateStaging], opId);
      } catch (err) {
        for (const entry of entries) rmSync(dirOf(entry.entryId), { recursive: true, force: true });
        rmSync(stateStaging, { recursive: true, force: true });
        for (const slug of slugs) if (existsSync(projectDir(layout, slug))) await ctx.adoptProject(slug);
        throw err;
      }
      for (const dir of archived) ctx.removeCopies?.(dir);
      const { projects, entries: entryTags } = removal!;
      ctx.emit('projects', { added: [], removed: slugs, renamed: [] }, projects);
      entries.forEach((entry, index) => emitEntry(entry, entry.undoUntil, entryTags[index]));
      return entries;
    });
  }
  // Decided while the projects are still registered: afterwards no grant can name them.
  function removalTags(slugs: string[], entries: TrashEntry[]) {
    return {
      projects: ctx.withCurrentReaders('projects', { projects: slugs }),
      entries: entries.map(entry => ctx.withCurrentReaders('trash', entryTags(entry))),
    };
  }
  // What a unit takes out of people's copies: its whole repository, or a subproject's folder.
  function copyRemoval(unit: DeletionUnit): CopyRemoval {
    if (unit.kind === 'repository') return { repo: unit.repo, folder: '', projects: unit.projects.map(p => p.slug) };
    const { folder, repo } = locationOf(unit.project);
    const inside = folder === repo ? '' : folder.slice(repo.length + 1);
    return { repo, folder: inside, projects: [unit.project.slug] };
  }
  // The trash entry that records one deletion unit, with what its restore needs.
  function unitEntry(unit: DeletionUnit, batchId: string | null) {
    if (unit.kind === 'repository')
      return {
        kind: 'repository' as const,
        project: unit.projects[0].slug,
        projectName: unit.repo,
        repo: unit.repo,
        projects: unit.projects,
        batchId,
      };
    const { slug, name, ...registry } = unit.project;
    return { kind: unit.kind, project: slug, projectName: name, batchId, registry };
  }
  // The renames that move a unit's folder, view settings and drafts into its trash entry.
  function unitSteps(unit: DeletionUnit, dir: string) {
    const steps: { from: string; to: string }[] = [];
    const keepState = (slug: string, viewTo: string, draftsTo: string) => {
      if (existsSync(state.viewFile(slug))) steps.push({ from: state.viewFile(slug), to: viewTo });
      if (existsSync(state.draftDir(slug))) steps.push({ from: state.draftDir(slug), to: draftsTo });
    };
    if (unit.kind === 'repository') {
      steps.push({ from: join(layout.projects, unit.repo), to: join(dir, 'payload', unit.repo) });
      for (const project of unit.projects) keepState(project.slug, join(dir, 'views', project.slug + '.json'), join(dir, 'drafts', project.slug));
      return steps;
    }
    const slug = unit.project.slug;
    steps.push({ from: projectDir(layout, slug), to: join(dir, 'payload', slug) });
    keepState(slug, join(dir, 'view.json'), join(dir, 'drafts'));
    return steps;
  }
  function list() {
    return safeReaddir(layout.trash)
      .flatMap(id => {
        try {
          const { e: trashEntry } = read(id);
          return [trashEntry];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.entryId.localeCompare(a.entryId))
      .map(trashEntry => ({
        ...(trashEntry.deletedBy ? { deletedBy: trashEntry.deletedBy, paths: trashEntry.paths } : {}),
        ...(trashEntry.copy ? { copy: trashEntry.copy } : {}),
        entryId: trashEntry.entryId,
        kind: trashEntry.kind,
        project: trashEntry.project,
        projectName: trashEntry.projectName,
        path: trashEntry.path,
        deletedAt: trashEntry.deletedAt,
        undoUntil: trashEntry.undoUntil,
        batchId: trashEntry.batchId,
        hash: trashEntry.hash,
      }));
  }
  const { restore } = createTrashRestore(ctx, { filesOf, now, read, emitEntry });
  return {
    deleteFile,
    list,
    /** Reads complete entry metadata so routes can authorize every restoration target. */
    entry: (id: string): TrashEntry => read(id).e,
    revertFile,
    deleteProject: async (slug: string, deletedBy?: string) => {
      const [e] = await deleteProjects([assertSlug(slug)], null, deletedBy);
      return { entryId: e.entryId, undoUntil: e.undoUntil };
    },
    /** Moves several projects to the trash in one step, each as its own entry. */
    deleteProjects: async (slugs: string[], deletedBy?: string) => {
      const entries = await deleteProjects(slugs.map(assertSlug), null, deletedBy);
      return entries.map(e => ({ entryId: e.entryId, undoUntil: e.undoUntil }));
    },
    async clear(deletedBy?: string) {
      const slugs = ctx.projects().map(p => p.slug);
      if (!slugs.length) return { batchId: null, entries: [], undoUntil: null };
      const batchId = ulid();
      const entries = await deleteProjects(slugs, batchId, deletedBy);
      return { batchId, entries: entries.map(e => e.entryId), undoUntil: entries[0].undoUntil };
    },
    undo: (id: string, reader: Reader) => restore(id, {}, true, reader),
    restore: (id: string, target: { toProject?: string; toPath?: string }, reader: Reader) => restore(id, target, false, reader),
    purge(id: string) {
      const { dir, e: trashEntry } = read(id);
      rmSync(dir, { recursive: true, force: true });
      emitEntry(trashEntry);
    },
    purgeAll() {
      const ids = list().map(e => e.entryId);
      for (const id of ids) rmSync(dirOf(id), { recursive: true, force: true });
      ctx.emit('trash', { entries: [] }, { audience: 'all' });
      return ids.length;
    },
  };
}
/** The workspace services a delete preview reads; the composition root supplies them. */
export type DeleteImpactDeps = {
  entry: (slug: string) => ProjectEntry;
  projects: () => ProjectEntry[];
  state: State;
  copies: Pick<WorkingCopies, 'readPlace'>;
  /** Every indexed definition file with its facts, unrestricted by any reader. */
  indexedFiles: () => IndexedFile[];
};
// Warn about unsaved drafts and references that would no longer resolve after deletion.
export function deleteImpact(deps: DeleteImpactDeps, slug: string, path: string | undefined, reader: Reader) {
  const { entry, projects, state, copies, indexedFiles } = deps;
  const { view, owner } = reader;
  entry(slug);
  const relativePath = path === undefined ? undefined : projectPath(path);
  if (view && relativePath && !view.canRead(slug, relativePath)) throw new HiddenResourceError();
  const place = copies.readPlace(reader, slug);
  if (relativePath !== undefined && !place.cache.file(slug, relativePath)) throw new NotFoundError('File not found.');
  const removed = (f: { project: string; path: string }) => f.project === slug && (relativePath === undefined || f.path === relativePath);
  // References resolve inside a project, so another project's files never keep one alive.
  const all = indexedFiles().filter(f => f.project === slug);
  const gone = all.filter(removed);
  const kept = all.filter(f => !removed(f));
  const brokenReferences: {
    from: { project: string; path: string };
    to: { project: string; path: string };
    kind: string;
    name: string;
  }[] = [];
  for (const keptFile of kept)
    for (const ref of keptFile.facts.refs) {
      const targets = gone.filter(g => g.facts.names.includes(ref));
      if (targets.length && !kept.some(o => o !== keptFile && o.facts.names.includes(ref)))
        for (const target of targets)
          brokenReferences.push({
            from: { project: keptFile.project, path: keptFile.path },
            to: { project: target.project, path: target.path },
            kind: 'ossie-ref-name',
            name: ref,
          });
    }
  // A subfolder project shares its repository; deleting it leaves the siblings in place.
  const location = locationOf(entry(slug));
  const sharedWith = projects()
    .filter(project => project.slug !== slug && locationOf(project).repo === location.repo)
    .map(project => project.slug);
  return {
    subproject: location.folder !== location.repo,
    repo: location.repo,
    sharedWith: sharedWith.filter(project => !view || view.readableProjects.has(project)),
    removes:
      relativePath === undefined
        ? {
            project: slug,
            name: entry(slug).name,
            files: place.cache
              .files(slug)
              .filter(f => !view || view.canRead(slug, f.path))
              .map(f => f.path),
          }
        : { project: slug, files: [relativePath] },
    unsavedDrafts: (owner ? state.forOwner(owner) : state)
      .drafts()
      .filter(removed)
      .filter(d => !view || view.canRead(d.project, d.path))
      .map(d => ({ project: d.project, path: d.path })),
    brokenReferences: brokenReferences.filter(ref => !view || (view.canRead(ref.from.project, ref.from.path) && view.canRead(ref.to.project, ref.to.path))),
    ...(view
      ? {
          hiddenReferences: brokenReferences.filter(ref => view.readableProjects.has(ref.from.project) && !view.canRead(ref.from.project, ref.from.path)).length,
        }
      : {}),
  };
}

/** The trash service returned by `createTrash`. */
export type Trash = ReturnType<typeof createTrash>;
