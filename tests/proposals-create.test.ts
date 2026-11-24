// Checks creating, listing and reading proposals: where a proposal starts, what it declares, the
// limits, and that a stop between writing the ref and the record never shows a broken proposal.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_OPEN_PROPOSALS } from '../src/shared/proposals/proposal';
import { createProposalRefs } from '../src/server/projects/proposal-refs';
import { createProposalStore } from '../src/server/projects/proposal-store';
import { createProposals } from '../src/server/projects/proposals';
import { LOCAL_READER } from '../src/server/projects/reader';
import { gitOutput } from './auth/working-copy-fixture';
import { proposalFixture } from './helpers/proposal-fixture';

const proposalsPath = (slug: string) => `/api/projects/${slug}/proposals`;

test('a proposal starts at the published tip and declares the projects its creator chose', async () => {
  using fixture = await proposalFixture();
  const { sales, billing } = fixture.projects;
  const alice = fixture.alice();
  const published = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
  const created = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Rename the customer concept', projects: [sales.slug, billing.slug] });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  expect(created.body).toMatchObject({ id: 'rename-the-customer-concept', name: 'Rename the customer concept', status: 'open', tip: published, createdByName: 'Alice Andrade' });
  expect(created.body.projects.map((project: { slug: string }) => project.slug).sort()).toEqual([billing.slug, sales.slug].sort());
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  expect(gitOutput(base, ['rev-parse', 'refs/workbench/proposals/rename-the-customer-concept']).text).toBe(published);
  expect(gitOutput(base, ['branch', '--list']).text).not.toContain('rename');
  const listed = await alice.call(proposalsPath(sales.slug));
  expect(listed.body.map((proposal: { id: string }) => proposal.id)).toEqual(['rename-the-customer-concept']);
});

test('the same name gets a new identifier and the record keeps the base and the creator', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const first = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Same name', projects: [sales.slug] });
  const second = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Same name', projects: [sales.slug] });
  expect([first.body.id, second.body.id]).toEqual(['same-name', 'same-name-2']);
  const file = JSON.parse(readFileSync(join(fixture.ws.layout.state, 'proposals', `${fixture.repository}.json`), 'utf8'));
  expect(file.proposals.map((record: { id: string }) => record.id)).toEqual(['same-name', 'same-name-2']);
  expect(file.proposals[0]).toMatchObject({ status: 'open', projects: [sales.slug], createdByName: 'Alice Andrade' });
  expect(file.proposals[0].base).toMatch(/^[0-9a-f]{40}$/);
});

test('a bad name, an empty or foreign project set and a project the person cannot read are refused alike', async () => {
  using fixture = await proposalFixture();
  const { sales, people } = fixture.projects;
  const alice = fixture.alice();
  const create = (body: unknown) => alice.call(proposalsPath(sales.slug), 'POST', body);
  expect((await create({ name: '   ', projects: [sales.slug] })).status).toBe(400);
  expect((await create({ name: 'x'.repeat(81), projects: [sales.slug] })).status).toBe(400);
  expect((await create({ name: 'No projects', projects: [] })).status).toBe(400);
  expect((await create({ name: 'Unknown', projects: ['no-such-project'] })).status).toBe(400);
  const unreadable = await create({ name: 'Hidden', projects: [people.slug] });
  const unknown = await create({ name: 'Hidden', projects: ['no-such-project'] });
  expect(unreadable.status).toBe(unknown.status);
  expect(unreadable.body).toEqual(unknown.body);
  expect((await create({ name: 'Extra', projects: [sales.slug], extra: true })).status).toBe(400);
});

test('someone who may not branch and edit the projects cannot create a proposal', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const refused = await fixture.carol().call(proposalsPath(sales.slug), 'POST', { name: 'Not allowed', projects: [sales.slug] });
  expect([403, 404]).toContain(refused.status);
  expect((await fixture.alice().call(proposalsPath(sales.slug))).body).toEqual([]);
});

test('the open limit refuses the next proposal with a reason', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  for (let count = 0; count < MAX_OPEN_PROPOSALS; count++) {
    const created = await alice.call(proposalsPath(sales.slug), 'POST', { name: `Proposal ${count}`, projects: [sales.slug] });
    expect(created.status, String(count)).toBe(201);
  }
  const refused = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'One too many', projects: [sales.slug] });
  expect(refused.status).toBe(409);
  expect(refused.body.error).toBe('limit');
});

test('a repository with no published commit refuses a proposal', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const service = createProposals({
    store: createProposalStore(fixture.ws.layout),
    refs: { listTips: async () => ({ open: new Map(), closed: new Map() }) } as never,
    git: fixture.ws.git,
    worktrees: { defaultBranch: async () => 'main' } as never,
    repositoryOf: () => fixture.repository,
    projectsIn: () => [sales.slug],
    publishedCommit: () => null,
    serialized: <T>(_repository: string, use: () => Promise<T>) => use(),
  } as never);
  const everything = { check: () => {}, allows: () => true, files: () => {}, checkout: () => {} };
  const caller = { reader: LOCAL_READER, authority: everything };
  const refused = service.create(sales.slug, { name: 'Too early', projects: [sales.slug] }, caller);
  await expect(refused).rejects.toMatchObject({ code: 'no-published-commit' });
});

test('a ref without a record is never shown and a record is never written before its ref', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  const published = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
  const refs = createProposalRefs(fixture.ws.git, () => base);
  // A stop after the ref and before the record leaves exactly this state.
  expect(await refs.createRef(fixture.repository, 'orphan', published)).toBe(true);
  expect((await alice.call(proposalsPath(sales.slug))).body).toEqual([]);
  expect((await alice.call(`${proposalsPath(sales.slug)}/orphan`)).status).toBe(404);
  expect(existsSync(join(fixture.ws.layout.state, 'proposals', `${fixture.repository}.json`))).toBe(false);
  // The identifier stays taken, so a later proposal with that name cannot adopt the stray ref.
  const created = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Orphan', projects: [sales.slug] });
  expect(created.body.id).toBe('orphan-2');
});
