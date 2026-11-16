// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { publicationRepository } from '../tests/helpers/git-fixtures';
import { createGit } from '../src/server/projects/git';
import type { classify } from '../src/server/projects/published-pointer';
import type { publicationChecks } from '../src/server/projects/publication-checks';
import type { createSnapshotIndexes } from '../src/server/projects/snapshot-index';
/** Exercises the publication predicate belonging to a candidate module. */
export async function snapshotMutationCase(
  category: string,
  candidate: {
    classify?: typeof classify;
    publicationChecks?: typeof publicationChecks;
    createSnapshotIndexes?: typeof createSnapshotIndexes;
  },
) {
  if (category === 'snapshot-pointer') {
    const pointer = { branch: 'main', commit: 'a'.repeat(40) };
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => false), 'diverged');
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => true), 'fast-forward');
  }
  if (category === 'snapshot-checks') {
    await checksCase(candidate.publicationChecks!);
  }
  if (category === 'snapshot-index') {
    await indexCase(candidate.createSnapshotIndexes!);
  }
}

async function checksCase(checks: typeof publicationChecks) {
  for (const failure of ['ancestor', 'bounds', 'guard', null]) {
    const calls: string[] = [];
    const list = checks({
      isAncestor: async () => {
        calls.push('ancestor');
        return failure !== 'ancestor';
      },
      readable: async () => {
        calls.push('bounds');
        if (failure === 'bounds') throw Error('Bounds');
      },
      guard: async () => {
        calls.push('guard');
        if (failure === 'guard') throw Error('Guard');
      },
    });
    const publish = async () => {
      for (const check of list) await check({ repo: 'definitions', branch: 'main', previous: 'a'.repeat(40), next: 'b'.repeat(40) });
    };
    if (failure) await assert.rejects(publish);
    else await publish();
    const expected = ['ancestor', 'bounds', 'guard'];
    assert.deepEqual(calls, failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected);
  }
}

async function indexCase(indexes: typeof createSnapshotIndexes) {
  const fixture = publicationRepository();
  try {
    const git = createGit({ projectsRoot: join(fixture.dir, 'projects') });
    const committed = new TextDecoder().decode((await git.blob(fixture.repository, fixture.published!, 'shop.ontology.yaml'))!);
    writeFileSync(join(fixture.repository, 'shop.ontology.yaml'), 'dirty');
    const loader = indexes({ git, directory: () => fixture.repository });
    const snapshot = await loader.build('definitions', fixture.published!, [{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }]);
    assert.equal(snapshot.projects.get('definitions')![0].document.source, committed);
  } finally {
    fixture.dispose();
  }
}
