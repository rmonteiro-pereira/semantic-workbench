import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest, printDependencyManifest } from '../../src/shared/tessera/dependency-manifest';
import { meshWorkspace } from '../helpers/mesh-workspace';

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
