// Publishing moves the default branch and the published checkout as one step: a lost race, a
// guard refusal or a changed checkout leaves both as they were, and a stop between the two moves
// is repaired. The default branch name a remote announces is checked before Git sees it.
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../../src/server/projects/git';
import { createWorktrees } from '../../src/server/projects/worktrees';
import { authWorkspace } from '../helpers/auth-workspace';
import { gitOutput } from './working-copy-fixture';

const REPO = 'sales-contracts';
const ANN = { key: 'ua'.repeat(20), handle: 'ann', name: 'Ann' };
const BEN = { key: 'ub'.repeat(20), handle: 'ben', name: 'Ben' };
const IDENTITY = ['-c', 'user.name=Someone', '-c', 'user.email=someone@example.org'];

// The fixture's repositories with copy operations for two people, outside any request.
async function copiesFixture() {
  const fixture = await authWorkspace();
  const { layout } = fixture.ws;
  const git = createGit({ projectsRoot: layout.projects, worktreesRoot: layout.worktrees });
  const worktrees = createWorktrees({ layout, git, people: () => [ANN, BEN] });
  const base = join(layout.projects, REPO);
  return { fixture, worktrees, base };
}

// Commits one new file in a copy and returns the commit.
function commitIn(dir: string, name: string) {
  writeFileSync(join(dir, name), name + '\n');
  gitOutput(dir, ['add', name]);
  gitOutput(dir, [...IDENTITY, 'commit', '-q', '-m', name]);
  return gitOutput(dir, ['rev-parse', 'HEAD']).text;
}

const unchecked = async () => {};
const tipOf = (base: string) => gitOutput(base, ['rev-parse', 'refs/heads/main']).text;

test('someone publishing between the check and the move makes the publish fail, not win', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  const ann = commitIn((await worktrees.ensure(REPO, ANN)).dir, 'ann.txt');
  const ben = (await worktrees.ensure(REPO, BEN)).dir;
  const before = tipOf(base);
  // Ben's commit lands on main after Ann's publish checked it was a fast-forward.
  gitOutput(ben, ['merge', '-q', '--ff-only', ann]);
  const benTip = commitIn(ben, 'ben.txt');
  const raced = async () => {
    gitOutput(base, ['update-ref', 'refs/heads/main', benTip, before]);
  };
  await expect(worktrees.publish(REPO, ANN.key, raced)).rejects.toThrow(/fast-forward/);
  expect(tipOf(base)).toBe(benTip);
});

test('a guard refusing a publish leaves the default branch and the published files alone', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  commitIn((await worktrees.ensure(REPO, ANN)).dir, 'ann.txt');
  const before = tipOf(base);
  const head = gitOutput(base, ['rev-parse', 'HEAD']).text;
  const refuse = async () => {
    throw new Error('refused by the guard');
  };
  await expect(worktrees.publish(REPO, ANN.key, refuse)).rejects.toThrow('refused by the guard');
  expect(tipOf(base)).toBe(before);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).toBe(head);
});

test('a published checkout with a new file refuses the publish before anything moves', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  commitIn((await worktrees.ensure(REPO, ANN)).dir, 'ann.txt');
  const before = tipOf(base);
  writeFileSync(join(base, 'stray.txt'), 'written outside the workbench\n');
  await expect(worktrees.publish(REPO, ANN.key, unchecked)).rejects.toThrow(/has changes/);
  expect(tipOf(base)).toBe(before);
});

test('a stop between moving the branch and the files is repaired on the next start', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  const ann = commitIn((await worktrees.ensure(REPO, ANN)).dir, 'ann.txt');
  // The branch moved, then the server stopped before the published files followed.
  gitOutput(base, ['update-ref', 'refs/heads/main', ann]);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).not.toBe(ann);
  await worktrees.repairBase(REPO);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).toBe(ann);
  expect(gitOutput(base, ['status', '--porcelain']).text).toBe('');
});

test('a default branch name from the remote that reads as an option is refused', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  // No remembered name and a detached checkout leave the remote's HEAD as the only source.
  gitOutput(base, ['checkout', '-q', '--detach']);
  gitOutput(base, ['update-ref', 'refs/remotes/origin/-evil', 'HEAD']);
  gitOutput(base, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/-evil']);
  await expect(worktrees.defaultBranch(REPO)).rejects.toThrow(/Cannot tell the default branch/);
  gitOutput(base, ['update-ref', 'refs/remotes/origin/trunk', 'HEAD']);
  gitOutput(base, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk']);
  expect(await worktrees.defaultBranch(REPO)).toBe('trunk');
});

test('following the remote judges the commits it brings like a publish', async () => {
  const { fixture, worktrees, base } = await copiesFixture();
  using _ = fixture;
  const ann = commitIn((await worktrees.ensure(REPO, ANN)).dir, 'ann.txt');
  const before = tipOf(base);
  gitOutput(base, ['update-ref', 'refs/remotes/origin/main', ann]);
  expect(await worktrees.remoteAhead(REPO, 'origin')).toEqual({
    branch: 'main',
    previous: before,
    next: ann,
  });
  const refuse = async () => {
    throw new Error('refused by the guard');
  };
  await expect(worktrees.followRemote(REPO, 'origin', refuse)).rejects.toThrow('refused');
  expect(tipOf(base)).toBe(before);
  await worktrees.followRemote(REPO, 'origin', unchecked);
  expect(tipOf(base)).toBe(ann);
});
