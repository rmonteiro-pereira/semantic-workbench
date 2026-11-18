// A promotion interrupted at each durable step ends with the proposal promoted only if the default
// branch actually moved, and a damaged proposal is shown only to people who may promote.
import { expect, test } from 'bun:test';
import { openWorkspace } from '../src/server/projects/workspace';
import { LOCAL_READER } from '../src/server/projects/reader';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, contributeToProposal, createProposal, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';

const allowEverything = { check: () => {}, allows: () => true, files: () => {}, checkout: () => {} };
const asEveryone = { reader: LOCAL_READER, authority: allowEverything };

for (const stage of ['intent', 'ref', 'pointer'] as const) {
  test(`a promotion stopped after ${stage} is promoted at restart only if the default branch moved`, async () => {
    let stopAt: string | null = null;
    using fixture = await proposalFixture(undefined, {
      publicationStage: reached => {
        if (reached === stopAt) throw Error('Stopped');
      },
    });
    const { sales } = fixture.projects;
    const dave = fixture.dave();
    const proposal = await createProposal(dave, sales.slug, 'Interrupted', [sales.slug]);
    await workOnProposal(dave, sales.slug, proposal.id);
    await commitEdit(dave, sales, '# interrupted\n');
    const tip = (await contributeToProposal(dave, sales.slug, proposal.id)).body.tip as string;
    const published = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
    stopAt = stage;
    const stopped = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: tip });
    expect(stopped.status).toBe(500);
    fixture.ws.close();

    const reopened = await openWorkspace({ root: fixture.root });
    try {
      const moved = stage !== 'intent';
      const summaries = await reopened.proposals.list(sales.slug, asEveryone);
      expect(summaries.map(summary => [summary.id, summary.status])).toEqual([[proposal.id, moved ? 'promoted' : 'open']]);
      const main = gitOutput(reopened.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
      expect(main).toBe(moved ? tip : published);
      expect(reopened.state.published().repositories[fixture.repository].commit).toBe(main);
      const ref = gitOutput(reopened.worktrees.baseDir(fixture.repository), ['rev-parse', '-q', '--verify', `refs/workbench/proposals/${proposal.id}`]);
      expect(ref.text).toBe(moved ? '' : tip);
    } finally {
      reopened.close();
    }
  });
}

test('a proposal whose ref is missing is damaged, shown only to people who may promote, and nothing is deleted', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const proposal = await createProposal(dave, sales.slug, 'Lost ref', [sales.slug]);
  gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['update-ref', '-d', `refs/workbench/proposals/${proposal.id}`]);
  const listed = await dave.call(proposalsPath(sales.slug));
  expect(listed.body.map((summary: { id: string; status: string }) => [summary.id, summary.status])).toEqual([[proposal.id, 'damaged']]);
  const alice = fixture.alice();
  expect((await alice.call(proposalsPath(sales.slug))).body).toEqual([]);
  expect((await alice.call(proposalsPath(sales.slug, proposal.id))).status).toBe(404);
  expect((await dave.call(proposalsPath(sales.slug, proposal.id))).body.status).toBe('damaged');
  const refused = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: proposal.tip });
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('damaged');
});
