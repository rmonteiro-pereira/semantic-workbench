import { expect, test } from 'bun:test';
import { hasNothingToCommit } from '../src/app/workspace/commit-availability';

test('commit is off only when no file changed and no edit is on its way to the file', () => {
  expect(hasNothingToCommit(0, 'clean', true)).toBe(true);
  expect(hasNothingToCommit(0, 'saved', true)).toBe(true);
  expect(hasNothingToCommit(0, 'pending', true)).toBe(false);
  expect(hasNothingToCommit(0, 'saving', true)).toBe(false);
  expect(hasNothingToCommit(2, 'saved', true)).toBe(false);
});

test('commit stays on after a save until the project list has refreshed', () => {
  expect(hasNothingToCommit(0, 'saved', false)).toBe(false);
  expect(hasNothingToCommit(0, 'clean', false)).toBe(true);
});
