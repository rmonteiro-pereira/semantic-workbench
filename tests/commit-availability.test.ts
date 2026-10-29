import { expect, test } from 'bun:test';
import { hasNothingToCommit, NOTHING_TO_COMMIT } from '../src/app/workspace/commit-availability';

test('commit is off only when no file changed and no edit is on its way to the file', () => {
  expect(hasNothingToCommit(0, 'clean')).toBe(true);
  expect(hasNothingToCommit(0, 'saved')).toBe(true);
  expect(hasNothingToCommit(0, 'pending')).toBe(false);
  expect(hasNothingToCommit(0, 'saving')).toBe(false);
  expect(hasNothingToCommit(2, 'saved')).toBe(false);
});

test('the reason names the next step', () => {
  expect(NOTHING_TO_COMMIT).toBe('Nothing to commit. Edit a file first.');
});
