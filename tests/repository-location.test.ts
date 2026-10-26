// The panel header names the remote, the branch and the folder a sparse project lives in.
import { expect, test } from 'bun:test';
import { repositoryLocation } from '../src/scm/SourceControl';

const base = { upstream: '', remotes: { origin: '/team.git' }, branch: 'main' };

test('the header names the remote, branch and folder', () => {
  expect(repositoryLocation({ ...base, upstream: 'origin/main', folder: 'semantic/ubl' })).toBe(
    'origin · main · semantic/ubl',
  );
});

test('without an upstream the first remote is named, and without a remote the header says so', () => {
  expect(repositoryLocation({ ...base, folder: 'semantic/ubl' })).toBe(
    'origin · main · semantic/ubl',
  );
  expect(repositoryLocation({ ...base, remotes: {}, folder: 'a' })).toBe('no remote · main · a');
});

test('a project without a folder shows only the remote and branch', () => {
  expect(repositoryLocation({ ...base, upstream: 'upstream/dev', branch: 'dev' })).toBe(
    'upstream · dev',
  );
});
