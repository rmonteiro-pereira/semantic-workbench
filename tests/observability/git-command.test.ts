// A trace may say which Git subcommand ran and with which options, never with which values.
import { expect, test } from 'bun:test';
import { summarizeGitArgs } from '../../src/server/observability/git-command';

test('option names are kept and their values are not', () => {
  const summary = summarizeGitArgs([
    '-c',
    'user.email=ana@example.org',
    'commit',
    '--author=Ana <ana@example.org>',
    '-m',
    'message with secrets',
  ]);
  expect(summary.options).toEqual(['--author', '-m']);
  expect(JSON.stringify(summary)).not.toContain('ana@');
  expect(JSON.stringify(summary)).not.toContain('secrets');
});

test('remote addresses and credentials in positional arguments are never reported', () => {
  const summary = summarizeGitArgs([
    'fetch',
    'https://user:token123@git.example.org/team/repo.git',
    'refs/heads/main',
  ]);
  expect(JSON.stringify(summary)).not.toContain('token123');
  expect(JSON.stringify(summary)).not.toContain('example.org');
  expect(summary.argumentCount).toBe(3);
});

test('the values after -c and -C are skipped even when they look like options', () => {
  expect(summarizeGitArgs(['-C', '--secret-dir', 'status', '--porcelain']).options).toEqual([
    '--porcelain',
  ]);
});

test('the option list is bounded and has no repeats', () => {
  const many = Array.from({ length: 40 }, (_, index) => `--option-${index}`);
  expect(summarizeGitArgs(['log', ...many]).options).toHaveLength(12);
  expect(summarizeGitArgs(['log', '-n', '-n']).options).toEqual(['-n']);
});
