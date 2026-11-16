// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import type { createWorktrees } from '../src/server/projects/worktrees';
import { publicationMoveFixture } from '../tests/helpers/publication-fixture';
import type { surfaceFromCredential } from '../src/server/auth/request-surface';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { publicationRepository } from '../tests/helpers/git-fixtures';
import { createGit } from '../src/server/projects/git';
import type { classify } from '../src/server/projects/published-pointer';
import type { publicationChecks } from '../src/server/projects/publication-checks';
import { createState, type ProjectEntry } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { createPublishedPointers } from '../src/server/projects/published-pointer';
import type { createPublishedSnapshots } from '../src/server/projects/published-snapshot';
import type { createSnapshotIndexes } from '../src/server/projects/snapshot-index';
/** Exercises the publication predicate belonging to a candidate module. */
export async function snapshotMutationCase(
  category: string,
  candidate: {
    surfaceFromCredential?: typeof surfaceFromCredential;
    createWorktrees?: typeof createWorktrees;
    classify?: typeof classify;
    publicationChecks?: typeof publicationChecks;
    createPublishedSnapshots?: typeof createPublishedSnapshots;
    createSnapshotIndexes?: typeof createSnapshotIndexes;
  },
) {
  if (category === 'snapshot-surface') {
    assert.equal(candidate.surfaceFromCredential!(new Request('http://localhost/'), { mode: 'local', session: false, originAllowed: true }), 'agent');
  }
  if (category === 'snapshot-publication') {
    const fixture = await publicationMoveFixture(candidate.createWorktrees!);
    try {
      await assert.rejects(() =>
        fixture.worktrees.publish('definitions', fixture.owner.key, async () => {
          throw Error('Refused');
        }),
      );
      assert.equal(fixture.pointers.get('definitions')?.commit, fixture.fixture.published);
    } finally {
      fixture.fixture.dispose();
    }
  }
  if (category === 'snapshot-pointer') {
    const pointer = { branch: 'main', commit: 'a'.repeat(40) };
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => false), 'diverged');
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => true), 'fast-forward');
  }
  if (category === 'snapshot-checks') {
    await checksCase(candidate.publicationChecks!);
  }
  if (category === 'snapshot-resolver') await resolverCase(candidate.createPublishedSnapshots!);
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

async function resolverCase(create: typeof createPublishedSnapshots) {
  const fixture = publicationRepository();
  try {
    const layout = dataLayout(fixture.dir);
    mkdirSync(layout.state, { recursive: true });
    const pointers = createPublishedPointers(createState(layout));
    pointers.complete('definitions', 'main', fixture.published!);
    const git = createGit({ projectsRoot: layout.projects });
    let projects: ProjectEntry[] = [{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }];
    const snapshots = create({ git, pointers, projects: () => projects, directory: () => fixture.repository, gitAvailable: () => true });
    await snapshots.withPin(async pin => {
      const original = await snapshots.documents(pin, 'definitions');
      pointers.complete('definitions', 'main', fixture.authoring);
      assert.deepEqual(await snapshots.documents(pin, 'definitions'), original);
      for (let index = 0; index < 5; index++) {
        await git.commit(fixture.repository, 'Publication', true);
        pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
        await snapshots.documents(snapshots.pin(), 'definitions');
        assert(snapshots.retainedCount() <= 3);
      }
    });
    mkdirSync(join(fixture.repository, 'nested'));
    writeFileSync(join(fixture.repository, 'nested', 'nested.yaml'), 'name: Nested\nontology: [{concept: Nested}]\n');
    await git.addAll(fixture.repository);
    await git.commit(fixture.repository, 'Nested project');
    pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
    const pin = snapshots.pin();
    assert.equal((await snapshots.documents(pin, 'definitions')).length, 2);
    projects = [{ ...projects[0], folder: 'definitions/nested', repo: 'definitions' }];
    assert.equal((await snapshots.documents(pin, 'definitions')).length, 1);
  } finally {
    fixture.dispose();
  }
}
