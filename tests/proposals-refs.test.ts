// Checks that proposal refs move only from the value the caller expects, stay out of branch lists,
// and report a rename as a removal plus an addition.
import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { createProposalRefs, parseChangedPaths } from '../src/server/projects/proposal-refs';
import { gitOutput } from './auth/working-copy-fixture';
import { tempDataDir } from './helpers/temp-data-dir';

function repositoryWithCommits() {
  const data = tempDataDir();
  const projects = join(data.root, 'projects');
  const folder = join(projects, 'shared');
  mkdirSync(folder, { recursive: true });
  const run = (...args: string[]) => {
    const result = gitOutput(folder, args);
    if (result.code !== 0) throw Error(`git ${args.join(' ')} failed`);
    return result.text;
  };
  run('init', '-q', '-b', 'main');
  const commit = (files: Record<string, string>, remove: string[] = []) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(folder, path, '..'), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    if (remove.length) run('rm', '-q', ...remove);
    run('add', '-A');
    run('commit', '-q', '-m', 'step');
    return run('rev-parse', 'HEAD');
  };
  const git = createGit({ projectsRoot: projects });
  const refs = createProposalRefs(git, repository => join(projects, repository));
  return { data, folder, run, commit, refs };
}

test('a stale expected value fails the swap and leaves the ref alone', async () => {
  const { data, commit, refs } = repositoryWithCommits();
  try {
    const first = commit({ 'a.txt': 'one\n' });
    const second = commit({ 'a.txt': 'two\n' });
    const third = commit({ 'a.txt': 'three\n' });
    expect(await refs.createRef('shared', 'p1', first)).toBe(true);
    expect(await refs.createRef('shared', 'p1', second)).toBe(false);
    expect(await refs.readTip('shared', 'p1')).toBe(first);
    expect(await refs.moveRef('shared', 'p1', second, third)).toBe(false);
    expect(await refs.readTip('shared', 'p1')).toBe(first);
    expect(await refs.moveRef('shared', 'p1', first, third)).toBe(true);
    expect(await refs.readTip('shared', 'p1')).toBe(third);
  } finally {
    data.cleanup();
  }
});

test('closing and restoring move the tip between the two namespaces and never lose it', async () => {
  const { data, commit, refs, run } = repositoryWithCommits();
  try {
    const tip = commit({ 'a.txt': 'one\n' });
    await refs.createRef('shared', 'p1', tip);
    expect(await refs.closeRef('shared', 'p1', tip)).toBe(true);
    expect(await refs.readTip('shared', 'p1')).toBeNull();
    expect(await refs.readTip('shared', 'p1', 'closed')).toBe(tip);
    expect((await refs.listTips('shared')).closed.get('p1')).toBe(tip);
    expect(await refs.restoreRef('shared', 'p1', tip)).toBe(true);
    expect(await refs.readTip('shared', 'p1')).toBe(tip);
    expect(await refs.readTip('shared', 'p1', 'closed')).toBeNull();
    expect(await refs.removeRef('shared', 'p1', tip)).toBe(true);
    expect(await refs.readTip('shared', 'p1')).toBeNull();
    expect(run('cat-file', '-t', tip)).toBe('commit');
  } finally {
    data.cleanup();
  }
});

test('closing a proposal whose tip moved fails and changes neither namespace', async () => {
  const { data, commit, refs } = repositoryWithCommits();
  try {
    const first = commit({ 'a.txt': 'one\n' });
    const second = commit({ 'a.txt': 'two\n' });
    await refs.createRef('shared', 'p1', first);
    expect(await refs.closeRef('shared', 'p1', second)).toBe(false);
    expect(await refs.readTip('shared', 'p1')).toBe(first);
    expect(await refs.readTip('shared', 'p1', 'closed')).toBeNull();
  } finally {
    data.cleanup();
  }
});

test('proposal refs live under refs/workbench and no branch list shows them', async () => {
  const { data, commit, refs, run } = repositoryWithCommits();
  try {
    await refs.createRef('shared', 'p1', commit({ 'a.txt': 'one\n' }));
    expect(run('for-each-ref', '--format=%(refname)', 'refs/workbench/')).toBe('refs/workbench/proposals/p1');
    expect(run('branch', '-a')).not.toContain('p1');
    expect(run('for-each-ref', '--format=%(refname)', 'refs/heads/')).toBe('refs/heads/main');
  } finally {
    data.cleanup();
  }
});

test('a rename lists two paths, an addition and a removal', async () => {
  const { data, commit, refs, run } = repositoryWithCommits();
  try {
    const before = commit({ 'old.txt': 'same content\n'.repeat(20), 'keep.txt': 'keep\n' });
    run('mv', 'old.txt', 'new.txt');
    writeFileSync(join(data.root, 'projects', 'shared', 'keep.txt'), 'changed\n');
    const after = commit({});
    const changes = await refs.changedPaths('shared', before, after);
    expect(changes).toContainEqual({ path: 'old.txt', status: 'removed' });
    expect(changes).toContainEqual({ path: 'new.txt', status: 'added' });
    expect(changes).toContainEqual({ path: 'keep.txt', status: 'changed' });
    expect(changes).toHaveLength(3);
  } finally {
    data.cleanup();
  }
});

test('changed-path output with odd file names parses by its separators', () => {
  expect(parseChangedPaths('A\0dir/with space.txt\0M\0naïve.txt\0D\0line\nbreak.txt\0')).toEqual([
    { path: 'dir/with space.txt', status: 'added' },
    { path: 'naïve.txt', status: 'changed' },
    { path: 'line\nbreak.txt', status: 'removed' },
  ]);
});
