// Exercises status and notice acknowledgement without moving existing commits or the index.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { publicationRepository } from './helpers/git-fixtures';
import { testWorkspace } from './helpers/temp-data-dir';

async function fixture(gitBinary?: string) {
  const repository = publicationRepository();
  createState(dataLayout(repository.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
  return { repository, workspace: await testWorkspace({ root: repository.dir, gitBinary }) };
}
const url = 'http://localhost/api/projects/definitions/git/';
async function status(workspace: Awaited<ReturnType<typeof testWorkspace>>) {
  const response = await workspace.handler(new Request(url + 'status'));
  expect(response.status).toBe(200);
  return (await response.json()).published;
}

test('status reports the durable snapshot, authoring distance and an explicitly acknowledged notice', async () => {
  const { repository, workspace } = await fixture();
  using _owned = workspace;
  expect(await status(workspace)).toEqual({ state: 'in-sync', branch: 'main', commit: repository.published, ahead: 0, behind: 0, notice: true });
  await workspace.ws.git.run(repository.repository, ['switch', 'work/local']);
  expect(await status(workspace)).toMatchObject({ commit: repository.published, ahead: 1, behind: 0, notice: true });
  const refs = (await workspace.ws.git.run(repository.repository, ['show-ref'])).stdout;
  const index = readFileSync(join(repository.repository, '.git', 'index'));
  const response = await workspace.handler(new Request(url + 'acknowledge-publication', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(200);
  expect((await status(workspace)).notice).toBe(false);
  expect((await status(workspace)).notice).toBe(false);
  expect((await workspace.ws.git.run(repository.repository, ['show-ref'])).stdout).toBe(refs);
  expect(readFileSync(join(repository.repository, '.git', 'index'))).toEqual(index);
  expect(workspace.ws.state.view('definitions').files['@publication']).toMatchObject({ notice: false });
});

test('an outside move appears as pending while the served commit remains unchanged', async () => {
  const { repository, workspace } = await fixture();
  using _owned = workspace;
  await workspace.ws.git.run(repository.repository, ['update-ref', 'refs/heads/main', repository.authoring]);
  expect(await status(workspace)).toMatchObject({ state: 'pending', commit: repository.published, pending: { next: repository.authoring, commits: 1, move: 'fast-forward' } });
  expect(workspace.ws.published.pin().commits.get('definitions')?.commit).toBe(repository.published!);
});

test('an unavailable default ref is reported without inventing a replacement snapshot', async () => {
  const { repository, workspace } = await fixture();
  using _owned = workspace;
  await workspace.ws.git.run(repository.repository, ['update-ref', '-d', 'refs/heads/main']);
  expect(await status(workspace)).toMatchObject({ state: 'none', reason: 'unavailable' });
});

test('status distinguishes a missing Git binary from an unborn default', async () => {
  const offline = await fixture('/nonexistent/git');
  using _ownedOffline = offline.workspace;
  expect(await status(offline.workspace)).toMatchObject({ state: 'none', reason: 'no-git' });
  using empty = await testWorkspace();
  const { slug } = await empty.seed([{ path: 'shop.ontology.yaml', source: 'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n' }], 'Shop');
  const response = await empty.handler(new Request(`http://localhost/api/projects/${slug}/git/status`));
  expect((await response.json()).published).toEqual({ state: 'none', reason: 'no-commit', notice: false });
});
