// Moves a file inside a project or into another one, together with its draft and view settings.
import { documentAddress } from '../../../shared/core/item-address';
import { operationMigrations, stageAddressMigrations } from '../address-migrations';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { decode } from '../atomic';
import { JournalCrash, type Journal } from '../journal';
import { projectFile, projectPath, type DataLayout } from '../paths';
import { movePersonalState } from '../personal-state';
import type { Reader } from '../reader';
import type { ProjectEntry, State } from '../state';
import type { Place, WorkingCopies } from '../working-copies';
import { NotFoundError, OccupiedError } from '../errors';
import type { ContentGuard } from '../../auth/guards';
import { freeReadableName } from './import-batch';

/** The workspace services a file move runs on; the composition root supplies them. */
export type FileMoveContext = {
  layout: DataLayout;
  localCommit: (files: DataLayout, project: string) => Promise<string>;
  journal: Journal;
  state: State;
  copies: WorkingCopies;
  lock: <T>(key: string, fn: () => Promise<T> | T) => Promise<T>;
  entry: (slug: string) => ProjectEntry;
  projectLock: (place: Place, slug: string) => string;
  rescanIn: (place: Pick<Place, 'scanner' | 'tags'>, slug: string) => Promise<unknown>;
};

// Journal the file move with its draft and view settings so they remain attached to the file.
// A move between projects is judged as removing the file from its project and creating it in
// the target project, whose domain and classification settings may differ.
function guardMove(guard: ContentGuard, files: DataLayout, move: { slug: string; from: string; toProject: string; to: string }) {
  let text: string | null;
  try {
    text = decode(readFileSync(projectFile(files, move.slug, move.from)));
  } catch {
    // A file that is not text holds nothing a guard reads.
    text = null;
  }
  const removed = { project: move.slug, path: move.from, before: text, after: null };
  const created = { project: move.toProject, path: move.to, before: null, after: text };
  guard([removed, created], { operation: 'move' });
}

/** The file move use case. */
export function createFileMove(ctx: FileMoveContext) {
  const { layout, localCommit, journal, state, copies, lock, entry, projectLock, rescanIn } = ctx;
  async function moveFile(slug: string, path: string, toProject: string, toPath: string | undefined, keepBoth: boolean, reader: Reader) {
    const { view: accessView, guard } = reader;
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
    // Across projects the file leaves one project's governance and enters another's.
    const guardAt = (at: Place, target: string) => {
      if (guard && toProject !== slug) guardMove(guard, at.layout, { slug, from, toProject, to: target });
    };
    const place = await copies.writePlace(reader, slug, at => guardAt(at, to));
    // The target project's repository may need a copy too; the file comes from this place, so a
    // refused move is judged on it before that copy is made.
    await copies.writePlace(reader, toProject, () => guardAt(place, to));
    const [firstSlug, secondSlug] = [slug, toProject].sort();
    return lock(projectLock(place, firstSlug), () =>
      lock(firstSlug === secondSlug ? 'none' : projectLock(place, secondSlug), async () => {
        const src = projectFile(place.layout, slug, from);
        if (!existsSync(src)) throw new NotFoundError('File not found.');
        if (slug === toProject && from === to) return { project: toProject, path: to };
        if (existsSync(projectFile(place.layout, toProject, to))) {
          const free = freeReadableName(place, toProject, to, accessView);
          if (!keepBoth) throw new OccupiedError(`${to} already exists in the target project; nothing was overwritten.`, free ? { toProject, toPath: free } : {});
          if (!free) throw new OccupiedError('The target is unavailable.', {});
          to = free;
        }
        guardAt(place, to);
        const steps = [{ from: src, to: projectFile(place.layout, toProject, to) }];
        if (existsSync(state.draftFile(slug, from)) && !existsSync(state.draftFile(toProject, to))) steps.push({ from: state.draftFile(slug, from), to: state.draftFile(toProject, to) });
        const commit = await localCommit(place.layout, slug);
        const opId = journal.newId();
        const personalStaging = join(layout.state, `.staging-${opId}`);
        steps.push(...movePersonalState(state, { project: slug, path: from, target: toProject, targetPath: to }, personalStaging, place.copy ?? undefined));
        const records = operationMigrations({ id: opId, at: new Date().toISOString(), commit }, [{ kind: 'document', from: documentAddress(slug, from), to: documentAddress(toProject, to) }]);
        try {
          for (const project of new Set([slug, toProject])) steps.push(...stageAddressMigrations({ layout, project, staging: personalStaging }, records));
          journal.run('move', steps, [personalStaging], opId);
        } catch (error) {
          if (!(error instanceof JournalCrash)) rmSync(personalStaging, { recursive: true, force: true });
          throw error;
        }
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
        await rescanIn(place, slug);
        if (toProject !== slug) await rescanIn(place, toProject);
        return { project: toProject, path: to };
      }),
    );
  }
  return { moveFile };
}
