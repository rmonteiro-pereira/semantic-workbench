// A person with two proposals switches between their contribution branches, and each proposal holds
// only the work done for it.
import { expect, test } from 'bun:test';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, contributeToProposal, createProposal, proposalFixture, workOnProposal } from './helpers/proposal-fixture';

test('each of two proposals holds only its own contribution', async () => {
  using fixture = await proposalFixture();
  const { sales, billing } = fixture.projects;
  const alice = fixture.alice();
  const first = await createProposal(alice, sales.slug, 'First change', [sales.slug]);
  const second = await createProposal(alice, billing.slug, 'Second change', [billing.slug]);
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);

  expect((await workOnProposal(alice, sales.slug, first.id)).status).toBe(200);
  await commitEdit(alice, sales, '# for the first proposal\n');
  expect((await contributeToProposal(alice, sales.slug, first.id)).status).toBe(200);

  expect((await workOnProposal(alice, billing.slug, second.id)).status).toBe(200);
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/alice.second-change');
  await commitEdit(alice, billing, '# for the second proposal\n');
  expect((await contributeToProposal(alice, billing.slug, second.id)).status).toBe(200);

  const changedBy = (id: string) =>
    gitOutput(base, ['diff', '--name-only', first.tip, `refs/workbench/proposals/${id}`])
      .text.split('\n')
      .filter(Boolean);
  expect(changedBy(first.id)).toEqual([`domains/sales/${sales.file}`]);
  expect(changedBy(second.id)).toEqual([`domains/billing/${billing.file}`]);

  // Switching back shows the first proposal's work without the second's.
  expect((await workOnProposal(alice, sales.slug, first.id)).status).toBe(200);
  expect(gitOutput(copy, ['show', `HEAD:domains/sales/${sales.file}`]).text).toContain('# for the first proposal');
  expect(gitOutput(copy, ['show', `HEAD:domains/billing/${billing.file}`]).text).not.toContain('# for the second proposal');
  expect(gitOutput(copy, ['rev-parse', 'refs/heads/work/alice']).text).toBe(first.tip);
});
