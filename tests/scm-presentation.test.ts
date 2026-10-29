// Covers the wording the Source control panel and Clone dialog derive from Git state.
import { expect, test } from 'bun:test';
import { isPublished, trackingLine, upstreamRemote } from '../src/app/scm/branch-tracking';
import { terminalSignInCommand } from '../src/app/scm/credential-command';
import { definitionsSummary } from '../src/app/scm/clone-summary';
import { cleanTreeText } from '../src/app/scm/empty-repository';
import { isRejectedPush } from '../src/app/scm/push-rejection';

const REJECTED_PUSH = `To /tmp/remote.git
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to '/tmp/remote.git'
hint: Updates were rejected because the tip of your current branch is behind`;

test('a push refused for missing commits is recognised, other refusals are not', () => {
  expect(isRejectedPush(REJECTED_PUSH)).toBe(true);
  expect(isRejectedPush(' ! [rejected] main -> main (fetch first)')).toBe(true);
  expect(isRejectedPush(' ! [remote rejected] main -> main (pre-receive hook declined)')).toBe(false);
  expect(isRejectedPush('fatal: Authentication failed')).toBe(false);
});

test('the tracking line names the upstream or says there is none', () => {
  expect(trackingLine('origin/feature/review')).toBe('Tracking origin/feature/review');
  expect(trackingLine('')).toBe('Not tracking a remote branch');
  expect(isPublished('origin/main')).toBe(true);
  expect(isPublished('')).toBe(false);
});

test('a repository without commits is not described as matching its last commit', () => {
  expect(cleanTreeText({ hasCommits: true })).toBe('No changes. The working tree matches the last commit.');
  expect(cleanTreeText({ hasCommits: false })).not.toContain('last commit');
});

test('a clone without commits or definitions does not claim valid definitions', () => {
  const cloned = { op: 'one', phase: 'done' as const };
  expect(definitionsSummary({ ...cloned, definitions: 3, hasCommits: true })).toBe('Every definition file is valid.');
  expect(definitionsSummary({ ...cloned, definitions: 0, hasCommits: true })).toBe('Repository cloned; no definitions yet.');
  expect(definitionsSummary({ ...cloned, definitions: 0, hasCommits: false })).toBe('Repository cloned; no commits or definitions yet.');
});

test('the terminal sign-in command names the remote and never carries a password', () => {
  expect(terminalSignInCommand('https://git.example.org/team/shop.git')).toBe("git ls-remote 'https://git.example.org/team/shop.git'");
  expect(terminalSignInCommand('https://ana:secret@git.example.org/shop.git')).toBe("git ls-remote 'https://git.example.org/shop.git'");
  expect(terminalSignInCommand(undefined)).toBe('git ls-remote <remote address>');
});

test('Fetch, Pull and Push use the upstream remote, not the first one listed', () => {
  const remotes = { origin: 'https://example.test/a.git', upstream: 'https://example.test/b.git' };
  expect(upstreamRemote({ upstream: 'upstream/main', remotes })).toBe('upstream');
  expect(upstreamRemote({ upstream: '', remotes })).toBe('origin');
  expect(upstreamRemote({ upstream: '', remotes: {} })).toBeUndefined();
});
