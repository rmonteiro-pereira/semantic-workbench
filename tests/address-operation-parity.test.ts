import { expect, test } from 'bun:test';
import { createHandler } from '../src/server/handler';
import { createAccessControl } from '../src/server/auth/authorize';
import { mintCaller } from '../src/server/auth/caller';
import { buildTwinRequest } from '../src/server/auth/twin-request';
import { readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout, repoDir } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { accessFixture, person } from './auth/access-fixture';
import { readAs } from './auth/guard-cases';
import { authWorkspace } from './helpers/auth-workspace';
import { allowEveryRemote } from './helpers/remote-credentials-fixture';
import { sh } from './helpers/scm';

const project = 'sales-contracts';
const path = 'address-parity.ontology.yaml';
const source = 'name: Parity\nontology: [{concept: Before}, {concept: Keep}]\n';
const before = `sw1:${project}/${path}#ontology:Parity/concept:Before`;
const after = before.replace('concept:Before', 'concept:After');

async function exercise(twin: boolean, batch: boolean) {
  using fixture = await authWorkspace();
  await fixture.ws.saveFile(project, path, { baseHash: null, source }, LOCAL_READER);
  const repository = repoDir(fixture.ws.layout, project);
  sh(repository, ['add', '--', path]);
  sh(repository, ['commit', '-qm', 'Add parity definition']);
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const caller = mintCaller({ principal, origin: 'mcp' });
  const handler = createHandler(fixture.ws, { mode: 'server', access, principal: () => principal, publicOrigin: 'http://localhost', remoteCredentials: allowEveryRemote() });
  const invoke = async (id: string, params: Record<string, string>, body: unknown) => {
    const request = buildTwinRequest(id, { params, body });
    if (twin) return (await handler.boundary.operate({ caller, request })).response;
    return handler(
      new Request('http://localhost' + new URL(request.url).pathname, { method: request.method, headers: { Origin: 'http://localhost', 'X-SW-Request': '1' }, body: await request.text() }),
    );
  };
  const save = async (next: string, metadata: object) => {
    const file = await readAs(fixture.ws, 'alice', project, path);
    const write = { baseHash: file.hash, source: next };
    return batch ? invoke('files.saveBatch', { slug: project }, { files: [{ path, ...write }], ...metadata }) : invoke('files.save', { slug: project, '*': path }, { ...write, ...metadata });
  };
  expect((await save(source.replace('Before', 'After'), { declaredMigrations: [{ kind: 'item', from: before, to: after }] })).status).toBe(200);
  expect((await readAs(fixture.ws, 'alice', project, path)).source).toBe(source.replace('Before', 'After'));
  const deleted = await save('name: Parity\nontology: [{concept: Keep}]\n', { deletedItems: [after] });
  expect(deleted.status, await deleted.clone().text()).toBe(200);
  const history = () => readAddressMigrations(dataLayout(fixture.root), project, LOCAL_READER).map(({ kind, from, to }) => ({ kind, from, to }));
  const savedHistory = history();
  expect(savedHistory).toEqual([
    { kind: 'item', from: before, to: after },
    { kind: 'deleted', from: after, to: undefined },
  ]);
  expect((await save(source, {})).status).toBe(200);
  expect((await invoke('files.move', { slug: project }, { path, toProject: project, toPath: 'address-moved.ontology.yaml' })).status).toBe(200);
  expect((await invoke('files.delete', { slug: project, '*': 'address-moved.ontology.yaml' }, { confirm: true })).status).toBe(200);
  const result = history();
  expect(result.slice(2).map(record => record.kind)).toEqual(['document', 'deleted']);
  return result;
}

for (const batch of [false, true]) {
  test(`${batch ? 'batch' : 'single'} save declarations, item tombstones, move and delete have HTTP/twin history parity`, async () => {
    expect(await exercise(true, batch)).toEqual(await exercise(false, batch));
  }, 60000);
}
