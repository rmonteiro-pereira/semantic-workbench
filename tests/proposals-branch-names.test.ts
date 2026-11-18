// Checks contribution branch names: the round trip, the first-dot split and whose branch a name is.
import { expect, test } from 'bun:test';
import { contributionBranch, ownsContributionBranch, parseContributionBranch } from '../src/shared/proposals/contribution-branch';
import { seededRandom } from './helpers/seeded-random';

const HANDLE_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const randomText = (random: () => number, alphabet: string, length: number) => Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');

test('a generated handle and identifier round trip through the branch name', () => {
  const random = seededRandom(4101);
  for (let run = 0; run < 300; run++) {
    const handle = randomText(random, HANDLE_LETTERS, 1 + Math.floor(random() * 12));
    const id = 'p' + randomText(random, HANDLE_LETTERS, Math.floor(random() * 20));
    expect(parseContributionBranch(contributionBranch(handle, id)), `${handle} ${id}`).toEqual({ handle, proposalId: id });
  }
});

test('names that are not contribution branches parse to nothing', () => {
  for (const name of ['work/alice', 'main', 'work/', 'work/.p1', 'work/alice.', 'work/alice.P_1', 'feature/alice.p1', 'work/alice.p1.extra']) {
    expect(parseContributionBranch(name), name).toBeNull();
  }
});

test('letter case is folded as the workbench folds branch names', () => {
  expect(parseContributionBranch('Work/Alice.P1')).toEqual({ handle: 'alice', proposalId: 'p1' });
  expect(ownsContributionBranch('work/alice', 'WORK/ALICE.p1')).toBe(true);
});

test('a handle that is a prefix of another never owns the other person branch', () => {
  expect(ownsContributionBranch('work/alice', 'work/alice.p1')).toBe(true);
  expect(ownsContributionBranch('work/alice', 'work/alice-2.p1')).toBe(false);
  expect(ownsContributionBranch('work/alice-2', 'work/alice.p1')).toBe(false);
  expect(ownsContributionBranch(null, 'work/alice.p1')).toBe(false);
});

test('work/alice.p1 is never read as the personal branch of a person named alice.p1', () => {
  expect(ownsContributionBranch('work/alice.p1', 'work/alice.p1')).toBe(false);
  expect(parseContributionBranch('work/alice.p1')).toEqual({ handle: 'alice', proposalId: 'p1' });
});
