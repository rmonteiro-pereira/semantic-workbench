import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWrite, atomicWriteJson, decode, readJsonFile, sha256 } from './atomic';
import { GoneError, NotFoundError, OccupiedError, StaleError } from './errors';
import { JournalCrash, type Journal } from './journal';
import {
  assertSlug,
  disambiguate,
  projectDir,
  projectFile,
  projectPath,
  slugify,
  uniqueName,
  type DataLayout,
} from './paths';
import type { ProjectEntry, State } from './state';
// Delete, undo, restore, purge and Clear (FR-021–FR-026, FR-086–FR-088). Deleting moves the file or
// the whole project folder (with .git) to data/trash/<entryId>/payload/ in one journaled
// operation; Git history is never rewritten. Restores never overwrite: a taken location is a 409
// with a free alternative.
export const UNDO_MS = 10_000;
export type TrashEntry = {
  formatVersion: 1;
  entryId: string;
  kind: 'file' | 'project';
  project: string;
  projectName: string;
  path?: string;
  deletedAt: string;
  hash?: string;
  undoUntil: string;
  batchId: string | null;
  view?: unknown;
  registry?: Omit<ProjectEntry, 'slug' | 'name'>;
};
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// ULID: 48-bit time and 80 random bits in Crockford base32, sortable by creation time.
export function ulid(now = Date.now()) {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}
export type TrashContext = {
  layout: DataLayout;
  state: State;
  journal: Journal;
  lock: <T>(key: string, fn: () => Promise<T> | T) => Promise<T>;
  projects: () => ProjectEntry[];
  registrySteps: (stateStaging: string, next: ProjectEntry[]) => { from: string; to: string }[];
  afterFiles: (slug: string) => Promise<unknown>;
  forgetProject: (slug: string) => void;
  adoptProject: (slug: string) => Promise<void>;
  createProject: (
    name: string,
    origin: string,
    files: { path: string; source: string }[],
  ) => Promise<ProjectEntry>;
  emit: (event: string, data: unknown) => void;
  now?: () => number;
};
export function createTrash(ctx: TrashContext) {
  const { layout, state, journal, lock } = ctx;
  const now = ctx.now ?? Date.now;
  const dirOf = (id: string) => {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new NotFoundError('Trash entry not found.');
    return join(layout.trash, id);
  };
  const read = (id: string) => {
    const dir = dirOf(id);
    const e = readJsonFile<TrashEntry>(join(dir, 'entry.json'));
    if (!e || !existsSync(join(dir, 'payload'))) throw new NotFoundError('Trash entry not found.');
    return { e, dir };
  };
  const registryEntry = (slug: string) => {
    const p = ctx.projects().find(p => p.slug === slug);
    if (!p) throw new NotFoundError('Project not found.');
    return p;
  };
  const newEntry = (
    fields: Omit<TrashEntry, 'formatVersion' | 'entryId' | 'deletedAt' | 'undoUntil'>,
    at: number,
  ): TrashEntry => ({
    formatVersion: 1,
    entryId: ulid(at),
    deletedAt: new Date(at).toISOString(),
    undoUntil: new Date(at + UNDO_MS).toISOString(),
    ...fields,
  });
  async function deleteFile(slug: string, path: string) {
    const p = projectPath(path);
    const project = registryEntry(assertSlug(slug));
    return lock('project:' + slug, async () => {
      const file = projectFile(layout, slug, p);
      let bytes: Uint8Array;
      try {
        bytes = readFileSync(file);
      } catch {
        throw new NotFoundError('File not found.');
      }
      const view = state.view(slug).files[p];
      const e = newEntry(
        {
          kind: 'file',
          project: slug,
          projectName: project.name,
          path: p,
          hash: sha256(bytes),
          batchId: null,
          ...(view !== undefined ? { view } : {}),
        },
        now(),
      );
      const dir = dirOf(e.entryId);
      atomicWriteJson(join(dir, 'entry.json'), e);
      const steps = [{ from: file, to: join(dir, 'payload', posix.basename(p)) }];
      if (existsSync(state.draftFile(slug, p)))
        steps.push({ from: state.draftFile(slug, p), to: join(dir, 'draft.json') });
      try {
        journal.run('delete', steps);
      } catch (err) {
        rmSync(dir, { recursive: true, force: true });
        throw err;
      }
      if (view !== undefined) {
        const files = { ...state.view(slug).files };
        delete files[p];
        state.writeView(slug, files);
      }
      await ctx.afterFiles(slug);
      ctx.emit('trash', { entries: [e.entryId], undoUntil: e.undoUntil });
      return { entryId: e.entryId, undoUntil: e.undoUntil };
    });
  }
  // Revert to last commit (FR-046, research R7): one journaled operation. The base hash is checked,
  // the committed bytes are staged, then the current file moves into a new trash entry and the
  // staged bytes move into its place. A file absent from the last commit just goes to the trash.
  async function revertFile(
    slug: string,
    path: string,
    baseHash: string | null,
    committed: Uint8Array | null,
  ) {
    const p = projectPath(path);
    const project = registryEntry(assertSlug(slug));
    return lock('project:' + slug, async () => {
      const file = projectFile(layout, slug, p);
      let current: Uint8Array | null = null;
      try {
        current = readFileSync(file);
      } catch {}
      const currentHash = current ? sha256(current) : null;
      if (baseHash !== currentHash)
        throw new StaleError(currentHash, current ? decode(current) : null);
      if (!current && !committed)
        throw new NotFoundError('The file is neither on disk nor in the last commit.');
      const at = now();
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      const steps: { from: string; to: string }[] = [];
      let entry: TrashEntry | null = null;
      let entryDir = '';
      try {
        if (current) {
          const view = state.view(slug).files[p];
          entry = newEntry(
            {
              kind: 'file',
              project: slug,
              projectName: project.name,
              path: p,
              hash: currentHash!,
              batchId: null,
              ...(view !== undefined ? { view } : {}),
            },
            at,
          );
          entryDir = dirOf(entry.entryId);
          atomicWriteJson(join(entryDir, 'entry.json'), entry);
          steps.push({ from: file, to: join(entryDir, 'payload', posix.basename(p)) });
        }
        if (committed) {
          const staged = join(staging, 'head');
          atomicWrite(staged, committed);
          steps.push({ from: staged, to: file });
        }
        journal.run('revert', steps, [staging], opId);
      } catch (err) {
        if (err instanceof JournalCrash) throw err;
        rmSync(staging, { recursive: true, force: true });
        if (entryDir) rmSync(entryDir, { recursive: true, force: true });
        throw err;
      }
      state.deleteDraft(slug, p);
      await ctx.afterFiles(slug);
      if (entry) ctx.emit('trash', { entries: [entry.entryId], undoUntil: entry.undoUntil });
      return { hash: committed ? sha256(committed) : null, trashEntry: entry?.entryId ?? null };
    });
  }
  // Projects (and Clear) are removed together with their registry entries in one journal.
  async function deleteProjects(slugs: string[], batchId: string | null) {
    return lock('registry', async () => {
      const current = ctx.projects();
      for (const slug of slugs) registryEntry(slug);
      const at = now();
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const entries: TrashEntry[] = [];
      const steps: { from: string; to: string }[] = [];
      try {
        for (const slug of slugs) {
          const p = registryEntry(slug);
          const e = newEntry(
            {
              kind: 'project',
              project: slug,
              projectName: p.name,
              batchId,
              registry: { createdAt: p.createdAt, origin: p.origin },
            },
            at,
          );
          const dir = dirOf(e.entryId);
          atomicWriteJson(join(dir, 'entry.json'), e);
          entries.push(e);
          steps.push({ from: projectDir(layout, slug), to: join(dir, 'payload', slug) });
          if (existsSync(state.viewFile(slug)))
            steps.push({ from: state.viewFile(slug), to: join(dir, 'view.json') });
          if (existsSync(state.draftDir(slug)))
            steps.push({ from: state.draftDir(slug), to: join(dir, 'drafts') });
        }
        steps.push(
          ...ctx.registrySteps(
            stateStaging,
            current.filter(p => !slugs.includes(p.slug)),
          ),
        );
        for (const slug of slugs) ctx.forgetProject(slug);
        journal.run(batchId ? 'clear' : 'delete', steps, [stateStaging], opId);
      } catch (err) {
        for (const e of entries) rmSync(dirOf(e.entryId), { recursive: true, force: true });
        rmSync(stateStaging, { recursive: true, force: true });
        for (const slug of slugs)
          if (existsSync(projectDir(layout, slug))) await ctx.adoptProject(slug);
        throw err;
      }
      ctx.emit('projects', { added: [], removed: slugs, renamed: [] });
      ctx.emit('trash', { entries: entries.map(e => e.entryId), undoUntil: entries[0]?.undoUntil });
      return entries;
    });
  }
  async function restore(
    id: string,
    target: { toProject?: string; toPath?: string } = {},
    undo = false,
  ) {
    const { e, dir } = read(id);
    if (undo && now() > Date.parse(e.undoUntil))
      throw new GoneError('The undo window has passed. Restore the item from the trash instead.');
    if (e.kind === 'file') {
      const slug = target.toProject !== undefined ? assertSlug(target.toProject) : e.project;
      const path = projectPath(target.toPath ?? e.path!);
      const payload = join(dir, 'payload', posix.basename(e.path!));
      if (!ctx.projects().some(p => p.slug === slug)) {
        if (target.toProject !== undefined) throw new NotFoundError('Project not found.');
        // The original project is gone: restore into a new project with the original name.
        const project = await ctx.createProject(e.projectName, 'restore', [
          { path, source: decode(readFileSync(payload)) },
        ]);
        rmSync(dir, { recursive: true, force: true });
        ctx.emit('trash', { entries: [id] });
        return { kind: 'file', project: project.slug, path };
      }
      return lock('project:' + slug, async () => {
        const dest = projectFile(layout, slug, path);
        if (existsSync(dest)) {
          const taken = new Set(readdirRecursive(projectDir(layout, slug)));
          throw new OccupiedError(
            `${path} already exists in this project; nothing was overwritten.`,
            { toProject: slug, toPath: disambiguate(path, taken) },
          );
        }
        const steps = [{ from: payload, to: dest }];
        if (existsSync(join(dir, 'draft.json')) && !existsSync(state.draftFile(slug, path)))
          steps.push({ from: join(dir, 'draft.json'), to: state.draftFile(slug, path) });
        journal.run('restore', steps, [dir]);
        if (e.view !== undefined)
          state.writeView(slug, { ...state.view(slug).files, [path]: e.view });
        await ctx.afterFiles(slug);
        ctx.emit('trash', { entries: [id] });
        return { kind: 'file', project: slug, path };
      });
    }
    return lock('registry', async () => {
      const current = ctx.projects();
      const slug = target.toProject !== undefined ? assertSlug(target.toProject) : e.project;
      if (current.some(p => p.slug === slug) || existsSync(projectDir(layout, slug))) {
        const taken = new Set([...current.map(p => p.slug), ...safeReaddir(layout.projects)]);
        throw new OccupiedError(`A project "${slug}" already exists; nothing was overwritten.`, {
          toProject: slugify(e.projectName, taken),
        });
      }
      const opId = journal.newId();
      const stateStaging = join(layout.state, `.staging-${opId}`);
      const name = uniqueName(
        e.projectName,
        current.map(p => p.name),
      );
      const steps = [{ from: join(dir, 'payload', e.project), to: projectDir(layout, slug) }];
      if (existsSync(join(dir, 'view.json')) && !existsSync(state.viewFile(slug)))
        steps.push({ from: join(dir, 'view.json'), to: state.viewFile(slug) });
      if (existsSync(join(dir, 'drafts')) && !existsSync(state.draftDir(slug)))
        steps.push({ from: join(dir, 'drafts'), to: state.draftDir(slug) });
      steps.push(
        ...ctx.registrySteps(stateStaging, [
          ...current,
          {
            slug,
            name,
            createdAt: e.registry?.createdAt ?? e.deletedAt,
            origin: e.registry?.origin ?? 'restore',
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
      if (slug !== e.project)
        for (const d of state
          .drafts()
          .filter(d => d.project === e.project && existsSync(state.draftFile(slug, d.path))))
          state.writeDraft(slug, d.path, {
            baseHash: d.baseHash,
            text: d.text,
            patches: d.patches,
          });
      await ctx.adoptProject(slug);
      ctx.emit('projects', { added: [slug], removed: [], renamed: [] });
      ctx.emit('trash', { entries: [id] });
      return { kind: 'project', project: slug, name };
    });
  }
  function list() {
    return safeReaddir(layout.trash)
      .flatMap(id => {
        try {
          const { e } = read(id);
          return [e];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.entryId.localeCompare(a.entryId))
      .map(e => ({
        entryId: e.entryId,
        kind: e.kind,
        project: e.project,
        projectName: e.projectName,
        path: e.path,
        deletedAt: e.deletedAt,
        undoUntil: e.undoUntil,
        batchId: e.batchId,
        hash: e.hash,
      }));
  }
  return {
    deleteFile,
    list,
    revertFile,
    deleteProject: async (slug: string) => {
      const [e] = await deleteProjects([assertSlug(slug)], null);
      return { entryId: e.entryId, undoUntil: e.undoUntil };
    },
    async clear() {
      const slugs = ctx.projects().map(p => p.slug);
      if (!slugs.length) return { batchId: null, entries: [], undoUntil: null };
      const batchId = ulid();
      const entries = await deleteProjects(slugs, batchId);
      return { batchId, entries: entries.map(e => e.entryId), undoUntil: entries[0].undoUntil };
    },
    undo: (id: string) => restore(id, {}, true),
    restore: (id: string, target: { toProject?: string; toPath?: string } = {}) =>
      restore(id, target, false),
    purge(id: string) {
      const { dir } = read(id);
      rmSync(dir, { recursive: true, force: true });
      ctx.emit('trash', { entries: [id] });
    },
    purgeAll() {
      const ids = list().map(e => e.entryId);
      for (const id of ids) rmSync(dirOf(id), { recursive: true, force: true });
      ctx.emit('trash', { entries: ids });
      return ids.length;
    },
  };
}
function safeReaddir(dir: string) {
  try {
    return readdirSync(dir).filter(n => !n.startsWith('.'));
  } catch {
    return [];
  }
}
function readdirRecursive(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.name === '.git'
      ? []
      : d.isDirectory()
        ? readdirRecursive(join(dir, d.name), prefix + d.name + '/')
        : [prefix + d.name],
  );
}
