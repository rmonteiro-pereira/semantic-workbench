// Many people contributing to one proposal from the same tip at once: exactly one wins, every other
// answers stale, and no commit from a personal branch ever reaches the proposal.
import { expect, test } from 'bun:test';
import { createProposalStore } from '../src/server/projects/proposal-store';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, contributeToProposal, createProposal, numberedEditor, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';
import { seededRandom } from './helpers/seeded-random';

const RANDOM_RUNS = 200;
const MOST_CONTRIBUTORS = 8;

test('exactly one of many simultaneous contributions wins and the proposal holds only its commit', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  const editors = Array.from({ length: MOST_CONTRIBUTORS }, (_, index) => fixture.as(numberedEditor(index + 1)));
  const handles = editors.map(editor => fixture.ws.state.users().users.find(user => user.key === editor.principal.key)!.handle);
  const store = createProposalStore(fixture.ws.layout);
  const random = seededRandom(20261117);
  const personalMarker = gitOutput(base, ['commit-tree', 'HEAD^{tree}', '-m', 'personal work']).text;
  for (let run = 0; run < RANDOM_RUNS; run++) {
    const contributors = 2 + Math.floor(random() * (MOST_CONTRIBUTORS - 1));
    const proposal = await createProposal(editors[0], sales.slug, `Race ${run}`, [sales.slug]);
    const tree = gitOutput(base, ['rev-parse', `${proposal.tip}^{tree}`]).text;
    const heads = Array.from({ length: contributors }, (_, index) => {
      const head = gitOutput(base, ['commit-tree', tree, '-p', proposal.tip, '-m', `Contribution ${run}.${index}`]).text;
      gitOutput(base, ['update-ref', `refs/heads/work/${handles[index]}.${proposal.id}`, head]);
      return head;
    });
    const order = heads.map((_, index) => index).sort(() => random() - 0.5);
    const answers = await Promise.all(
      order.map(async index => {
        await Bun.sleep(Math.floor(random() * 3));
        const answer = await editors[index].call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: proposal.tip, branchHead: heads[index] });
        return { index, status: answer.status, error: answer.body?.error };
      }),
    );
    const winners = answers.filter(answer => answer.status === 200);
    expect(winners, `run ${run}: ${JSON.stringify(answers)}`).toHaveLength(1);
    for (const loser of answers.filter(answer => answer.status !== 200)) expect(loser.error, `run ${run}`).toBe('stale-tip');
    const tip = gitOutput(base, ['rev-parse', `refs/workbench/proposals/${proposal.id}`]).text;
    expect(tip).toBe(heads[winners[0].index]);
    expect(gitOutput(base, ['merge-base', '--is-ancestor', personalMarker, tip]).code).not.toBe(0);
    // Each run starts from an empty repository record, so the open limit never interferes.
    store.write(fixture.repository, []);
    gitOutput(base, ['update-ref', '-d', `refs/workbench/proposals/${proposal.id}`]);
  }
}, 240_000);

type RaceFixture = Awaited<ReturnType<typeof proposalFixture>>;

// A proposal contributed to by Dave, so there is something to promote.
async function proposalReadyToPromote(fixture: RaceFixture, name: string) {
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const proposal = await createProposal(dave, sales.slug, name, [sales.slug]);
  await workOnProposal(dave, sales.slug, proposal.id);
  await commitEdit(dave, sales, `# ${name}\n`);
  const contributed = await contributeToProposal(dave, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  return { dave, proposal, tip: contributed.body.tip as string };
}

const statuses = (answers: { status: number }[]) => answers.map(answer => answer.status).sort();

test('two simultaneous promotions of one proposal have exactly one winner', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { dave, proposal, tip } = await proposalReadyToPromote(fixture, 'Twice');
  const promote = () => dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: tip });
  const answers = await Promise.all([promote(), promote()]);
  expect(statuses(answers)).toEqual([200, 409]);
  expect(gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text).toBe(tip);
});

test('a contribution racing a promotion leaves exactly one winner, whichever order they run in', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const random = seededRandom(7);
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  const editor = fixture.as(numberedEditor(1));
  const handle = fixture.ws.state.users().users.find(user => user.key === editor.principal.key)!.handle;
  for (let run = 0; run < 15; run++) {
    const { dave, proposal, tip } = await proposalReadyToPromote(fixture, `Race ${run}`);
    const tree = gitOutput(base, ['rev-parse', `${tip}^{tree}`]).text;
    const head = gitOutput(base, ['commit-tree', tree, '-p', tip, '-m', 'Late contribution']).text;
    gitOutput(base, ['update-ref', `refs/heads/work/${handle}.${proposal.id}`, head]);
    const promote = async () => {
      await Bun.sleep(Math.floor(random() * 6));
      return dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: tip });
    };
    const contribute = async () => {
      await Bun.sleep(Math.floor(random() * 6));
      return editor.call(proposalsPath(sales.slug, proposal.id) + '/contribute', 'POST', { expectedTip: tip, branchHead: head });
    };
    const [promoted, contributed] = await Promise.all([promote(), contribute()]);
    expect(
      [promoted.status, contributed.status].filter(status => status === 200),
      `run ${run}: ${promoted.status} ${contributed.status}`,
    ).toHaveLength(1);
    const main = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
    if (promoted.status === 200) expect(main).toBe(tip);
    else expect(main).not.toBe(tip);
  }
}, 120_000);

test('a promotion racing a publication leaves exactly one winner', async () => {
  using fixture = await proposalFixture();
  const { sales, billing } = fixture.projects;
  for (let run = 0; run < 6; run++) {
    const { dave, proposal, tip } = await proposalReadyToPromote(fixture, `Publication ${run}`);
    // Dave's own branch carries other work that would be published at the same moment.
    expect((await dave.call(`/api/projects/${billing.slug}/git/switch`, 'POST', { branch: 'work/dave' })).status).toBe(200);
    await commitEdit(dave, billing, `# other work ${run}\n`);
    const answers = await Promise.all([
      dave.call(proposalsPath(sales.slug, proposal.id) + '/promote', 'POST', { expectedTip: tip }),
      dave.call(`/api/projects/${billing.slug}/git/publish`, 'POST', {}),
    ]);
    expect(
      answers.filter(answer => answer.status === 200),
      `run ${run}: ${statuses(answers)}`,
    ).toHaveLength(1);
  }
}, 120_000);
