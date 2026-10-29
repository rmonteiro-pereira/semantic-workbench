// Runs the assertions for the data access, files and Git mutants against a candidate module.
// Every category exercises exactly the decisions of the module its mutants change.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scmCases, type Candidate } from './security-review-scm-cases';
import { checkoutCases } from './security-review-checkout-cases';
import { serverCases } from './security-review-server-cases';

function pathsCase(candidate: Candidate) {
  const listing: Record<string, string[]> = {
    '/p': ['secret', 'Notes.yaml', 'café.yaml'],
    '/p/secret': ['plan.yaml'],
  };
  const list = (directory: string) => {
    if (!listing[directory]) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return listing[directory];
  };
  const variant = (error: any) => error.name === 'CaseVariantError';
  assert.doesNotThrow(() => candidate.assertExactCase('/p', 'secret/plan.yaml', list));
  assert.throws(() => candidate.assertExactCase('/p', 'SECRET/plan.yaml', list), variant);
  assert.throws(() => candidate.assertExactCase('/p', 'secret/PLAN.yaml', list), variant);
  assert.throws(() => candidate.assertExactCase('/p', 'notes.yaml', list), variant);
  // The same letters in another Unicode form are one name on such a volume.
  assert.throws(() => candidate.assertExactCase('/p', 'café.yaml', list), variant);
  assert.doesNotThrow(() => candidate.assertExactCase('/p', 'fresh/deeper/x.yaml', list));
  const denied = () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  };
  assert.throws(() => candidate.assertExactCase('/p', 'a.yaml', denied), /denied/);
  // The path check of every file access applies it on the real disk.
  const root = mkdtempSync(join(tmpdir(), 'secrev-paths-'));
  try {
    const layout = candidate.dataLayout(root);
    mkdirSync(join(layout.projects, 'demo', 'secret'), { recursive: true });
    writeFileSync(join(layout.projects, 'demo', 'secret', 'plan.yaml'), 'x');
    assert.throws(() => candidate.projectFile(layout, 'demo', 'SECRET/plan.yaml'), variant);
    assert.throws(() => candidate.projectFile(layout, 'demo', 'secret/Plan.yaml'), variant);
    assert.doesNotThrow(() => candidate.projectFile(layout, 'demo', 'secret/plan.yaml'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function httpCase(candidate: Candidate, hidden: WeakSet<Response>, paths: any, errors: any) {
  const variant = candidate.errorResponse(new paths.CaseVariantError());
  assert.equal(variant.status, 404);
  assert(hidden.has(variant), 'a case variant is audited as a hidden resource');
  const personal = candidate.errorResponse(new errors.PersonalBranchError('work/bob'));
  assert.equal(personal.status, 403);
  const plain = candidate.errorResponse(new paths.PathError('bad'));
  assert.equal(plain.status, 400);
  assert(!hidden.has(plain));
}

async function gitBranchNameCase(candidate: Candidate) {
  let asked = 0;
  const fake = (code: number) => ({
    run: async () => {
      asked++;
      return { code };
    },
  });
  assert.equal(await candidate.isBranchName(fake(0), '/d', '@{-1}'), false);
  assert.equal(await candidate.isBranchName(fake(0), '/d', 'a@{b}'), false);
  assert.equal(await candidate.isBranchName(fake(0), '/d', '-x'), false);
  assert.equal(asked, 0);
  assert.equal(await candidate.isBranchName(fake(0), '/d', 'feature/a'), true);
  assert.equal(await candidate.isBranchName(fake(1), '/d', 'bad..name'), false);
}

async function hooksCase(candidate: Candidate) {
  const owner = { key: 'u' + 'a'.repeat(20), handle: 'alice', name: 'Alice' };
  const checked: string[] = [];
  const worktrees = {
    assertFree: async (_repo: string, _key: string, branch: string) => void checked.push(branch),
    defaultBranch: async () => 'main',
    branchesMoved: () => {},
    mergeDefault: async () => ({}),
  };
  const hooks = candidate.copyScmHooks(owner.key, {
    worktrees,
    repoOf: (slug: string) => slug,
    owners: () => [owner],
    followRemote: async () => null,
  });
  await hooks.assertBranchFree('repo', 'main');
  await hooks.assertBranchFree('repo', 'work/alice');
  await hooks.assertBranchFree('repo', 'WORK/alice');
  await assert.rejects(() => hooks.assertBranchFree('repo', 'Work/bob'));
  await hooks.assertBranchFree('repo', 'feature/work/bob');
  await assert.rejects(
    () => hooks.assertBranchFree('repo', 'work/bob'),
    (error: any) => error.name === 'PersonalBranchError',
  );
  assert.equal(hooks.ownBranch(), 'work/alice');
  assert.equal(await hooks.untrackedPull('repo', 'work/alice'), 'main');
  assert.equal(await hooks.untrackedPull('repo', 'feature'), null);
  const nobody = candidate.copyScmHooks('u' + 'b'.repeat(20), {
    ...hooksDeps(worktrees),
    owners: () => [],
  });
  assert.equal(nobody.ownBranch(), null);
  await assert.rejects(() => nobody.assertBranchFree('repo', 'work/alice'));
}

function hooksDeps(worktrees: object) {
  return {
    worktrees,
    repoOf: (slug: string) => slug,
    owners: () => [],
    followRemote: async () => null,
  };
}

function existingCopyKeyCase(candidate: Candidate, local: any) {
  const key = 'u' + 'c'.repeat(20);
  const author = { name: 'Ann', email: 'ann@example.org', id: 'ann' };
  const reader = {
    view: {},
    owner: 'ann',
    guard: () => ({}),
    copy: { key, author, editable: () => true },
  };
  assert.equal(
    candidate.existingCopyKey(reader, () => true),
    key,
  );
  assert.equal(
    candidate.existingCopyKey(reader, () => false),
    null,
  );
  assert.equal(
    candidate.existingCopyKey(local, () => true),
    null,
  );
}

async function worktreesCase(candidate: Candidate) {
  const own = 'work/alice';
  assert.equal(candidate.branchShownTo('main', own), true);
  assert.equal(candidate.branchShownTo('feature/a', null), true);
  assert.equal(candidate.branchShownTo('work/alice', own), true);
  assert.equal(candidate.branchShownTo('work/bob', own), false);
  assert.equal(candidate.branchShownTo('work/bob', null), false);
  assert.equal(candidate.branchShownTo('origin/work/bob', own, true), false);
  assert.equal(candidate.branchShownTo('origin/work/alice', own, true), true);
  assert.equal(candidate.branchShownTo('origin/main', own, true), true);
  assert.equal(candidate.isPersonalBranch('work/x'), true);
  assert.equal(candidate.isPersonalBranch('network/x'), false);
  // On a volume that ignores letter case these are the same names.
  assert.equal(candidate.isPersonalBranch('Work/x'), true);
  assert.equal(candidate.branchShownTo('Work/bob', own), false);
  assert.equal(candidate.branchShownTo('WORK/alice', own), true);
  assert.equal(candidate.branchSpelledDifferently('Work/bob', ['main', 'work/bob']), 'work/bob');
  assert.equal(candidate.branchSpelledDifferently('work/bob', ['main', 'work/bob']), undefined);
  assert.equal(candidate.branchSpelledDifferently('fresh', ['main']), undefined);
}

const pathCases: Record<string, (candidate: Candidate) => unknown> = {
  'secrev-paths': pathsCase,
  'secrev-http': async candidate =>
    httpCase(candidate, (await import('../src/server/request')).hiddenResponses, await import('../src/server/projects/paths'), await import('../src/server/projects/errors')),
  'secrev-git': gitBranchNameCase,
  'secrev-hooks': hooksCase,
  'secrev-copy-key': async candidate => existingCopyKeyCase(candidate, (await import('../src/server/projects/reader')).LOCAL_READER),
  'secrev-worktrees': worktreesCase,
};

/** Executes one category of the data access, files and Git mutants against a candidate module. */
export async function securityReviewCase(candidate: Candidate, category: string) {
  const run = { ...pathCases, ...scmCases, ...serverCases, ...checkoutCases }[category];
  if (!run) throw Error(`Unknown data access category ${category}.`);
  await run(candidate);
}
