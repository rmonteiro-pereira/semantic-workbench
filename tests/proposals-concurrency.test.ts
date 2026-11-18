// Many people contributing to one proposal from the same tip at once: exactly one wins, every other
// answers stale, and no commit from a personal branch ever reaches the proposal.
import { expect, test } from 'bun:test';
import { createProposalStore } from '../src/server/projects/proposal-store';
import { gitOutput } from './auth/working-copy-fixture';
import { createProposal, numberedEditor, proposalFixture, proposalsPath } from './helpers/proposal-fixture';
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
