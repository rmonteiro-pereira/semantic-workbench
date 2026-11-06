// Restores trash entries: a file back into a project, or a project, subproject or repository back into the
// workspace. Nothing is overwritten; an occupied target gets a free alternative suggested.
import { restorePersonalState } from './personal-state';
import type { Reader } from './reader';
import { projectLockKey } from './working-copies';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { decode } from './atomic';
import { GoneError, NotFoundError, OccupiedError } from './errors';
import { assertSlug, disambiguate, locationOf, projectDir, projectFile, projectPath, slugify, uniqueName, type DataLayout } from './paths';
import type { ProjectEntry } from './state';
/** Time window for immediate undo after deletion. */
import type { TrashContext, TrashEntry } from './trash';
import { documentText, payloadChanges, readdirRecursive, safeReaddir } from './trash-access';

/** What restoring shares with the rest of the trash service. */
export type TrashRestoreShared = {
  filesOf: (copy: string | null) => DataLayout;
  now: () => number;
  read: (id: string) => { e: TrashEntry; dir: string };
  emitEntry: (entry: TrashEntry, undoUntil?: string) => void;
};

/** Creates the restore and undo operations of the trash. */
export function createTrashRestore(ctx: TrashContext, shared: TrashRestoreShared) {
  const { layout, state, journal, lock } = ctx;
  const { filesOf, now, read, emitEntry } = shared;
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
  return { restore };
}
// A whole project comes back into the folder named by its slug, whatever folder it had, so its
// entry must not keep the old folder and repository.
function withoutLocation(registry: TrashEntry['registry']) {
  if (!registry) return {};
  const { folder: _folder, repo: _repo, ...rest } = registry;
  return rest;
}
