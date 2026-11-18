import { expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from '../auth/access-fixture';
import { signedIn } from '../auth/working-copy-fixture';
import { MESH_PROJECTS, meshWorkspace } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;
const root = '/api/projects/retail';
const path = root + '/files/ontology.yaml';
const privatePart = 'private/customer.yaml';

function readers(fixture: Fixture, hidden: boolean) {
  const options = accessFixture();
  const projects = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
  if (!hidden) projects.projects.retail.restricted = [];
  const grants = ['alice', 'bob'].map(name => ({
    id: `scope-${name}`,
    roleId: 'steward',
    member: { kind: 'email' as const, email: `${name}@example.org` },
    scope: { kind: 'projects' as const, projects: ['retail'] },
    addedBy: 'fixture',
    addedAt: '2026-11-17T00:00:00Z',
  }));
  const access = createAccessControl({ ...options, knownProjects: () => [...MESH_PROJECTS], config: { ...options.config, projects, grants } });
  const as = signedIn(fixture.ws, access);
  return { partial: as(person('alice')), complete: as(person('bob')) };
}

async function refusals(hidden: boolean) {
  using fixture = await meshWorkspace('separate');
  if (!hidden) rmSync(join(fixture.projectDirectory('retail'), privatePart));
  const { partial } = readers(fixture, hidden);
  const read = await partial.raw(path);
  expect(read.status).toBe(200);
  const readBytes = await read.text();
  const document = JSON.parse(readBytes);
  expect(document.unitValidation).toEqual({ singleFile: { 'ontology.yaml': [] }, set: [], setNotChecked: true });
  const edit = { path: 'ontology.yaml', baseHash: document.hash, source: document.source };
  const single = await partial.raw(path, 'PUT', { baseHash: edit.baseHash, source: edit.source });
  const batch = await partial.raw(root + '/save-batch', 'POST', { files: [edit] });
  const draft = '/api/drafts/retail/ontology.yaml';
  const text = document.source + '\n';
  expect((await partial.call(draft, 'PUT', { baseHash: edit.baseHash, text })).status).toBe(200);
  expect((await partial.call(draft)).body.text).toBe(text);
  const sourcePath = join(fixture.projectDirectory('retail'), 'ontology.yaml');
  const data = JSON.parse(readFileSync(sourcePath, 'utf8'));
  data.ontology[0].description = 'Candidate accepted only with the complete set';
  writeFileSync(sourcePath, JSON.stringify(data));
  fixture.git('retail', ['add', '-A']);
  fixture.git('retail', ['commit', '-qm', 'Review the incomplete set']);
  const publication = await partial.raw(root + '/git/adopt', 'POST', {});
  const response = async (answer: Response) => ({ status: answer.status, bytes: await answer.text() });
  return { read: readBytes, single: await response(single), batch: await response(batch), publication: await response(publication) };
}

test('hidden and nonexistent parts produce the same read, save, batch and publication responses', async () => {
  const hidden = await refusals(true);
  const missing = await refusals(false);
  expect(hidden).toEqual(missing);
  expect(hidden.single).toEqual({ status: 400, bytes: JSON.stringify({ error: 'The ontology set could not be checked.' }) });
  expect(hidden.batch).toEqual(hidden.single);
  expect(hidden.publication).toEqual(hidden.single);
});

test('a full reader’s finding never reaches the partial reader in either call order', async () => {
  using fixture = await meshWorkspace('separate');
  const file = join(fixture.projectDirectory('retail'), privatePart);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.ontology[0].concept = 'Order';
  writeFileSync(file, JSON.stringify(data));
  const { partial, complete } = readers(fixture, true);
  expect((await partial.call(path)).body.unitValidation).toMatchObject({ set: [], setNotChecked: true });
  const result = (await complete.call(path)).body.unitValidation;
  expect(result).toMatchObject({ setNotChecked: false, set: [{ code: 'tessera-duplicate-concept' }] });
  const next = (await partial.call(path)).body.unitValidation;
  expect(next).toMatchObject({ set: [], setNotChecked: true });
  expect(JSON.stringify(next)).not.toContain(privatePart);
});
