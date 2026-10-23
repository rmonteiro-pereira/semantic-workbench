// Restoring from the trash in server mode: a restore that makes a project is a project creation,
// and a file deleted outside any working copy comes back into the person's own copy.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { openAdminRepository } from '../../server/auth/admin-repo';
import { LOCAL_READER } from '../../server/projects/reader';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { copyFolder, gitOutput, signedIn } from './working-copy-fixture';

const ORDERS = 'orders.odcs.yaml';
// A file with no classification, which an Editor may restore.
const MAPPING = 'sales.mapping.yaml';
const restoreUrl = (entryId: string) => `/api/trash/${entryId}/restore`;
const slugs = (ws: { state: { registry: () => { projects: { slug: string }[] } } }) =>
  ws.state.registry().projects.map(project => project.slug);

/** Deletes a file as local mode did (no working copy), then the project that held it. */
async function fileOfDeletedProject(ws: Parameters<typeof signedIn>[0], deletedBy: string) {
  const entry = await ws.trash.deleteFile('sales-contracts', ORDERS, deletedBy, LOCAL_READER);
  await ws.trash.deleteProject('sales-contracts', undefined);
  return entry.entryId;
}

test('an Editor cannot make a project by restoring a file whose project is gone', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  const entryId = await fileOfDeletedProject(fixture.ws, alice.principal.id);
  const before = slugs(fixture.ws);

  const refused = await alice.call(restoreUrl(entryId), 'POST', {});
  expect([403, 404]).toContain(refused.status);
  expect(slugs(fixture.ws)).toEqual(before);
  const undone = await alice.call(`/api/trash/${entryId}/undo`, 'POST');
  expect([403, 404, 410]).toContain(undone.status);
  expect(slugs(fixture.ws)).toEqual(before);
});

test('a Steward restoring such a file makes the project in a domain they may create in', async () => {
  using fixture = await authWorkspace();
  const bob = signedIn(fixture.ws)(person('bob'));
  const entryId = await fileOfDeletedProject(fixture.ws, bob.principal.id);
  // The restored project reuses the deleted one's id, so its old entry must not hide the result.
  const administration = openAdminRepository({ root: fixture.root });
  await administration.ensure();
  const document = administration.load().projects;
  delete document.projects['sales-contracts'];
  await administration.write(
    { 'projects.json': JSON.stringify(document, null, 2) + '\n' },
    {
      baseVersion: await administration.version(),
      author: { name: 'Test', email: 'test@example.org' },
      message: 'projects: forget the deleted project',
    },
  );

  const restored = await bob.call(restoreUrl(entryId), 'POST', {});
  expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  const slug = restored.body.project as string;
  expect(slugs(fixture.ws)).toContain(slug);
  const assigned = JSON.parse(readFileSync(join(fixture.root, 'admin', 'projects.json'), 'utf8'));
  expect(assigned.projects[slug].domain).toBe('sales');
});

test('a Steward naming a domain they may not create in is refused and nothing is made', async () => {
  using fixture = await authWorkspace();
  const bob = signedIn(fixture.ws)(person('bob'));
  const entryId = await fileOfDeletedProject(fixture.ws, bob.principal.id);
  const before = slugs(fixture.ws);
  const refused = await bob.call(restoreUrl(entryId), 'POST', { domain: 'hr' });
  expect([403, 404]).toContain(refused.status);
  expect(slugs(fixture.ws)).toEqual(before);
});

test('a file deleted outside any copy comes back into the person’s copy, not the published checkout', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  const entry = await fixture.ws.trash.deleteFile(
    'sales-contracts',
    MAPPING,
    alice.principal.id,
    LOCAL_READER,
  );
  gitOutput(base, ['add', '-A']);
  expect(gitOutput(base, ['commit', '-q', '-m', 'Remove orders']).code).toBe(0);

  const restored = await alice.call(restoreUrl(entry.entryId), 'POST', {});
  expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  expect(existsSync(join(copy, MAPPING))).toBe(true);
  expect(existsSync(join(base, MAPPING))).toBe(false);
  // A changed published checkout would refuse every later publish.
  expect(gitOutput(base, ['status', '--porcelain']).text).toBe('');
});

test('an undo that makes a project takes the same domain as a restore', async () => {
  using fixture = await authWorkspace();
  const bob = signedIn(fixture.ws)(person('bob'));
  const entryId = await fileOfDeletedProject(fixture.ws, bob.principal.id);
  const before = slugs(fixture.ws);
  const undoUrl = `/api/trash/${entryId}/undo`;

  const refused = await bob.call(undoUrl, 'POST', { domain: 'hr' });
  expect([403, 404]).toContain(refused.status);
  expect(slugs(fixture.ws)).toEqual(before);
  expect((await bob.call(undoUrl, 'POST', { domain: 5 })).status).toBe(400);
  expect((await bob.call(undoUrl, 'POST', { other: 'x' })).status).toBe(400);
  const undone = await bob.call(undoUrl, 'POST', { domain: 'sales' });
  expect(undone.status, JSON.stringify(undone.body)).toBe(200);
  expect(slugs(fixture.ws)).toContain(undone.body.project);
});
