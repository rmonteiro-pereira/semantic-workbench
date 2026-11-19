// Saves and reverts documents: a stale base is refused, the reader's guard judges the text, and the
// swap is journaled so a crash leaves either the old or the new bytes.
import { DEPENDENCY_MANIFEST_PATH } from '../../../shared/tessera/dependency-manifest';
import { requireWritableOntologySet } from '../../mesh/unit-reader';
import { unitEditMigrations } from './unit-edits';
import type { DeclaredMigration } from '../../../shared/core/address-migration';
import type { OperationOutcome } from '../../auth/operation-outcome';
import { parseAddress } from '../../../shared/core/item-address';
import { deletedItemAddresses } from '../../../shared/edit/address-changes';
import { ADDRESS_HISTORY_FILE, operationMigrations, stageAddressMigrations } from '../address-migrations';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { InputError, MAX_INPUT_BYTES } from '../../../shared/validation/diagnostics';
import { atomicWrite, decode, encode, sha256 } from '../atomic';
import type { Git } from '../git';
import { JournalCrash, type Journal } from '../journal';
import { PathError, projectFile, projectPath, projectPrefix, repoDir, type DataLayout } from '../paths';
import { clearPersonalDrafts } from '../personal-state';
import type { Reader } from '../reader';
import { indexBytes } from '../scanner';
import type { Patch, ProjectEntry, State } from '../state';
import { guardRevert, type GuardedFile, type Trash } from '../trash';
import type { Place, WorkingCopies } from '../working-copies';
import { BadRequestError, GitUnavailableError, OccupiedError, StaleError } from '../errors';
import { demotionsOf, type ContentGuard } from '../../auth/guards';

/** Applies ordered UTF-16 ranges from the end, preserving untouched source text exactly. */
export function applyPatches(base: string, patches: Patch[]) {
  if (!Array.isArray(patches) || patches.length > 10_000) throw new BadRequestError('Patches must be an array.');
  let end = 0;
  for (const patch of patches) {
    if (!patch || !Number.isSafeInteger(patch.from) || !Number.isSafeInteger(patch.to) || typeof patch.insert !== 'string' || patch.from < end || patch.to < patch.from || patch.to > base.length)
      throw new BadRequestError('Patches must be ordered, non-overlapping ranges inside the base text.');
    end = patch.to;
  }
  let out = base;
  for (const patch of [...patches].reverse()) out = out.slice(0, patch.from) + patch.insert + out.slice(patch.to);
  return out;
}

/** The checks a definition passes before any byte is stored: its size, its type and, through the index, its syntax. */
function checkedBytes(slug: string, relativePath: string, text: string) {
  const bytes = encode(text);
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new InputError([{ severity: 'error', code: 'size', path: '/', message: 'The definition exceeds the 2 MB UTF-8 limit. Split it into smaller documents.' }]);
  }
  const indexed = indexBytes(slug, relativePath, bytes);
  if (!indexed.file.visible) throw new InputError([{ severity: 'error', code: 'unsupported', path: '/', message: 'Unsupported file type.' }]);
  return { bytes, indexed };
}

// The file as the last commit has it, so an owner handed over in an earlier save still counts
// for self-approval. Null without Git, without a commit, or for a binary file.
export async function committedText(source: { git: Git; gitAvailable: boolean }, files: DataLayout, slug: string, path: string): Promise<string | null> {
  if (!source.gitAvailable) return null;
  const bytes = await source.git.blob(repoDir(files, slug), 'HEAD', projectPrefix(files, slug) + path);
  if (!bytes) return null;
  try {
    return decode(bytes);
  } catch {
    return null;
  }
}

function addressDocument(value: string): string {
  const parsed = parseAddress(value);
  if (!parsed.ok) throw new BadRequestError('Invalid deleted item locator.');
  return parsed.address.document!.join('/');
}

function verifyDeletedItems(addresses: string[], change: { project: string; path: string; before: string; after: string }) {
  if (!addresses.length) return;
  const removed = new Set(deletedItemAddresses(change.before, change.after, { project: change.project, document: change.path.split('/') }));
  if (addresses.some(address => !removed.has(address))) throw new BadRequestError('A declared item was not removed by this save.');
}

