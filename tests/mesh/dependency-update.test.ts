import { expect, test } from 'bun:test';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest } from '../../src/shared/tessera/dependency-manifest';
import { sha256Hex } from '../../src/shared/tessera/digest';
import { requireOneProviderVersion } from '../../src/server/mesh/dependency-update';
import { meshWorkspace, type MeshRepositoryShape } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

function update(fixture: Fixture, baseHash: string | null = null, confirm?: string) {
  return fixture.fixture.handler(
    new Request('http://localhost:4310/api/projects/retail/dependencies/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseHash, confirm }),
    }),
  );
}

function pin(fixture: Fixture, revision: string) {
  const root = join(fixture.projectDirectory('retail'), 'ontology.yaml');
  const data = JSON.parse(readFileSync(root, 'utf8'));
  data.tessera_imports[0].version = { pin: revision };
  writeFileSync(root, JSON.stringify(data));
}

async function previewAndWrite(fixture: Fixture) {
  const response = await update(fixture);
  const value = await response.json();
  expect({ status: response.status, preview: value.preview }).toEqual({ status: 200, preview: expect.any(String) });
  const manifestPath = join(fixture.projectDirectory('retail'), DEPENDENCY_MANIFEST_PATH);
  expect(existsSync(manifestPath)).toBe(false);
  const accepted = await update(fixture, null, value.preview);
  expect(accepted.status).toBe(200);
  expect((await update(fixture, null, value.preview)).status).toBe(409);
  return parseDependencyManifest(readFileSync(manifestPath, 'utf8')).providers[0];
}

test.each(['shared', 'separate'] as const)('locks latest with an explicit confirmation for %s repositories', async (shape: MeshRepositoryShape) => {
  using fixture = await meshWorkspace(shape);
  fixture.addUncommittedImport();
  const provider = await previewAndWrite(fixture);
  expect(provider.sameRepository).toBe(shape === 'shared');
  expect(provider.commit).toBe(shape === 'shared' ? undefined : fixture.git('finance', ['rev-parse', 'HEAD']));
});

test.each(['commit', 'tag'] as const)('locks a published history pin by %s', async identity => {
  using fixture = await meshWorkspace('separate');
  const original = fixture.git('finance', ['rev-parse', 'HEAD']);
  fixture.git('finance', ['tag', 'finance-release', original]);
  await fixture.publishProviderChange('finance', 'New finance interface');
  fixture.addUncommittedImport();
  pin(fixture, identity === 'commit' ? original : 'finance-release');
  const provider = await previewAndWrite(fixture);
  expect(provider.commit).toBe(original);
  expect(provider.tag).toBe(identity === 'tag' ? 'finance-release' : null);
});

test.each(['shared', 'separate'] as const)('rejects a personal commit pin in %s repositories', async shape => {
  using fixture = await meshWorkspace(shape);
  fixture.addPersonalBranch('finance');
  fixture.git('finance', ['commit', '--allow-empty', '-qm', 'Private state']);
  fixture.addUncommittedImport();
  pin(fixture, fixture.git('finance', ['rev-parse', 'HEAD']));
  const response = await update(fixture);
  expect(response.status).toBe(400);
  expect(JSON.stringify(await response.json())).toContain('tessera-import-pin');
});

test('a transitive pin cannot select a different commit of a direct provider', () => {
  const common = { ontology: 'ontology.yaml', repository: 'repository', tag: null, interfaceHash: 'digest', concepts: ['Invoice'], choice: 'latest' } as const;
  expect(() =>
    requireOneProviderVersion([
      { ...common, concepts: ['Invoice'], project: 'finance', sameRepository: false, commit: 'first', dependsOn: [] },
      { ...common, concepts: ['Money'], project: 'units', sameRepository: false, commit: 'other', dependsOn: [{ project: 'finance', commit: 'second', interfaceHash: 'digest' }] },
    ]),
  ).toThrow();
});

test('one manifest freezes every importing root of a project', async () => {
  using fixture = await meshWorkspace('separate');
  fixture.addUncommittedImport();
  const second = join(fixture.projectDirectory('retail'), 'billing.json');
  writeFileSync(
    second,
    JSON.stringify({
      tessera: 3,
      version: '0.2.0.dev0',
      name: 'Billing',
      ontology: [{ concept: 'Bill', type: 'EntityType' }],
      tessera_imports: [{ project: 'units', alias: 'measure', concepts: ['Quantity'] }],
    }),
  );
  fixture.git('retail', ['add', '--', 'billing.json']);
  await fixture.ws.rescan('retail');
  await previewAndWrite(fixture);
  const path = join(fixture.projectDirectory('retail'), DEPENDENCY_MANIFEST_PATH);
  expect(parseDependencyManifest(readFileSync(path, 'utf8'))).toMatchObject({
    root: 'billing.json',
    providers: [{ project: 'units' }],
    additionalRoots: [{ root: 'ontology.yaml', providers: [{ project: 'finance' }] }],
  });
});

test('an explicit update clears the entries after the last importing root is deleted', async () => {
  using fixture = await meshWorkspace('separate');
  fixture.addUncommittedImport();
  await previewAndWrite(fixture);
  const directory = fixture.projectDirectory('retail');
  const manifestPath = join(directory, DEPENDENCY_MANIFEST_PATH);
  const original = readFileSync(manifestPath, 'utf8');
  unlinkSync(join(directory, 'ontology.yaml'));
  await fixture.ws.rescan('retail');
  const baseHash = sha256Hex(original);
  const preview = await update(fixture, baseHash);
  expect(preview.status).toBe(200);
  expect(readFileSync(manifestPath, 'utf8')).toBe(original);
  const confirmed = await update(fixture, baseHash, (await preview.json()).preview);
  expect(confirmed.status).toBe(200);
  expect(parseDependencyManifest(readFileSync(manifestPath, 'utf8')).providers).toEqual([]);
});
