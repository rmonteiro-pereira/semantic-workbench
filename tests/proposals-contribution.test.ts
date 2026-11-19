// Checks working on a proposal and contributing to it: the private branch, the compare-and-swap,
// and that nothing but the proposal moves.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, commitFilesDirectly, contributeToProposal, copyPosition, createProposal, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';

const refOf = (fixture: Awaited<ReturnType<typeof proposalFixture>>, id: string) => gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', `refs/workbench/proposals/${id}`]).text;
const mainOf = (fixture: Awaited<ReturnType<typeof proposalFixture>>) => gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;

test('working on a proposal gives a private branch at the tip and switches the copy to it', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  const worked = await workOnProposal(alice, sales.slug, proposal.id);
  expect(worked.status, JSON.stringify(worked.body)).toBe(200);
  expect(worked.body).toEqual({ branch: 'work/alice.rename', head: proposal.tip });
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/alice.rename');
  // Working again is the same answer; the personal branch is untouched.
  expect((await workOnProposal(alice, sales.slug, proposal.id)).body).toEqual(worked.body);
  expect(gitOutput(copy, ['rev-parse', 'refs/heads/work/alice']).text).toBe(proposal.tip);
});

test('a dirty copy is refused and nothing moves', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  const file = `/api/projects/${sales.slug}/files/${sales.file}`;
  const current = await alice.call(file);
  expect((await alice.call(file, 'PUT', { baseHash: current.body.hash, source: current.body.source + '# unsaved\n' })).status).toBe(200);
  await alice.call(`/api/projects/${sales.slug}/git/stage`, 'POST', { all: true });
  const refused = await workOnProposal(alice, sales.slug, proposal.id);
  expect(refused.status).toBe(409);
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/alice');
  expect(gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['branch', '--list', 'work/alice.rename']).text).toBe('');
});

test('a copy that moved since the person looked is refused', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await commitEdit(alice, sales, '# first\n');
  const position = await copyPosition(alice, sales.slug);
  await commitEdit(alice, sales, '# second\n');
  const refused = await alice.call(proposalsPath(sales.slug, proposal.id) + '/work', 'POST', position);
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('wrong-branch');
});

test('a contribution moves only the proposal and leaves the default branch and personal branches alone', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  await commitEdit(alice, sales, '# contributed\n', 'Contribute');
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);
  const head = gitOutput(copy, ['rev-parse', 'HEAD']).text;
  const mainBefore = mainOf(fixture);
  const personalBefore = gitOutput(copy, ['rev-parse', 'refs/heads/work/alice']).text;
  const contributed = await contributeToProposal(alice, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  expect(refOf(fixture, proposal.id)).toBe(head);
  expect(contributed.body.tip).toBe(head);
  expect(contributed.body.contributors).toEqual(['Alice Andrade']);
  expect(contributed.body.changes).toEqual([{ project: sales.slug, files: [{ path: sales.file, status: 'changed' }] }]);
  expect(mainOf(fixture)).toBe(mainBefore);
  expect(gitOutput(copy, ['rev-parse', 'refs/heads/work/alice']).text).toBe(personalBefore);
  expect(fixture.ws.state.published().repositories[fixture.repository].commit).toBe(mainBefore);
});

test('a contribution that names an old tip is stale and nothing changes', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  await commitEdit(alice, sales, '# contributed\n');
  const position = await copyPosition(alice, sales.slug);
  const stale = await alice.call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: 'f'.repeat(40), branchHead: position.expectedHead });
  expect(stale.status).toBe(409);
  expect(stale.body.error).toBe('stale-tip');
  expect(refOf(fixture, proposal.id)).toBe(proposal.tip);
});

test('a contribution from a branch that does not contain the proposal is refused as not a descendant', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const [alice, frank] = [fixture.alice(), fixture.as((await import('./auth/access-fixture')).person('frank'))];
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  await workOnProposal(frank, sales.slug, proposal.id);
  await commitEdit(alice, sales, '# alice\n');
  expect((await contributeToProposal(alice, sales.slug, proposal.id)).status).toBe(200);
  // Frank's branch still starts at the old tip, so it lacks Alice's contribution.
  await commitEdit(frank, sales, '# frank\n');
  const tipNow = (await frank.call(proposalsPath(sales.slug, proposal.id))).body.tip;
  const position = await copyPosition(frank, sales.slug);
  const refused = await frank.call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: tipNow, branchHead: position.expectedHead });
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('not-descendant');
});

test('an unchanged branch has nothing to contribute and a person without edit rights cannot contribute', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  const nothing = await contributeToProposal(alice, sales.slug, proposal.id);
  expect(nothing.status).toBe(409);
  expect(nothing.body.error).toBe('nothing-to-contribute');
  const carol = await fixture.carol().call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: proposal.tip, branchHead: proposal.tip });
  expect([403, 404]).toContain(carol.status);
});

test('contributing from a personal branch other than the proposal contribution branch is refused', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Rename', [sales.slug]);
  await commitEdit(alice, sales, '# personal work\n');
  const position = await copyPosition(alice, sales.slug);
  const refused = await alice.call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: proposal.tip, branchHead: position.expectedHead });
  expect(refused.status).toBe(409);
  expect(['work-first', 'wrong-branch']).toContain(refused.body.error);
  expect(refOf(fixture, proposal.id)).toBe(proposal.tip);
});

const reclassify = (source: string) => source.replace('classification: internal', 'classification: public');
const ordersFile = 'domains/sales/orders.odcs.yaml';

test('a change only a Steward may make refuses the whole contribution for an Editor and passes for a Steward', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  for (const [caller, expected] of [
    [fixture.alice(), 403],
    [fixture.bob(), 200],
  ] as const) {
    const proposal = await createProposal(caller, sales.slug, `Reclassify by ${expected}`, [sales.slug]);
    expect((await workOnProposal(caller, sales.slug, proposal.id)).status).toBe(200);
    const copy = fixture.ws.worktrees.copyDir(caller.principal.key, fixture.repository);
    commitFilesDirectly(copy, { [ordersFile]: reclassify(readFileSync(join(copy, ordersFile), 'utf8')) });
    const result = await contributeToProposal(caller, sales.slug, proposal.id);
    expect(result.status, JSON.stringify(result.body)).toBe(expected);
    if (expected === 403) expect(refOf(fixture, proposal.id)).toBe(proposal.tip);
  }
});

test('a file the contributor may not edit refuses the contribution before the ref moves', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Private', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);
  commitFilesDirectly(copy, { 'domains/sales/private/secret.ontology.yaml': 'name: Secret\n' });
  const refused = await contributeToProposal(alice, sales.slug, proposal.id);
  expect([403, 404]).toContain(refused.status);
  expect(refOf(fixture, proposal.id)).toBe(proposal.tip);
});
