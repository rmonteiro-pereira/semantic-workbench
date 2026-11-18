// Promotion moves the default branch to a proposal's tip through the publication path: every
// project of the repository moves together or none does, and publication's own guards apply.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { person } from './auth/access-fixture';
import { gitOutput } from './auth/working-copy-fixture';
import {
  commitEdit,
  commitFilesDirectly,
  contributeToProposal,
  createProposal,
  grantErinPublishingWithoutGuardedChanges,
  proposalFixture,
  proposalsPath,
  workOnProposal,
} from './helpers/proposal-fixture';

type Fixture = Awaited<ReturnType<typeof proposalFixture>>;

const mainOf = (fixture: Fixture) => gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
const refOf = (fixture: Fixture, id: string) => gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', '-q', '--verify', `refs/workbench/proposals/${id}`]).text;
const promote = (fixture: Fixture, who: ReturnType<Fixture['dave']>, id: string, expectedTip: string) => who.call(proposalsPath(fixture.projects.sales.slug, id) + '/promote', 'POST', { expectedTip });

// A proposal declaring the three projects, with one contribution to Sales. Only an Admin may work
// on all three, so the Admin makes the contribution too.
async function contributedProposal(fixture: Fixture) {
  const { sales, billing, people } = fixture.projects;
  const dave = fixture.dave();
  const proposal = await createProposal(dave, sales.slug, 'Together', [sales.slug, billing.slug, people.slug]);
  expect((await workOnProposal(dave, sales.slug, proposal.id)).status).toBe(200);
  await commitEdit(dave, sales, '# promoted together\n');
  const contributed = await contributeToProposal(dave, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  return { proposal, tip: contributed.body.tip as string };
}

test('a Steward with authority over every project promotes and all three projects move together', async () => {
  using fixture = await proposalFixture();
  const { sales, billing, people } = fixture.projects;
  const { proposal, tip } = await contributedProposal(fixture);
  const before = mainOf(fixture);
  const promoted = await promote(fixture, fixture.dave(), proposal.id, tip);
  expect(promoted.status, JSON.stringify(promoted.body)).toBe(200);
  expect(promoted.body).toEqual({ published: 'main', previous: before, commit: tip });
  expect(mainOf(fixture)).toBe(tip);
  expect(fixture.ws.state.published().repositories[fixture.repository].commit).toBe(tip);
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  expect(readFileSync(join(base, 'domains/sales', sales.file), 'utf8')).toContain('# promoted together');
  const event = fixture.ws.events
    .replay(0)!
    .filter(candidate => candidate.event === 'published')
    .at(-1)!;
  expect([...(event.tags.projects ?? [])].sort()).toEqual([billing.slug, people.slug, sales.slug].sort());
  const afterwards = (await fixture.dave().call(proposalsPath(sales.slug, proposal.id))).body;
  expect(afterwards.status).toBe('promoted');
  expect(refOf(fixture, proposal.id)).toBe('');
  const record = JSON.parse(readFileSync(join(fixture.ws.layout.state, 'proposals', `${fixture.repository}.json`), 'utf8')).proposals[0];
  expect(record.outcome).toMatchObject({ tip, previousPublished: before, published: tip });
});

test('a promoted proposal accepts no further contribution, work or promotion', async () => {
  using fixture = await proposalFixture();
  const { proposal, tip } = await contributedProposal(fixture);
  expect((await promote(fixture, fixture.dave(), proposal.id, tip)).status).toBe(200);
  const sales = fixture.projects.sales.slug;
  const again = await promote(fixture, fixture.dave(), proposal.id, tip);
  expect(again.status).toBe(409);
  expect(again.body.error).toBe('not-open');
  const work = await workOnProposal(fixture.alice(), sales, proposal.id);
  expect(work.status).toBe(409);
});

test('partial authority never moves the default branch or the proposal', async () => {
  using fixture = await proposalFixture();
  const { proposal, tip } = await contributedProposal(fixture);
  const before = mainOf(fixture);
  // Bob is a Steward of the Sales domain only, and the repository also holds People.
  for (const who of [fixture.bob(), fixture.alice()]) {
    const refused = await promote(fixture, who, proposal.id, tip);
    expect([403, 404]).toContain(refused.status);
  }
  expect(mainOf(fixture)).toBe(before);
  expect(refOf(fixture, proposal.id)).toBe(tip);
  const check = await fixture.bob().call(proposalsPath(fixture.projects.sales.slug, proposal.id) + '/promotion-check');
  expect(check.body).toEqual({ ok: false, reasons: ['authority'], files: [] });
});

test('a tip that is not a descendant of the published tip is refused with the check naming it', async () => {
  using fixture = await proposalFixture();
  const { sales, billing } = fixture.projects;
  const { proposal, tip } = await contributedProposal(fixture);
  // Someone publishes first, so the proposal no longer starts at the published tip.
  const dave = fixture.dave();
  // Dave goes back to his own branch so only his other work is published.
  expect((await dave.call(`/api/projects/${billing.slug}/git/switch`, 'POST', { branch: 'work/dave' })).status).toBe(200);
  await commitEdit(dave, billing, '# published first\n');
  expect((await dave.call(`/api/projects/${billing.slug}/git/publish`, 'POST', {})).status).toBe(200);
  const before = mainOf(fixture);
  const check = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promotion-check');
  expect(check.body).toEqual({ ok: false, reasons: ['not-descendant'], files: [] });
  const refused = await promote(fixture, dave, proposal.id, tip);
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('not-descendant');
  expect(mainOf(fixture)).toBe(before);
  expect(refOf(fixture, proposal.id)).toBe(tip);
});

test('a promotion that names an old tip is stale and moves nothing', async () => {
  using fixture = await proposalFixture();
  const { proposal, tip } = await contributedProposal(fixture);
  const before = mainOf(fixture);
  const refused = await promote(fixture, fixture.dave(), proposal.id, proposal.tip);
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('stale-tip');
  expect(mainOf(fixture)).toBe(before);
  expect(refOf(fixture, proposal.id)).toBe(tip);
});

test('a check passes for a good proposal and is the same decision promotion then makes', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const { proposal, tip } = await contributedProposal(fixture);
  const dave = fixture.dave();
  const check = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promotion-check');
  expect(check.body).toEqual({ ok: true, reasons: [], files: [] });
  const stale = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promotion-check?expectedTip=' + 'f'.repeat(40));
  expect(stale.body.reasons).toEqual(['stale-tip']);
  expect(mainOf(fixture)).not.toBe(tip);
});

