// A proposal cannot change more than it declared: files of an undeclared project, files that belong
// to no project and a rename across a project boundary each refuse the whole contribution, and a
// refusal names nothing the contributor may not read.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitOutput } from './auth/working-copy-fixture';
import { commitFilesDirectly, contributeToProposal, createProposal, proposalFixture, workOnProposal } from './helpers/proposal-fixture';

async function startedProposal(declared: ('sales' | 'billing')[]) {
  const fixture = await proposalFixture();
  const alice = fixture.alice();
  const { sales } = fixture.projects;
  const proposal = await createProposal(
    alice,
    sales.slug,
    'Scoped',
    declared.map(name => fixture.projects[name].slug),
  );
  expect((await workOnProposal(alice, sales.slug, proposal.id)).status).toBe(200);
  const copy = fixture.ws.worktrees.copyDir(alice.principal.key, fixture.repository);
  const tipOf = () => gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', `refs/workbench/proposals/${proposal.id}`]).text;
  return { fixture, alice, proposal, copy, tipOf };
}

const billingFile = 'domains/billing/billing.ontology.yaml';
const salesFile = 'domains/sales/sales.ontology.yaml';

test('files of declared projects are accepted, including a new file', async () => {
  const { fixture, alice, proposal, copy, tipOf } = await startedProposal(['sales', 'billing']);
  using _fixture = fixture;
  const head = commitFilesDirectly(copy, {
    'domains/billing/new.ontology.yaml': readFileSync(join(copy, billingFile), 'utf8') + '\n# new\n',
    [salesFile]: readFileSync(join(copy, salesFile), 'utf8') + '# edit\n',
  });
  const accepted = await contributeToProposal(alice, fixture.projects.sales.slug, proposal.id);
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  expect(tipOf()).toBe(head);
});

test('a file of an undeclared project refuses the whole contribution and names the readable project', async () => {
  const { fixture, alice, proposal, copy, tipOf } = await startedProposal(['sales']);
  using _fixture = fixture;
  commitFilesDirectly(copy, { [salesFile]: readFileSync(join(copy, salesFile), 'utf8') + '# fine\n', [billingFile]: readFileSync(join(copy, billingFile), 'utf8') + '# not declared\n' });
  const refused = await contributeToProposal(alice, fixture.projects.sales.slug, proposal.id);
  expect(refused.status).toBe(403);
  expect(refused.body.error).toBe('outside-declared-projects');
  expect(refused.body.message).toContain('Billing');
  expect(tipOf()).toBe(proposal.tip);
});

test('a file that belongs to no project refuses the contribution', async () => {
  const { fixture, alice, proposal, copy, tipOf } = await startedProposal(['sales']);
  using _fixture = fixture;
  commitFilesDirectly(copy, { 'README.md': 'Outside every project\n' });
  const refused = await contributeToProposal(alice, fixture.projects.sales.slug, proposal.id);
  expect(refused.status).toBe(403);
  expect(refused.body.error).toBe('outside-declared-projects');
  expect(refused.body.message).not.toContain('README');
  expect(tipOf()).toBe(proposal.tip);
});

test('a rename across a project boundary counts both of its paths', async () => {
  const { fixture, alice, proposal, copy, tipOf } = await startedProposal(['sales']);
  using _fixture = fixture;
  const text = readFileSync(join(copy, salesFile), 'utf8');
  commitFilesDirectly(copy, { [salesFile]: null, 'domains/billing/moved.ontology.yaml': text });
  const refused = await contributeToProposal(alice, fixture.projects.sales.slug, proposal.id);
  expect(refused.status).toBe(403);
  expect(refused.body.error).toBe('outside-declared-projects');
  expect(tipOf()).toBe(proposal.tip);
});

test('a refusal never names a project the contributor may not read', async () => {
  const { fixture, alice, proposal, copy, tipOf } = await startedProposal(['sales']);
  using _fixture = fixture;
  commitFilesDirectly(copy, { 'domains/people/people.ontology.yaml': 'name: People\n# changed\n' });
  const refused = await contributeToProposal(alice, fixture.projects.sales.slug, proposal.id);
  expect(refused.status).toBe(403);
  expect(refused.body.error).toBe('outside-declared-projects');
  expect(JSON.stringify(refused.body).toLowerCase()).not.toContain('people');
  expect(tipOf()).toBe(proposal.tip);
});
