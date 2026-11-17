// Provides the real Git and durable-pointer boundaries shared by local publication proofs.
import { createGit } from '../../src/server/projects/git';
import { createLocalPublication } from '../../src/server/projects/local-publication';
import { createPublication } from '../../src/server/projects/publication';
import { createState } from '../../src/server/projects/state';
import { dataLayout } from '../../src/server/projects/paths';
import { createPublishedPointers } from '../../src/server/projects/published-pointer';
import { createSnapshotIndexes } from '../../src/server/projects/snapshot-index';
import { publicationRepository } from './git-fixtures';

/** Opens an isolated publication fixture using the supplied implementation. */
export function localPublicationFixture(kind: 'history' | 'unborn' = 'history', factories: { createLocalPublication?: typeof createLocalPublication; createPublication?: typeof createPublication } = {}) {
  const fixture = publicationRepository(kind);
  const layout = dataLayout(fixture.dir);
  const git = createGit({ projectsRoot: layout.projects });
  const state = createState(layout);
  const pointers = createPublishedPointers(state);
  pointers.record('definitions', { branch: 'main', ...(fixture.published ? { commit: fixture.published } : {}) });
  const indexes = createSnapshotIndexes({ git, directory: () => fixture.repository });
  const publication = (factories.createPublication ?? createPublication)({
    git,
    pointers,
    directory: () => fixture.repository,
    supersede: () => {},
    readable: candidate => indexes.build('definitions', candidate.next, [{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]),
  });
  const local = (factories.createLocalPublication ?? createLocalPublication)({ git, pointers, directory: () => fixture.repository, publication });
  return { ...fixture, git, pointers, publication: local, [Symbol.dispose]: fixture.dispose };
}
