// Coordinates project files, durable state, and workspace services. Project folders are the source
// of truth; the SQLite cache can be rebuilt.
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { atomicWriteJson, decode, readJsonFile, sha256 } from './atomic';
import { createCache, type Cache } from './cache';
import { createEvents, type EventTags } from './events';
import { createGit, GitError, type RemoteCredential } from './git';
import { createJournal, type JournalHooks, type RecoveryOutcome } from './journal';
import { dataLayout, locationOf, projectDir, projectPrefix, repoDir, indexedFile, projectFile, projectName, projectPath, assertSlug, copyLayout, PathError, type DataLayout } from './paths';
import { createScanner, indexBytes, walk } from './scanner';
import { planProjectExport, type ExportOptions } from './project-export';
import { createState, type ProjectEntry } from './state';
import { createWatcher } from './watcher';
import { migrateLegacy, type MigrationReport } from './migration';
import { createTrash, deleteImpact as reportDeleteImpact, guardDeletion, type TrashEntry } from './trash';
import { restoreTrashedDeletions } from './published-checkout';
import { createScm } from './scm';
import { createWorktrees } from './worktrees';
import { copyScmHooks, createWorkingCopies, projectLockKey, type Place, type RepositoryFacts } from './working-copies';
import { createPublishing } from './publishing';
import { createUnpublishedWork } from './unpublished-work';
import { createCloner, rollBackInterruptedClones, type AssignProject, type FolderRequest } from './clone';
import { createRepositoryProjects } from './repository-projects';
import { createProjectFolders } from './project-folder';
import { createImportBatch, freeReadableName, preflight } from './workspace/import-batch';
import { createDocumentSave, applyPatches } from './workspace/document-save';
import { createFileMove } from './workspace/file-move';
import { createGitIdentity } from './workspace/git-identity';
import { MANIFEST_FILE } from './repositories';
import { LOCAL_READER, type Reader } from './reader';
import { BadRequestError, HiddenResourceError } from './errors';
import { factsOf, inferSuggestions, type FileFacts, type IndexedFile } from './suggestions';
import { MergingError, OccupiedError } from './errors';
import { StaleError, NotFoundError } from './errors';
import {} from '../auth/guards';
import { log } from '../observability/log';
export { StaleError, NotFoundError, GoneError, OccupiedError, ConflictError } from './errors';
export { importMessage, type ImportFile, type ImportCommit } from './workspace/import-batch';
export { applyPatches };
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
  /** How long a person's working copy stays watched without use; 30 minutes by default. */
  copyIdleMs?: number;
  migrationHooks?: Parameters<typeof migrateLegacy>[1];
  journalHooks?: JournalHooks;
  /**
   * Server mode: at start-up, restores files that local-mode deletions left deleted in the
   * published checkout, and refuses to start on any other change there.
   */
  reconcilePublished?: boolean;
  /** Where a structured start-up line goes; the console by default. */
  log?: (line: string) => void;
};
/** A definition file is one the person sees as a definition: visible, and not a .gitignore. */
function isDefinitionFile(file: { visible: boolean; docType: string }) {
  return file.visible && file.docType !== 'gitignore';
}
/** Derives a numeric revision from a content hash for legacy document clients. */
export const revisionOf = (hash: string) => parseInt(hash.slice(0, 12), 16) + 1;
/** Recovers and opens workspace services, scans projects, and optionally starts watchers. */
export async function openWorkspace(options: WorkspaceOptions = {}) {
  const layout: DataLayout = dataLayout(options.root, options.cacheDir);
  for (const dir of [layout.projects, layout.state, layout.trash, layout.backup]) mkdirSync(dir, { recursive: true });
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
  const git = createGit({
    projectsRoot: layout.projects,
    worktreesRoot: layout.worktrees,
    binary: options.gitBinary,
  });
  const gitAvailable = await git.available();
  const identityConfigured = gitAvailable && (await git.identity());
  const recovery: RecoveryOutcome[] = journal.recover();
  recovery.push(...rollBackInterruptedClones(layout));
  const migration: MigrationReport | null = await migrateLegacy({ layout, state, journal, git, gitAvailable, identityConfigured }, options.migrationHooks);
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
    const projectEntry = projects().find(p => p.slug === assertSlug(slug));
    if (!projectEntry) throw new NotFoundError('Project not found.');
    return projectEntry;
  };
  // Rescans one project of a place; events about a person's copy reach only that person.
  async function rescanIn(place: Pick<Place, 'scanner' | 'tags'>, slug: string) {
    const scan = await place.scanner.scan(slug);
    if (scan.changed.length || scan.removed.length) {
      events.emit(
        'files',
        scan,
        place.tags({
          projects: [slug],
          paths: [...scan.changed, ...scan.removed].map(path => ({ project: slug, path })),
        }),
      );
      notifySuggestions();
    }
    return scan;
  }
  const rescan = (slug: string) => rescanIn({ scanner, tags: tags => tags }, slug);
  const projectLock = (place: Place, slug: string) => projectLockKey(slug, place.copy);
  // Replace the registry with two renames inside a journal: current → staging, staged → current.
  function registrySteps(stateStaging: string, next: ProjectEntry[]) {
    atomicWriteJson(join(stateStaging, 'projects.json'), { formatVersion: 1, projects: next });
    return [...(existsSync(layout.registry) ? [{ from: layout.registry, to: join(stateStaging, 'projects.previous.json') }] : []), { from: join(stateStaging, 'projects.json'), to: layout.registry }];
  }
  // Grouping suggestions are derived from file facts, memoized by content hash.
  const facts = new Map<string, FileFacts>();
  // `filesOf` picks whose files a project is indexed from: the published state by default.
  function indexedFiles({ view }: Reader, filesOf: (slug: string) => Pick<Place, 'cache' | 'layout'> = () => publishedBase): IndexedFile[] {
    return projects().flatMap(projectEntry => {
      const files = filesOf(projectEntry.slug);
      return files.cache
        .files(projectEntry.slug)
        .filter(f => isDefinitionFile(f) && (!view || view.canRead(projectEntry.slug, f.path)))
        .flatMap(cachedFile => {
          let fx = facts.get(cachedFile.hash);
          if (!fx) {
            try {
              const bytes = readFileSync(indexedFile(files.layout, projectEntry.slug, cachedFile.path));
              fx = factsOf(decode(bytes), cachedFile.path);
            } catch {
              return [];
            }
            facts.set(cachedFile.hash, fx);
          }
          return [{ project: projectEntry.slug, path: cachedFile.path, hash: cachedFile.hash, facts: fx }];
        });
    });
  }
  // Suggestions follow reads: a person's own copy where they edit, the published state elsewhere.
  // The shared index serves everyone who has no copy.
  function personalIndex(reader: Reader, shared: IndexedFile[]) {
    if (!reader.copy) return shared;
    const filesOf = (slug: string) => copies.filesFor(reader, slug);
    if (projects().every(p => filesOf(p.slug) === published)) return shared;
    return indexedFiles(LOCAL_READER, filesOf);
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
    return suggestionsFrom(personalIndex(reader, indexedFiles(LOCAL_READER)), reader);
  }
  let closed = false;
  // A payload-free trigger: the event hub debounces it and counts for each connected client.
  function notifySuggestions() {
    if (!closed) events.emit('suggestions', {}, { audience: 'all' });
  }
  function readFile(slug: string, path: string, reader: Reader = LOCAL_READER) {
    entry(slug);
    const place = copies.readPlace(reader, slug);
    const file = projectFile(place.layout, slug, path);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(file);
    } catch {
      throw new NotFoundError('File not found.');
    }
    const relativePath = projectPath(path);
    const hash = sha256(bytes);
    const cached = place.cache.file(slug, relativePath);
    return {
      path: relativePath,
      source: decode(bytes),
      hash,
      docType: cached?.docType ?? 'unknown',
      valid: cached?.valid ?? false,
      findings: cached && cached.hash === hash ? place.cache.findings(slug, relativePath) : indexBytes(slug, relativePath, bytes).findings,
    };
  }
  // Legacy clients accept both `<project>/<path>` IDs and IDs from the old database.
  function resolveId(id: string) {
    const legacy = state.legacyIds().ids[id];
    if (legacy) return legacy;
    const slash = id.indexOf('/');
    if (slash < 1) throw new NotFoundError('Document not found.');
    return { project: id.slice(0, slash), path: id.slice(slash + 1) };
  }
  function documentsFor(reader: Reader) {
    const { view } = reader;
    return projects().flatMap(projectEntry => {
      const place = copies.readPlace(reader, projectEntry.slug);
      return place.cache
        .files(projectEntry.slug)
        .filter(f => f.visible && (!view || view.canRead(projectEntry.slug, f.path)))
        .flatMap(cachedFile => {
          let source: string;
          try {
            source = decode(readFileSync(indexedFile(place.layout, projectEntry.slug, cachedFile.path)));
          } catch {
            return [];
          }
          return [
            {
              id: `${projectEntry.slug}/${cachedFile.path}`,
              filename: posix.basename(cachedFile.path),
              source,
              revision: revisionOf(cachedFile.hash),
              hash: cachedFile.hash,
              project: projectEntry.slug,
              path: cachedFile.path,
              updated: cachedFile.indexedAt,
            },
          ];
        });
    });
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
        const status = await git.status(join(layout.projects, repo));
        events.emit(
          'git',
          {
            project: slug,
            repo,
            projects: projectsInRepo,
            branch: status.branch,
            ahead: status.ahead,
            behind: status.behind,
            changes: status.changes,
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
          if (!projects().some(p => p.slug === slug) || !existsSync(projectDir(layout, slug))) return;
          await rescan(slug);
          if (gitChanged && gitAvailable) announceGitChange(slug);
        },
        all: () => projects().map(p => p.slug),
        locate: slug => locationOf(entry(slug)),
      })
    : null;
  const worktrees = createWorktrees({ layout, git, people: () => copies.owners() });
  // The repository paths of files that copy-less trash entries hold, per repository folder.
  function trashedPaths(): Map<string, Set<string>> {
    const byRepo = new Map<string, Set<string>>();
    for (const id of readdirSync(layout.trash)) {
      const kept = readJsonFile<TrashEntry>(join(layout.trash, id, 'entry.json'));
      const project = projects().find(item => item.slug === kept?.project);
      if (!kept || kept.kind !== 'file' || kept.copy || !kept.path || !project) continue;
      const repo = locationOf(project).repo;
      const paths = byRepo.get(repo) ?? new Set<string>();
      paths.add(projectPrefix(layout, project.slug) + kept.path);
      byRepo.set(repo, paths);
    }
    return byRepo;
  }
  async function reconcilePublishedCheckouts() {
    const trashed = trashedPaths();
    for (const repo of new Set(projects().map(project => locationOf(project).repo))) {
      const dir = join(layout.projects, repo);
      if (!existsSync(join(dir, '.git'))) continue;
      const report = options.log ?? ((line: string) => log.info('workspace.reconcile', { detail: line }));
      const paths = trashed.get(repo) ?? new Set<string>();
      await restoreTrashedDeletions({ git, dir, repo, trashed: paths, log: report });
    }
  }
  // A stop between moving the default branch and moving the published files is finished here.
  if (gitAvailable) for (const repo of new Set(projects().map(project => locationOf(project).repo))) if (existsSync(join(layout.projects, repo, '.git'))) await worktrees.repairBase(repo);
  if (gitAvailable && options.reconcilePublished) await reconcilePublishedCheckouts();
  for (const projectEntry of projects())
    if (existsSync(projectDir(layout, projectEntry.slug))) {
      await scanner.scan(projectEntry.slug);
      watcher?.add(projectEntry.slug);
    }
  for (const recoveryOutcome of recovery) events.emit('recovery', { outcome: recoveryOutcome.outcome }, { audience: 'all' });
  const repoOf = (slug: string) => locationOf(entry(slug)).repo;
  const projectsIn = (repo: string) =>
    projects()
      .filter(project => locationOf(project).repo === repo)
      .map(project => project.slug);
  // Source Control over one place. In a person's copy only their own drafts block a switch or
  // pull, and a branch another copy holds is refused.
  function scmIn(place: Omit<Place, 'scm'>) {
    const drafts = place.copy ? state.ownerState(place.copy) : state;
    const own = place.copy;
    return createScm({
      layout: place.layout,
      git,
      gitAvailable,
      siblings: slug => projectsIn(repoOf(slug)),
      project: slug => entry(slug),
      drafts: slug =>
        drafts
          .drafts()
          .filter(d => d.project === slug)
          .map(d => d.path),
      rescan: slug => rescanIn(place, slug),
      emit: (e, d, tags) => events.emit(e, d, place.tags(tags)),
      defaultBranch: slug => worktrees.defaultBranch(repoOf(slug)),
      ...(own
        ? copyScmHooks(own, {
            worktrees,
            repoOf,
            owners: () => copies.owners(),
            followRemote: (slug, remote, follow) => publishing.followRemote(slug, remote, follow),
          })
        : {}),
    });
  }
  const publishedBase = { copy: null, layout, cache, scanner, tags: (tags: EventTags) => tags };
  const published: Place = { ...publishedBase, scm: scmIn(publishedBase) };
  const scm = published.scm;
  const copies = createWorkingCopies({
    layout,
    cache,
    git,
    gitAvailable,
    worktrees,
    state,
    published,
    repoOf,
    projectsIn,
    scmFor: scmIn,
    rescan: (place, slug) => rescanIn(place, slug),
    watch: !!options.watch,
    debounceMs: options.debounceMs,
    rescanMs: options.rescanMs,
    now: options.now ?? Date.now,
    idleMs: options.copyIdleMs,
  });
  const publishing = createPublishing({
    worktrees,
    copies,
    repoOf,
    projectsIn,
    rescan,
    emit: (e, d, tags) => events.emit(e, d, tags),
  });
  const unpublished = createUnpublishedWork({
    git,
    gitAvailable,
    worktrees,
    copies,
    state,
    repoOf,
    folderOf: slug => projectPrefix(layout, slug).replace(/\/$/, ''),
  });
  const importBatch = createImportBatch({
    layout,
    git,
    gitAvailable,
    journal,
    state,
    scanner,
    cache,
    copies,
    events,
    lock,
    projects,
    entry,
    registrySteps,
    projectLock,
    rescanIn,
    watchProject: slug => watcher?.add(slug),
    notifySuggestions,
    examplesDir,
  });
  const { createProjectFolder } = importBatch;
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
    copyLayout: copy => copyLayout(layout, copy),
    afterFiles: (slug, copy) => (copy ? rescanIn(copies.placeOf(copy), slug) : rescan(slug)),
    writeCopy: async (reader, slug) => (await copies.writePlace(reader, slug)).copy,
    archiveCopies: (removed, entryDir) => unpublished.archiveCopies(removed, entryDir),
    removeCopies: entryDir => unpublished.removeCopies(entryDir),
    forgetProject: slug => {
      watcher?.remove(slug);
      cache.removeProject(slug);
      cache.removeProjectFromCopies(slug);
      notifySuggestions();
    },
    adoptProject: async slug => {
      await scanner.scan(slug);
      watcher?.add(slug);
      notifySuggestions();
    },
    createProject: (name, origin, files) => createProjectFolder(name, origin, files),
  });
  const documentSave = createDocumentSave({ layout, git, gitAvailable, journal, state, copies, trash, lock, entry, projectLock, rescanIn });
  const { saveFile } = documentSave;
  const { moveFile } = createFileMove({ layout, journal, state, copies, lock, entry, projectLock, rescanIn });
  async function acceptSuggestion(id: string, reader: Reader) {
    const suggestion = suggestions(reader).find(x => x.id === id);
    if (!suggestion) throw new NotFoundError('Suggestion not found or no longer valid.');
    const moved = await moveFile(suggestion.file.project, suggestion.file.path, suggestion.targetProject, undefined, true, reader);
    notifySuggestions();
    return moved;
  }
  function rejectSuggestion(id: string, reader: Reader) {
    const { owner } = reader;
    const personal = owner ? state.forOwner(owner) : state;
    const suggestion = suggestions(reader).find(x => x.id === id);
    if (!suggestion) throw new NotFoundError('Suggestion not found or no longer valid.');
    const current = personal.suggestions().rejected;
    personal.writeSuggestions([
      ...current,
      {
        hash: suggestion.file.hash,
        target: suggestion.targetProject,
        project: suggestion.file.project,
        path: suggestion.file.path,
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
    definitionCount: slug => cache.files(slug).filter(isDefinitionFile).length,
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
  const gitIdentity = createGitIdentity({ layout, git, gitAvailable, events, projects, entry, repositories });
  const projectFolders = createProjectFolders({
    layout,
    git,
    journal,
    projects,
    lock,
    projectLockKey: slug => projectLockKey(slug, null),
    registrySteps,
    drafts: slug =>
      state
        .drafts()
        .filter(draft => draft.project === slug)
        .map(draft => draft.path),
    refreshed: async slug => {
      await scm.refresh(slug);
    },
  });
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
    manifestFolder: async (repo, reader, write) => {
      const slug = projectsIn(repo)[0];
      if (!slug || !reader.copy) return join(layout.projects, repo);
      const place = write ? await copies.writePlace(reader, slug) : copies.readPlace(reader, slug);
      const dir = repoDir(place.layout, slug);
      // A copy in the middle of a merge cannot commit the manifest, so nothing is written.
      if (write && (await git.merging(dir))) throw new MergingError([]);
      return dir;
    },
    // The manifest must be committed in the copy before the registry follows it.
    manifestSaved: async (dir, reader) => {
      const message = 'Choose the projects of this repository';
      const saved = await git.commitPaths(dir, [MANIFEST_FILE], message, reader.copy?.author);
      if (saved.committed || saved.reason === 'nothing') return;
      if (saved.reason === 'merging') throw new MergingError([]);
      throw new GitError(`The manifest was not committed (${saved.reason}).`);
    },
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
    ...gitIdentity,
    revertFile: documentSave.revertFile,
    importBatch: importBatch.importBatch,
    loadExample: importBatch.loadExample,
    /** Git availability, per-repository identity (checked now), and start-up reports. */
    async status() {
      const repositories = await repositoryStatus();
      // Without projects there is no repository to check, so Git's global identity decides.
      const identityConfigured = repositories.length ? repositories.every(repository => repository.identityConfigured) : gitAvailable && (await git.identity());
      return {
        gitAvailable,
        identityConfigured,
        repositories,
        dataRoot: layout.root,
        migration,
        recovery,
      };
    },
    /** A repository's project folders, with the manifest as the reader sees it. */
    projectCandidates: (repo: string, reader?: Reader) => repositoryProjects.candidates(repo, reader),
    registerRepositoryProjects: repositoryProjects.register,
    /** Previews and applies moving a project into a folder of its repository. */
    projectFolders,
    /** Takes a project out of the workspace without deleting anything: its folder, history,
     * drafts and view settings stay where they are. */
    /** Takes a subfolder project out of the workspace without deleting anything. */
    removeProject: (slug: string) => repositoryProjects.remove(slug),
    clone: (url: unknown, name: unknown, { owner }: Reader, assign?: AssignProject, credential?: RemoteCredential, sparse: FolderRequest = {}) =>
      cloner.start(url, name, { owner, assign, credential, ...sparse }),
    cancelClone: cloner.cancel,
    lock,
    rescan,
    /** Fast-forwards the default branch to the person's working copy. */
    publish: (slug: string, reader: Reader) => {
      entry(slug);
      return publishing.publish(slug, reader);
    },
    /** How much of each person's work on the project's repository is not published yet. */
    unpublishedWork: (slug: string) => {
      entry(slug);
      return unpublished.unpublishedWork(slug);
    },
    /** Source Control of the copy a person works in, created on first use; published otherwise. */
    scmFor: async (slug: string, reader: Reader) => {
      entry(slug);
      return (await copies.writePlace(reader, slug)).scm;
    },
    /** Source Control of the place a request reads, without creating a copy. */
    readScm: (slug: string, reader: Reader) => {
      entry(slug);
      return copies.readPlace(reader, slug).scm;
    },
    /** Source Control of the place a change would run in, without creating a copy. */
    pendingScm: (slug: string, reader: Reader) => {
      entry(slug);
      return copies.pendingWritePlace(reader, slug).scm;
    },
    /** The file a request reads, in the person's copy when they have one. */
    filePath: (slug: string, path: string, reader: Reader) => projectFile(copies.readPlace(reader, slug).layout, slug, path),
    /**
     * Whether a draft may belong to the path: a file the person's place holds on disk or in its
     * index. A case variant of an existing name is refused.
     */
    hasFile: (slug: string, path: string, reader: Reader) => {
      entry(slug);
      const place = copies.readPlace(reader, slug);
      const relative = projectPath(path);
      return existsSync(projectFile(place.layout, slug, relative)) || place.cache.file(slug, relative) !== null;
    },
    /** Moves a file to the trash from the place the person edits it in. */
    deleteFile: async (slug: string, path: string, reader: Reader) => {
      entry(slug);
      const relativePath = projectPath(path);
      const check = (at: Place) => guardDeletion(at.layout, slug, relativePath, reader.guard);
      const place = await copies.writePlace(reader, slug, check);
      return trash.deleteFile(slug, path, reader.owner, reader, place.copy);
    },
    /** People's copies in use now, with the repository folders watched for each. */
    activeCopies: () => copies.active(),
    /** Releases copies idle longer than the idle period; their files and drafts stay. */
    releaseIdleCopies: () => copies.releaseIdle(),
    worktrees,
    /** The repository folder of a registered project. */
    repoOf,
    project: entry,
    registrySteps,
    readFile,
    saveFile,
    saveFiles: documentSave.saveFiles,
    documents: () => documentsFor(LOCAL_READER),
    documentsFor,
    resolveId,
    preflight,
    trash,
    moveFile,
    importInto: importBatch.importInto,
    /**
     * Plans the zip export of a project's files as the reader sees them, or throws before
     * anything is sent when the project is too large or the history may not be exported.
     */
    exportProject: (slug: string, reader: Reader, options: ExportOptions, maxBytes: number) => {
      entry(slug);
      const place = copies.readPlace(reader, slug);
      const deps = {
        layout: place.layout,
        git,
        gitAvailable,
        scratchDir: join(layout.state, 'exports'),
        maxBytes,
        listPaths: (dir: string) => (gitAvailable ? git.lsFiles(dir) : walk(dir)),
      };
      return planProjectExport(deps, slug, reader, options);
    },
    deleteImpact: (slug: string, path: string | undefined, reader: Reader) =>
      reportDeleteImpact({ entry, projects, state, copies, indexedFiles: () => indexedFiles(LOCAL_READER) }, slug, path, reader),
    suggestions,
    /** One person's open suggestion count from a shared unrestricted index. */
    suggestionCount: (reader: Reader, index: IndexedFile[]) => suggestionsFrom(personalIndex(reader, index), reader).length,
    acceptSuggestion,
    rejectSuggestion,
    async listProjects(reader: Reader) {
      const { view } = reader;
      const facts: RepositoryFacts = new Map();
      return Promise.all(
        projects()
          .filter(p => !view || view.readableProjects.has(p.slug))
          .map(async projectEntry => {
            const place = copies.readPlace(reader, projectEntry.slug);
            const cache = place.cache;
            let gitInfo = { branch: '', ahead: 0, behind: 0, changes: 0 };
            if (gitAvailable && existsSync(projectDir(place.layout, projectEntry.slug)))
              try {
                const status = await git.status(repoDir(place.layout, projectEntry.slug));
                gitInfo = {
                  branch: status.branch,
                  ahead: status.ahead,
                  behind: status.behind,
                  changes: status.changes,
                };
              } catch {}
            const location = locationOf(projectEntry);
            return {
              slug: projectEntry.slug,
              name: projectEntry.name,
              origin: projectEntry.origin,
              createdAt: projectEntry.createdAt,
              repo: location.repo,
              // The project's folder inside its repository; empty for the repository itself.
              folder: location.folder === location.repo ? '' : location.folder.slice(location.repo.length + 1),
              ...gitInfo,
              ...(view
                ? {
                    copy: await copies.copyInfo(reader, projectEntry.slug, gitInfo.branch, facts),
                    hiddenFiles: cache.files(projectEntry.slug).filter(f => f.visible && !view.canRead(projectEntry.slug, f.path)).length,
                    changes: cache.files(projectEntry.slug).filter(f => view.canRead(projectEntry.slug, f.path) && f.gitState !== 'clean').length,
                  }
                : {}),
              files: cache
                .files(projectEntry.slug)
                .filter(f => f.visible && (!view || view.canRead(projectEntry.slug, f.path)))
                .map(cachedFile => ({
                  path: cachedFile.path,
                  docType: cachedFile.docType,
                  layout: cachedFile.layout,
                  valid: cachedFile.valid,
                  visible: cachedFile.visible,
                  gitState: cachedFile.gitState,
                  hash: cachedFile.hash,
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
    renameProject: (slug: string, name: unknown) =>
      lock('registry', () => {
        const current = projects();
        const projectEntry = entry(slug);
        const value = projectName(
          name,
          current.map(x => x.name),
          projectEntry.name,
        );
        state.writeRegistry(current.map(x => (x.slug === slug ? { ...x, name: value } : x)));
        events.emit('projects', { added: [], removed: [], renamed: [{ slug, name: value }] }, { projects: [slug] });
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
        if (target && view && !view.readableProjects.has(target.slug)) throw new OccupiedError('The target is unavailable.', {});
        // A project that does not exist yet holds no file, so the requested name is free.
        const place = target ? copies.readPlace(reader, target.slug) : published;
        const free = target ? freeReadableName(place, target.slug, path, view) : path;
        if (free === null) throw new OccupiedError('The target is unavailable.', {});
        const authorizeIn = (slug: string) => authorizeTargets?.([{ project: slug, path: free }]);
        if (target) authorizeIn(target.slug);
        else target = await createProjectFolder('Ungrouped', 'import', [], 'ungrouped', authorizeIn);
        await saveFile(target.slug, free, { baseHash: null, source }, reader);
        return documentsFor(reader).find(d => d.project === target!.slug && d.path === free)!;
      }
      const ref = resolveId(id);
      if (view && !view.canRead(ref.project, ref.path)) throw new HiddenResourceError();
      if (posix.basename(ref.path) !== filename) throw new BadRequestError('Renaming through the documents API is not supported.');
      let current: string | null = null;
      const place = copies.readPlace(reader, ref.project);
      try {
        current = sha256(readFileSync(projectFile(place.layout, ref.project, ref.path)));
      } catch {
        throw new NotFoundError('Document not found.');
      }
      const base = version?.baseHash ?? (version?.revision !== undefined && version.revision === revisionOf(current) ? current : undefined);
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
    saveGrouping(id: string, value: unknown, reader: Reader) {
      const { view, owner } = reader;
      const personal = owner ? state.forOwner(owner) : state;
      const ref = resolveId(id);
      if (view && !view.canRead(ref.project, ref.path)) throw new HiddenResourceError();
      const place = copies.readPlace(reader, ref.project);
      const indexed = place.cache.file(ref.project, ref.path);
      if (!indexed) throw new NotFoundError('Document not found.');
      return lock(projectLockKey(ref.project, place.copy), () => {
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
      copies.close();
      cache.close();
    },
  };
}
export type Workspace = Awaited<ReturnType<typeof openWorkspace>>;
export { PathError };
