// Coordinates project files, durable state, and workspace services. Project folders are the source
// of truth; the SQLite cache can be rebuilt.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { validateInput } from '../../src/input';
import { InputError, MAX_INPUT_BYTES, type Issue } from '../../src/diagnostics';
import { exampleSet } from '../../src/projects/examples';
import { atomicWrite, atomicWriteJson, decode, encode, sha256 } from './atomic';
import { createCache, type Cache } from './cache';
import { createEvents } from './events';
import { createGit, hasControlCharacters, type RemoteCredential } from './git';
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
import { movePersonalState, clearPersonalDrafts } from './personal-state';
import { createState, type ProjectEntry, type Patch } from './state';
import { createWatcher } from './watcher';
import { migrateLegacy, type MigrationReport } from './migration';
import { createTrash } from './trash';
import { createScm } from './scm';
import { createCloner, rollBackInterruptedClones, type AssignProject } from './clone';
import { createRepositoryProjects } from './repository-projects';
import { LOCAL_READER, type Reader } from './reader';
import { HiddenResourceError } from './errors';
import { factsOf, inferSuggestions, type FileFacts, type IndexedFile } from './suggestions';
import { ConflictError, OccupiedError } from './errors';
import { StaleError, NotFoundError } from './errors';
import { demotionsOf, type ContentGuard, type Demotion } from '../auth/guards';
import { NEW_PROJECT } from '../auth/resource';
export { StaleError, NotFoundError, GoneError, OccupiedError, ConflictError } from './errors';
/** A project-relative path and the source text to import there. */
export type ImportFile = { path: string; source: string };
/** Storage, Git, watching, and test-hook options for opening a workspace. */
export type WorkspaceOptions = {
  root?: string;
  cacheDir?: string | null;
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
  const layout: DataLayout = dataLayout(options.root, options.cacheDir);
  for (const dir of [layout.projects, layout.state, layout.trash, layout.backup])
    mkdirSync(dir, { recursive: true });
  const state = createState(layout);
  const journal = createJournal(layout, options.journalHooks);
  const events = createEvents({
    suggestionIndex: () => indexedFiles(LOCAL_READER),
    sharedSuggestionCount: index => suggestionsFrom(index, LOCAL_READER).length,
  });
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
  mkdirSync(dirname(layout.cache), { recursive: true });
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
      events.emit('files', r, {
        projects: [slug],
        paths: [...r.changed, ...r.removed].map(path => ({ project: slug, path })),
      });
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
  function indexedFiles({ view }: Reader): IndexedFile[] {
    return projects().flatMap(p =>
      cache
        .files(p.slug)
        .filter(
          f => f.visible && f.docType !== 'gitignore' && (!view || view.canRead(p.slug, f.path)),
        )
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
  // Infers from an unrestricted index narrowed to what the reader can open, so one index can
  // serve every person in a refresh round.
  function suggestionsFrom(index: IndexedFile[], reader: Reader) {
    const { view, owner } = reader;
    const personal = owner ? state.forOwner(owner) : state;
    const rejected = new Set(personal.suggestions().rejected.map(r => `${r.hash}:${r.target}`));
    return inferSuggestions(
      view ? index.filter(file => view.canRead(file.project, file.path)) : index,
      rejected,
      projects()
        .filter(p => !view || view.readableProjects.has(p.slug))
        .map(p => p.slug),
    );
  }
  function suggestions(reader: Reader) {
    return suggestionsFrom(indexedFiles(LOCAL_READER), reader);
  }
  let closed = false;
  // A payload-free trigger: the event hub debounces it and counts for each connected client.
  function notifySuggestions() {
    if (!closed) events.emit('suggestions', {}, { audience: 'all' });
  }
  // Stage a new project folder, then move it and the new registry into place in one journaled
  // operation. A caller that must authorize the final slug gets it before anything is written,
  // because a stray folder on disk can make it differ from the preferred one.
  async function createProjectFolder(
    name: string,
    origin: string,
    files: ImportFile[],
    preferredSlug?: string,
    beforeCreate?: (slug: string) => void,
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
      beforeCreate?.(slug);
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
        events.emit('projects', { added: [slug], removed: [], renamed: [] }, { projects: [slug] });
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
  // The file as the last commit has it, so an owner handed over in an earlier save still counts
  // for self-approval. Null without Git, without a commit, or for a binary file.
  async function committedText(slug: string, path: string): Promise<string | null> {
    if (!gitAvailable) return null;
    const bytes = await git.blob(repoDir(layout, slug), 'HEAD', projectPrefix(layout, slug) + path);
    if (!bytes) return null;
    try {
      return decode(bytes);
    } catch {
      return null;
    }
  }
  // The reader's guard, given in server mode, may refuse the save or store an approved metric as
  // proposed.
  async function saveFile(
    slug: string,
    path: string,
    body: { baseHash: string | null; source?: string; patches?: Patch[] },
    { guard }: Reader,
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
      const edited =
        body.source !== undefined ? body.source : applyPatches(base, body.patches ?? []);
      const before = current ? base : null;
      const committed = guard ? await committedText(slug, p) : null;
      const change = { project: slug, path: p, before, after: edited, committed };
      const guarded = guard?.([change]);
      const next = guarded?.changes[0].after ?? edited;
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
      const staging = join(layout.state, `.staging-${journal.newId()}`);
      const staged = join(staging, 'source');
      const hash = atomicWrite(staged, bytes);
      const steps = clearPersonalDrafts(state, slug, [p], staging);
      if (existsSync(file)) steps.push({ from: file, to: join(staging, 'previous') });
      steps.push({ from: staged, to: file });
      journal.run('save', steps, [staging]);
      await rescan(slug);
      const demoted = guarded ? demotionsOf(guarded) : [];
      // A demoted metric means the stored text differs from what was sent, so it is returned.
      const stored = demoted.length ? { demoted, source: next } : {};
      return { path: p, hash, findings: indexed.findings, ...stored };
    });
  }
  // Check every base hash before staging and validating replacements.
  // Journal the file swaps together so related edits can be recovered after a crash.
  async function saveFiles(
    slug: string,
    writes: { path: string; baseHash: string | null; source?: string; patches?: Patch[] }[],
    reader: Reader,
    kind = 'save-files',
  ) {
    const { guard } = reader;
    entry(slug);
    if (!Array.isArray(writes) || !writes.length || writes.length > 50)
      throw Error('Expected 1–50 files.');
    const files = writes.map(w => ({ ...w, path: projectPath(w.path) }));
    if (new Set(files.map(f => f.path)).size !== files.length)
      throw Error('Each file may appear once.');
    if (reader.view && files.some(file => !reader.view!.canRead(slug, file.path))) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    return lock('project:' + slug, async () => {
      const edited = files.map(f => {
        const file = projectFile(layout, slug, f.path);
        let current: Uint8Array | null = null;
        try {
          current = readFileSync(file);
        } catch {}
        const currentHash = current ? sha256(current) : null;
        if (f.baseHash !== currentHash)
          throw new StaleError(currentHash, current ? decode(current) : null);
        const before = current ? decode(current) : null;
        const next =
          f.source !== undefined ? f.source : applyPatches(before ?? '', f.patches ?? []);
        return { ...f, file, current, before, next };
      });
      // Every file is guarded before any is validated or staged, so a refusal changes nothing.
      const changes = [];
      for (const f of edited) {
        const committed = guard ? await committedText(slug, f.path) : null;
        changes.push({ project: slug, path: f.path, before: f.before, after: f.next, committed });
      }
      const guarded = guard?.(changes);
      const prepared = edited.map((f, index) => {
        const { file, current } = f;
        const next = guarded?.changes[index].after ?? f.next;
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
        const rewritten = next !== f.next;
        return {
          path: f.path,
          file,
          exists: !!current,
          bytes,
          findings: indexed.findings,
          rewritten,
        };
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
        steps.push(
          ...clearPersonalDrafts(
            state,
            slug,
            prepared.map(file => file.path),
            staging,
          ),
        );
        journal.run(kind, steps, [staging], opId);
      } catch (e) {
        rmSync(staging, { recursive: true, force: true });
        throw e;
      }
      await rescan(slug);
      const demoted = guarded ? demotionsOf(guarded) : [];
      return {
        written: prepared.map(f => ({
          path: f.path,
          hash: sha256(f.bytes),
          created: !f.exists,
          findings: f.findings,
          ...(f.rewritten ? { source: decode(f.bytes) } : {}),
        })),
        ...(demoted.length ? { demoted } : {}),
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
  function documentsFor({ view }: Reader) {
    return projects().flatMap(p =>
      cache
        .files(p.slug)
        .filter(f => f.visible && (!view || view.canRead(p.slug, f.path)))
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
        events.emit(
          'git',
          {
            project: slug,
            repo,
            projects: projectsInRepo,
            branch: s.branch,
            ahead: s.ahead,
            behind: s.behind,
            changes: s.changes,
            altered: [],
          },
          { projects: projectsInRepo },
        );
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
  for (const r of recovery) events.emit('recovery', { outcome: r.outcome }, { audience: 'all' });
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
    emit: (e, d, tags) => events.emit(e, d, tags),
  });
  const trash = createTrash({
    layout,
    state,
    journal,
    lock,
    projects,
    registrySteps,
    now: options.now,
    emit: (e, d, tags) => events.emit(e, d, tags),
    withCurrentReaders: (event, tags) => events.withCurrentReaders(event, tags),
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
  // A move between projects is judged as removing the file from its project and creating it in
  // the target project, whose domain and classification settings may differ.
  function guardMove(
    guard: ContentGuard,
    move: { slug: string; from: string; toProject: string; to: string },
  ) {
    let text: string | null;
    try {
      text = decode(readFileSync(projectFile(layout, move.slug, move.from)));
    } catch {
      // A file that is not text holds nothing a guard reads.
      text = null;
    }
    const removed = { project: move.slug, path: move.from, before: text, after: null };
    const created = { project: move.toProject, path: move.to, before: null, after: text };
    guard([removed, created], { operation: 'move' });
  }
  async function moveFile(
    slug: string,
    path: string,
    toProject: string,
    toPath: string | undefined,
    keepBoth: boolean,
    { view: accessView, guard }: Reader,
  ) {
    entry(slug);
    if (accessView && !accessView.readableProjects.has(toProject)) {
      throw new NotFoundError('Project not found.');
    }
    entry(toProject);
    const from = projectPath(path);
    let to = projectPath(toPath ?? posix.basename(from));
    if (accessView && !accessView.canRead(toProject, to)) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    const [a, b] = [slug, toProject].sort();
    return lock('project:' + a, () =>
      lock(a === b ? 'none' : 'project:' + b, async () => {
        const src = projectFile(layout, slug, from);
        if (!existsSync(src)) throw new NotFoundError('File not found.');
        if (slug === toProject && from === to) return { project: toProject, path: to };
        if (existsSync(projectFile(layout, toProject, to))) {
          const free = freeReadableName(toProject, to, accessView);
          if (!keepBoth)
            throw new OccupiedError(
              `${to} already exists in the target project; nothing was overwritten.`,
              free ? { toProject, toPath: free } : {},
            );
          if (!free) throw new OccupiedError('The target is unavailable.', {});
          to = free;
        }
        // Across projects the file leaves one project's governance and enters another's.
        if (guard && toProject !== slug) guardMove(guard, { slug, from, toProject, to });
        const steps = [{ from: src, to: projectFile(layout, toProject, to) }];
        if (existsSync(state.draftFile(slug, from)) && !existsSync(state.draftFile(toProject, to)))
          steps.push({ from: state.draftFile(slug, from), to: state.draftFile(toProject, to) });
        const personalStaging = join(layout.state, `.staging-${journal.newId()}`);
        steps.push(
          ...movePersonalState(
            state,
            { project: slug, path: from, target: toProject, targetPath: to },
            personalStaging,
          ),
        );
        journal.run('move', steps, [personalStaging]);
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
  // The names a keep-both choice must avoid: those this reader can see, plus names already taken
  // in the same batch. Hidden names are left out so the choice does not reveal them.
  function visibleNames(slug: string, view: Reader['view'], batchNames: Iterable<string> = []) {
    const taken = new Set(batchNames);
    for (const file of cache.files(slug)) {
      if (!view || view.canRead(slug, file.path)) taken.add(file.path);
    }
    return taken;
  }
  // A keep-both name chosen among the visible names. A name the reader cannot open is refused, so
  // a hidden file is neither revealed nor replaced. A file on disk that the cache does not list
  // counts as hidden for a person.
  function freeReadableName(
    slug: string,
    path: string,
    view: Reader['view'],
    batchNames: Iterable<string> = [],
  ) {
    const taken = visibleNames(slug, view, batchNames);
    for (;;) {
      const free = disambiguate(path, taken);
      if (view && !view.canRead(slug, free)) return null;
      if (!existsSync(projectFile(layout, slug, free))) return free;
      if (view) return null;
      taken.add(free);
    }
  }
  // The name each imported file is written under. Keep-both names are chosen before anything is
  // staged, so a refused name leaves the project untouched.
  function importTargets(
    slug: string,
    batch: ImportFile[],
    conflicts: {
      existing: Set<string>;
      keepBoth: boolean;
      view: Reader['view'];
      authorizePaths?: (paths: string[]) => void;
    },
  ) {
    const { existing, keepBoth, view, authorizePaths } = conflicts;
    const taken = new Set(batch.map(file => file.path));
    let refused = false;
    const targets = batch.map(file => {
      if (!keepBoth || !existing.has(file.path)) return file.path;
      const free = freeReadableName(slug, file.path, view, taken);
      // A refused name is still the one this reader would get, so authorization judges it first.
      const name = free ?? disambiguate(file.path, visibleNames(slug, view, taken));
      if (!free) refused = true;
      taken.add(name);
      return name;
    });
    authorizePaths?.(targets);
    if (refused) throw new OccupiedError('The target is unavailable.', {});
    return targets;
  }
  // The text each imported file is written with. A replaced file is compared with the file it
  // replaces, a new one with nothing, and an approved metric may come back as proposed.
  async function guardedImport(
    slug: string,
    batch: ImportFile[],
    targets: string[],
    guard: ContentGuard | undefined,
  ): Promise<{ sources: string[]; demoted: Demotion[] }> {
    if (!guard) return { sources: batch.map(file => file.source), demoted: [] };
    const changes = [];
    for (const [position, file] of batch.entries()) {
      const path = targets[position];
      const full = projectFile(layout, slug, path);
      const before = existsSync(full) ? decode(readFileSync(full)) : null;
      const committed = await committedText(slug, path);
      changes.push({ project: slug, path, before, after: file.source, committed });
    }
    // An import replacing an approved metric is a save: the metric comes back as proposed.
    const outcome = guard(changes, { operation: 'import', demote: true });
    const sources = outcome.changes.map(change => change.after ?? '');
    return { sources, demoted: demotionsOf(outcome) };
  }
  /** The files of a project being created, as the guard returns them. */
  function guardedNewProject(
    files: ImportFile[],
    guard: ContentGuard | undefined,
    domain: string | undefined,
  ): ImportFile[] {
    if (!guard) return files;
    const changes = files.map(file => ({
      project: NEW_PROJECT,
      path: file.path,
      before: null,
      after: file.source,
    }));
    const outcome = guard(changes, { operation: 'import', domain });
    return files.map((file, position) => ({
      ...file,
      source: outcome.changes[position].after ?? file.source,
    }));
  }
  // Name clashes require an explicit replace or keep-both choice before any files change.
  async function importInto(
    slug: string,
    files: ImportFile[],
    onConflict: 'replace' | 'keep-both' | undefined,
    reader: Reader,
    authorizePaths?: (paths: string[]) => void,
  ) {
    entry(slug);
    const batch = preflight(files);
    authorizePaths?.(batch.map(file => file.path));
    if (reader.view && batch.some(file => !reader.view!.canRead(slug, file.path))) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    if (onConflict !== undefined && onConflict !== 'replace' && onConflict !== 'keep-both')
      throw Error('onConflict must be replace or keep-both.');
    return lock('project:' + slug, async () => {
      const dir = projectDir(layout, slug);
      const existing = new Set(cache.files(slug).map(f => f.path));
      for (const f of batch) if (existsSync(join(dir, f.path))) existing.add(f.path);
      const conflicts = batch.filter(f => existing.has(f.path)).map(f => f.path);
      if (conflicts.length && !onConflict) throw new ConflictError(conflicts);
      const { view } = reader;
      const targets = importTargets(slug, batch, {
        existing,
        keepBoth: onConflict === 'keep-both',
        view,
        // Final names are checked while the project lock keeps another import from taking them.
        authorizePaths,
      });
      const { sources, demoted } = await guardedImport(slug, batch, targets, reader.guard);
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      const steps: { from: string; to: string }[] = [];
      const written: { path: string; hash: string }[] = [];
      const replaced: string[] = [];
      try {
        for (const position of batch.keys()) {
          const path = targets[position];
          const staged = join(staging, 'new', path);
          atomicWrite(staged, encode(sources[position]));
          if (existing.has(path)) {
            steps.push({ from: join(dir, path), to: join(staging, 'replaced', path) });
            replaced.push(path);
          }
          steps.push({ from: staged, to: join(dir, path) });
          written.push({ path, hash: sha256(encode(sources[position])) });
        }
        // A draft of a replaced file was edited against bytes that are gone.
        steps.push(...clearPersonalDrafts(state, slug, replaced, staging));
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
      return { written, commit, ...(demoted.length ? { demoted } : {}) };
    });
  }
  // Warn about unsaved drafts and references that would no longer resolve after deletion.
  function deleteImpact(slug: string, path: string | undefined, { view, owner }: Reader) {
    entry(slug);
    const p = path === undefined ? undefined : projectPath(path);
    if (view && p && !view.canRead(slug, p)) throw new HiddenResourceError();
    if (p !== undefined && !cache.file(slug, p)) throw new NotFoundError('File not found.');
    const removed = (f: { project: string; path: string }) =>
      f.project === slug && (p === undefined || f.path === p);
    const all = indexedFiles(LOCAL_READER);
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
      sharedWith: sharedWith.filter(project => !view || view.readableProjects.has(project)),
      removes:
        p === undefined
          ? {
              project: slug,
              name: entry(slug).name,
              files: cache
                .files(slug)
                .filter(f => !view || view.canRead(slug, f.path))
                .map(f => f.path),
            }
          : { project: slug, files: [p] },
      unsavedDrafts: (owner ? state.forOwner(owner) : state)
        .drafts()
        .filter(removed)
        .filter(d => !view || view.canRead(d.project, d.path))
        .map(d => ({ project: d.project, path: d.path })),
      brokenReferences: brokenReferences.filter(
        ref =>
          !view ||
          (view.canRead(ref.from.project, ref.from.path) &&
            view.canRead(ref.to.project, ref.to.path)),
      ),
      ...(view
        ? {
            hiddenReferences: brokenReferences.filter(
              ref =>
                view.readableProjects.has(ref.from.project) &&
                !view.canRead(ref.from.project, ref.from.path),
            ).length,
          }
        : {}),
    };
  }
  async function acceptSuggestion(id: string, reader: Reader) {
    const s = suggestions(reader).find(x => x.id === id);
    if (!s) throw new NotFoundError('Suggestion not found or no longer valid.');
    const moved = await moveFile(
      s.file.project,
      s.file.path,
      s.targetProject,
      undefined,
      true,
      reader,
    );
    notifySuggestions();
    return moved;
  }
  function rejectSuggestion(id: string, reader: Reader) {
    const { owner } = reader;
    const personal = owner ? state.forOwner(owner) : state;
    const s = suggestions(reader).find(x => x.id === id);
    if (!s) throw new NotFoundError('Suggestion not found or no longer valid.');
    const current = personal.suggestions().rejected;
    personal.writeSuggestions([
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
      events.emit('projects', { added: [slug], removed: [], renamed: [] }, { projects: [slug] });
    },
    emit: (event, owner) => events.emit('clone', event, { audience: 'all', owner }),
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
    emit: (event, data, tags) => events.emit(event, data, tags),
    withCurrentReaders: (event, tags) => events.withCurrentReaders(event, tags),
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
        events.emit(
          'identity',
          { repo },
          {
            projects: projects()
              .filter(project => locationOf(project).repo === repo)
              .map(project => project.slug),
          },
        );
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
    clone: (
      url: unknown,
      name: unknown,
      { owner }: Reader,
      assign?: AssignProject,
      credential?: RemoteCredential,
    ) => cloner.start(url, name, { owner, assign, credential }),
    cancelClone: cloner.cancel,
    // Restore committed bytes through a journaled trash operation so the current version is
    // recoverable.
    async revertFile(slug: string, path: string, baseHash: unknown, reader: Reader) {
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
      const expected = baseHash as string | null;
      const r = await trash.revertFile(slug, p, expected, committed, reader);
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
    documents: () => documentsFor(LOCAL_READER),
    documentsFor,
    resolveId,
    preflight,
    trash,
    moveFile,
    importInto,
    deleteImpact,
    suggestions,
    /** One person's open suggestion count from a shared unrestricted index. */
    suggestionCount: (reader: Reader, index: IndexedFile[]) =>
      suggestionsFrom(index, reader).length,
    acceptSuggestion,
    rejectSuggestion,
    async listProjects({ view }: Reader) {
      return Promise.all(
        projects()
          .filter(p => !view || view.readableProjects.has(p.slug))
          .map(async p => {
            let gitInfo = { branch: '', ahead: 0, behind: 0, changes: 0 };
            if (gitAvailable && existsSync(projectDir(layout, p.slug)))
              try {
                const s = await git.status(repoDir(layout, p.slug));
                gitInfo = {
                  branch: s.branch,
                  ahead: s.ahead,
                  behind: s.behind,
                  changes: s.changes,
                };
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
              ...(view
                ? {
                    hiddenFiles: cache
                      .files(p.slug)
                      .filter(f => f.visible && !view.canRead(p.slug, f.path)).length,
                    changes: cache
                      .files(p.slug)
                      .filter(f => view.canRead(p.slug, f.path) && f.gitState !== 'clean').length,
                  }
                : {}),
              files: cache
                .files(p.slug)
                .filter(f => f.visible && (!view || view.canRead(p.slug, f.path)))
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
    /**
     * Creates a project from an import. Its files are judged as created by the person, as files
     * of the project's chosen domain, before the project exists.
     */
    async importBatch(
      body: { name?: unknown; files: ImportFile[] },
      reader: Reader,
      creating: { domain?: string } = {},
    ) {
      const files = guardedNewProject(preflight(body.files), reader.guard, creating.domain);
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
        events.emit(
          'projects',
          { added: [], removed: [], renamed: [{ slug, name: value }] },
          { projects: [slug] },
        );
        return { slug, name: value };
      }),
    // Facade save: new documents go to the "Ungrouped" project; existing ones need their base
    // version. A new document is saved under a free name, which authorizeTargets judges first.
    async saveDocument(
      filename: string,
      source: string,
      reader: Reader,
      id?: string,
      version?: { revision?: number; baseHash?: string },
      authorizeTargets?: (targets: { project: string; path: string }[]) => void,
    ) {
      const { view } = reader;
      if (id === undefined) {
        let target = projects().find(p => p.slug === 'ungrouped');
        const path = projectPath(filename);
        preflight([{ path, source }]);
        if (target && view && !view.readableProjects.has(target.slug))
          throw new OccupiedError('The target is unavailable.', {});
        // A project that does not exist yet holds no file, so the requested name is free.
        const free = target ? freeReadableName(target.slug, path, view) : path;
        if (free === null) throw new OccupiedError('The target is unavailable.', {});
        const authorizeIn = (slug: string) => authorizeTargets?.([{ project: slug, path: free }]);
        if (target) authorizeIn(target.slug);
        else
          target = await createProjectFolder('Ungrouped', 'import', [], 'ungrouped', authorizeIn);
        await saveFile(target.slug, free, { baseHash: null, source }, reader);
        return documentsFor(reader).find(d => d.project === target!.slug && d.path === free)!;
      }
      const ref = resolveId(id);
      if (view && !view.canRead(ref.project, ref.path)) throw new HiddenResourceError();
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
      await saveFile(ref.project, ref.path, { baseHash: base, source }, reader);
      return documentsFor(reader).find(d => d.project === ref.project && d.path === ref.path)!;
    },
    grouping(id: string, { view, owner }: Reader) {
      const personal = owner ? state.forOwner(owner) : state;
      const ref = resolveId(id);
      if (view && !view.canRead(ref.project, ref.path)) throw new HiddenResourceError();
      return (personal.view(ref.project).files[ref.path] ?? {}) as object;
    },
    saveGrouping(id: string, value: unknown, { view, owner }: Reader) {
      const personal = owner ? state.forOwner(owner) : state;
      const ref = resolveId(id);
      if (view && !view.canRead(ref.project, ref.path)) throw new HiddenResourceError();
      if (!cache.file(ref.project, ref.path)) throw new NotFoundError('Document not found.');
      return lock('project:' + ref.project, () => {
        const view = personal.view(ref.project);
        personal.writeView(ref.project, { ...view.files, [ref.path]: value });
        return value;
      });
    },
    close() {
      if (closed) return;
      closed = true;
      events.close();
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
