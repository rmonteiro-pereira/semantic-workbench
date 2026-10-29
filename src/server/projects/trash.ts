// Moves deleted files and project folders into journaled trash without rewriting Git history.
// Restoration refuses occupied paths and suggests a free alternative.
import { archivePersonalState, clearPersonalDrafts, restorePersonalState } from './personal-state';
import type { EventTags } from './events';
import type { Reader } from './reader';
import { projectLockKey } from './working-copies';
import type { ContentGuard, FileChange } from '../auth/guards';
import type { AccessScope } from '../auth/authorize';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWrite, atomicWriteJson, decode, readJsonFile, sha256 } from './atomic';
import { BadRequestError, GoneError, NotFoundError, OccupiedError, StaleError } from './errors';
import { JournalCrash, type Journal } from './journal';
import { assertSlug, disambiguate, locationOf, projectDir, projectFile, projectPath, slugify, uniqueName, type DataLayout } from './paths';
import type { ProjectEntry, State } from './state';
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
  // Undo and restore re-create content, so a guard judges them as creating it.
  async function restore(id: string, target: { toProject?: string; toPath?: string }, undo: boolean, reader: Reader) {
    const { view, guard } = reader;
    const { e: trashEntry, dir } = read(id);
    // Only its owner restores an entry from a working copy, and only while that copy exists.
    if (trashEntry.copy && reader.copy?.key !== trashEntry.copy) throw new NotFoundError('Trash entry not found.');
    if (undo && now() > Date.parse(trashEntry.undoUntil)) throw new GoneError('The undo window has passed. Restore the item from the trash instead.');
    if (trashEntry.kind === 'file') {
      const slug = target.toProject !== undefined ? assertSlug(target.toProject) : trashEntry.project;
      const path = projectPath(target.toPath ?? trashEntry.path!);
      if (view && !view.canRead(slug, path)) {
        throw new OccupiedError('The target is unavailable.', {});
      }
      const payload = join(dir, 'payload', posix.basename(trashEntry.path!));
      const created = {
        project: slug,
        path,
        before: null,
        after: documentText(readFileSync(payload)),
      };
      guard?.([created], { operation: 'restore' });
      if (!ctx.projects().some(p => p.slug === slug)) {
        if (target.toProject !== undefined) throw new NotFoundError('Project not found.');
        // The original project is gone: restore into a new project with the original name.
        const project = await ctx.createProject(trashEntry.projectName, 'restore', [{ path, source: decode(readFileSync(payload)) }]);
        const personalSteps = restorePersonalState(
          state,
          {
            project: trashEntry.project,
            path: trashEntry.path,
            target: project.slug,
            targetPath: path,
          },
          join(dir, 'personal'),
        );
        journal.run('restore', personalSteps, [dir]);
        emitEntry(trashEntry);
        return { kind: 'file', project: project.slug, path };
      }
      // A file deleted from the published state, as local mode does, comes back into the person's
      // own copy in server mode: only publishing may change the published checkout.
      const copy = trashEntry.copy ?? (await ctx.writeCopy?.(reader, slug)) ?? null;
      const files = filesOf(copy);
      if (copy && !existsSync(projectDir(files, slug))) throw new NotFoundError('The working copy this file came from no longer exists.');
      return lock(projectLockKey(slug, copy), async () => {
        const dest = projectFile(files, slug, path);
        if (existsSync(dest)) {
          const taken = new Set(readdirRecursive(projectDir(files, slug)));
          throw new OccupiedError(`${path} already exists in this project; nothing was overwritten.`, { toProject: slug, toPath: disambiguate(path, taken) });
        }
        const steps = [{ from: payload, to: dest }];
        if (existsSync(join(dir, 'draft.json')) && !existsSync(state.draftFile(slug, path))) steps.push({ from: join(dir, 'draft.json'), to: state.draftFile(slug, path) });
        steps.push(...restorePersonalState(state, { project: trashEntry.project, path: trashEntry.path, target: slug, targetPath: path }, join(dir, 'personal')));
        journal.run('restore', steps, [dir]);
        if (trashEntry.view !== undefined) state.writeView(slug, { ...state.view(slug).files, [path]: trashEntry.view });
        await ctx.afterFiles(slug, copy);
        emitEntry(trashEntry);
        return { kind: 'file', project: slug, path };
      });
    }
    if (guard) guard(payloadChanges(trashEntry, dir), { operation: 'restore' });
    if (trashEntry.kind === 'subproject') return restoreSubproject(id, trashEntry, dir);
    if (trashEntry.kind === 'repository') return restoreRepository(id, trashEntry, dir);
    return lock('registry', async () => {
      const current = ctx.projects();
      const slug = target.toProject !== undefined ? assertSlug(target.toProject) : trashEntry.project;
      if (current.some(p => p.slug === slug) || existsSync(projectDir(layout, slug))) {
        const taken = new Set([...current.map(p => p.slug), ...safeReaddir(layout.projects)]);
        throw new OccupiedError(`A project "${slug}" already exists; nothing was overwritten.`, {
          toProject: slugify(trashEntry.projectName, taken),
        });
      }
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const name = uniqueName(
        trashEntry.projectName,
        current.map(p => p.name),
      );
      const steps = [{ from: join(dir, 'payload', trashEntry.project), to: projectDir(layout, slug) }];
      steps.push(...restorePersonalState(state, { project: trashEntry.project, target: slug }, join(dir, 'personal')));
      if (existsSync(join(dir, 'view.json')) && !existsSync(state.viewFile(slug))) steps.push({ from: join(dir, 'view.json'), to: state.viewFile(slug) });
      if (existsSync(join(dir, 'drafts')) && !existsSync(state.draftDir(slug))) steps.push({ from: join(dir, 'drafts'), to: state.draftDir(slug) });
      steps.push(
        ...ctx.registrySteps(stateStaging, [
          ...current,
          {
            slug,
            name,
            ...withoutLocation(trashEntry.registry),
            createdAt: trashEntry.registry?.createdAt ?? trashEntry.deletedAt,
            origin: trashEntry.registry?.origin ?? 'restore',
          },
        ]),
      );
      try {
        journal.run('restore', steps, [dir, stateStaging], opId);
      } catch (err) {
        rmSync(stateStaging, { recursive: true, force: true });
        throw err;
      }
      // Drafts carry their project id; rewrite them when the project comes back under a new id.
      if (slug !== trashEntry.project)
        for (const draft of state.drafts().filter(d => d.project === trashEntry.project && existsSync(state.draftFile(slug, d.path))))
          state.writeDraft(slug, draft.path, {
            baseHash: draft.baseHash,
            text: draft.text,
            patches: draft.patches,
          });
      await ctx.adoptProject(slug);
      ctx.emit('projects', { added: [slug], removed: [], renamed: [] }, { projects: [slug] });
      emitEntry(trashEntry);
      return { kind: 'project', project: slug, name };
    });
  }
  // A subproject goes back into its folder of the same repository, if both are still free and
  // present; nothing is overwritten.
  function restoreSubproject(id: string, trashEntry: TrashEntry, dir: string) {
    return lock('registry', async () => {
      const current = ctx.projects();
      const { folder, repo } = locationOf({ slug: trashEntry.project, ...trashEntry.registry });
      if (!existsSync(join(layout.projects, repo, '.git'))) throw new NotFoundError(`The repository ${repo} is no longer in the workspace.`);
      if (current.some(p => p.slug === trashEntry.project) || existsSync(join(layout.projects, folder))) throw new OccupiedError(`${folder} is in use; nothing was overwritten.`, {});
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const name = uniqueName(
        trashEntry.projectName,
        current.map(p => p.name),
      );
      const restored: ProjectEntry = { ...trashEntry.registry!, slug: trashEntry.project, name };
      const steps = [
        { from: join(dir, 'payload', trashEntry.project), to: join(layout.projects, folder) },
        ...stateSteps(dir, trashEntry.project, join(dir, 'view.json'), join(dir, 'drafts')),
        ...ctx.registrySteps(stateStaging, [...current, restored]),
      ];
      runRestore(steps, [dir, stateStaging], opId, stateStaging);
      await ctx.adoptProject(trashEntry.project);
      ctx.emit('projects', { added: [trashEntry.project], removed: [], renamed: [] }, { projects: [trashEntry.project] });
      emitEntry(trashEntry);
      return { kind: 'subproject', project: trashEntry.project, name };
    });
  }
  // A cleared repository comes back whole, with every project it held.
  function restoreRepository(id: string, trashEntry: TrashEntry, dir: string) {
    return lock('registry', async () => {
      const current = ctx.projects();
      const repo = assertSlug(trashEntry.repo!);
      const members = trashEntry.projects ?? [];
      if (existsSync(join(layout.projects, repo))) throw new OccupiedError(`A folder named ${repo} already exists; nothing was overwritten.`, {});
      if (members.some(member => current.some(p => p.slug === member.slug))) throw new OccupiedError('A project of this repository is already in the workspace.', {});
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const names = current.map(p => p.name);
      const restored = members.map(member => {
        const name = uniqueName(member.name, names);
        names.push(name);
        return { ...member, name };
      });
      const steps = [
        { from: join(dir, 'payload', repo), to: join(layout.projects, repo) },
        ...members.flatMap(member => stateSteps(dir, member.slug, join(dir, 'views', member.slug + '.json'), join(dir, 'drafts', member.slug))),
        ...ctx.registrySteps(stateStaging, [...current, ...restored]),
      ];
      runRestore(steps, [dir, stateStaging], opId, stateStaging);
      for (const member of restored) await ctx.adoptProject(member.slug);
      ctx.emit('projects', { added: restored.map(p => p.slug), removed: [], renamed: [] }, { projects: restored.map(p => p.slug) });
      emitEntry(trashEntry);
      return { kind: 'repository', project: restored[0]?.slug, name: repo };
    });
  }
  // Moves saved view settings and drafts back when the workspace has none for the project.
  function stateSteps(dir: string, slug: string, view: string, drafts: string) {
    const steps = restorePersonalState(state, { project: slug, target: slug }, join(dir, 'personal'));
    if (existsSync(view) && !existsSync(state.viewFile(slug))) steps.push({ from: view, to: state.viewFile(slug) });
    if (existsSync(drafts) && !existsSync(state.draftDir(slug))) steps.push({ from: drafts, to: state.draftDir(slug) });
    return steps;
  }
  function runRestore(steps: { from: string; to: string }[], cleanup: string[], opId: string, stateStaging: string) {
    try {
      journal.run('restore', steps, cleanup, opId);
    } catch (err) {
      rmSync(stateStaging, { recursive: true, force: true });
      throw err;
    }
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
// A whole project comes back into the folder named by its slug, whatever folder it had, so its
// entry must not keep the old folder and repository.
function withoutLocation(registry: TrashEntry['registry']) {
  if (!registry) return {};
  const { folder: _folder, repo: _repo, ...rest } = registry;
  return rest;
}
function safeReaddir(dir: string) {
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
function documentText(bytes: Uint8Array): string | null {
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

function readdirRecursive(dir: string, prefix = ''): string[] {
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
