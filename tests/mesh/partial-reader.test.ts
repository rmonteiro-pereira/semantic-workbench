import { expect, spyOn, test } from 'bun:test';
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
  if (!hidden) {
    rmSync(join(fixture.projectDirectory('retail'), privatePart));
    await fixture.ws.rescan('retail');
  }
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
  const candidateReads = spyOn(fixture.ws.git, 'catFileBatch');
  const publication = await partial.raw(root + '/git/adopt', 'POST', {});
  const blobs = candidateReads.mock.calls.map(([, ids]) => ids);
  candidateReads.mockRestore();
  expect(blobs).toHaveLength(1);
  expect(blobs[0]).toEqual([fixture.git('retail', ['rev-parse', 'HEAD:ontology.yaml'])]);
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

type ReaderClient = ReturnType<typeof readers>['partial'];

function quantile(samples: number[], fraction: number): number {
  return [...samples].sort((first, next) => first - next)[Math.ceil(samples.length * fraction) - 1];
}

async function sample(client: ReaderClient) {
  const started = performance.now();
  const response = await client.raw(path);
  const bytes = await response.text();
  return { bytes, elapsed: performance.now() - started };
}

async function samplePairs(hidden: ReaderClient, missing: ReaderClient, count: number) {
  const times = { hidden: [] as number[], missing: [] as number[] };
  for (let i = 0; i < count; i++) {
    const order = i % 2 ? (['missing', 'hidden'] as const) : (['hidden', 'missing'] as const);
    const first = await sample(order[0] === 'hidden' ? hidden : missing);
    const next = await sample(order[1] === 'hidden' ? hidden : missing);
    expect(first.bytes).toBe(next.bytes);
    times[order[0]].push(first.elapsed);
    times[order[1]].push(next.elapsed);
  }
  return times;
}

function latency(samples: number[]) {
  return { p10: quantile(samples, 0.1), median: quantile(samples, 0.5), p95: quantile(samples, 0.95) };
}

function compareLatency(phase: string, times: Awaited<ReturnType<typeof samplePairs>>) {
  const hidden = latency(times.hidden);
  const missing = latency(times.missing);
  console.log(`Part timing ${phase} (${times.hidden.length} per case, ms): ${JSON.stringify({ hidden, missing })}`);
  expect(Math.max(hidden.p10, missing.p10)).toBeLessThanOrEqual(Math.min(hidden.p95, missing.p95));
  expect(Math.abs(hidden.median - missing.median)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(hidden.p95 - missing.p95)).toBeLessThanOrEqual(2);
}

test('hidden and missing parts overlap in latency across 200 interleaved requests each', async () => {
  using hiddenFixture = await meshWorkspace('separate');
  using missingFixture = await meshWorkspace('separate');
  rmSync(join(missingFixture.projectDirectory('retail'), privatePart));
  await missingFixture.ws.rescan('retail');
  const hidden = readers(hiddenFixture, true).partial;
  const missing = readers(missingFixture, true).partial;
  await samplePairs(hidden, missing, 20);
  const idle = await samplePairs(hidden, missing, 100);
  const snapshot = hiddenFixture.ws.state.published().repositories.retail;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const original = hiddenFixture.ws.git.catFileBatch;
  const batch = spyOn(hiddenFixture.ws.git, 'catFileBatch').mockImplementation(async (...args) => {
    const read = original(...args);
    entered.resolve();
    await release.promise;
    return read;
  });
  const building = hiddenFixture.ws.published.validate({ repo: 'retail', branch: snapshot.branch, previous: null, next: snapshot.commit });
  let active: typeof idle;
  try {
    await Promise.race([
      entered.promise,
      building.then(() => {
        throw new Error('The snapshot was already built.');
      }),
    ]);
    active = await samplePairs(hidden, missing, 100);
  } finally {
    release.resolve();
    batch.mockRestore();
    (await building)();
  }
  compareLatency('idle', idle);
  compareLatency('snapshot in progress', active);
  compareLatency('combined', { hidden: [...idle.hidden, ...active.hidden], missing: [...idle.missing, ...active.missing] });
}, 30_000);
