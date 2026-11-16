// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import type { classify } from '../src/server/projects/published-pointer';
import type { publicationChecks } from '../src/server/projects/publication-checks';
/** Exercises the publication predicate belonging to a candidate module. */
export async function snapshotMutationCase(
  category: string,
  candidate: {
    classify?: typeof classify;
    publicationChecks?: typeof publicationChecks;
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
