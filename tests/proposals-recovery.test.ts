// A promotion interrupted at each durable step ends with the proposal promoted only if the default
// branch actually moved, and a damaged proposal is shown only to people who may promote.
import { expect, test } from 'bun:test';
import { createPromotions } from '../src/server/projects/proposal-promotion';
import type { ProposalContext } from '../src/server/projects/proposal-context';
import type { ProposalRecord } from '../src/shared/proposals/proposal';
import { createGit } from '../src/server/projects/git';
import { createProposalRefs } from '../src/server/projects/proposal-refs';
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

for (const action of ['close', 'restore'] as const) {
  test(`restart finishes an interrupted ${action} after the Git transaction`, async () => {
    using fixture = await proposalFixture();
    const { sales } = fixture.projects;
    const caller = fixture.dave();
    const proposal = await createProposal(caller, sales.slug, 'Interrupted transition', [sales.slug]);
    const folder = fixture.ws.worktrees.baseDir(fixture.repository);
    const refs = createProposalRefs(createGit({ projectsRoot: fixture.ws.layout.projects }), () => folder);
    if (action === 'restore') {
      expect((await caller.call(proposalsPath(sales.slug, proposal.id) + '/close', 'POST', {})).status).toBe(200);
    }
    // Stop after the durable ref transaction, before writing the proposal record.
    const move = action === 'close' ? refs.closeRef : refs.restoreRef;
    expect(await move(fixture.repository, proposal.id, proposal.tip)).toBe(true);
    fixture.ws.close();

    const reopened = await openWorkspace({ root: fixture.root });
    try {
      const summaries = await reopened.proposals.list(sales.slug, asEveryone);
      const status = action === 'close' ? 'closed' : 'open';
      expect(summaries).toMatchObject([{ id: proposal.id, status, tip: proposal.tip }]);
      expect(await refs.readTip(fixture.repository, proposal.id, status === 'closed' ? 'closed' : 'open')).toBe(proposal.tip);
      expect(await refs.readTip(fixture.repository, proposal.id, status === 'closed' ? 'open' : 'closed')).toBeNull();
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

test('promotion recovery preserves both refs if writing the recovered records fails', async () => {
  const records = ['first', 'second'].map(id => ({ id, status: 'open', base: 'base' }) as ProposalRecord);
  let persisted = records;
  const tips = new Map(records.map(record => [record.id, record.id + '-tip']));
  let failWrite = true;
  let failRemoval = false;
  const context = {
    timestamp: () => '2026-11-18T00:00:00Z',
    deps: {
      serialized: async (_repository: string, use: () => Promise<void>) => use(),
      publishedCommit: () => 'published',
      store: {
        read: () => persisted,
        write: (_repository: string, next: ProposalRecord[]) => {
          if (failWrite) throw Error('Storage unavailable');
          persisted = next;
        },
      },
      refs: {
        listTips: async () => ({ open: new Map(tips), closed: new Map() }),
        mergedInto: async () => new Set(tips.keys()),
        removeRef: async (_repository: string, id: string) => {
          if (failRemoval && id === 'second') throw Error('Interrupted cleanup');
          return tips.delete(id);
        },
      },
    },
  } as unknown as ProposalContext;
  const recovery = createPromotions(context);
  await expect(recovery.recover(['repo'])).rejects.toThrow('Storage unavailable');
  expect([...tips.keys()]).toEqual(['first', 'second']);
  expect(persisted.map(record => record.status)).toEqual(['open', 'open']);

  failWrite = false;
  failRemoval = true;
  await expect(recovery.recover(['repo'])).rejects.toThrow('Interrupted cleanup');
  expect(persisted.map(record => [record.status, record.outcome?.tip])).toEqual([
    ['promoted', 'first-tip'],
    ['promoted', 'second-tip'],
  ]);
  expect(tips.get('second')).toBe('second-tip');

  failRemoval = false;
  await recovery.recover(['repo']);
  expect([...tips]).toEqual([]);
});
