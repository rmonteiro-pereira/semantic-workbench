// A promoter may have no working copy, so the changes a promotion brings in must be readable from
// the repository's published checkout alone, and must match what a copy would report.
import { expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { gitOutput } from './auth/working-copy-fixture';
import { commitEdit, proposalFixture } from './helpers/proposal-fixture';

test('changes between two commits are read on the published checkout and create no copy', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const base = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
  await commitEdit(dave, sales, '# promoted edit\n');
  const copyFolder = fixture.ws.worktrees.copyDir(dave.principal.key, fixture.repository);
  const tip = gitOutput(copyFolder, ['rev-parse', 'HEAD']).text;
  const copiesBefore = readdirSync(fixture.ws.layout.worktrees).sort();

  const changes = await fixture.ws.scm.changesBetween(sales.slug, base, tip);

  expect(changes).toHaveLength(1);
  expect(changes[0].project).toBe(sales.slug);
  expect(changes[0].path).toBe(sales.file);
  expect(changes[0].before).not.toContain('# promoted edit');
  expect(changes[0].after).toContain('# promoted edit');
  expect(readdirSync(fixture.ws.layout.worktrees).sort()).toEqual(copiesBefore);
  expect(existsSync(fixture.ws.worktrees.copyDir(fixture.carol().principal.key, fixture.repository))).toBe(false);
});

test('naming the changed paths judges exactly those files, so a rename counts both of its paths', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const base = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
  const prefix = 'domains/sales/';
  const changes = await fixture.ws.scm.changesBetween(sales.slug, base, base, [`${prefix}${sales.file}`, 'domains/billing/billing.ontology.yaml']);
  expect(changes.map(change => `${change.project}:${change.path}`).sort()).toEqual([`${sales.slug}:${sales.file}`, `${fixture.projects.billing.slug}:billing.ontology.yaml`].sort());
});
