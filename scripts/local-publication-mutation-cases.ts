// Keeps destructive-branch and lost-update predicates on real Git entry points.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as local from '../src/server/projects/local-publication';
import { localPublicationFixture } from '../tests/helpers/local-publication-fixture';

/** Verifies preserved authoring changes and rejection of an outside compare-and-swap race. */
export async function localPublicationCase(candidate: { createLocalPublication?: typeof local.createLocalPublication; moveToAuthoringBranch?: typeof local.moveToAuthoringBranch }) {
  using fixture = localPublicationFixture('history', candidate.createLocalPublication);
  const path = join(fixture.repository, 'unrelated.txt');
  writeFileSync(path, 'staged');
  await fixture.git.stage(fixture.repository, ['unrelated.txt']);
  writeFileSync(path, 'unstaged');
  await candidate.moveToAuthoringBranch!(fixture.git, fixture.repository, 'main');
  assert.equal(readFileSync(path, 'utf8'), 'unstaged');
  assert.equal(Buffer.from((await fixture.git.blob(fixture.repository, '', 'unrelated.txt'))!).toString(), 'staged');
  await assert.rejects(() =>
    fixture.publication.publishLocal('definitions', 'main', async () => {
      await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.foreign!]);
    }),
  );
  assert.equal(fixture.pointers.get('definitions')?.commit, fixture.published);
}
