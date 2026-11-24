// Wires the proposal service to the workspace services it is built from.
import { join } from 'node:path';
import type { Events } from '../events';
import type { Git } from '../git';
import { projectPrefix, type DataLayout } from '../paths';
import type { Publication } from '../publication';
import { createProposalRefs } from '../proposal-refs';
import { createProposalStore } from '../proposal-store';
import { createProposals } from '../proposals';
import { judgePublish, type PublicationDependencyDeps, type Publishing } from '../publishing';
import type { Place, WorkingCopies } from '../working-copies';
import type { Worktrees } from '../worktrees';
import type { ProjectEntry } from '../state';

/** The workspace services the proposal service runs on; the composition root supplies them. */
export type WorkspaceProposalsContext = {
  layout: DataLayout;
  git: Git;
  worktrees: Worktrees;
  publication: Publication;
  publishing: Publishing;
  published: Place;
  copies: WorkingCopies;
  events: Events;
  entry: (slug: string) => ProjectEntry;
  repoOf: (slug: string) => string;
  projectsIn: (repository: string) => string[];
  /** What a promotion's dependency check reads, the same as a publication's. */
  publicationDependencies: PublicationDependencyDeps;
  now: () => number;
};

/** Creates the proposal service over the workspace's Git, publication and working copies. */
export function createWorkspaceProposals(context: WorkspaceProposalsContext) {
  const { layout, git, worktrees, publication, publishing, published, copies, events } = context;
  const directory = (repository: string) => join(layout.projects, repository);
  return createProposals({
    store: createProposalStore(layout),
    refs: createProposalRefs(git, directory),
    git,
    worktrees,
    changes: (slug, base, tip, paths) => published.scm.changesBetween(slug, base, tip, paths),
    scmFor: async (slug, reader) => (await copies.writePlace(reader, slug)).scm,
    repositoryOf: context.repoOf,
    projectsIn: context.projectsIn,
    projectName: slug => context.entry(slug).name,
    prefixOf: slug => projectPrefix(layout, slug),
    ownerOf: reader => (reader.copy ? (copies.owners().find(owner => owner.key === reader.copy!.key) ?? null) : null),
    publishedCommit: repository => publication.recorded(repository) ?? null,
    checkCandidate: async (slug, reader, move) => {
      const repository = context.repoOf(slug);
      const branch = await worktrees.defaultBranch(repository);
      await publication.check(repository, branch, { previous: move.previous, next: move.next }, judgePublish(context.publicationDependencies, published, slug, reader, move.paths));
    },
    promote: (slug, reader, move) => publishing.promote(slug, reader, move),
    serialized: (repository, use) => publication.serialized(repository, () => use()),
    emit: (event, data, tags) => events.emit(event, data, tags),
    now: () => new Date(context.now()),
  });
}

/** The proposal service of one workspace. */
export type WorkspaceProposals = ReturnType<typeof createWorkspaceProposals>;
