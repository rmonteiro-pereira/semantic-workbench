// Proposal content never leaves the proposal operations: no read, export, agent call, published
// snapshot or remote action carries it, and no push the workbench makes names a proposal ref.
import { expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiRequest, gitOutput } from './auth/working-copy-fixture';
import { readRouteExamples } from './auth/route-actions';
import { sh } from './helpers/scm';
import { commitEdit, contributeToProposal, createProposal, proposalFixture, proposalsPath, workOnProposal } from './helpers/proposal-fixture';

const MARKER = 'CONFINEMENT-MARKER-7f3a91';

type Fixture = Awaited<ReturnType<typeof proposalFixture>>;

// An open proposal and a closed one, both carrying the marker in a file of Sales.
async function proposalsCarryingTheMarker(fixture: Fixture) {
  const { sales } = fixture.projects;
  const dave = fixture.dave();
  const open = await createProposal(dave, sales.slug, 'Open with marker', [sales.slug]);
  await workOnProposal(dave, sales.slug, open.id);
  await commitEdit(dave, sales, `# ${MARKER} open\n`);
  await contributeToProposal(dave, sales.slug, open.id);
  const closing = await createProposal(dave, sales.slug, 'Closed with marker', [sales.slug]);
  await workOnProposal(dave, sales.slug, closing.id);
  await commitEdit(dave, sales, `# ${MARKER} closed\n`);
  await contributeToProposal(dave, sales.slug, closing.id);
  expect((await dave.call(proposalsPath(sales.slug, closing.id) + '/close', 'POST', {})).status).toBe(200);
  // Dave goes back to his personal branch, so what his own copy holds no longer includes the marker.
  expect((await dave.call(`/api/projects/${sales.slug}/git/switch`, 'POST', { branch: 'work/dave' })).status).toBe(200);
  return { dave, open, closed: closing };
}

const concreteExample = (fixture: Fixture, path: string) =>
  path
    .replace('/api/projects/missing', `/api/projects/${fixture.projects.sales.slug}`)
    .replace('example.yaml', fixture.projects.sales.file)
    .replace('/api/drafts/missing', `/api/drafts/${fixture.projects.sales.slug}`);

test('no read operation, export, agent call or explanation carries proposal content to anyone else', async () => {
  using fixture = await proposalFixture();
  const { dave, open } = await proposalsCarryingTheMarker(fixture);
  // The marker is readable through the proposal's own operation, so its absence elsewhere means something.
  const diff = await dave.call(proposalsPath(fixture.projects.sales.slug, open.id) + `/diff?path=${fixture.projects.sales.file}`);
  expect(diff.body.after).toContain(MARKER);
  let checked = 0;
  for (const person of [fixture.alice(), fixture.bob(), fixture.carol()]) {
    for (const example of readRouteExamples.filter(candidate => !candidate.path.includes('/proposals') && candidate.path !== '/api/events')) {
      const path = concreteExample(fixture, example.path);
      const response = await person.handler(apiRequest(path, example.method, example.method === 'GET' ? undefined : (example.body ?? {})));
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.includes(MARKER), `${example.method} ${path}`).toBe(false);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(40);
  const exported = await fixture
    .alice()
    .handler(new Request(`http://127.0.0.1:4310/api/projects/${fixture.projects.sales.slug}/export`, { headers: { Origin: 'http://127.0.0.1:4310', 'X-SW-Request': '1' } }));
  expect(Buffer.from(await exported.arrayBuffer()).includes(MARKER)).toBe(false);
}, 60_000);

test('the published snapshot and the default branch never hold proposal content', async () => {
  using fixture = await proposalFixture();
  await proposalsCarryingTheMarker(fixture);
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  expect(gitOutput(base, ['grep', '-c', MARKER, 'refs/heads/main']).code).not.toBe(0);
  await fixture.ws.published.withPin(async pin => {
    for (const project of Object.values(fixture.projects)) {
      for (const path of await fixture.ws.published.filePaths(pin, project.slug)) {
        const bytes = await fixture.ws.published.fileBytes(pin, project.slug, path);
        expect(Buffer.from(bytes ?? new Uint8Array()).includes(MARKER), `${project.slug}/${path}`).toBe(false);
      }
    }
  });
});

test('every remote action leaves the remote without proposal content and no push names a proposal ref', async () => {
  using fixture = await proposalFixture();
  const { dave } = await proposalsCarryingTheMarker(fixture);
  const slug = fixture.projects.sales.slug;
  const spawned = spyOn(Bun, 'spawn');
  try {
    for (const action of ['fetch', 'pull', 'push', 'sync', 'push-default', 'pull-default']) await dave.call(`/api/projects/${slug}/git/${action}`, 'POST', {});
    await dave.call(`/api/projects/${slug}/git/commit`, 'POST', { message: 'Nothing', push: true });
    const pushes = spawned.mock.calls.map(callArguments => (callArguments[0] as string[]).join(' ')).filter(command => / push /.test(` ${command} `));
    expect(pushes.length).toBeGreaterThan(0);
    for (const command of pushes) {
      for (const forbidden of ['refs/workbench', '--all', '--mirror', '--tags']) expect(command, command).not.toContain(forbidden);
    }
  } finally {
    spawned.mockRestore();
  }
  const everything = sh(fixture.remote, ['log', '--all', '-p']);
  expect(everything).not.toContain(MARKER);
  expect(
    sh(fixture.remote, ['for-each-ref', '--format=%(refname)'])
      .split('\n')
      .filter(name => name.includes('workbench') || name.includes('proposal')),
  ).toEqual([]);
});

test('a remote branch named like a proposal is not a proposal and creates no workbench ref', async () => {
  using fixture = await proposalFixture();
  const { dave } = await proposalsCarryingTheMarker(fixture);
  const slug = fixture.projects.sales.slug;
  const scratch = mkdtempSync(join(tmpdir(), 'workbench-remote-proposal-'));
  try {
    const other = join(scratch, 'other');
    sh(scratch, ['clone', '-q', fixture.remote, other]);
    for (const name of ['proposal/from-remote', 'work/someone.from-remote']) {
      sh(other, ['switch', '-q', '-c', name]);
      sh(other, ['commit', '-q', '--allow-empty', '-m', 'Remote work']);
      sh(other, ['push', '-q', 'origin', name]);
    }
    const base = fixture.ws.worktrees.baseDir(fixture.repository);
    const before = gitOutput(base, ['for-each-ref', '--format=%(refname)', 'refs/workbench/']).text;
    for (const action of ['fetch', 'pull', 'sync']) await dave.call(`/api/projects/${slug}/git/${action}`, 'POST', {});
    expect(gitOutput(base, ['for-each-ref', '--format=%(refname)', 'refs/workbench/']).text).toBe(before);
    const listed = await dave.call(proposalsPath(slug));
    expect(listed.body.map((summary: { id: string }) => summary.id).sort()).toEqual(['closed-with-marker', 'open-with-marker']);
    expect((await dave.call(proposalsPath(slug, 'from-remote'))).status).toBe(404);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60_000);
