import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace, publishDependent } from '../helpers/mesh-workspace';
import { MAPPING_TEXT, SEMANTIC_MODEL_TEXT } from '../helpers/tessera-repository';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

function get(fixture: Fixture, path: string) {
  return fixture.fixture.handler(new Request('http://localhost:4310' + path));
}

function post(fixture: Fixture, project: string, path: string, body: object = {}) {
  return fixture.fixture.handler(
    new Request(`http://localhost:4310/api/projects/${project}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function publish(fixture: Fixture, project: string) {
  fixture.git(project, ['add', '-A']);
  fixture.git(project, ['commit', '-qm', 'Publish a new interface']);
  const response = await post(fixture, project, 'git/publish');
  if (!response.ok) throw new Error(await response.text());
}

async function consumers(fixture: Fixture) {
  const bundle = await post(fixture, 'retail', 'compile');
  const context = await get(fixture, '/api/agent/context?project=retail&mappingId=retail/mapping.yaml');
  const catalog = await get(fixture, '/api/agent/catalog?project=retail');
  const graph = await get(fixture, '/api/projects/retail/dependencies?interfaces=1');
  const plan = await fixture.fixture.handler(
    new Request('http://localhost:4310/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'retail', mappingId: 'retail/mapping.yaml', metrics: ['revenue'], dimensions: [] }),
    }),
  );
  if (!plan.ok) throw new Error(await plan.text());
  expect([bundle.status, context.status, catalog.status, graph.status, plan.status]).toEqual([200, 200, 200, 200, 200]);
  const graphResult = await graph.json();
  return {
    bundle: await bundle.text(),
    context: await context.text(),
    catalog: await catalog.text(),
    plan: await plan.text(),
    graph: graphResult.interfaces,
    state: graphResult.roots[0].state,
  };
}

test('published consumers preserve their locked interface across provider edits and publications', async () => {
  using fixture = await meshWorkspace('separate');
  const retail = fixture.projectDirectory('retail');
  const root = join(retail, 'ontology.yaml');
  const ontology = JSON.parse(readFileSync(root, 'utf8'));
  ontology.ontology.push({ concept: 'Revenue', type: 'ValueType' });
  writeFileSync(root, JSON.stringify(ontology));
  const metricMapping = 'concept_mappings:\n  - concept: Revenue\n    object_mappings:\n      - expression: revenue';
  writeFileSync(join(retail, 'mapping.yaml'), MAPPING_TEXT.replace('name: Retail', 'name: retail').replace('concept_mappings: []', metricMapping));
  writeFileSync(join(retail, 'model.yaml'), SEMANTIC_MODEL_TEXT);
  await publishDependent(fixture);
  const before = await consumers(fixture);
  expect(before.context).toContain('fin.Invoice');
  expect(before.plan).toContain('SUM');
  expect(before.graph[0].providers[0].concepts.map(([name]: [string, object]) => name)).toEqual(['Invoice']);
  expect(before.state).toBe('current');
  fixture.addPersonalBranch('finance');
  const file = join(fixture.projectDirectory('finance'), 'ontology.yaml');
  const provider = JSON.parse(readFileSync(file, 'utf8'));
  provider.ontology.find((concept: { concept: string }) => concept.concept === 'Invoice').description = 'Revised invoice';
  writeFileSync(file, JSON.stringify(provider));
  expect(await consumers(fixture)).toEqual(before);
  await publish(fixture, 'finance');
  expect(await consumers(fixture)).toEqual({ ...before, state: 'update-available' });

  const { manifestHash } = await (await get(fixture, '/api/projects/retail/dependencies')).json();
  const preview = await post(fixture, 'retail', 'dependencies/update', { baseHash: manifestHash });
  const proposed = await preview.json();
  expect(proposed.changes).toMatchObject([{ changed: ['Invoice'], compatibility: 'not judged' }]);
  const update = await post(fixture, 'retail', 'dependencies/update', { baseHash: manifestHash, confirm: proposed.preview });
  expect(update.status).toBe(200);
  expect((await consumers(fixture)).context).toBe(before.context);
  await publish(fixture, 'retail');
  const after = await consumers(fixture);
  expect(JSON.stringify(after.graph)).toContain('Revised invoice');
  expect(after.context).toContain('Revised invoice');
  expect(after.bundle).not.toBe(before.bundle);
});
