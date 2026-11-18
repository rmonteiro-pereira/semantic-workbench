import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { meshWorkspace, MESH_PROJECTS } from '../helpers/mesh-workspace';

type Fixture = Awaited<ReturnType<typeof meshWorkspace>>;
type Import = { project: string; alias: string; concepts: string[] };

function operation(fixture: Fixture, path: string, body?: object) {
  return fixture.fixture.handler(
    new Request('http://localhost:4310/api/' + path, {
      ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    }),
  );
}

async function addRoots(fixture: Fixture, roots: { path: string; exports: string[]; imports: Import[] }[]) {
  const repository = fixture.ws.repoOf('finance');
  const directory = join(fixture.fixture.root, 'projects', repository);
  for (const root of roots) {
    mkdirSync(join(directory, root.path));
    const source = {
      tessera: 3,
      version: '0.2.0.dev0',
      name: root.path,
      ...(root.exports.length && { tessera_exports: root.exports }),
      tessera_imports: root.imports,
      ontology: [{ concept: 'Local', type: 'EntityType' }],
    };
    writeFileSync(join(directory, root.path, 'ontology.yaml'), JSON.stringify(source));
  }
  await fixture.ws.registerRepositoryProjects(
    repository,
    [...MESH_PROJECTS, ...roots.map(root => root.path)].map(path => ({ path, name: path })),
  );
}

async function update(fixture: Fixture, project: string) {
  const route = `projects/${project}/dependencies/update`;
  const preview = await operation(fixture, route, { baseHash: null });
  if (!preview.ok) throw new Error(project + ': ' + (await preview.text()));
  const write = await operation(fixture, route, { baseHash: null, confirm: (await preview.json()).preview });
  if (!write.ok) throw new Error(await write.text());
}

const invoice = { project: 'finance', alias: 'fin', concepts: ['Invoice'] };

test('canonical owners survive a two-level and three-level chain and a diamond through real operations', async () => {
  using fixture = await meshWorkspace('shared');
  fixture.addPersonalBranch('finance');
  await addRoots(fixture, [
    { path: 'wholesale', exports: ['fin.Invoice'], imports: [invoice] },
    { path: 'retailer', exports: ['wh.fin.Invoice'], imports: [{ project: 'wholesale', alias: 'wh', concepts: ['fin.Invoice'] }] },
    {
      path: 'consumer',
      exports: [],
      imports: [
        { project: 'retailer', alias: 'ret', concepts: ['wh.fin.Invoice'] },
        { project: 'wholesale', alias: 'wh', concepts: ['fin.Invoice'] },
      ],
    },
  ]);
  for (const project of ['wholesale', 'retailer', 'consumer']) await update(fixture, project);
  fixture.git('finance', ['add', '-A']);
  fixture.git('finance', ['commit', '-qm', 'Publish a diamond of re-exports']);
  const published = await operation(fixture, 'projects/finance/git/publish', {});
  if (!published.ok) throw new Error(await published.text());

  const version = fixture.git('finance', ['rev-parse', 'HEAD']);
  const compile = await operation(fixture, 'projects/consumer/compile', {});
  const result = await compile.json();
  expect(result.result).toBe('released');
  const addresses = result.manifest.addressMap.filter((entry: { from: string }) => entry.from.includes('Invoice'));
  expect(addresses).toEqual([{ from: 'sw1:finance/ontology.yaml#ontology:finance/concept:Invoice', to: 'sw1:consumer/ontology.yaml#ontology:consumer/concept:finance~ontology%252Eyaml~Invoice' }]);
  expect(await (await operation(fixture, 'projects/consumer/compile', {})).text()).toBe(JSON.stringify(result));
  const file = { path: 'ontology.yaml', offset: 0 };
  const output = await (await operation(fixture, 'projects/consumer/compile', { commit: version, file })).json();
  const compiled = Bun.YAML.parse(output.part.text) as { ontology: { concept: string }[] };
  expect(compiled.ontology.map(item => item.concept)).toEqual(['Local', 'finance~ontology%2Eyaml~Invoice']);
  expect(await (await operation(fixture, 'projects/consumer/compile', { commit: version, file })).text()).toBe(JSON.stringify(output));
  const graph = await (await operation(fixture, 'mesh')).json();

  expect(graph.links.filter((link: { consumer: string }) => link.consumer === 'consumer')).toEqual([{ consumer: 'consumer', provider: 'finance', version, items: ['Invoice'] }]);
  const usedBy = await (await operation(fixture, 'projects/finance/dependents')).json();
  expect(usedBy.dependents.filter((entry: { name: string }) => entry.name === 'consumer')).toEqual([{ name: 'consumer', domain: null, items: ['Invoice'], version }]);
  expect((await (await operation(fixture, 'projects/wholesale/dependents')).json()).dependents).toEqual([]);
});

test('an intermediate cannot pass through a name it has not exported', async () => {
  using fixture = await meshWorkspace('shared');
  fixture.addPersonalBranch('finance');
  await addRoots(fixture, [
    { path: 'wholesale', exports: ['Local'], imports: [invoice] },
    { path: 'consumer', exports: [], imports: [{ project: 'wholesale', alias: 'wh', concepts: ['fin.Invoice'] }] },
  ]);
  await update(fixture, 'wholesale');
  const preview = await operation(fixture, 'projects/consumer/dependencies/update', { baseHash: null });
  expect(preview.status).toBe(400);
  expect(await preview.text()).toContain('tessera-import-unexported');
});

test('a candidate cyclic re-export names both roots before advancing the pointer', async () => {
  using fixture = await meshWorkspace('shared');
  fixture.addPersonalBranch('finance');
  const first = { project: 'first', alias: 'first', concepts: ['Local'] };
  const second = { project: 'second', alias: 'second', concepts: ['Local'] };
  await addRoots(fixture, [
    { path: 'first', exports: ['Local'], imports: [second] },
    { path: 'second', exports: ['Local'], imports: [first] },
  ]);
  await update(fixture, 'first');
  await update(fixture, 'second');
  for (const [project, alias] of [
    ['first', 'second'],
    ['second', 'first'],
  ]) {
    const path = join(fixture.projectDirectory(project), 'ontology.yaml');
    const document = await Bun.file(path).json();
    document.tessera_exports.push(alias + '.Local');
    writeFileSync(path, JSON.stringify(document));
  }
  const original = fixture.ws.state.published().repositories.mesh.commit;
  fixture.git('finance', ['add', '-A']);
  fixture.git('finance', ['commit', '-qm', 'Attempt a cyclic re-export']);
  const result = await operation(fixture, 'projects/finance/git/publish', {});
  expect(result.status).toBe(400);
  const body = await result.text();
  expect(body).toContain('Re-export cycle:');
  expect(body).toContain('first/ontology.yaml');
  expect(body).toContain('second/ontology.yaml');
  expect(fixture.ws.state.published().repositories.mesh.commit).toBe(original);
});
