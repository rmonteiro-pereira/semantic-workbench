// Builds a publication candidate and optional crash point for restart and mutation proofs.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createGit, type Git } from '../../src/server/projects/git';
import { createState } from '../../src/server/projects/state';
import { dataLayout, type DataLayout } from '../../src/server/projects/paths';
import { createPublishedPointers } from '../../src/server/projects/published-pointer';
import { createSnapshotIndexes } from '../../src/server/projects/snapshot-index';
import { createPublication } from '../../src/server/projects/publication';
import { createWorktrees } from '../../src/server/projects/worktrees';
import { publicationRepository } from './git-fixtures';

/** Creates a real candidate, publishing through the supplied publication implementation. */
export async function publicationMoveFixture(stage?: 'intent' | 'ref' | 'pointer', factory = createPublication) {
  const fixture = publicationRepository();
  const layout = dataLayout(fixture.dir);
  mkdirSync(layout.state, { recursive: true });
  const state = createState(layout);
  const project = { slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' };
  state.writeRegistry([project]);
  const git = createGit({ projectsRoot: layout.projects, worktreesRoot: layout.worktrees });
  const pointers = createPublishedPointers(state);
  pointers.complete('definitions', 'main', fixture.published!);
  const indexes = createSnapshotIndexes({ git, directory: () => fixture.repository });
  const owner = { key: 'u' + 'a'.repeat(20), handle: 'author', name: 'Author' };
  const publication = factory({
    git,
    pointers,
    directory: () => fixture.repository,
    readable: candidate => indexes.build(candidate.repo, candidate.next, [project]),
    supersede: () => {},
    stage: reached => {
      if (reached === stage) throw Error('Stopped');
    },
  });
  const worktrees = createWorktrees({ layout, git, people: () => [owner], publication });
  const copy = await worktrees.ensure('definitions', owner);
  await git.commit(copy.dir, 'Candidate', true);
  const next = (await git.head(copy.dir))!;
  return { fixture, pointers, worktrees, owner, next };
}

/** A publication with a durable pointer record and no snapshot validation, for tests that only need working copies. */
export function plainPublication(git: Git, layout: DataLayout, factory = createPublication) {
  mkdirSync(layout.state, { recursive: true });
  const pointers = createPublishedPointers(createState(layout));
  return factory({ git, pointers, directory: repository => join(layout.projects, repository), readable: async () => {}, supersede: () => {} });
}
