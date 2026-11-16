// Exercises adoption through HTTP while retaining local files and immutable agent reads.
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../src/server/handler';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { createAuditLog } from '../src/server/auth/audit';
import { publicationRepository } from './helpers/git-fixtures';
import { testWorkspace } from './helpers/temp-data-dir';

async function setup() {
  const repository = publicationRepository();
  createState(dataLayout(repository.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
  const workspace = await testWorkspace({ root: repository.dir });
  const audit = createAuditLog({ dir: join(repository.dir, 'state', 'adoption-audit'), mirror: () => {} });
  const handler = createHandler(workspace.ws, { audit });
  const adopt = () => handler(new Request('http://localhost/api/projects/definitions/git/adopt', { method: 'POST', body: '{}' }));
  return { repository, workspace, audit, adopt };
}

test('adoption validates an outside fast-forward, records both commits and emits after settlement without changing local files', async () => {
  const { repository, workspace, audit, adopt } = await setup();
  using _owned = workspace;
  await workspace.ws.git.run(repository.repository, ['switch', 'work/local']);
  const path = join(repository.repository, 'shop.ontology.yaml');
  writeFileSync(path, 'uncommitted draft');
  const index = readFileSync(join(repository.repository, '.git', 'index'));
  await workspace.ws.git.run(repository.repository, ['update-ref', 'refs/heads/main', repository.authoring]);
  expect(workspace.ws.published.pin().commits.get('definitions')?.commit).toBe(repository.published!);
  const event = workspace.ws.events.stream(new Request('http://localhost/api/events'));
  const reader = event.body!.getReader();
  await reader.read();
  const response = await adopt();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ published: 'main', previous: repository.published, commit: repository.authoring });
  expect(workspace.ws.published.pin().commits.get('definitions')?.commit).toBe(repository.authoring);
  expect(readFileSync(path, 'utf8')).toBe('uncommitted draft');
  expect(readFileSync(join(repository.repository, '.git', 'index'))).toEqual(index);
  expect(audit.recent(1)[0].publication).toEqual({ previous: repository.published, commit: repository.authoring });
  let frames = '';
  while (!frames.includes('event: published')) frames += new TextDecoder().decode((await reader.read()).value);
  expect(frames).toContain('event: published');
  expect(frames).toContain(repository.authoring);
  await reader.cancel();
});

test('empty and diverged adoptions are explicit conflicts and retain the served snapshot', async () => {
  const { repository, workspace, adopt } = await setup();
  using _owned = workspace;
  const empty = await adopt();
  expect(empty.status).toBe(409);
  expect(await empty.json()).toEqual({ error: 'Nothing to adopt.' });
  await workspace.ws.git.run(repository.repository, ['update-ref', 'refs/heads/main', repository.previous!]);
  const diverged = await adopt();
  expect(diverged.status).toBe(409);
  expect(await diverged.json()).toEqual({
    error: `The default branch was moved outside the workbench and no longer contains the published commit. Make it a descendant of ${repository.published} in Git.`,
  });
  expect(workspace.ws.published.pin().commits.get('definitions')?.commit).toBe(repository.published!);
});

test('an adoption ref race is changed rather than diverged and abandons the pending intent', async () => {
  const { repository, workspace, adopt } = await setup();
  using _owned = workspace;
  await workspace.ws.git.run(repository.repository, ['switch', 'work/local']);
  await workspace.ws.git.commit(repository.repository, 'Outside follow-up', true);
  const outside = await workspace.ws.git.head(repository.repository);
  await workspace.ws.git.run(repository.repository, ['update-ref', 'refs/heads/main', repository.authoring]);
  const original = workspace.ws.git.run;
  workspace.ws.git.run = async (directory, args, options) => {
    if (args[0] === 'update-ref' && args[3] === repository.authoring) {
      await original(directory, ['update-ref', 'refs/heads/main', outside!]);
    }
    return original(directory, args, options);
  };
  const response = await adopt();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: 'The default branch changed during adoption. Review the pending move and try again.' });
  expect(workspace.ws.state.published().repositories.definitions).toEqual({ branch: 'main', commit: repository.published! });
});