test('a guarded change only a Steward may make is refused for a promoter who may not make it', async () => {
  using fixture = await proposalFixture(grantErinPublishingWithoutGuardedChanges);
  const { sales } = fixture.projects;
  const bob = fixture.bob();
  const proposal = await createProposal(bob, sales.slug, 'Reclassify', [sales.slug]);
  await workOnProposal(bob, sales.slug, proposal.id);
  const copy = fixture.ws.worktrees.copyDir(bob.principal.key, fixture.repository);
  const orders = 'domains/sales/orders.odcs.yaml';
  commitFilesDirectly(copy, { [orders]: readFileSync(join(copy, orders), 'utf8').replace('classification: internal', 'classification: public') });
  const contributed = await contributeToProposal(bob, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  const erin = fixture.as(person('erin'));
  const before = mainOf(fixture);
  const check = await erin.call(proposalsPath(sales.slug, proposal.id) + '/promotion-check');
  expect(check.status, JSON.stringify(check.body)).toBe(200);
  expect(check.body.reasons).toEqual(['guard']);
  expect(check.body.files).toEqual(['orders.odcs.yaml']);
  const refused = await promote(fixture, erin, proposal.id, contributed.body.tip);
  expect([403, 404]).toContain(refused.status);
  expect(mainOf(fixture)).toBe(before);
  expect(refOf(fixture, proposal.id)).toBe(contributed.body.tip);
  expect((await promote(fixture, fixture.dave(), proposal.id, contributed.body.tip)).status).toBe(200);
});

test('a candidate that cannot be read within the limits moves nothing and the check says it is invalid', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const proposal = await createProposal(dave, sales.slug, 'Too big', [sales.slug]);
  await workOnProposal(dave, sales.slug, proposal.id);
  const copy = fixture.ws.worktrees.copyDir(dave.principal.key, fixture.repository);
  commitFilesDirectly(copy, { 'domains/sales/huge.ontology.yaml': `name: Huge\ndescription: ${'x'.repeat(2_100_000)}\n` });
  const contributed = await contributeToProposal(dave, sales.slug, proposal.id);
  expect(contributed.status, JSON.stringify(contributed.body)).toBe(200);
  const before = mainOf(fixture);
  const check = await dave.call(proposalsPath(sales.slug, proposal.id) + '/promotion-check');
  expect(check.body.ok).toBe(false);
  expect(['invalid', 'limit']).toContain(check.body.reasons[0]);
  const refused = await promote(fixture, dave, proposal.id, contributed.body.tip);
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(mainOf(fixture)).toBe(before);
  expect(refOf(fixture, proposal.id)).toBe(contributed.body.tip);
});
