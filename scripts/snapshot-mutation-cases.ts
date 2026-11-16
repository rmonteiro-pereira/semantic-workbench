// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import type { classify } from '../src/server/projects/published-pointer';
/** Exercises the publication predicate belonging to a candidate module. */
export async function snapshotMutationCase(category: string, candidate: { classify?: typeof classify }) {
  if (category !== 'snapshot-pointer') return;
  const pointer = { branch: 'main', commit: 'a'.repeat(40) };
  assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => false), 'diverged');
  assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => true), 'fast-forward');
}
