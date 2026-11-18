import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from '../auth/access-fixture';
import { signedIn } from '../auth/working-copy-fixture';
import { MESH_PROJECTS, meshWorkspace, publishDependent } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

function reader(fixture: Fixture, projects: string[]) {
  const options = accessFixture();
  const configured = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
  configured.projects.finance = configured.projects.retail;
  configured.projects.retail = { ...configured.projects.retail, restricted: [] };
  const grants = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/grants.json', 'utf8')).grants.slice(0, 1);
  grants[0].scope.projects = projects;
  const access = createAccessControl({ ...options, config: { ...options.config, projects: configured, grants }, knownProjects: () => [...MESH_PROJECTS] });
  return signedIn(fixture.ws, access)(person('alice'));
}

async function putPublicConceptInPrivatePart(fixture: Fixture) {
  fixture.addPersonalBranch('finance');
  const finance = fixture.projectDirectory('finance');
  const root = JSON.parse(readFileSync(join(finance, 'ontology.yaml'), 'utf8'));
  const invoice = root.ontology.shift();
  root.tessera_includes = ['private/invoice.yaml'];
  writeFileSync(join(finance, 'ontology.yaml'), JSON.stringify(root));
  mkdirSync(join(finance, 'private'));
  const part = { tessera: 3, tessera_part: true, ontology: [invoice, { concept: 'InternalLedger', type: 'EntityType' }] };
  writeFileSync(join(finance, 'private/invoice.yaml'), JSON.stringify(part));
  fixture.git('finance', ['add', '-A']);
  fixture.git('finance', ['commit', '-qm', 'Separate a public interface from private content']);
  const response = await fixture.fixture.handler(new Request('http://localhost:4310/api/projects/finance/git/publish', { method: 'POST', body: '{}' }));
  if (!response.ok) throw new Error(await response.text());
}

test('published interfaces expose exported concepts without exposing private files and respect renewed access checks', async () => {
  using fixture = await meshWorkspace('separate');
  await putPublicConceptInPrivatePart(fixture);
  await publishDependent(fixture);
  const allowed = reader(fixture, ['finance', 'retail']);
  expect((await allowed.call('/api/projects/finance/files/private/invoice.yaml')).status).toBe(404);
  const path = '/api/projects/retail/dependencies?interfaces=1';
  const result = await allowed.call(path);
  expect(result.status).toBe(200);
  expect(JSON.stringify(result.body.interfaces)).toContain('Invoice');
  expect(JSON.stringify(result.body.interfaces)).not.toMatch(/InternalLedger|private\/invoice/);
  const compile = await allowed.call('/api/projects/retail/compile', 'POST', {});
  expect(compile.status).toBe(200);
  expect(JSON.stringify(compile.body)).toContain('Invoice');
  expect(JSON.stringify(compile.body)).not.toMatch(/InternalLedger|private\/invoice/);
  const denied = reader(fixture, ['retail']);
  expect((await denied.call(path)).body.interfaces).toEqual([]);
  const deniedCompile = await denied.call('/api/projects/retail/compile', 'POST', {});
  expect(JSON.stringify(deniedCompile.body)).not.toContain('Invoice');
});
