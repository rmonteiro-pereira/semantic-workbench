import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest, printDependencyManifest } from '../../src/shared/tessera/dependency-manifest';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from '../auth/access-fixture';
import { gitOutput, openCopy, signedIn } from '../auth/working-copy-fixture';
import { meshWorkspace, MESH_PROJECTS } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

function post(fixture: Fixture, path: string, body: object = {}) {
  return fixture.fixture.handler(
    new Request('http://localhost:4310/api/projects/retail/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function writeLock(fixture: Fixture) {
  const response = await post(fixture, 'dependencies/update', { baseHash: null });
  expect(response.status).toBe(200);
  const { preview } = await response.json();
  expect((await post(fixture, 'dependencies/update', { baseHash: null, confirm: preview })).status).toBe(200);
}

function editJson(fixture: Fixture, project: string, path: string, edit: (data: any) => void) {
  const file = join(fixture.projectDirectory(project), path);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  edit(data);
  writeFileSync(file, JSON.stringify(data));
}

async function publish(fixture: Fixture) {
  fixture.git('retail', ['add', '-A']);
  fixture.git('retail', ['commit', '-qm', 'Candidate mesh snapshot']);
  return post(fixture, 'git/publish');
}

test.each(['missing', 'stale', 'unreadable'] as const)('publication refuses a %s dependency manifest before moving the default ref', async problem => {
  using fixture = await meshWorkspace('separate');
  const original = fixture.git('retail', ['rev-parse', 'HEAD']);
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  if (problem !== 'missing') await writeLock(fixture);
  if (problem === 'stale') editJson(fixture, 'retail', 'ontology.yaml', data => data.tessera_imports[0].concepts.push('Currency'));
  if (problem === 'unreadable') {
    const path = join(fixture.projectDirectory('retail'), DEPENDENCY_MANIFEST_PATH);
    const lock = parseDependencyManifest(readFileSync(path, 'utf8'));
    const [provider] = lock.providers;
    if (provider.sameRepository) throw new Error('Expected an independently published provider.');
    provider.commit = 'b'.repeat(original.length);
    writeFileSync(path, printDependencyManifest(lock));
  }
  const rejected = await publish(fixture);
  expect(rejected.status).toBe(400);
  expect(JSON.stringify(await rejected.json())).toContain('Update dependencies');
  expect(fixture.ws.state.published().repositories[fixture.ws.repoOf('retail')].commit).toBe(original);
});

test('a provider interface from a different same-repository candidate cannot be published', async () => {
  using fixture = await meshWorkspace('shared');
  const original = fixture.git('retail', ['rev-parse', 'HEAD']);
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  await writeLock(fixture);
  editJson(fixture, 'finance', 'ontology.yaml', data => (data.ontology[0].description = 'A different public interface'));
  const rejected = await publish(fixture);
  expect(rejected.status).toBe(400);
  expect(JSON.stringify(await rejected.json())).toContain('differs from the candidate');
  expect(fixture.ws.state.published().repositories[fixture.ws.repoOf('retail')].commit).toBe(original);
});

function publisher(fixture: Fixture, projects: string[]) {
  const options = accessFixture();
  const rules = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
  const configured = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/grants.json', 'utf8')).grants;
  const grants = configured
    .filter((grant: { id: string }) => grant.id === 'retail-steward')
    .map((grant: object) => ({
      ...grant,
      scope: { kind: 'projects', projects },
    }));
  const access = createAccessControl({ ...options, knownProjects: () => [...MESH_PROJECTS], config: { ...options.config, grants, projects: rules } });
  return signedIn(fixture.ws, access)(person('bob'));
}

test('publication rechecks the publishing person’s current access to a provider', async () => {
  using fixture = await meshWorkspace('separate');
  fixture.addUncommittedImport();
  await writeLock(fixture);
  const original = fixture.ws.state.published().repositories.retail.commit;
  fixture.git('retail', ['add', '-A']);
  fixture.git('retail', ['commit', '-qm', 'Import finance']);
  const actor = publisher(fixture, ['retail']);
  const response = await actor.call('/api/projects/retail/git/adopt', 'POST', {});
  expect(response.status).toBe(400);
  expect(JSON.stringify(response.body)).toContain('A locked provider is unavailable');
  expect(fixture.ws.state.published().repositories.retail.commit).toBe(original);
});

test('fetch stops before following a remote candidate with a set error', async () => {
  using fixture = await meshWorkspace('separate');
  const previous = fixture.ws.state.published().repositories.retail.commit;
  const repository = fixture.projectDirectory('retail');
  const remote = join(fixture.fixture.root, 'retail-remote');
  expect(gitOutput(fixture.fixture.root, ['clone', '-q', repository, remote]).code).toBe(0);
  fixture.git('retail', ['remote', 'add', 'origin', remote]);
  const actor = publisher(fixture, [...MESH_PROJECTS]);
  expect((await openCopy(actor.call, 'retail')).status).toBe(200);
  const part = 'private/customer.yaml';
  const source = JSON.parse(readFileSync(join(remote, part), 'utf8'));
  source.ontology[0].concept = 'Order';
  writeFileSync(join(remote, part), JSON.stringify(source));
  expect(gitOutput(remote, ['add', '--', part]).code).toBe(0);
  expect(gitOutput(remote, ['commit', '-qm', 'Duplicate a concept across files']).code).toBe(0);
  const fetched = await actor.call('/api/projects/retail/git/fetch', 'POST', {});
  expect(fetched.status).toBe(200);
  expect(fetched.body).toMatchObject({ ok: true, follow: { followed: false, reason: 'guard' } });
  expect(fixture.git('retail', ['rev-parse', 'refs/heads/main'])).toBe(previous);
  expect(fixture.ws.state.published().repositories.retail.commit).toBe(previous);
});
