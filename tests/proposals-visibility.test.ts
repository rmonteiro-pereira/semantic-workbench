// A person who may read none of a proposal's declared projects must get the very same answer as for
// a proposal that does not exist, from every operation, so the proposal's existence is never revealed.
import { expect, test } from 'bun:test';
import { proposalFixture, rawAnswer } from './helpers/proposal-fixture';

const proposalsPath = (slug: string) => `/api/projects/${slug}/proposals`;

type Probe = { name: string; method: string; suffix: string; body?: unknown };

/** Every operation that names an existing proposal. */
const PROBES: Probe[] = [
  { name: 'read', method: 'GET', suffix: '' },
  { name: 'diff', method: 'GET', suffix: '/diff?path=people.ontology.yaml' },
  { name: 'work', method: 'POST', suffix: '/work', body: { expectedBranch: 'work/bob', expectedHead: 'none' } },
  { name: 'synchronize', method: 'POST', suffix: '/synchronize', body: { expectedBranch: 'work/bob', expectedHead: 'none' } },
  { name: 'contribute', method: 'POST', suffix: '/contribute', body: { expectedTip: 'none', branchHead: 'none' } },
  { name: 'check', method: 'GET', suffix: '/promotion-check' },
  { name: 'promote', method: 'POST', suffix: '/promote', body: { expectedTip: 'none' } },
  { name: 'close', method: 'POST', suffix: '/close', body: {} },
  { name: 'restore', method: 'POST', suffix: '/restore', body: {} },
];

test('every operation answers the same for a hidden proposal as for a missing one', async () => {
  using fixture = await proposalFixture();
  const { sales, people } = fixture.projects;
  const hidden = await fixture.dave().call(proposalsPath(people.slug), 'POST', { name: 'People change', projects: [people.slug] });
  expect(hidden.status, JSON.stringify(hidden.body)).toBe(201);
  // Bob reads Sales and Billing but nothing in People, the only project this proposal declares.
  const bob = fixture.bob();
  const responseFor = (probe: Probe, id: string) => rawAnswer(bob, proposalsPath(sales.slug) + `/${id}` + probe.suffix, probe.method, probe.body);
  for (const probe of PROBES) {
    const hiddenAnswer = await responseFor(probe, hidden.body.id);
    const missingAnswer = await responseFor(probe, 'never-created');
    expect(hiddenAnswer, probe.name).toEqual(missingAnswer);
    expect(hiddenAnswer.status, probe.name).toBe(404);
  }
});

test('a proposal appears in lists only for people who read a declared project', async () => {
  using fixture = await proposalFixture();
  const { sales, people } = fixture.projects;
  await fixture.dave().call(proposalsPath(people.slug), 'POST', { name: 'People change', projects: [people.slug] });
  await fixture.dave().call(proposalsPath(sales.slug), 'POST', { name: 'Sales change', projects: [sales.slug] });
  const idsFor = async (caller: ReturnType<typeof fixture.bob>, slug: string) => (await caller.call(proposalsPath(slug))).body.map((proposal: { id: string }) => proposal.id);
  expect(await idsFor(fixture.bob(), sales.slug)).toEqual(['sales-change']);
  expect(await idsFor(fixture.carol(), people.slug)).toEqual(['people-change']);
  expect((await idsFor(fixture.dave(), sales.slug)).sort()).toEqual(['people-change', 'sales-change']);
});

test('a proposal declaring a readable project and a hidden one shows only the readable one', async () => {
  using fixture = await proposalFixture();
  const { sales, billing, people } = fixture.projects;
  await fixture.dave().call(proposalsPath(sales.slug), 'POST', { name: 'Mixed', projects: [sales.slug, people.slug, billing.slug] });
  const seen = await fixture.bob().call(`${proposalsPath(sales.slug)}/mixed`);
  expect(seen.status).toBe(200);
  expect(seen.body.projects.map((project: { slug: string }) => project.slug).sort()).toEqual([billing.slug, sales.slug].sort());
  expect(JSON.stringify(seen.body)).not.toContain(people.slug);
});
