// Checks synchronizing: the proposal tip merges into a person's contribution branch with the guards
// of a pull, and a conflict stays on that branch and never changes the proposal.
import { expect, test } from 'bun:test';
import { person } from './auth/access-fixture';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, contributeToProposal, copyPosition, createProposal, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';

const synchronize = async (caller: Parameters<typeof copyPosition>[0], slug: string, id: string) => caller.call(proposalsPath(slug, id) + '/synchronize', 'POST', await copyPosition(caller, slug));

test('synchronizing merges the proposal tip into the contribution branch', async () => {
  using fixture = await proposalFixture();
  const { sales, billing } = fixture.projects;
  const alice = fixture.alice();
  const frank = fixture.as(person('frank'));
  const proposal = await createProposal(alice, sales.slug, 'Shared', [sales.slug, billing.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  await workOnProposal(frank, sales.slug, proposal.id);
  await commitEdit(alice, sales, '# from alice\n');
  const contributed = await contributeToProposal(alice, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  await commitEdit(frank, billing, '# from frank\n');
  const view = await frank.call(proposalsPath(sales.slug, proposal.id));
  expect(view.body.mine).toEqual({ branch: 'work/frank.shared', behind: true });
  const merged = await synchronize(frank, sales.slug, proposal.id);
  expect(merged.status, JSON.stringify(merged.body)).toBe(200);
  expect(merged.body.merged).toBe(true);
  const copy = fixture.ws.worktrees.copyDir(frank.principal.key, fixture.repository);
  expect(gitOutput(copy, ['merge-base', '--is-ancestor', contributed.body.tip, 'HEAD']).code).toBe(0);
  expect((await frank.call(proposalsPath(sales.slug, proposal.id))).body.mine.behind).toBe(false);
});

test('a conflict stays on the contribution branch and the proposal does not change', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const frank = fixture.as(person('frank'));
  const proposal = await createProposal(alice, sales.slug, 'Clash', [sales.slug]);
  await workOnProposal(alice, sales.slug, proposal.id);
  await workOnProposal(frank, sales.slug, proposal.id);
  await commitEdit(alice, sales, '# alice says one thing\n');
  const contributed = await contributeToProposal(alice, sales.slug, proposal.id);
  await commitEdit(frank, sales, '# frank says another\n');
  const refused = await synchronize(frank, sales.slug, proposal.id);
  expect(refused.status).toBe(200);
  expect(refused.body).toEqual({ merged: false, conflicted: [`domains/sales/${sales.file}`] });
  const copy = fixture.ws.worktrees.copyDir(frank.principal.key, fixture.repository);
  expect(gitOutput(copy, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).code).toBe(0);
  const tipAfter = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', `refs/workbench/proposals/${proposal.id}`]).text;
  expect(tipAfter).toBe(contributed.body.tip);
});

test('synchronizing needs the person to be working on the proposal first', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const proposal = await createProposal(alice, sales.slug, 'Early', [sales.slug]);
  await commitEdit(alice, sales, '# personal\n');
  const refused = await synchronize(alice, sales.slug, proposal.id);
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('work-first');
});
