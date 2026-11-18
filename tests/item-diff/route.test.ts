import { expect, test } from 'bun:test';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

type Fixture = Awaited<ReturnType<typeof itemDiffBaselineWorkspace>>;

async function request(fixture: Fixture, query: string, project = 'finance') {
  const url = new URL(`http://localhost:5173/api/projects/${project}/item-diff?${query}`);
  return fixture.handler(new Request(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
}

test('item comparison returns version labels, bounded change details and a no-store response', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const response = await request(fixture, 'from=published&to=working');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    from: { side: 'published', version: expect.stringMatching(/^[a-f0-9]{40}$/) },
    to: { side: 'working', version: expect.stringMatching(/^[a-f0-9]{64}$/) },
    counts: { added: 0, removed: 0, changed: 2 },
    changes: expect.arrayContaining([expect.objectContaining({ kind: 'concept', name: 'Customer', state: 'changed' })]),
    notCompared: [],
    omitted: 0,
  });
});

test('comparison rejects malformed queries and treats missing projects and branches alike', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const unknown = await request(fixture, 'from=published&to=proposal');
  expect(unknown.status).toBe(400);
  expect(await unknown.text()).toContain('published, working, branch:<name>, commit:<id>');
  for (const query of ['from=published', 'from=published&to=working&to=working', 'from=published&to=commit:bad', 'from=published&to=' + 'x'.repeat(1024)]) {
    expect((await request(fixture, query)).status).toBe(400);
  }
  const branch = await request(fixture, 'from=published&to=branch:missing');
  const project = await request(fixture, 'from=published&to=working', 'missing');
  expect([branch.status, project.status]).toEqual([404, 404]);
  expect(await branch.text()).toBe(await project.text());
});
