// Coordinates project files, durable state, and workspace services. Project folders are the source
// of truth; the SQLite cache can be rebuilt.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { validateInput } from '../../src/input';
import { InputError, MAX_INPUT_BYTES, type Issue } from '../../src/diagnostics';
import { exampleSet } from '../../src/projects/examples';
import { atomicWrite, atomicWriteJson, decode, encode, sha256 } from './atomic';
import { createCache, type Cache } from './cache';
import { createEvents } from './events';
import { createGit, hasControlCharacters } from './git';
import { createJournal, type JournalHooks, type RecoveryOutcome } from './journal';
import {
  dataLayout,
  disambiguate,
  locationOf,
  projectDir,
  projectPrefix,
  repoDir,
  projectFile,
  projectName,
  projectPath,
  slugify,
  uniqueName,
  assertSlug,
  PathError,
  type DataLayout,
} from './paths';
import { createScanner, indexBytes } from './scanner';
import { createState, type ProjectEntry, type Patch } from './state';
import { createWatcher } from './watcher';
import { migrateLegacy, type MigrationReport } from './migration';
import { createTrash } from './trash';
import { createScm } from './scm';
import { createCloner, rollBackInterruptedClones } from './clone';
import { createRepositoryProjects } from './repository-projects';
import { factsOf, inferSuggestions, type FileFacts, type IndexedFile } from './suggestions';
import { ConflictError, OccupiedError } from './errors';
import { StaleError, NotFoundError } from './errors';
export { StaleError, NotFoundError, GoneError, OccupiedError, ConflictError } from './errors';
/** A project-relative path and the source text to import there. */
export type ImportFile = { path: string; source: string };
/** Storage, Git, watching, and test-hook options for opening a workspace. */
export type WorkspaceOptions = {
  root?: string;
  gitBinary?: string;
  watch?: boolean;
  examplesDir?: string;
  rescanMs?: number;
  debounceMs?: number;
  now?: () => number;
  migrationHooks?: Parameters<typeof migrateLegacy>[1];
  journalHooks?: JournalHooks;
};
/** Records an import commit or explains why no commit was created. */
export type ImportCommit =
  | { committed: true; commit: string; message: string }
  | { committed: false; reason: 'no-git' | 'no-identity' | 'merging' | 'nothing' };
