// Ensures memoisation uses Cedar globs while restricted paths use POSIX segments.
import { expect, test } from 'bun:test';
import { matchesSegmentGlob, matchesCedarLike } from '../../src/server/auth/path-rules';

test('restricted stars stay in a segment and double stars span zero or more directories', () => {
  expect(matchesSegmentGlob('a/b/c.yaml', 'a/*.yaml')).toBe(false);
  expect(matchesSegmentGlob('a/c.yaml', 'a/**/*.yaml')).toBe(true);
  expect(matchesSegmentGlob('a/b/c.yaml', 'a/**/*.yaml')).toBe(true);
  expect(matchesSegmentGlob('a/b/c.yaml', 'a/**')).toBe(true);
  expect(matchesSegmentGlob('a/b/c.yaml', 'b/**')).toBe(false);
  expect(matchesSegmentGlob('a/x+1.yaml', 'a/x+1.yaml')).toBe(true);
  expect(matchesSegmentGlob('a/xx1.yaml', 'a/x+1.yaml')).toBe(false);
  expect(matchesCedarLike('a/b/c.yaml', 'a/*.yaml')).toBe(true);
});

test('segment globs also match protected branches without crossing slashes', () => {
  expect(matchesSegmentGlob('release/stable', 'release/*')).toBe(true);
  expect(matchesSegmentGlob('release/team/stable', 'release/*')).toBe(false);
  expect(matchesCedarLike('release/team/stable', 'release/*')).toBe(true);
});
