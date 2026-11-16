// Builds a publication candidate and optional crash point for restart and mutation proofs.
import { mkdirSync } from 'node:fs';
import { createGit } from '../../src/server/projects/git';
import { createState } from '../../src/server/projects/state';
import { dataLayout } from '../../src/server/projects/paths';
import { createPublishedPointers } from '../../src/server/projects/published-pointer';
import { createSnapshotIndexes } from '../../src/server/projects/snapshot-index';
import type { createWorktrees } from '../../src/server/projects/worktrees';
import { publicationRepository } from './git-fixtures';

/** Creates a real candidate using the supplied worktree implementation. */
export async function publicationMoveFixture(create: typeof createWorktrees, stage?: 'intent' | 'ref' | 'pointer') {
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
  const worktrees = create({
    layout,
    git,
    people: () => [owner],
    publication: {
      pointers,
      readable: candidate => indexes.build(candidate.repo, candidate.next, [project]),
      supersede: () => {},
      stage: reached => {
        if (reached === stage) throw Error('Stopped');
      },
    },
  });
  const copy = await worktrees.ensure('definitions', owner);
  await git.commit(copy.dir, 'Candidate', true);
  const next = (await git.head(copy.dir))!;
  return { fixture, pointers, worktrees, owner, next };
}
