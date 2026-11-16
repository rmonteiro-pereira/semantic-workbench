// Adopts existing default-branch commits without changing refs, files or the index.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setPublicationNotice } from './scm-published';
import { LOCAL_READER } from './reader';
import { UnknownDefaultBranchError, rememberDefaultBranch } from './worktrees';
import type { Git } from './git';
import type { DataLayout } from './paths';
import { locationOf } from './paths';
import type { State } from './state';
import type { PublishedPointers } from './published-pointer';

/** State and Git boundaries used while opening an existing data root. */
export type PublishedInitializationDeps = {
  git: Git;
  layout: DataLayout;
  state: State;
  pointers: PublishedPointers;
  serverMode: boolean;
  repositories?: readonly string[];
  defaultBranch: (repository: string) => Promise<string>;
};

/** Records the first snapshot and local notice, preserving all pre-existing Git content. */
export async function initializePublishedPointers(deps: PublishedInitializationDeps): Promise<void> {
  const { git, layout, state, pointers } = deps;
  const projects = state.registry().projects;
  for (const repository of deps.repositories ?? new Set(projects.map(project => locationOf(project).repo))) {
    const directory = join(layout.projects, repository);
    if (!existsSync(join(directory, '.git'))) continue;
    const existing = pointers.get(repository);
    if (existing) continue;
    let branch: string;
    try {
      branch = await deps.defaultBranch(repository);
    } catch (error) {
      if (error instanceof UnknownDefaultBranchError) {
        if (!deps.serverMode) {
          for (const project of projects.filter(project => locationOf(project).repo === repository)) {
            setPublicationNotice(state, project.slug, true, LOCAL_READER);
          }
        }
        continue;
      }
      throw error;
    }
    await rememberDefaultBranch(git, directory, branch);
    const commit = await git.revParse(directory, `refs/heads/${branch}`);
    if (!commit) continue;
    if (deps.serverMode && (await git.status(directory)).entries.length) continue;
    if (!deps.serverMode) {
      for (const project of projects.filter(project => locationOf(project).repo === repository)) {
        setPublicationNotice(state, project.slug, true, LOCAL_READER);
      }
    }
    pointers.complete(repository, branch, commit);
  }
}
