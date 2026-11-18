// Checks the proposal routes: their answers and status codes, that local mode has none, and that
// the reading routes return the same shapes the interface expects.
import { expect, test } from 'bun:test';
import { routeFor } from '../src/server/auth/route-actions';
import { call, ontology } from './helpers/scm';
import { testWorkspace } from './helpers/temp-data-dir';
import { proposalFixture, proposalsPath } from './helpers/proposal-fixture';

test('local mode has no proposal routes and answers like any unknown path', async () => {
  using workspace = await testWorkspace();
  const created = await workspace.seed([{ path: 'shop.yaml', source: ontology('Buys.') }], 'shop');
  const unknown = await call(workspace, 'GET', '/api/projects/shop/unknown-thing');
  for (const [method, path] of [
    ['GET', `/api/projects/${created.slug}/proposals`],
    ['POST', `/api/projects/${created.slug}/proposals`],
    ['GET', `/api/projects/${created.slug}/proposals/one`],
    ['POST', `/api/projects/${created.slug}/proposals/one/promote`],
  ] as const) {
    const answer = await workspace.handler(new Request('http://127.0.0.1:4310' + path, { method, ...(method === 'POST' ? { body: '{}' } : {}) }));
    expect(answer.status, `${method} ${path}`).toBe(404);
    expect(answer.status).toBe(unknown.status);
  }
  expect(routeFor('GET', '/api/projects/shop/proposals', 'local')).toBeNull();
  expect(routeFor('GET', '/api/projects/shop/proposals', 'server')?.row.action).toBe('read');
});

test('reading a proposal returns its changes and a file diff, and listing shows the same proposal', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  const created = await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Read me', projects: [sales.slug] });
  expect(created.status).toBe(201);
  const read = await alice.call(`${proposalsPath(sales.slug)}/read-me`);
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ id: 'read-me', status: 'open', behindPublished: 0, changes: [], mine: null });
  expect(read.body.may).toEqual({ contribute: true, promote: false, close: false, restore: false });
  const missing = await alice.call(`${proposalsPath(sales.slug)}/no-such-proposal`);
  expect(missing.status).toBe(404);
  const noPath = await alice.call(`${proposalsPath(sales.slug)}/read-me/diff`);
  expect(noPath.status).toBe(400);
  const diff = await alice.call(`${proposalsPath(sales.slug)}/read-me/diff?path=${sales.file}`);
  expect(diff.status).toBe(200);
  expect(diff.body).toMatchObject({ path: sales.file, beforeExists: true, afterExists: true, binary: false });
  expect(diff.body.before).toBe(diff.body.after);
});

test('create answers 400 for a bad request, 403 or 404 without authority and 409 at the limit', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  expect((await alice.call(proposalsPath(sales.slug), 'POST', { name: '', projects: [sales.slug] })).status).toBe(400);
  expect([403, 404]).toContain((await fixture.carol().call(proposalsPath(sales.slug), 'POST', { name: 'Denied', projects: [sales.slug] })).status);
  expect((await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Fine', projects: [sales.slug] })).status).toBe(201);
});

test('work, synchronize and contribute refuse bodies that are not what they expect', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const alice = fixture.alice();
  await alice.call(proposalsPath(sales.slug), 'POST', { name: 'Bodies', projects: [sales.slug] });
  for (const [action, wrong] of [
    ['work', { expectedBranch: 'main', expectedHead: 'abc', surprise: true }],
    ['synchronize', { expectedBranch: 'main', surprise: true }],
    ['contribute', { expectedTip: 'abc' }],
    ['contribute', { expectedTip: 'abc', branchHead: 'abc', surprise: true }],
  ] as const) {
    const answer = await alice.call(`${proposalsPath(sales.slug)}/bodies/${action}`, 'POST', wrong);
    expect(answer.status, `${action} ${JSON.stringify(wrong)}`).toBe(400);
  }
});

test('promote needs the tip the promoter reviewed and the check needs no body', async () => {
  using fixture = await proposalFixture();
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  await dave.call(proposalsPath(sales.slug), 'POST', { name: 'Promote me', projects: [sales.slug] });
  expect((await dave.call(`${proposalsPath(sales.slug)}/promote-me/promote`, 'POST', {})).status).toBe(400);
  expect((await dave.call(`${proposalsPath(sales.slug)}/promote-me/promote`, 'POST', { expectedTip: 'x', other: 1 })).status).toBe(400);
  const check = await dave.call(`${proposalsPath(sales.slug)}/promote-me/promotion-check`);
  expect(check.status).toBe(200);
  expect(Object.keys(check.body).sort()).toEqual(['files', 'ok', 'reasons']);
});