/** The workspace services document saving runs on; the composition root supplies them. */
export type DocumentSaveContext = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  localCommit: (files: DataLayout, project: string) => Promise<string>;
  journal: Journal;
  state: State;
  copies: WorkingCopies;
  trash: Trash;
  lock: <T>(key: string, fn: () => Promise<T> | T) => Promise<T>;
  entry: (slug: string) => ProjectEntry;
  projectLock: (place: Place, slug: string) => string;
  rescanIn: (place: Pick<Place, 'scanner' | 'tags'>, slug: string) => Promise<unknown>;
};

/** Document use cases: saving one or several files, and reverting a file to its committed text. */
export function createDocumentSave(ctx: DocumentSaveContext) {
  const { layout, git, gitAvailable, localCommit, journal, state, copies, trash, lock, entry, projectLock, rescanIn } = ctx;
  async function saveMigrations(files: DataLayout, project: string, id: string, declarations: DeclaredMigration[], deletedItems: string[]) {
    const commit = declarations.length || deletedItems.length ? await localCommit(files, project) : '';
    return operationMigrations({ id, at: new Date().toISOString(), commit }, [...declarations, ...deletedItems.map(from => ({ kind: 'deleted' as const, from }))]);
  }
  // The edit a save makes to the file in a place: a stale base is refused, and the reader's
  // guard, given in server mode, may refuse it or store an approved metric as proposed.
  async function guardedEdit(place: Place, file: GuardedFile, body: { baseHash: string | null; source?: string; patches?: Patch[] }, guard: ContentGuard | undefined) {
    const { slug, path } = file;
    let current: Uint8Array | null = null;
    try {
      current = readFileSync(projectFile(place.layout, slug, path));
    } catch {}
    const currentHash = current ? sha256(current) : null;
    if (body.baseHash !== currentHash) throw new StaleError(currentHash, current ? decode(current) : null);
    const base = current ? decode(current) : '';
    const edited = body.source !== undefined ? body.source : applyPatches(base, body.patches ?? []);
    const before = current ? base : null;
    const committed = guard ? await committedText({ git, gitAvailable }, place.layout, slug, path) : null;
    const change = { project: slug, path, before, after: edited, committed };
    return { edited, before, guarded: guard?.([change]) };
  }
  // Judges proposed text exactly as a save would, through the same edit, guard and index steps, and stores nothing.
  async function validateFile(slug: string, path: string, body: { baseHash?: string | null; source?: string; patches?: Patch[] }, reader: Reader) {
    entry(slug);
    const relativePath = projectPath(path);
    const place = copies.readPlace(reader, slug);
    let current: Uint8Array | null = null;
    try {
      current = readFileSync(projectFile(place.layout, slug, relativePath));
    } catch {}
    const version = current ? sha256(current) : null;
    // Proposed full text needs no base, and a patch is refused against any base other than the current one.
    const base = body.baseHash === undefined && body.source !== undefined ? version : (body.baseHash ?? null);
    const { edited, guarded } = await guardedEdit(place, { slug, path: relativePath }, { baseHash: base, source: body.source, patches: body.patches }, reader.guard);
    const stored = guarded?.changes[0].after ?? edited;
    const { indexed } = checkedBytes(slug, relativePath, stored);
    const demoted = guarded ? demotionsOf(guarded) : [];
    const guard = demoted.length ? { outcome: 'rewritten' as const, demoted, storedSource: stored } : { outcome: 'accepted' as const };
    return { version, valid: indexed.file.valid, findings: indexed.findings, guard };
  }
  function requireCompleteSet(place: Place, project: string, reader: Reader, path: string) {
    const read = (name: string) => {
      if (reader.view && !reader.view.canRead(project, name)) return null;
      try {
        return decode(readFileSync(projectFile(place.layout, project, name)));
      } catch (error) {
        if (error instanceof PathError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    };
    const source = read(path);
    if (source === null) return;
    const rootPaths = () =>
      place.cache
        .files(project)
        .filter(file => file.docType === 'Ossie ontology')
        .map(file => file.path);
    const available = (name: string) => {
      const indexed = place.cache.file(project, name);
      const readable = !reader.view || reader.view.canRead(project, name);
      return Boolean(indexed?.visible && readable);
    };
    requireWritableOntologySet({ path, source }, { available, read, rootPaths });
  }
  async function saveFile(
    slug: string,
    path: string,
    body: { baseHash: string | null; source?: string; patches?: Patch[]; declaredMigrations?: DeclaredMigration[]; deletedItems?: string[]; keepDrafts?: boolean },
    reader: Reader,
    manifestRoots?: ReadonlyMap<string, string>,
  ) {
    const { guard } = reader;
    entry(slug);
    const relativePath = projectPath(path);
    if (relativePath.split('/').at(-1)?.toLowerCase() === ADDRESS_HISTORY_FILE) throw new BadRequestError('Address history is managed by the workbench.');
    if (relativePath === DEPENDENCY_MANIFEST_PATH && !manifestRoots) throw new BadRequestError('Use Update dependencies to write the dependency manifest.');
    const declarations = body.declaredMigrations ?? [];
    const deletedItems = body.deletedItems ?? [];
    const check = async (at: Place) => {
      if (manifestRoots) {
        for (const [root, expectedHash] of manifestRoots) {
          const bytes = readFileSync(projectFile(at.layout, slug, root));
          if (sha256(bytes) !== expectedHash) throw new BadRequestError('The ontology changed. Review the dependency update again.');
        }
      }
      if (!manifestRoots) requireCompleteSet(at, slug, reader, relativePath);
      const result = await guardedEdit(at, { slug, path: relativePath }, body, guard);
      const after = result.guarded?.changes[0].after ?? result.edited;
      verifyDeletedItems(deletedItems, { project: slug, path: relativePath, before: result.before ?? '', after });
      return result;
    };
    const place = await copies.writePlace(reader, slug, check);
    const file = projectFile(place.layout, slug, relativePath);
    return lock(projectLock(place, slug), async () => {
      const { edited, before, guarded } = await check(place);
      const next = guarded?.changes[0].after ?? edited;
      const { bytes, indexed } = checkedBytes(slug, relativePath, next);
      if (!indexed.file.valid) throw new InputError(indexed.findings);
      unitEditMigrations(place, slug, reader, [{ path: relativePath, before, after: next }]);
      const opId = journal.newId();
      const records = await saveMigrations(place.layout, slug, opId, declarations, deletedItems);
      const staging = join(layout.state, `.staging-${opId}`);
      const staged = join(staging, 'source');
      const hash = atomicWrite(staged, bytes);
      const steps = body.keepDrafts ? [] : clearPersonalDrafts(state, slug, [relativePath], staging, place.copy ?? undefined);
      if (existsSync(file)) steps.push({ from: file, to: join(staging, 'previous') });
      steps.push({ from: staged, to: file });
      try {
        steps.push(...stageAddressMigrations({ layout: place.layout, project: slug, staging }, records));
        journal.run('save', steps, [staging], opId);
      } catch (error) {
        if (!(error instanceof JournalCrash)) rmSync(staging, { recursive: true, force: true });
        throw error;
      }
      await rescanIn(place, slug);
      const demoted = guarded ? demotionsOf(guarded) : [];
      // A demoted metric means the stored text differs from what was sent, so it is returned.
      const stored = demoted.length ? { demoted, source: next } : {};
      return { path: relativePath, hash, findings: indexed.findings, ...stored };
    });
  }
  // The edits of a batch in a place: every base hash is checked and every file is guarded before
  // any is validated or staged, so a refusal changes nothing.
  async function guardedEdits(place: Place, slug: string, files: { path: string; baseHash: string | null; source?: string; patches?: Patch[] }[], guard: ContentGuard | undefined) {
    const edited = files.map(edit => {
      const file = projectFile(place.layout, slug, edit.path);
      let current: Uint8Array | null = null;
      try {
        current = readFileSync(file);
      } catch {}
      const currentHash = current ? sha256(current) : null;
      if (edit.baseHash !== currentHash) throw new StaleError(currentHash, current ? decode(current) : null);
      const before = current ? decode(current) : null;
      const next = edit.source !== undefined ? edit.source : applyPatches(before ?? '', edit.patches ?? []);
      return { ...edit, file, current, before, next };
    });
    const changes = [];
    for (const edit of edited) {
      const committed = guard ? await committedText({ git, gitAvailable }, place.layout, slug, edit.path) : null;
      changes.push({
        project: slug,
        path: edit.path,
        before: edit.before,
        after: edit.next,
        committed,
      });
    }
    return { edited, guarded: guard?.(changes) };
  }
  // Journal the file swaps together so related edits can be recovered after a crash.
  async function saveFiles(
    slug: string,
    writes: { path: string; baseHash: string | null; source?: string; patches?: Patch[] }[],
    reader: Reader,
    options: { kind?: string; declaredMigrations?: DeclaredMigration[]; deletedItems?: string[] } = {},
  ) {
    const { guard } = reader;
    const kind = options.kind ?? 'save-files';
    entry(slug);
    if (!Array.isArray(writes) || !writes.length || writes.length > 50) throw new BadRequestError('Expected 1–50 files.');
    const files = writes.map(w => ({ ...w, path: projectPath(w.path) }));
    if (files.some(file => file.path.split('/').at(-1)?.toLowerCase() === ADDRESS_HISTORY_FILE)) throw new BadRequestError('Address history is managed by the workbench.');
    if (files.some(file => file.path === DEPENDENCY_MANIFEST_PATH)) throw new BadRequestError('Use Update dependencies to write the dependency manifest.');
    const declarations = options.declaredMigrations ?? [];
    const deletedItems = options.deletedItems ?? [];
    if (new Set(files.map(f => f.path)).size !== files.length) throw new BadRequestError('Each file may appear once.');
    if (reader.view && files.some(file => !reader.view!.canRead(slug, file.path))) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    const check = async (at: Place) => {
      for (const file of files) requireCompleteSet(at, slug, reader, file.path);
      const result = await guardedEdits(at, slug, files, guard);
      result.edited.forEach((edit, index) => {
        const ownDeleted = deletedItems.filter(address => addressDocument(address) === edit.path);
        const after = result.guarded?.changes[index].after ?? edit.next;
        verifyDeletedItems(ownDeleted, { project: slug, path: edit.path, before: edit.before ?? '', after });
      });
      return result;
    };
    const place = await copies.writePlace(reader, slug, check);
    return lock(projectLock(place, slug), async () => {
      const { edited, guarded } = await check(place);
      const prepared = edited.map((edit, index) => {
        const { file, current } = edit;
        const next = guarded?.changes[index].after ?? edit.next;
        const bytes = encode(next);
        if (bytes.length > MAX_INPUT_BYTES)
          throw new InputError([
            {
              severity: 'error',
              code: 'size',
              path: '/',
              message: `${edit.path}: the definition exceeds the 2 MB UTF-8 limit.`,
            },
          ]);
        const indexed = indexBytes(slug, edit.path, bytes);
        if (!indexed.file.visible)
          throw new InputError([
            {
              severity: 'error',
              code: 'unsupported',
              path: '/',
              message: `${edit.path}: unsupported file type.`,
            },
          ]);
        if (!indexed.file.valid) throw new InputError(indexed.findings.map(i => ({ ...i, message: `${edit.path}: ${i.message}` })));
        const rewritten = next !== edit.next;
        return {
          path: edit.path,
          file,
          exists: !!current,
          bytes,
          findings: indexed.findings,
          rewritten,
        };
      });
      const moves = unitEditMigrations(
        place,
        slug,
        reader,
        edited.map((edit, index) => ({
          path: edit.path,
          before: edit.before,
          after: decode(prepared[index].bytes),
        })),
      );
      const opId = journal.newId();
      const staging = join(place.layout.projects, `.staging-${opId}`);
      try {
        const steps: { from: string; to: string }[] = [];
        prepared.forEach((write, i) => {
          const staged = join(staging, 'new', String(i));
          atomicWrite(staged, write.bytes);
          if (write.exists) steps.push({ from: write.file, to: join(staging, 'previous', String(i)) });
          steps.push({ from: staged, to: write.file });
        });
        steps.push(
          ...clearPersonalDrafts(
            state,
            slug,
            prepared.map(file => file.path),
            staging,
            place.copy ?? undefined,
          ),
        );
        const records = await saveMigrations(place.layout, slug, opId, [...declarations, ...moves], deletedItems);
        steps.push(...stageAddressMigrations({ layout: place.layout, project: slug, staging }, records));
        journal.run(kind, steps, [staging], opId);
      } catch (error) {
        if (!(error instanceof JournalCrash)) rmSync(staging, { recursive: true, force: true });
        throw error;
      }
      await rescanIn(place, slug);
      const demoted = guarded ? demotionsOf(guarded) : [];
      return {
        written: prepared.map(write => ({
          path: write.path,
          hash: sha256(write.bytes),
          created: !write.exists,
          findings: write.findings,
          ...(write.rewritten ? { source: decode(write.bytes) } : {}),
        })),
        ...(demoted.length ? { demoted } : {}),
      };
    });
  }
  // Restore committed bytes through a journaled trash operation so the current version is
  // recoverable.
  async function revertFile(slug: string, path: string, baseHash: unknown, reader: Reader) {
    entry(slug);
    if (baseHash !== null && (typeof baseHash !== 'string' || !/^[0-9a-f]{64}$/.test(baseHash))) throw new BadRequestError('baseHash must be a SHA-256 hex digest or null.');
    if (!gitAvailable) throw new GitUnavailableError();
    const relativePath = projectPath(path);
    if (relativePath.split('/').at(-1)?.toLowerCase() === ADDRESS_HISTORY_FILE) throw new BadRequestError('Address history is managed by the workbench.');
    if (relativePath === DEPENDENCY_MANIFEST_PATH) throw new BadRequestError('Use Update dependencies to write the dependency manifest.');
    const committedIn = (at: Place) => git.blob(repoDir(at.layout, slug), 'HEAD', projectPrefix(layout, slug) + relativePath);
    const check = async (at: Place) => guardRevert(at.layout, { slug, path: relativePath }, await committedIn(at), reader.guard);
    const place = await copies.writePlace(reader, slug, check);
    const committed = await committedIn(place);
    const expected = baseHash as string | null;
    const reverted = await trash.revertFile(slug, relativePath, expected, committed, reader, place.copy);
    try {
      await place.scm.refresh(slug);
    } catch {}
    return reverted;
  }
  /** Writes a planned lock after rechecking the roots and the previous lock under the save lock. */
  function writeDependencyManifest(slug: string, body: { baseHash: string | null; source: string }, roots: ReadonlyMap<string, string>, reader: Reader) {
    return saveFile(slug, DEPENDENCY_MANIFEST_PATH, body, reader, roots);
  }
  return { saveFile, saveFiles, revertFile, validateFile, writeDependencyManifest };
}

/** Classifies an atomic batch save and any governance demotions it reports. */
export function classifyBatchSave(value: unknown): OperationOutcome {
  if (!value || typeof value !== 'object' || !('written' in value) || !Array.isArray(value.written) || !value.written.length) return 'failed';
  for (const file of value.written) {
    if (!file || typeof file.path !== 'string' || !file.path.trim() || typeof file.hash !== 'string' || !file.hash.trim()) return 'failed';
  }
  if (!('demoted' in value)) return 'ok';
  if (!Array.isArray(value.demoted)) return 'failed';
  return value.demoted.length ? 'degraded' : 'ok';
}

/** Classifies one stored file and any governance demotions reported with it. */
export function classifyFileSave(value: unknown): OperationOutcome {
  if (!value || typeof value !== 'object') return 'failed';
  return classifyBatchSave({ written: [value], ...('demoted' in value ? { demoted: value.demoted } : {}) });
}
