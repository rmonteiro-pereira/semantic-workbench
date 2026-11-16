/** Runs presentation assertions against a supplied comparison module. */
import assert from 'node:assert/strict';

const candidate = await import(process.argv[2]);
assert.equal(candidate.diffAfterLabel(false, 'index', 'Staged'), 'Deleted (staged)');
assert.equal(candidate.diffAfterLabel(false, 'worktree', 'Working tree'), 'Deleted');
assert.equal(candidate.diffAfterLabel(true, 'index', 'Staged'), 'Staged');
assert.equal(candidate.identicalVersions('', '', true, true), true);
assert.equal(candidate.identicalVersions('', '', false, true), false);
assert.equal(candidate.identicalVersions('', '', true, false), false);
assert.equal(candidate.identicalVersions('old', 'new', true, true), false);
