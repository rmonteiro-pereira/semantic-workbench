// Keeps destructive-branch and lost-update predicates on real Git entry points.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as local from '../src/server/projects/local-publication';
import type * as publication from '../src/server/projects/publication';
import { localPublicationFixture } from '../tests/helpers/local-publication-fixture';

/** Verifies preserved authoring changes and rejection of an outside compare-and-swap race. */
export async function localPublicationCase(candidate: { createLocalPublication?: typeof local.createLocalPublication; createPublication?: typeof publication.createPublication; moveToAuthoringBranch?: typeof local.moveToAuthoringBranch }) {
  using fixture = localPublicationFixture('history', candidate);
  const path = join(fixture.repository, 'unrelated.txt');
  writeFileSync(path, 'staged');
  await fixture.git.stage(fixture.repository, ['unrelated.txt']);
  writeFileSync(path, 'unstaged');
  await candidate.moveToAuthoringBranch!(fixture.git, fixture.repository, 'main');
  await assert.rejects(() => candidate.moveToAuthoringBranch!(fixture.git, fixture.repository, 'work/local'), /another authoring branch/);
  assert.equal(readFileSync(path, 'utf8'), 'unstaged');
  assert.equal(Buffer.from((await fixture.git.blob(fixture.repository, '', 'unrelated.txt'))!).toString(), 'staged');
  await assert.rejects(() =>
    fixture.publication.publishLocal('definitions', 'main', async () => {
      await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.foreign!]);
    }),
  );
  assert.deepEqual(fixture.pointers.get('definitions'), { branch: 'main', commit: fixture.published });
}

/** A local commit must advance authoring while preserving the recorded default tip. */
export async function localCommitCase(candidate: { openWorkspace?: typeof import('../src/server/projects/workspace').openWorkspace }) {
  const { publicationRepository } = await import('../tests/helpers/git-fixtures');
  const { createState } = await import('../src/server/projects/state');
  const { dataLayout } = await import('../src/server/projects/paths');
  const fixture = publicationRepository();
  let workspace: Awaited<ReturnType<NonNullable<typeof candidate.openWorkspace>>> | undefined;
  try {
    createState(dataLayout(fixture.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
    workspace = await candidate.openWorkspace!({ root: fixture.dir });
    writeFileSync(join(fixture.repository, 'new.ontology.yaml'), 'name: New\nontology: []\n');
    const result = await workspace.scm.commit('definitions', 'Add definition', { paths: ['new.ontology.yaml'] });
    assert.equal(result.branch, 'work/local');
    assert.equal(await workspace.git.revParse(fixture.repository, 'refs/heads/main'), fixture.published);
  } finally {
    workspace?.close();
    fixture.dispose();
  }
}

/** Adopting must run the content guard and refuse a non-descendant default ref. */
export async function adoptionCase(candidate: { createLocalPublication?: typeof local.createLocalPublication; createPublication?: typeof publication.createPublication }) {
  using fixture = localPublicationFixture('history', candidate);
  await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.authoring]);
  await assert.rejects(
    () =>
      fixture.publication.adopt('definitions', 'main', async () => {
        throw Error('Content refused');
      }),
    /Content refused/,
  );
  assert.equal(fixture.pointers.get('definitions')?.commit, fixture.published);
  await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.previous!]);
  await assert.rejects(() => fixture.publication.adopt('definitions', 'main', async () => {}), /no longer contains/);
  assert.equal(fixture.pointers.get('definitions')?.commit, fixture.published);
}
