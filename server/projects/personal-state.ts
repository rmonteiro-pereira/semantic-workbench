// Journals personal drafts and grouping alongside the files they describe.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson, readJsonFile } from './atomic';
import type { State, PersonalState, Draft } from './state';

type Step = { from: string; to: string };

function replaceView(
  state: PersonalState,
  project: string,
  files: Record<string, unknown>,
  staging: string,
): Step[] {
  const destination = state.viewFile(project);
  const staged = join(staging, project + '.json');
  atomicWriteJson(staged, { formatVersion: 1, files });
  return [
    ...(existsSync(destination) ? [{ from: destination, to: staged + '.previous' }] : []),
    { from: staged, to: destination },
  ];
}

/** A file's source and destination when its personal state follows a move or restore. */
export type PersonalMove = { project: string; path: string; target: string; targetPath: string };

/**
 * Moves every owner's draft and grouping using the same journal as the source file. A move inside
 * one person's working copy moves only that person's state (`only` is their key).
 */
export function movePersonalState(
  state: State,
  move: PersonalMove,
  staging: string,
  only?: string,
): Step[] {
  const { project, path, target, targetPath } = move;
  const owners = state.personalStates().filter(({ key }) => !only || key === only);
  return owners.flatMap(({ key, state: personal }) => {
    const steps: Step[] = [];
    const root = join(staging, key);
    const draft = personal.draft(project, path);
    const destination = personal.draftFile(target, targetPath);
    // Like the shared draft, an existing draft at the destination is kept, never replaced.
    const occupied = destination !== personal.draftFile(project, path) && existsSync(destination);
    if (draft && !occupied) {
      const staged = join(root, 'draft.json');
      atomicWriteJson(staged, { ...draft, project: target, path: targetPath });
      steps.push({
        from: personal.draftFile(project, path),
        to: join(root, 'previous-draft.json'),
      });
      steps.push({ from: staged, to: destination });
    }
    const sourceFiles = { ...personal.view(project).files };
    const grouping = sourceFiles[path];
    if (grouping !== undefined) {
      delete sourceFiles[path];
      if (project === target) sourceFiles[targetPath] = grouping;
      steps.push(...replaceView(personal, project, sourceFiles, root));
      if (project !== target) {
        steps.push(
          ...replaceView(
            personal,
            target,
            { ...personal.view(target).files, [targetPath]: grouping },
            root,
          ),
        );
      }
    }
    return steps;
  });
}

/** Archives all personal state for a deleted path or project without exposing it in trash metadata. */
export function archivePersonalState(
  state: State,
  project: string,
  path: string | undefined,
  archive: string,
): Step[] {
  return state.personalStates().flatMap(({ key, state: personal }) => {
    const root = join(archive, key, project);
    const steps: Step[] = [];
    const draft =
      path === undefined ? personal.draftDir(project) : personal.draftFile(project, path);
    if (existsSync(draft)) steps.push({ from: draft, to: join(root, 'drafts') });
    if (path === undefined) {
      if (existsSync(personal.viewFile(project))) {
        steps.push({ from: personal.viewFile(project), to: join(root, 'view.json') });
      }
      return steps;
    }
    const files = { ...personal.view(project).files };
    if (files[path] !== undefined) {
      atomicWriteJson(join(root, 'view.json'), {
        formatVersion: 1,
        files: { [path]: files[path] },
      });
      delete files[path];
      steps.push(...replaceView(personal, project, files, join(root, 'staging')));
    }
    return steps;
  });
}

/** What a restore brings back: a single path, or the whole project when the paths are absent. */
export type PersonalRestore = {
  project: string;
  path?: string;
  target: string;
  targetPath?: string;
};

/** Restores each owner's archived state into that owner's namespace. */
export function restorePersonalState(
  state: State,
  restore: PersonalRestore,
  archive: string,
): Step[] {
  const { project, path, target, targetPath } = restore;
  if (!existsSync(archive)) return [];
  return readdirSync(archive).flatMap(key => {
    const personal = state.ownerState(key);
    const root = join(archive, key, project);
    const steps: Step[] = [];
    const draft = join(root, 'drafts');
    const destination =
      targetPath === undefined ? personal.draftDir(target) : personal.draftFile(target, targetPath);
    if (existsSync(draft) && !existsSync(destination)) {
      if (targetPath !== undefined) {
        const savedDraft = readJsonFile<Draft>(draft)!;
        const staged = join(root, 'restored-draft.json');
        atomicWriteJson(staged, { ...savedDraft, project: target, path: targetPath });
        steps.push({ from: staged, to: destination });
      } else {
        for (const name of readdirSync(draft)) {
          const savedDraft = readJsonFile<Draft>(join(draft, name))!;
          const staged = join(root, 'restored-drafts', name);
          atomicWriteJson(staged, { ...savedDraft, project: target });
          steps.push({ from: staged, to: join(destination, name) });
        }
      }
    }
    const saved = readJsonFile<{ files: Record<string, unknown> }>(join(root, 'view.json'));
    if (saved) {
      const files = { ...personal.view(target).files };
      if (path !== undefined && targetPath !== undefined) files[targetPath] = saved.files[path];
      else Object.assign(files, saved.files);
      steps.push(...replaceView(personal, target, files, join(root, 'restore')));
    }
    return steps;
  });
}

/**
 * Removes drafts in the file transaction, including owners without an active session. A save in
 * one person's working copy outdates only that person's drafts (`only` is their key).
 */
export function clearPersonalDrafts(
  state: State,
  project: string,
  paths: string[],
  staging: string,
  only?: string,
): Step[] {
  const owners = only
    ? state.personalStates().filter(({ key }) => key === only)
    : [{ key: 'shared', state }, ...state.personalStates()];
  return owners.flatMap(personal =>
    paths.flatMap((path, index) => {
      const draft = personal.state.draftFile(project, path);
      return existsSync(draft)
        ? [{ from: draft, to: join(staging, 'drafts', personal.key, String(index)) }]
        : [];
    }),
  );
}
