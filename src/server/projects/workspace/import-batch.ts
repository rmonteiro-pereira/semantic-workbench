// Imports files into a project or into a new project: it checks the batch, picks names that do not
// clash, commits the imported paths, and stages a new project folder with the registry change.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { validateInput } from '../../../shared/validation/input';
import { InputError, type Issue } from '../../../shared/validation/diagnostics';
import { exampleSet } from '../../../shared/projects/examples';
import { atomicWrite, decode, encode, sha256 } from '../atomic';
import type { Cache } from '../cache';
import type { Events } from '../events';
import type { CommitAuthor, Git } from '../git';
import type { Journal } from '../journal';
import { disambiguate, projectDir, projectFile, projectName, projectPrefix, projectPath, repoDir, slugify, uniqueName, type DataLayout } from '../paths';
import type { Reader } from '../reader';
import type { Scanner } from '../scanner';
import { indexBytes } from '../scanner';
import type { ProjectEntry, State } from '../state';
import type { Place, WorkingCopies } from '../working-copies';
import { BadRequestError, ConflictError, NotFoundError, OccupiedError } from '../errors';
import { demotionsOf, type ContentGuard, type Demotion } from '../../auth/guards';
import { NEW_PROJECT } from '../../auth/resource';
import { log } from '../../observability/log';
import { clearPersonalDrafts } from '../personal-state';
import { committedText } from './document-save';

/** A project-relative path and the source text to import there. */
export type ImportFile = { path: string; source: string };
/** Records an import commit or explains why no commit was created. */
export type ImportCommit = { committed: true; commit: string; message: string } | { committed: false; reason: 'no-git' | 'no-identity' | 'merging' | 'nothing' };
/** Builds an import commit message naming the file or count and optional subfolder. */
export function importMessage(paths: string[], subfolder = '') {
  const what = paths.length === 1 ? posix.basename(paths[0]) : `${paths.length} files`;
  return `Import ${what}${subfolder ? ` into ${subfolder}` : ''}`;
}

export function preflight(files: ImportFile[]) {
  if (!Array.isArray(files) || !files.length || files.length > 500) throw new BadRequestError('Expected 1–500 files.');
  const paths = new Set<string>();
  const issues: Issue[] = [];
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.source !== 'string') throw new BadRequestError('Each file needs a path and source text.');
    const path = projectPath(file.path);
    if (paths.has(path)) throw new BadRequestError(`Duplicate path in batch: ${path}`);
    paths.add(path);
    const indexed = indexBytes('preflight', path, encode(file.source));
    if (!indexed.file.visible)
      issues.push({
        severity: 'error',
        code: 'unsupported',
        path: '/',
        message: `${path}: unsupported file type.`,
      });
    else if (!indexed.file.valid) issues.push(...indexed.findings.filter(i => i.severity === 'error').map(i => ({ ...i, message: `${path}: ${i.message}` })));
  }
  if (issues.length) throw new InputError(issues);
  return files.map(f => ({ path: projectPath(f.path), source: f.source }));
}
// Use the contained ontology or semantic model name to give the import a recognizable project
// name.
function batchName(files: ImportFile[]) {
  const models = files.map(f => validateInput(f.source, posix.basename(f.path)).model);
  for (const kind of ['Ossie ontology', 'Ossie semantic'])
    for (const model of models) if (model?.kind === kind && typeof model.name === 'string' && model.name.trim()) return model.name.trim().slice(0, 200);
  return posix.basename(files[0].path).replace(/\.[^.]+$/, '') || 'Imported files';
}

// The names a keep-both choice must avoid: those this reader can see, plus names already taken
// in the same batch. Hidden names are left out so the choice does not reveal them.
function visibleNames(place: Place, slug: string, view: Reader['view'], batchNames: Iterable<string> = []) {
  const taken = new Set(batchNames);
  for (const file of place.cache.files(slug)) {
    if (!view || view.canRead(slug, file.path)) taken.add(file.path);
  }
  return taken;
}
// A keep-both name chosen among the visible names. A name the reader cannot open is refused, so
// a hidden file is neither revealed nor replaced. A file on disk that the cache does not list
// counts as hidden for a person.
export function freeReadableName(place: Place, slug: string, path: string, view: Reader['view'], batchNames: Iterable<string> = []) {
  const taken = visibleNames(place, slug, view, batchNames);
  for (;;) {
    const free = disambiguate(path, taken);
    if (view && !view.canRead(slug, free)) return null;
    if (!existsSync(projectFile(place.layout, slug, free))) return free;
    if (view) return null;
    taken.add(free);
  }
}
// The name each imported file is written under. Keep-both names are chosen before anything is
// staged, so a refused name leaves the project untouched.
function importTargets(
  place: Place,
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
    const free = freeReadableName(place, slug, file.path, view, taken);
    // A refused name is still the one this reader would get, so authorization judges it first.
    const name = free ?? disambiguate(file.path, visibleNames(place, slug, view, taken));
    if (!free) refused = true;
    taken.add(name);
    return name;
  });
  authorizePaths?.(targets);
  if (refused) throw new OccupiedError('The target is unavailable.', {});
  return targets;
}
// The names of a batch already taken in a project: indexed files and files on disk.
function existingNames(place: Place, slug: string, batch: ImportFile[]) {
  const dir = projectDir(place.layout, slug);
  const existing = new Set(place.cache.files(slug).map(f => f.path));
  for (const importFile of batch) if (existsSync(join(dir, importFile.path))) existing.add(importFile.path);
  return existing;
}
/** The files of a project being created, as the guard returns them. */
function guardedNewProject(files: ImportFile[], guard: ContentGuard | undefined, domain: string | undefined): ImportFile[] {
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

/** The workspace services the import use cases run on; the composition root supplies them. */
export type ImportBatchContext = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  journal: Journal;
  state: State;
  scanner: Scanner;
  cache: Cache;
  copies: WorkingCopies;
  events: Events;
  lock: <T>(key: string, fn: () => Promise<T> | T) => Promise<T>;
  projects: () => ProjectEntry[];
  entry: (slug: string) => ProjectEntry;
  registrySteps: (stateStaging: string, next: ProjectEntry[]) => { from: string; to: string }[];
  projectLock: (place: Place, slug: string) => string;
  rescanIn: (place: Pick<Place, 'scanner' | 'tags'>, slug: string) => Promise<unknown>;
  /** Starts watching a project folder that was just registered. */
  watchProject: (slug: string) => void;
  notifySuggestions: () => void;
  examplesDir: string;
};

