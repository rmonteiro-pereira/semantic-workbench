// Saves and reverts documents: a stale base is refused, the reader's guard judges the text, and the
// swap is journaled so a crash leaves either the old or the new bytes.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { InputError, MAX_INPUT_BYTES } from '../../../shared/validation/diagnostics';
import { atomicWrite, decode, encode, sha256 } from '../atomic';
import type { Git } from '../git';
import type { Journal } from '../journal';
import { projectFile, projectPath, projectPrefix, repoDir, type DataLayout } from '../paths';
import { clearPersonalDrafts } from '../personal-state';
import type { Reader } from '../reader';
import { indexBytes } from '../scanner';
import type { Patch, ProjectEntry, State } from '../state';
import { guardRevert, type GuardedFile, type Trash } from '../trash';
import type { Place, WorkingCopies } from '../working-copies';
import { BadRequestError, OccupiedError, StaleError } from '../errors';
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

/** The workspace services document saving runs on; the composition root supplies them. */
export type DocumentSaveContext = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
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
  const { layout, git, gitAvailable, journal, state, copies, trash, lock, entry, projectLock, rescanIn } = ctx;
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
    return { edited, guarded: guard?.([change]) };
  }
  async function saveFile(slug: string, path: string, body: { baseHash: string | null; source?: string; patches?: Patch[] }, reader: Reader) {
    const { guard } = reader;
    entry(slug);
    const relativePath = projectPath(path);
    const check = (at: Place) => guardedEdit(at, { slug, path: relativePath }, body, guard);
    const place = await copies.writePlace(reader, slug, check);
    const file = projectFile(place.layout, slug, relativePath);
    return lock(projectLock(place, slug), async () => {
      const { edited, guarded } = await check(place);
      const next = guarded?.changes[0].after ?? edited;
      const bytes = encode(next);
      if (bytes.length > MAX_INPUT_BYTES)
        throw new InputError([
          {
            severity: 'error',
            code: 'size',
            path: '/',
            message: 'The definition exceeds the 2 MB UTF-8 limit. Split it into smaller documents.',
          },
        ]);
      const indexed = indexBytes(slug, relativePath, bytes);
      if (!indexed.file.visible) throw new InputError([{ severity: 'error', code: 'unsupported', path: '/', message: 'Unsupported file type.' }]);
      if (!indexed.file.valid) throw new InputError(indexed.findings);
      const staging = join(layout.state, `.staging-${journal.newId()}`);
      const staged = join(staging, 'source');
      const hash = atomicWrite(staged, bytes);
      const steps = clearPersonalDrafts(state, slug, [relativePath], staging, place.copy ?? undefined);
      if (existsSync(file)) steps.push({ from: file, to: join(staging, 'previous') });
      steps.push({ from: staged, to: file });
      journal.run('save', steps, [staging]);
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
  async function saveFiles(slug: string, writes: { path: string; baseHash: string | null; source?: string; patches?: Patch[] }[], reader: Reader, kind = 'save-files') {
    const { guard } = reader;
    entry(slug);
    if (!Array.isArray(writes) || !writes.length || writes.length > 50) throw new BadRequestError('Expected 1–50 files.');
    const files = writes.map(w => ({ ...w, path: projectPath(w.path) }));
    if (new Set(files.map(f => f.path)).size !== files.length) throw new BadRequestError('Each file may appear once.');
    if (reader.view && files.some(file => !reader.view!.canRead(slug, file.path))) {
      throw new OccupiedError('The target is unavailable.', {});
    }
    const check = (at: Place) => guardedEdits(at, slug, files, guard);
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
        journal.run(kind, steps, [staging], opId);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
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
    if (!gitAvailable) throw new BadRequestError('Git is not available on this machine.');
    const relativePath = projectPath(path);
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
  return { saveFile, saveFiles, revertFile };
}