/** Builds an import commit message naming the file or count and optional subfolder. */
export function importMessage(paths: string[], subfolder = '') {
  const what = paths.length === 1 ? posix.basename(paths[0]) : `${paths.length} files`;
  return `Import ${what}${subfolder ? ` into ${subfolder}` : ''}`;
}
/** Applies ordered UTF-16 ranges from the end, preserving untouched source text exactly. */
export function applyPatches(base: string, patches: Patch[]) {
  if (!Array.isArray(patches) || patches.length > 10_000) throw Error('Patches must be an array.');
  let end = 0;
  for (const p of patches) {
    if (
      !p ||
      !Number.isSafeInteger(p.from) ||
      !Number.isSafeInteger(p.to) ||
      typeof p.insert !== 'string' ||
      p.from < end ||
      p.to < p.from ||
      p.to > base.length
    )
      throw Error('Patches must be ordered, non-overlapping ranges inside the base text.');
    end = p.to;
  }
  let out = base;
  for (const p of [...patches].reverse()) out = out.slice(0, p.from) + p.insert + out.slice(p.to);
  return out;
}
/** Derives a numeric revision from a content hash for legacy document clients. */
export const revisionOf = (hash: string) => parseInt(hash.slice(0, 12), 16) + 1;
/** Recovers and opens workspace services, scans projects, and optionally starts watchers. */
export async function openWorkspace(options: WorkspaceOptions = {}) {
  const layout: DataLayout = dataLayout(options.root);
  for (const dir of [layout.projects, layout.state, layout.trash, layout.backup])
    mkdirSync(dir, { recursive: true });
  const state = createState(layout);
  const journal = createJournal(layout, options.journalHooks);
  const events = createEvents();
  // Unregistered slugs fall back to folders with the same name; registered projects use the
  // registry.
  layout.locate = slug => {
    const e = state.registry().projects.find(p => p.slug === slug);
    return e ? locationOf(e) : undefined;
  };
  const git = createGit({ projectsRoot: layout.projects, binary: options.gitBinary });
  const gitAvailable = await git.available();
  const identityConfigured = gitAvailable && (await git.identity());
  const recovery: RecoveryOutcome[] = journal.recover();
  recovery.push(...rollBackInterruptedClones(layout));
  const migration: MigrationReport | null = await migrateLegacy(
    { layout, state, journal, git, gitAvailable, identityConfigured },
    options.migrationHooks,
  );
  const cache: Cache = createCache(layout.cache);
  const scanner = createScanner(layout, cache, git, () => gitAvailable);
  const examplesDir = options.examplesDir ?? 'public/examples';
  // One queue for registry changes and one per project for file mutations.
  const locks = new Map<string, Promise<unknown>>();
  function lock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const next = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
    locks.set(key, next);
    next
      .catch(() => {})
      .finally(() => {
        if (locks.get(key) === next) locks.delete(key);
      });
    return next;
  }
  const projects = () => state.registry().projects;
  const entry = (slug: string) => {
    const p = projects().find(p => p.slug === assertSlug(slug));
    if (!p) throw new NotFoundError('Project not found.');
    return p;
  };
  async function rescan(slug: string) {
    const r = await scanner.scan(slug);
    if (r.changed.length || r.removed.length) {
      events.emit('files', r);
      notifySuggestions();
    }
    return r;
  }
  // Replace the registry with two renames inside a journal: current → staging, staged → current.
  function registrySteps(stateStaging: string, next: ProjectEntry[]) {
    atomicWriteJson(join(stateStaging, 'projects.json'), { formatVersion: 1, projects: next });
    return [
      ...(existsSync(layout.registry)
        ? [{ from: layout.registry, to: join(stateStaging, 'projects.previous.json') }]
        : []),
      { from: join(stateStaging, 'projects.json'), to: layout.registry },
    ];
  }
  // Grouping suggestions are derived from file facts, memoized by content hash.
  const facts = new Map<string, FileFacts>();
  function indexedFiles(): IndexedFile[] {
    return projects().flatMap(p =>
      cache
        .files(p.slug)
        .filter(f => f.visible && f.docType !== 'gitignore')
        .flatMap(f => {
          let fx = facts.get(f.hash);
          if (!fx) {
            try {
              fx = factsOf(decode(readFileSync(projectFile(layout, p.slug, f.path))), f.path);
            } catch {
              return [];
            }
            facts.set(f.hash, fx);
          }
          return [{ project: p.slug, path: f.path, hash: f.hash, facts: fx }];
        }),
    );
  }
  function suggestions() {
    const rejected = new Set(state.suggestions().rejected.map(r => `${r.hash}:${r.target}`));
    return inferSuggestions(
      indexedFiles(),
      rejected,
      projects().map(p => p.slug),
    );
  }
  let openSuggestions = -1;
  let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
  function notifySuggestions() {
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(() => {
      if (closed) return;
      try {
        const n = suggestions().length;
        if (n !== openSuggestions) {
          openSuggestions = n;
          events.emit('suggestions', { open: n });
        }
      } catch {}
    }, 50);
  }
  // Stage a new project folder, then move it and the new registry into place in one journaled
  // operation.
  async function createProjectFolder(
    name: string,
    origin: string,
    files: ImportFile[],
    preferredSlug?: string,
  ) {
    return lock('registry', async () => {
      const current = projects();
      const finalName = uniqueName(
        name,
        current.map(p => p.name),
      );
      const taken = new Set(current.map(p => p.slug));
      for (const s of safeDirs(layout.projects)) taken.add(s);
      const slug =
        preferredSlug && !taken.has(preferredSlug) ? preferredSlug : slugify(finalName, taken);
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      const stagedProject = join(staging, slug);
      const stateStaging = join(layout.state, `.staging-${opId}`);
      try {
        mkdirSync(stagedProject, { recursive: true });
        for (const f of files) {
          const bytes = encode(f.source);
          const file = join(stagedProject, f.path);
          atomicWrite(file, bytes);
          if (sha256(readFileSync(file)) !== sha256(bytes))
            throw Error(`Could not verify ${f.path} after writing.`);
        }
        let commit: ImportCommit = { committed: false, reason: 'no-git' };
        if (gitAvailable) {
          await git.init(stagedProject);
          if (files.length)
            commit = await commitFiles(
              stagedProject,
              files.map(f => f.path),
            );
          else if (await git.identity(stagedProject))
            await git.commit(stagedProject, 'Create project', true);
        }
        const project: ProjectEntry = {
          slug,
          name: finalName,
          createdAt: new Date().toISOString(),
          origin,
        };
        const steps = [
          { from: stagedProject, to: projectDir(layout, slug) },
          ...registrySteps(stateStaging, [...current, project]),
        ];
        journal.run(
          origin === 'import' ? 'import' : 'create',
          steps,
          [staging, stateStaging],
          opId,
        );
        await scanner.scan(slug);
        watcher?.add(slug);
        notifySuggestions();
        events.emit('projects', { added: [slug], removed: [], renamed: [] });
        return Object.assign({}, project, { commit });
      } catch (e) {
        rmSync(staging, { recursive: true, force: true });
        rmSync(stateStaging, { recursive: true, force: true });
        throw e;
      }
    });
  }
  // Commit only imported paths to preserve unrelated work; prefix paths for subfolder projects.
  async function commitFiles(repo: string, paths: string[], prefix = ''): Promise<ImportCommit> {
    if (!gitAvailable) return { committed: false, reason: 'no-git' };
    const message = importMessage(paths, prefix.replace(/\/$/, ''));
    const r = await git.commitPaths(
      repo,
      paths.map(p => prefix + p),
      message,
    );
    return r.committed ? { committed: true, commit: r.commit, message } : r;
  }
  function preflight(files: ImportFile[]) {
    if (!Array.isArray(files) || !files.length || files.length > 500)
      throw Error('Expected 1–500 files.');
    const paths = new Set<string>();
    const issues: Issue[] = [];
    for (const f of files) {
      if (!f || typeof f.path !== 'string' || typeof f.source !== 'string')
        throw Error('Each file needs a path and source text.');
      const path = projectPath(f.path);
      if (paths.has(path)) throw Error(`Duplicate path in batch: ${path}`);
      paths.add(path);
      const indexed = indexBytes('preflight', path, encode(f.source));
      if (!indexed.file.visible)
        issues.push({
          severity: 'error',
          code: 'unsupported',
          path: '/',
          message: `${path}: unsupported file type.`,
        });
      else if (!indexed.file.valid)
        issues.push(
          ...indexed.findings
            .filter(i => i.severity === 'error')
            .map(i => ({ ...i, message: `${path}: ${i.message}` })),
        );
    }
    if (issues.length) throw new InputError(issues);
    return files.map(f => ({ path: projectPath(f.path), source: f.source }));
  }
  // Use the contained ontology or semantic model name to give the import a recognizable project
  // name.
  function batchName(files: ImportFile[]) {
    const models = files.map(f => validateInput(f.source, posix.basename(f.path)).model);
    for (const kind of ['Ossie ontology', 'Ossie semantic'])
      for (const m of models)
        if (m?.kind === kind && typeof m.name === 'string' && m.name.trim())
          return m.name.trim().slice(0, 200);
    return posix.basename(files[0].path).replace(/\.[^.]+$/, '') || 'Imported files';
  }
  function readFile(slug: string, path: string) {
    entry(slug);
    const file = projectFile(layout, slug, path);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(file);
    } catch {
      throw new NotFoundError('File not found.');
    }
    const p = projectPath(path);
    const hash = sha256(bytes);
    const cached = cache.file(slug, p);
    return {
      path: p,
      source: decode(bytes),
      hash,
      docType: cached?.docType ?? 'unknown',
      valid: cached?.valid ?? false,
      findings:
        cached && cached.hash === hash
          ? cache.findings(slug, p)
          : indexBytes(slug, p, bytes).findings,
    };
  }
  async function saveFile(
    slug: string,
    path: string,
    body: { baseHash: string | null; source?: string; patches?: Patch[] },
  ) {
    entry(slug);
    const p = projectPath(path);
    const file = projectFile(layout, slug, p);
    return lock('project:' + slug, async () => {
      let current: Uint8Array | null = null;
      try {
        current = readFileSync(file);
      } catch {}
      const currentHash = current ? sha256(current) : null;
      if (body.baseHash !== currentHash)
        throw new StaleError(currentHash, current ? decode(current) : null);
      const base = current ? decode(current) : '';
      const next = body.source !== undefined ? body.source : applyPatches(base, body.patches ?? []);
      const bytes = encode(next);
      if (bytes.length > MAX_INPUT_BYTES)
        throw new InputError([
          {
            severity: 'error',
            code: 'size',
            path: '/',
            message:
              'The definition exceeds the 2 MB UTF-8 limit. Split it into smaller documents.',
          },
        ]);
      const indexed = indexBytes(slug, p, bytes);
      if (!indexed.file.visible)
        throw new InputError([
          { severity: 'error', code: 'unsupported', path: '/', message: 'Unsupported file type.' },
        ]);
      if (!indexed.file.valid) throw new InputError(indexed.findings);
      const hash = atomicWrite(file, bytes);
      state.deleteDraft(slug, p);
      await rescan(slug);
      return { path: p, hash, findings: indexed.findings };
    });
  }
  // Check every base hash before staging and validating replacements.
  // Journal the file swaps together so related edits can be recovered after a crash.
  async function saveFiles(
    slug: string,
    writes: { path: string; baseHash: string | null; source?: string; patches?: Patch[] }[],
    kind = 'save-files',
  ) {
    entry(slug);
    if (!Array.isArray(writes) || !writes.length || writes.length > 50)
      throw Error('Expected 1–50 files.');
    const files = writes.map(w => ({ ...w, path: projectPath(w.path) }));
    if (new Set(files.map(f => f.path)).size !== files.length)
      throw Error('Each file may appear once.');
    return lock('project:' + slug, async () => {
      const prepared = files.map(f => {
        const file = projectFile(layout, slug, f.path);
        let current: Uint8Array | null = null;
        try {
          current = readFileSync(file);
        } catch {}
        const currentHash = current ? sha256(current) : null;
        if (f.baseHash !== currentHash)
          throw new StaleError(currentHash, current ? decode(current) : null);
        const next =
          f.source !== undefined
            ? f.source
            : applyPatches(current ? decode(current) : '', f.patches ?? []);
        const bytes = encode(next);
        if (bytes.length > MAX_INPUT_BYTES)
          throw new InputError([
            {
              severity: 'error',
              code: 'size',
              path: '/',
              message: `${f.path}: the definition exceeds the 2 MB UTF-8 limit.`,
            },
          ]);
        const indexed = indexBytes(slug, f.path, bytes);
        if (!indexed.file.visible)
          throw new InputError([
            {
              severity: 'error',
              code: 'unsupported',
              path: '/',
              message: `${f.path}: unsupported file type.`,
            },
          ]);
        if (!indexed.file.valid)
          throw new InputError(
            indexed.findings.map(i => ({ ...i, message: `${f.path}: ${i.message}` })),
          );
        return { ...f, file, exists: !!current, bytes, findings: indexed.findings };
      });
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      try {
        const steps: { from: string; to: string }[] = [];
        prepared.forEach((f, i) => {
          const staged = join(staging, 'new', String(i));
          atomicWrite(staged, f.bytes);
          if (f.exists) steps.push({ from: f.file, to: join(staging, 'previous', String(i)) });
          steps.push({ from: staged, to: f.file });
        });
        journal.run(kind, steps, [staging], opId);
      } catch (e) {
        rmSync(staging, { recursive: true, force: true });
        throw e;
      }
      for (const f of prepared) state.deleteDraft(slug, f.path);
      await rescan(slug);
      return {
        written: prepared.map(f => ({
          path: f.path,
          hash: sha256(f.bytes),
          created: !f.exists,
          findings: f.findings,
        })),
      };
    });
  }
  // Legacy clients accept both `<project>/<path>` IDs and IDs from the old database.
  function resolveId(id: string) {
    const legacy = state.legacyIds().ids[id];
    if (legacy) return legacy;
    const slash = id.indexOf('/');
    if (slash < 1) throw new NotFoundError('Document not found.');
    return { project: id.slice(0, slash), path: id.slice(slash + 1) };
  }
  function documents() {
    return projects().flatMap(p =>
      cache
        .files(p.slug)
        .filter(f => f.visible)
        .flatMap(f => {
          let source: string;
          try {
            source = decode(readFileSync(projectFile(layout, p.slug, f.path)));
          } catch {
            return [];
          }
          return [
            {
              id: `${p.slug}/${f.path}`,
              filename: posix.basename(f.path),
              source,
              revision: revisionOf(f.hash),
              hash: f.hash,
              project: p.slug,
              path: f.path,
              updated: f.indexedAt,
            },
          ];
        }),
    );
  }
  // Every project of a repository notices a change under .git; the browser hears of it once.
  const pendingGitEvents = new Set<string>();
  function announceGitChange(slug: string) {
    const repo = locationOf(entry(slug)).repo;
    if (pendingGitEvents.has(repo)) return;
    pendingGitEvents.add(repo);
    setTimeout(async () => {
      pendingGitEvents.delete(repo);
      if (closed) return;
      const projectsInRepo = projects()
        .filter(project => locationOf(project).repo === repo)
        .map(project => project.slug);
      try {
        const s = await git.status(join(layout.projects, repo));
        events.emit('git', {
          project: slug,
          repo,
          projects: projectsInRepo,
          branch: s.branch,
          ahead: s.ahead,
          behind: s.behind,
          changes: s.changes,
          altered: [],
        });
      } catch {
        // The repository went away meanwhile; the next scan reports what is left.
      }
    }, options.debounceMs ?? 0);
  }
  const watcher = options.watch
    ? createWatcher(layout, {
        debounceMs: options.debounceMs,
        rescanMs: options.rescanMs,
        onChange: async (slug, gitChanged) => {
          if (!projects().some(p => p.slug === slug) || !existsSync(projectDir(layout, slug)))
            return;
          await rescan(slug);
          if (gitChanged && gitAvailable) announceGitChange(slug);
        },
        all: () => projects().map(p => p.slug),
        locate: slug => locationOf(entry(slug)),
      })
    : null;
  for (const p of projects())
    if (existsSync(projectDir(layout, p.slug))) {
      await scanner.scan(p.slug);
      watcher?.add(p.slug);
    }
  for (const r of recovery) events.emit('recovery', r);
  const scm = createScm({
    layout,
    git,
    gitAvailable,
    siblings: slug => {
      const repo = locationOf(entry(slug)).repo;
      return projects()
        .filter(project => locationOf(project).repo === repo)
        .map(project => project.slug);
    },
    project: slug => entry(slug),
    drafts: slug =>
      state
        .drafts()
        .filter(d => d.project === slug)
        .map(d => d.path),
    rescan: slug => rescan(slug),
    emit: (e, d) => events.emit(e, d),
  });
  let closed = false;
  const trash = createTrash({
    layout,
    state,
    journal,
    lock,
    projects,
    registrySteps,
    now: options.now,
    emit: (e, d) => events.emit(e, d),
    afterFiles: slug => rescan(slug),
    forgetProject: slug => {
      watcher?.remove(slug);
      cache.removeProject(slug);
      notifySuggestions();
    },
    adoptProject: async slug => {
      await scanner.scan(slug);
      watcher?.add(slug);
      notifySuggestions();
    },
    createProject: (name, origin, files) => createProjectFolder(name, origin, files),
  });
  // Journal the file move with its draft and view settings so they remain attached to the file.
  async function moveFile(
    slug: string,
    path: string,
    toProject: string,
    toPath?: string,
    keepBoth = false,
  ) {
    entry(slug);
    entry(toProject);
    const from = projectPath(path);
    let to = projectPath(toPath ?? posix.basename(from));
    const [a, b] = [slug, toProject].sort();
    return lock('project:' + a, () =>
      lock(a === b ? 'none' : 'project:' + b, async () => {
        const src = projectFile(layout, slug, from);
        if (!existsSync(src)) throw new NotFoundError('File not found.');
        if (slug === toProject && from === to) return { project: toProject, path: to };
        if (existsSync(projectFile(layout, toProject, to))) {
          const free = disambiguate(to, new Set(cache.files(toProject).map(f => f.path)));
          if (!keepBoth)
            throw new OccupiedError(
              `${to} already exists in the target project; nothing was overwritten.`,
              { toProject, toPath: free },
            );
          to = free;
        }
        const steps = [{ from: src, to: projectFile(layout, toProject, to) }];
        if (existsSync(state.draftFile(slug, from)) && !existsSync(state.draftFile(toProject, to)))
          steps.push({ from: state.draftFile(slug, from), to: state.draftFile(toProject, to) });
        journal.run('move', steps);
        const view = state.view(slug).files[from];
        if (view !== undefined) {
          const files = { ...state.view(slug).files };
          delete files[from];
          state.writeView(slug, files);
          state.writeView(toProject, { ...state.view(toProject).files, [to]: view });
        }
        const draft = state.draft(toProject, to);
        if ((draft && draft.project !== toProject) || (draft && draft.path !== to))
          state.writeDraft(toProject, to, {
            baseHash: draft.baseHash,
            text: draft.text,
            patches: draft.patches,
          });
        await rescan(slug);
        if (toProject !== slug) await rescan(toProject);
        return { project: toProject, path: to };
      }),
    );
  }
  // Name clashes require an explicit replace or keep-both choice before any files change.
  async function importInto(
    slug: string,
    files: ImportFile[],
    onConflict?: 'replace' | 'keep-both',
  ) {
    entry(slug);
    const batch = preflight(files);
    if (onConflict !== undefined && onConflict !== 'replace' && onConflict !== 'keep-both')
      throw Error('onConflict must be replace or keep-both.');
    return lock('project:' + slug, async () => {
      const dir = projectDir(layout, slug);
      const existing = new Set(cache.files(slug).map(f => f.path));
      for (const f of batch) if (existsSync(join(dir, f.path))) existing.add(f.path);
      const conflicts = batch.filter(f => existing.has(f.path)).map(f => f.path);
      if (conflicts.length && !onConflict) throw new ConflictError(conflicts);
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      const steps: { from: string; to: string }[] = [];
      const written: { path: string; hash: string }[] = [];
      const taken = new Set([...existing, ...batch.map(f => f.path)]);
      try {
        for (const f of batch) {
          let path = f.path;
          if (existing.has(path) && onConflict === 'keep-both') {
            path = disambiguate(path, taken);
            taken.add(path);
          }
          const staged = join(staging, 'new', path);
          atomicWrite(staged, encode(f.source));
          if (existing.has(path))
            steps.push({ from: join(dir, path), to: join(staging, 'replaced', path) });
          steps.push({ from: staged, to: join(dir, path) });
          written.push({ path, hash: sha256(encode(f.source)) });
        }
        journal.run('import', steps, [staging], opId);
      } catch (e) {
        rmSync(staging, { recursive: true, force: true });
        throw e;
      }
      let commit: ImportCommit;
      try {
        commit = await commitFiles(
          repoDir(layout, slug),
          written.map(w => w.path),
          projectPrefix(layout, slug),
        );
      } catch (e) {
        console.error(`[import] commit failed: ${(e as Error).message}`);
        commit = { committed: false, reason: 'nothing' };
      }
      await rescan(slug);
      if (commit.committed)
        try {
          await scm.refresh(slug);
        } catch {}
      return { written, commit };
    });
  }
  // Warn about unsaved drafts and references that would no longer resolve after deletion.
  function deleteImpact(slug: string, path?: string) {
    entry(slug);
    const p = path === undefined ? undefined : projectPath(path);
    if (p !== undefined && !cache.file(slug, p)) throw new NotFoundError('File not found.');
    const removed = (f: { project: string; path: string }) =>
      f.project === slug && (p === undefined || f.path === p);
    const all = indexedFiles();
    const gone = all.filter(removed);
    const kept = all.filter(f => !removed(f));
    const brokenReferences: {
      from: { project: string; path: string };
      to: { project: string; path: string };
      kind: string;
      name: string;
    }[] = [];
    for (const k of kept)
      for (const ref of k.facts.refs) {
        const targets = gone.filter(g => g.facts.names.includes(ref));
        if (targets.length && !kept.some(o => o !== k && o.facts.names.includes(ref)))
          for (const g of targets)
            brokenReferences.push({
              from: { project: k.project, path: k.path },
              to: { project: g.project, path: g.path },
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
      sharedWith,
      removes:
        p === undefined
          ? { project: slug, name: entry(slug).name, files: cache.files(slug).map(f => f.path) }
          : { project: slug, files: [p] },
      unsavedDrafts: state
        .drafts()
        .filter(removed)
        .map(d => ({ project: d.project, path: d.path })),
      brokenReferences,
    };
  }
  async function acceptSuggestion(id: string) {
    const s = suggestions().find(x => x.id === id);
    if (!s) throw new NotFoundError('Suggestion not found or no longer valid.');
    const moved = await moveFile(s.file.project, s.file.path, s.targetProject, undefined, true);
    notifySuggestions();
    return moved;
  }
  function rejectSuggestion(id: string) {
    const s = suggestions().find(x => x.id === id);
    if (!s) throw new NotFoundError('Suggestion not found or no longer valid.');
    const current = state.suggestions().rejected;
    state.writeSuggestions([
      ...current,
      {
        hash: s.file.hash,
        target: s.targetProject,
        project: s.file.project,
        path: s.file.path,
        rejectedAt: new Date().toISOString(),
      },
    ]);
    notifySuggestions();
    events.emit('suggestions', { open: suggestions().length });
  }
  const cloner = createCloner({
    layout,
    git,
    journal,
    projects,
    lock,
    registrySteps,
    scan: slug => scanner.scan(slug),
    invalidFiles: slug =>
      cache
        .files(slug)
        .filter(f => f.visible && !f.valid)
        .map(f => f.path),
    added: slug => {
      watcher?.add(slug);
      notifySuggestions();
      events.emit('projects', { added: [slug], removed: [], renamed: [] });
    },
    emit: event => events.emit('clone', event),
    // A manifest's projects are registered at once; otherwise the folders that hold definitions
    // are proposed, and the user confirms them in the browser.
    afterClone: slug => repositoryProjects.adoptClone(slug),
  });
  // Each repository folder under data/projects/ with the projects it holds.
  function repositories() {
    const byRepo = new Map<string, { dir: string; projects: string[] }>();
    for (const project of projects()) {
      const repo = locationOf(project).repo;
      const known = byRepo.get(repo) ?? { dir: repoDir(layout, project.slug), projects: [] };
      known.projects.push(project.slug);
      byRepo.set(repo, known);
    }
    return byRepo;
  }
  function checkIdentityText(value: unknown, label: string, min: number, max: number) {
    if (
      typeof value !== 'string' ||
      value.trim().length < min ||
      value.length > max ||
      hasControlCharacters(value)
    )
      throw Error(`${label} must be ${min}–${max} characters without control characters.`);
    return value.trim();
  }
  const repositoryProjects = createRepositoryProjects({
    layout,
    git,
    gitAvailable,
    state,
    projects,
    lock,
    added: async slugs => {
      for (const slug of slugs) {
        await scanner.scan(slug);
        watcher?.add(slug);
      }
      notifySuggestions();
    },
    removed: slugs => {
      for (const slug of slugs) {
        watcher?.remove(slug);
        cache.removeProject(slug);
      }
      notifySuggestions();
    },
    emit: (event, data) => events.emit(event, data),
  });
  // Every repository with whether Git has an identity for it, checked now.
  async function repositoryStatus() {
    if (!gitAvailable) return [];
    const out = [];
    for (const [repo, known] of repositories())
      out.push({
        repo,
        identityConfigured: await git.identity(known.dir),
        projects: known.projects,
      });
    return out;
  }
  return {
    layout,
    state,
    cache,
    events,
    git,
    scm,
    journal,
    gitAvailable,
    recovery,
    migration,
    repositoryStatus,
    /** Git availability, per-repository identity (checked now), and start-up reports. */
    async status() {
      const repositories = await repositoryStatus();
      // Without projects there is no repository to check, so Git's global identity decides.
      const identityConfigured = repositories.length
        ? repositories.every(repository => repository.identityConfigured)
        : gitAvailable && (await git.identity());
      return {
        gitAvailable,
        identityConfigured,
        repositories,
        dataRoot: layout.root,
        migration,
        recovery,
      };
    },
    /** The identity a commit in this project's repository would use. */
    async identity(slug: string) {
      entry(slug);
      if (!gitAvailable) throw Error('Git is not available on this machine.');
      return git.identityOf(repoDir(layout, slug));
    },
    /** Writes user.name and user.email into this project's repository, or into every repository. */
    async setIdentity(slug: string, name: unknown, email: unknown, allRepositories = false) {
      entry(slug);
      if (!gitAvailable) throw Error('Git is not available on this machine.');
      const userName = checkIdentityText(name, 'The name', 1, 200);
      const userEmail = checkIdentityText(email, 'The email', 3, 320);
      const own = locationOf(entry(slug)).repo;
      // "Every repository" fills in the ones without an identity; it never replaces another
      // author that a repository has on purpose.
      const targets = [];
      for (const [repo, known] of repositories())
        if (repo === own || (allRepositories && !(await git.identity(known.dir))))
          targets.push([repo, known] as const);
      for (const [repo, known] of targets) {
        await git.setIdentity(known.dir, userName, userEmail);
        events.emit('identity', { repo });
      }
      return { repositories: targets.map(([repo]) => repo) };
    },
    /** The configured credential helper's name; credentials themselves are never read. */
    async credentialHelper() {
      if (!gitAvailable) return { helper: null };
      return { helper: await git.configValue(layout.projects, 'credential.helper') };
    },
    projectCandidates: repositoryProjects.candidates,
    registerRepositoryProjects: repositoryProjects.register,
    /** Takes a project out of the workspace without deleting anything: its folder, history,
     * drafts and view settings stay where they are. */
    /** Takes a subfolder project out of the workspace without deleting anything. */
    removeProject: (slug: string) => repositoryProjects.remove(slug),
    clone: cloner.start,
    cancelClone: cloner.cancel,
    // Restore committed bytes through a journaled trash operation so the current version is
    // recoverable.
    async revertFile(slug: string, path: string, baseHash: unknown) {
      entry(slug);
      if (baseHash !== null && (typeof baseHash !== 'string' || !/^[0-9a-f]{64}$/.test(baseHash)))
        throw Error('baseHash must be a SHA-256 hex digest or null.');
      if (!gitAvailable) throw Error('Git is not available on this machine.');
      const p = projectPath(path);
      const committed = await git.blob(
        repoDir(layout, slug),
        'HEAD',
        projectPrefix(layout, slug) + p,
      );
      const r = await trash.revertFile(slug, p, baseHash as string | null, committed);
      try {
        await scm.refresh(slug);
      } catch {}
      return r;
    },
    lock,
    rescan,
    project: entry,
    registrySteps,
    readFile,
    saveFile,
    saveFiles,
    documents,
    resolveId,
    preflight,
    trash,
    moveFile,
    importInto,
    deleteImpact,
    suggestions,
    acceptSuggestion,
    rejectSuggestion,
    async listProjects() {
      return Promise.all(
        projects().map(async p => {
          let gitInfo = { branch: '', ahead: 0, behind: 0, changes: 0 };
          if (gitAvailable && existsSync(projectDir(layout, p.slug)))
            try {
              const s = await git.status(repoDir(layout, p.slug));
              gitInfo = { branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.changes };
            } catch {}
          const location = locationOf(p);
          return {
            slug: p.slug,
            name: p.name,
            origin: p.origin,
            createdAt: p.createdAt,
            repo: location.repo,
            // The project's folder inside its repository; empty for the repository itself.
            folder:
              location.folder === location.repo
                ? ''
                : location.folder.slice(location.repo.length + 1),
            ...gitInfo,
            files: cache
              .files(p.slug)
              .filter(f => f.visible)
              .map(f => ({
                path: f.path,
                docType: f.docType,
                layout: f.layout,
                valid: f.valid,
                visible: f.visible,
                gitState: f.gitState,
                hash: f.hash,
              })),
          };
        }),
      );
    },
    createProject: (name: unknown) =>
      createProjectFolder(
        projectName(
          name,
          projects().map(p => p.name),
        ),
        'import',
        [],
      ),
    async importBatch(body: { name?: unknown; files: ImportFile[] }) {
      const files = preflight(body.files);
      const name = body.name === undefined ? batchName(files) : projectName(body.name);
      const project = await createProjectFolder(name, 'import', files);
      return {
        slug: project.slug,
        name: project.name,
        written: files.map(f => ({ path: f.path, hash: sha256(encode(f.source)) })),
        commit: project.commit,
      };
    },
    async loadExample(id: string) {
      const set = exampleSet(id);
      if (!set) throw new NotFoundError('Unknown example.');
      const existing = projects().find(p => p.origin === `example:${id}`);
      if (existing && existsSync(projectDir(layout, existing.slug)))
        return { slug: existing.slug, name: existing.name, created: false };
      const files = set.files.map(name => ({
        path: name,
        source: readFileSync(join(examplesDir, set.folder, name), 'utf8'),
      }));
      // A project that already holds every example file with identical bytes is opened, not
      // duplicated.
      const hashes = new Map(files.map(f => [f.path, sha256(encode(f.source))]));
      const same = projects().find(p =>
        files.every(f => cache.file(p.slug, f.path)?.hash === hashes.get(f.path)),
      );
      if (same) return { slug: same.slug, name: same.name, created: false };
      const project = await createProjectFolder(set.name, `example:${id}`, files, set.id);
      return { slug: project.slug, name: project.name, created: true, commit: project.commit };
    },
    renameProject: (slug: string, name: unknown) =>
      lock('registry', () => {
        const current = projects();
        const p = entry(slug);
        const value = projectName(
          name,
          current.map(x => x.name),
          p.name,
        );
        state.writeRegistry(current.map(x => (x.slug === slug ? { ...x, name: value } : x)));
        events.emit('projects', { added: [], removed: [], renamed: [{ slug, name: value }] });
        return { slug, name: value };
      }),
    // Facade save: new documents go to the "Ungrouped" project; existing ones need their base
    // version.
    async saveDocument(
      filename: string,
      source: string,
      id?: string,
      version?: { revision?: number; baseHash?: string },
    ) {
      if (id === undefined) {
        let target = projects().find(p => p.slug === 'ungrouped');
        const path = projectPath(filename);
        preflight([{ path, source }]);
        if (!target) target = await createProjectFolder('Ungrouped', 'import', [], 'ungrouped');
        const taken = new Set(cache.files(target.slug).map(f => f.path));
        const free = disambiguate(path, taken);
        await saveFile(target.slug, free, { baseHash: null, source });
        return documents().find(d => d.project === target!.slug && d.path === free)!;
      }
      const ref = resolveId(id);
      if (posix.basename(ref.path) !== filename)
        throw Error('Renaming through the documents API is not supported.');
      let current: string | null = null;
      try {
        current = sha256(readFileSync(projectFile(layout, ref.project, ref.path)));
      } catch {
        throw new NotFoundError('Document not found.');
      }
      const base =
        version?.baseHash ??
        (version?.revision !== undefined && version.revision === revisionOf(current)
          ? current
          : undefined);
      if (base === undefined) throw new StaleError(current, null);
      await saveFile(ref.project, ref.path, { baseHash: base, source });
      return documents().find(d => d.project === ref.project && d.path === ref.path)!;
    },
    grouping(id: string) {
      const ref = resolveId(id);
      return (state.view(ref.project).files[ref.path] ?? {}) as object;
    },
    saveGrouping(id: string, value: unknown) {
      const ref = resolveId(id);
      if (!cache.file(ref.project, ref.path)) throw new NotFoundError('Document not found.');
      return lock('project:' + ref.project, () => {
        const view = state.view(ref.project);
        state.writeView(ref.project, { ...view.files, [ref.path]: value });
        return value;
      });
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(suggestionTimer);
      watcher?.close();
      cache.close();
    },
  };
}
function safeDirs(dir: string) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
/** Project storage and services returned by an opened workspace. */
export type Workspace = Awaited<ReturnType<typeof openWorkspace>>;
export { PathError };
