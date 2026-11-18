import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { meshWorkspace } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

async function post(fixture: Fixture, action: string, body: object = {}) {
  return fixture.fixture.handler(
    new Request(`http://localhost:4310/api/projects/retail/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function publishConsumer(fixture: Fixture) {
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  const preview = await post(fixture, 'dependencies/update', { baseHash: null });
  expect(preview.status).toBe(200);
  expect((await post(fixture, 'dependencies/update', { baseHash: null, confirm: (await preview.json()).preview })).status).toBe(200);
  writeFileSync(join(fixture.projectDirectory('retail'), 'address-history.jsonl'), '{"migration":"fixture"}\n');
  fixture.git('retail', ['add', '-A']);
  fixture.git('retail', ['commit', '-qm', 'Publish ontology and lock']);
  const published = await post(fixture, 'git/publish');
  if (!published.ok) throw new Error(await published.text());
}

test.each(['shared', 'separate'] as const)('loads a published lock and its public interface from %s repositories', async shape => {
  using fixture = await meshWorkspace(shape);
  await publishConsumer(fixture);
  const source = workspaceUnitSource(fixture.ws, 'retail', LOCAL_READER);
  const read = await source.read('published');
  expect(read.files.map(file => file.path).sort()).toEqual(['ontology.yaml', 'private/customer.yaml']);
  expect(read.mesh?.manifest?.providers).toHaveLength(1);
  const providers = read.mesh?.providers.get('ontology.yaml');
  expect(providers?.[0].concepts.has('Invoice')).toBe(true);
  expect(providers?.[0].version).toBe(fixture.git('finance', ['rev-parse', 'HEAD']));
});

test('a unit without imports returns only its own definitions and zero providers', async () => {
  using fixture = await meshWorkspace('separate');
  const read = await workspaceUnitSource(fixture.ws, 'retail', LOCAL_READER).read('published');
  expect(read.mesh?.providers.size).toBe(0);
  expect(read.files.map(file => file.path).sort()).toEqual(['ontology.yaml', 'private/customer.yaml']);
});

test('a trashed provider does not fall back to the published or working files on disk', async () => {
  using fixture = await meshWorkspace('separate');
  await publishConsumer(fixture);
  const provider = join(fixture.projectDirectory('finance'), 'ontology.yaml');
  const candidate = readFileSync(provider, 'utf8');
  await fixture.ws.trash.deleteProject('finance');
  expect(candidate).toContain('Invoice');
  await expect(workspaceUnitSource(fixture.ws, 'retail', LOCAL_READER).read('published')).rejects.toThrow('A locked provider is unavailable');
});
