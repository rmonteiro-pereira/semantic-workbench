import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;

function post(fixture: Fixture, project: string, action: string, body: object = {}) {
  return fixture.fixture.handler(
    new Request(`http://localhost:4310/api/projects/${project}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function update(fixture: Fixture) {
  const preview = await post(fixture, 'retail', 'dependencies/update', { baseHash: null });
  expect(preview.status).toBe(200);
  const confirmation = (await preview.json()).preview;
  expect((await post(fixture, 'retail', 'dependencies/update', { baseHash: null, confirm: confirmation })).status).toBe(200);
}

function editProvider(fixture: Fixture, description: string) {
  const file = join(fixture.projectDirectory('finance'), 'ontology.yaml');
  const definition = JSON.parse(readFileSync(file, 'utf8'));
  definition.ontology.find((concept: { concept: string }) => concept.concept === 'Invoice').description = description;
  writeFileSync(file, JSON.stringify(definition));
}

function commit(fixture: Fixture, project: string) {
  fixture.git(project, ['add', '-A']);
  fixture.git(project, ['commit', '-qm', 'Change ontology']);
  return fixture.git(project, ['rev-parse', 'HEAD']);
}

async function publishedContent(fixture: Fixture, project: string, path: string) {
  return fixture.ws.published.withPin(async pin => (await fixture.ws.published.documents(pin, project)).find(file => file.path === path)?.source);
}

test('one candidate publishes the same-repository provider and consumer together', async () => {
  using fixture = await meshWorkspace('shared');
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  editProvider(fixture, 'Candidate finance concept');
  await update(fixture);
  const candidate = commit(fixture, 'retail');
  editProvider(fixture, 'Uncommitted finance concept');
  expect(await publishedContent(fixture, 'finance', 'ontology.yaml')).not.toContain('Candidate finance concept');
  expect(await publishedContent(fixture, 'retail', 'ontology.yaml')).not.toContain('tessera_imports');
  const response = await post(fixture, 'retail', 'git/publish');
  expect(response.status).toBe(200);
  expect((await response.json()).commit).toBe(candidate);
  expect(await publishedContent(fixture, 'finance', 'ontology.yaml')).toContain('Candidate finance concept');
  expect(await publishedContent(fixture, 'finance', 'ontology.yaml')).not.toContain('Uncommitted finance concept');
  expect(await publishedContent(fixture, 'retail', 'ontology.yaml')).toContain('tessera_imports');
});

test('separate repositories publish a consumer locked to previously published provider history', async () => {
  using fixture = await meshWorkspace('separate');
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  fixture.addPersonalBranch('finance');
  editProvider(fixture, 'New provider interface');
  await update(fixture);
  const candidate = commit(fixture, 'retail');
  const provider = commit(fixture, 'finance');
  expect((await post(fixture, 'finance', 'git/publish')).status).toBe(200);
  expect((await post(fixture, 'retail', 'git/publish')).status).toBe(200);
  expect(fixture.ws.state.published().repositories.finance.commit).toBe(provider);
  expect(fixture.ws.state.published().repositories.retail.commit).toBe(candidate);
  expect(await publishedContent(fixture, 'retail', 'tessera-dependencies.json')).not.toContain(provider);
});

test('a reciprocal import between same-repository public interfaces publishes and compiles', async () => {
  using fixture = await meshWorkspace('shared');
  fixture.addPersonalBranch('retail');
  fixture.addUncommittedImport();
  for (const [project, change] of [
    ['retail', { tessera_exports: ['Order'] }],
    ['finance', { tessera_imports: [{ project: 'retail', alias: 'retail', concepts: ['Order'], version: 'latest' }] }],
  ] as const) {
    const path = join(fixture.projectDirectory(project), 'ontology.yaml');
    const source = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...source, ...change }));
  }
  await update(fixture);
  const preview = await post(fixture, 'finance', 'dependencies/update', { baseHash: null });
  expect(preview.status).toBe(200);
  const finance = await post(fixture, 'finance', 'dependencies/update', { baseHash: null, confirm: (await preview.json()).preview });
  expect(finance.status).toBe(200);
  const candidate = commit(fixture, 'retail');
  expect((await post(fixture, 'retail', 'git/publish')).status).toBe(200);
  expect(fixture.ws.state.published().repositories[fixture.ws.repoOf('finance')].commit).toBe(candidate);
  for (const project of ['finance', 'retail']) {
    const first = await post(fixture, project, 'compile');
    const review = await first.json();
    expect(review.result).toBe('loss-needs-acceptance');
    const accepted = await post(fixture, project, 'compile', { accept: { digest: review.report.digest } });
    const release = await accepted.json();
    expect(release).toMatchObject({ result: 'released', manifest: { manifestVersion: 2 } });
    expect(release.manifest.providers).toMatchObject([{ commit: candidate, project: project === 'finance' ? 'retail' : 'finance' }]);
  }
});
