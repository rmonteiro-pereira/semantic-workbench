// A branch spelled in another letter case is the same branch on a volume that ignores case, so
// it is refused, and personal branches are recognized whatever their case.
import { expect, test } from 'bun:test';
import {
  branchShownTo,
  branchSpelledDifferently,
  isPersonalBranch,
} from '../../src/server/projects/worktrees';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { gitOutput, copyFolder, openCopy, signedIn } from './working-copy-fixture';

test('personal branches are recognized in any letter case', () => {
  expect(isPersonalBranch('Work/bob')).toBe(true);
  expect(isPersonalBranch('WORK/bob')).toBe(true);
  expect(isPersonalBranch('network/x')).toBe(false);
  expect(branchShownTo('Work/bob', 'work/alice')).toBe(false);
  expect(branchShownTo('origin/WORK/bob', 'work/alice', true)).toBe(false);
  expect(branchShownTo('WORK/alice', 'work/alice')).toBe(true);
  expect(branchShownTo('feature', null)).toBe(true);
});

test('a spelling that differs only in case from an existing branch is found', () => {
  const existing = ['main', 'work/bob', 'Release/1'];
  expect(branchSpelledDifferently('Work/bob', existing)).toBe('work/bob');
  expect(branchSpelledDifferently('work/bob', existing)).toBeUndefined();
  expect(branchSpelledDifferently('release/1', existing)).toBe('Release/1');
  expect(branchSpelledDifferently('fresh', existing)).toBeUndefined();
});

test('a branch cannot be created or switched to under another spelling of an existing one', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  const switchTo = (branch: string, create: boolean) =>
    frank.call('/api/projects/sales-contracts/git/switch', 'POST', { branch, create });
  const refused = await switchTo('Work/alice', true);
  expect(refused.status).toBe(400);
  expect(refused.body.error).toContain('differs only in letter case');
  expect((await switchTo('Main', true)).status).toBe(400);
  const copy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/frank');
  expect((await switchTo('feature/new', true)).status).toBe(200);
});
