// Closing keeps every commit and the record of who closed the proposal, restoring brings it back
// at its last tip, and neither is allowed without authority over the whole repository.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_OPEN_PROPOSALS } from '../src/shared/proposals/proposal';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, contributeToProposal, createProposal, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';

type Fixture = Awaited<ReturnType<typeof proposalFixture>>;

const refs = (fixture: Fixture, id: string) => {
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  const read = (ref: string) => gitOutput(base, ['rev-parse', '-q', '--verify', ref]).text;
  return { open: read(`refs/workbench/proposals/${id}`), closed: read(`refs/workbench/closed-proposals/${id}`) };
};
const act = (who: ReturnType<Fixture['dave']>, fixture: Fixture, id: string, action: 'close' | 'restore') => who.call(proposalsPath(fixture.projects.sales.slug, id) + `/${action}`, 'POST', {});

async function contributedProposal(fixture: Fixture, name = 'Closable') {
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const proposal = await createProposal(dave, sales.slug, name, [sales.slug]);
  await workOnProposal(dave, sales.slug, proposal.id);
  await commitEdit(dave, sales, `# ${name}\n`);
  const tip = (await contributeToProposal(dave, sales.slug, proposal.id)).body.tip as string;
  return { proposal, tip, dave };
}

test('closing moves the tip to the closed namespace, keeps its commits and records who closed it', async () => {
  using fixture = await proposalFixture();
  const { proposal, tip, dave } = await contributedProposal(fixture);
  const closed = await act(dave, fixture, proposal.id, 'close');
  expect(closed.status, JSON.stringify(closed.body)).toBe(200);
  expect(closed.body).toMatchObject({ status: 'closed', tip, may: { contribute: false, promote: false, close: false, restore: true } });
  expect(refs(fixture, proposal.id)).toEqual({ open: '', closed: tip });
  expect(gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['cat-file', '-t', tip]).text).toBe('commit');
  const record = JSON.parse(readFileSync(join(fixture.ws.layout.state, 'proposals', `${fixture.repository}.json`), 'utf8')).proposals[0];
  expect(record).toMatchObject({ status: 'closed', projects: [fixture.projects.sales.slug], outcome: { tip } });
  expect(record.outcome.by).toBeTruthy();
  expect(record.base).toMatch(/^[0-9a-f]{40}$/);
});

test('a closed proposal accepts no work, contribution or promotion but is still listed with its status', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { proposal, tip, dave } = await contributedProposal(fixture);
  await act(dave, fixture, proposal.id, 'close');
  const work = await workOnProposal(dave, sales.slug, proposal.id);
  expect(work.status).toBe(409);
  expect(work.body.error).toBe('not-open');
  const promote = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: tip });
  expect(promote.body.error).toBe('not-open');
  expect((await dave.call(proposalsPath(sales.slug))).body.map((summary: { status: string }) => summary.status)).toEqual(['closed']);
  expect((await act(dave, fixture, proposal.id, 'close')).body.error).toBe('not-open');
});

test('restoring reopens the proposal at its last tip', async () => {
  using fixture = await proposalFixture();
  const { proposal, tip, dave } = await contributedProposal(fixture);
  await act(dave, fixture, proposal.id, 'close');
  const restored = await act(dave, fixture, proposal.id, 'restore');
  expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  expect(restored.body).toMatchObject({ status: 'open', tip });
  expect(refs(fixture, proposal.id)).toEqual({ open: tip, closed: '' });
  expect((await act(dave, fixture, proposal.id, 'restore')).body.error).toBe('not-closed');
});

test('restoring is refused when an open proposal already has the name', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { proposal, dave } = await contributedProposal(fixture, 'Same name');
  await act(dave, fixture, proposal.id, 'close');
  await createProposal(dave, sales.slug, 'same NAME', [sales.slug]);
  const taken = await act(dave, fixture, proposal.id, 'restore');
  expect(taken.status).toBe(409);
  expect(taken.body.error).toBe('name-taken');
  expect(refs(fixture, proposal.id).closed).not.toBe('');
});

test('restoring is refused when the repository already holds the most open proposals', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { proposal, dave } = await contributedProposal(fixture, 'Closed early');
  await act(dave, fixture, proposal.id, 'close');
  for (let count = 0; count < MAX_OPEN_PROPOSALS; count++) await createProposal(dave, sales.slug, `Filler ${count}`, [sales.slug]);
  const full = await act(dave, fixture, proposal.id, 'restore');
  expect(full.status).toBe(409);
  expect(full.body.error).toBe('limit');
});

test('closing and restoring need authority over every project of the repository', async () => {
  using fixture = await proposalFixture();
  const { proposal, dave } = await contributedProposal(fixture);
  for (const who of [fixture.bob(), fixture.alice()]) {
    expect([403, 404]).toContain((await act(who, fixture, proposal.id, 'close')).status);
  }
  expect(refs(fixture, proposal.id).open).not.toBe('');
  await act(dave, fixture, proposal.id, 'close');
  for (const who of [fixture.bob(), fixture.alice()]) {
    expect([403, 404]).toContain((await act(who, fixture, proposal.id, 'restore')).status);
  }
  expect(refs(fixture, proposal.id).closed).not.toBe('');
});

test('a proposal published by someone else cannot be closed', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { proposal, dave } = await contributedProposal(fixture);
  // Dave's copy is on the contribution branch, so publishing it publishes the proposal's work.
  expect((await dave.call(`/api/projects/${sales.slug}/git/publish`, 'POST', {})).status).toBe(200);
  const refused = await act(dave, fixture, proposal.id, 'close');
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('not-open');
});
