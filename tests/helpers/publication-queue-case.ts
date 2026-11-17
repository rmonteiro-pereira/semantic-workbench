// Checks that all publication entry points wait for the same repository transaction.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPublication } from '../../src/server/projects/publication';
import { createLocalPublication } from '../../src/server/projects/local-publication';
import { createWorktrees, rememberDefaultBranch } from '../../src/server/projects/worktrees';
import { localPublicationFixture } from './local-publication-fixture';
import { dataLayout } from '../../src/server/projects/paths';

/** Exercises competing local publication, remote following and adoption on real Git refs. */
export async function publicationQueueCase(factory = createPublication) {
  using fixture = localPublicationFixture();
  const layout = dataLayout(fixture.dir);
  const shared = {
    git: fixture.git,
    pointers: fixture.pointers,
    directory: () => fixture.repository,
    readable: async () => {},
    supersede: () => {},
  };
  const publication = factory(shared);
  const local = createLocalPublication({ git: fixture.git, pointers: fixture.pointers, directory: shared.directory, publication });
  const worktrees = createWorktrees({ layout, git: fixture.git, people: () => [], publication });
  await rememberDefaultBranch(fixture.git, fixture.repository, 'main');
  await fixture.git.run(fixture.repository, ['switch', 'work/local']);
  await fixture.git.run(fixture.repository, ['update-ref', 'refs/remotes/origin/main', fixture.authoring]);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const first = worktrees.followRemote('definitions', 'origin', async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const outcomes: string[] = [];
  const second = local
    .publishLocal('definitions', 'main', async () => {
      outcomes.push('local guard');
    })
    .then(
      () => outcomes.push('local completed'),
      () => outcomes.push('local refused'),
    );
  const third = worktrees
    .adopt('definitions', async () => {
      outcomes.push('adopt guard');
    })
    .then(
      () => outcomes.push('adopt completed'),
      () => outcomes.push('adopt refused'),
    );
  try {
    await publication.serialized('another-repository', async () => {
      await Bun.sleep(150);
    });
    assert.deepEqual(outcomes, []);
  } finally {
    release.resolve();
    await Promise.all([first, second, third]);
  }
  assert.deepEqual(outcomes, ['local refused', 'adopt refused']);
  assert.deepEqual(fixture.pointers.get('definitions'), { branch: 'main', commit: fixture.authoring });
  assert.equal(await fixture.git.head(join(layout.projects, 'definitions')), fixture.authoring);
}