/** Import use cases: files into a project, a batch into a new project, and bundled examples. */
export function createImportBatch(ctx: ImportBatchContext) {
  const { layout, git, gitAvailable, journal, state, scanner, cache, copies, events, lock, projects, registrySteps, projectLock, rescanIn, watchProject, notifySuggestions, examplesDir, entry } = ctx;
  // Stage a new project folder, then move it and the new registry into place in one journaled
  // operation. A caller that must authorize the final slug gets it before anything is written,
  // because a stray folder on disk can make it differ from the preferred one.
  async function createProjectFolder(name: string, origin: string, files: ImportFile[], preferredSlug?: string, beforeCreate?: (slug: string) => void) {
    return lock('registry', async () => {
      const current = projects();
      const finalName = uniqueName(
        name,
        current.map(p => p.name),
      );
      const taken = new Set(current.map(p => p.slug));
      for (const name of safeDirs(layout.projects)) taken.add(name);
      const slug = preferredSlug && !taken.has(preferredSlug) ? preferredSlug : slugify(finalName, taken);
      beforeCreate?.(slug);
      const opId = journal.newId();
      const staging = join(layout.projects, `.staging-${opId}`);
      const stagedProject = join(staging, slug);
      const stateStaging = join(layout.state, `.staging-${opId}`);
      try {
        mkdirSync(stagedProject, { recursive: true });
        for (const importFile of files) {
          const bytes = encode(importFile.source);
          const file = join(stagedProject, importFile.path);
          atomicWrite(file, bytes);
          if (sha256(readFileSync(file)) !== sha256(bytes)) throw Error(`Could not verify ${importFile.path} after writing.`);
        }
        let commit: ImportCommit = { committed: false, reason: 'no-git' };
        if (gitAvailable) {
          await git.init(stagedProject);
          if (files.length)
            commit = await commitFiles(
              stagedProject,
              files.map(f => f.path),
            );
          else if (await git.identity(stagedProject)) await git.commit(stagedProject, 'Create project', true);
        }
        const project: ProjectEntry = {
          slug,
          name: finalName,
          createdAt: new Date().toISOString(),
          origin,
        };
        const steps = [{ from: stagedProject, to: projectDir(layout, slug) }, ...registrySteps(stateStaging, [...current, project])];
        journal.run(origin === 'import' ? 'import' : 'create', steps, [staging, stateStaging], opId);
        await scanner.scan(slug);
        watchProject(slug);
        notifySuggestions();
        events.emit('projects', { added: [slug], removed: [], renamed: [] }, { projects: [slug] });
        return Object.assign({}, project, { commit });
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        rmSync(stateStaging, { recursive: true, force: true });
        throw error;
      }
    });
  }
  // Commit only imported paths to preserve unrelated work; prefix paths for subfolder projects.
  async function commitFiles(repo: string, paths: string[], prefix = '', author?: CommitAuthor): Promise<ImportCommit> {
    if (!gitAvailable) return { committed: false, reason: 'no-git' };
    const message = importMessage(paths, prefix.replace(/\/$/, ''));
    const commitPathsResult = await git.commitPaths(
      repo,
      paths.map(p => prefix + p),
      message,
      author,
    );
    return commitPathsResult.committed ? { committed: true, commit: commitPathsResult.commit, message } : commitPathsResult;
  }
  // The text each imported file is written with. A replaced file is compared with the file it
  // replaces, a new one with nothing, and an approved metric may come back as proposed.
  async function guardedImport(files: DataLayout, slug: string, batch: ImportFile[], targets: string[], guard: ContentGuard | undefined): Promise<{ sources: string[]; demoted: Demotion[] }> {
    if (!guard) return { sources: batch.map(file => file.source), demoted: [] };
    const changes = [];
    for (const [position, file] of batch.entries()) {
      const path = targets[position];
      const full = projectFile(files, slug, path);
      const before = existsSync(full) ? decode(readFileSync(full)) : null;
      const committed = await committedText({ git, gitAvailable }, files, slug, path);
      changes.push({ project: slug, path, before, after: file.source, committed });
    }
    // An import replacing an approved metric is a save: the metric comes back as proposed.
    const outcome = guard(changes, { operation: 'import', demote: true });
    const sources = outcome.changes.map(change => change.after ?? '');
    return { sources, demoted: demotionsOf(outcome) };
  }
  // Name clashes require an explicit replace or keep-both choice before any files change.
  async function importInto(slug: string, files: ImportFile[], onConflict: 'replace' | 'keep-both' | undefined, reader: Reader, authorizePaths?: (paths: string[]) => void) {
    entry(slug);
    const batch = preflight(files);
    authorizePaths?.(batch.map(file => file.path));
    if (reader.view && batch.some(file => !reader.view!.canRead(slug, file.path))) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    if (onConflict !== undefined && onConflict !== 'replace' && onConflict !== 'keep-both') throw new BadRequestError('onConflict must be replace or keep-both.');
    // Final names and their content are judged before a first write creates the person's copy;
    // the copy starts with the same files, and both are checked again under the lock below.
    const planned = importTargets(copies.readPlace(reader, slug), slug, batch, {
      existing: existingNames(copies.readPlace(reader, slug), slug, batch),
      keepBoth: onConflict === 'keep-both',
      view: reader.view,
      authorizePaths,
    });
    const { guard } = reader;
    const check = (at: Place) => guardedImport(at.layout, slug, batch, planned, guard);
    const place = await copies.writePlace(reader, slug, check);
    return lock(projectLock(place, slug), async () => {
      const dir = projectDir(place.layout, slug);
      const existing = existingNames(place, slug, batch);
      const conflicts = batch.filter(f => existing.has(f.path)).map(f => f.path);
      if (conflicts.length && !onConflict) throw new ConflictError(conflicts);
      const { view } = reader;
      const targets = importTargets(place, slug, batch, {
        existing,
        keepBoth: onConflict === 'keep-both',
        view,
        // Final names are checked while the project lock keeps another import from taking them.
        authorizePaths,
      });
      const imported = await guardedImport(place.layout, slug, batch, targets, guard);
      const { sources, demoted } = imported;
      const opId = journal.newId();
      const staging = join(place.layout.projects, `.staging-${opId}`);
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
        steps.push(...clearPersonalDrafts(state, slug, replaced, staging, place.copy ?? undefined));
        journal.run('import', steps, [staging], opId);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
      }
      let commit: ImportCommit;
      try {
        commit = await commitFiles(
          repoDir(place.layout, slug),
          written.map(w => w.path),
          projectPrefix(layout, slug),
          reader.copy?.author,
        );
      } catch (error) {
        log.failure('import.commit-failed', error);
        commit = { committed: false, reason: 'nothing' };
      }
      await rescanIn(place, slug);
      if (commit.committed)
        try {
          await place.scm.refresh(slug);
        } catch {}
      return { written, commit, ...(demoted.length ? { demoted } : {}) };
    });
  }
  /**
   * Creates a project from an import. Its files are judged as created by the person, as files
   * of the project's chosen domain, before the project exists.
   */
  async function importBatch(body: { name?: unknown; files: ImportFile[] }, reader: Reader, creating: { domain?: string } = {}) {
    const files = guardedNewProject(preflight(body.files), reader.guard, creating.domain);
    const name = body.name === undefined ? batchName(files) : projectName(body.name);
    const project = await createProjectFolder(name, 'import', files);
    return {
      slug: project.slug,
      name: project.name,
      written: files.map(f => ({ path: f.path, hash: sha256(encode(f.source)) })),
      commit: project.commit,
    };
  }
  async function loadExample(id: string) {
    const set = exampleSet(id);
    if (!set) throw new NotFoundError('Unknown example.');
    const existing = projects().find(p => p.origin === `example:${id}`);
    if (existing && existsSync(projectDir(layout, existing.slug))) return { slug: existing.slug, name: existing.name, created: false };
    const files = set.files.map(name => ({
      path: name,
      source: readFileSync(join(examplesDir, set.folder, name), 'utf8'),
    }));
    // A project that already holds every example file with identical bytes is opened, not
    // duplicated.
    const hashes = new Map(files.map(f => [f.path, sha256(encode(f.source))]));
    const same = projects().find(p => files.every(f => cache.file(p.slug, f.path)?.hash === hashes.get(f.path)));
    if (same) return { slug: same.slug, name: same.name, created: false };
    const project = await createProjectFolder(set.name, `example:${id}`, files, set.id);
    return { slug: project.slug, name: project.name, created: true, commit: project.commit };
  }
  return { createProjectFolder, commitFiles, importInto, importBatch, loadExample };
}
function safeDirs(dir: string) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
