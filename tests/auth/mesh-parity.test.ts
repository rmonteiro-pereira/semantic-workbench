/** Exercises ontology unit edits through the HTTP and in-process operation boundaries. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { testWorkspace } from '../helpers/temp-data-dir';
import { publishFixture } from '../helpers/published-workspace';
import { meshWorkspace, MESH_PROJECTS } from '../helpers/mesh-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

const origin = 'http://localhost:5418';
const project = 'sales-contracts';
const part = 'orders.yaml';
const rootSource = JSON.stringify({ tessera: 3, version: '0.2.0.dev0', name: 'Sales', ontology: [], tessera_includes: [part] });
const partDefinition = { tessera: 3, tessera_part: true, ontology: [{ concept: 'Order', type: 'EntityType' }] };

const operations = [
  { id: 'files.save', params: { slug: project, '*': part }, body: (write: Write) => write },
  { id: 'files.saveBatch', params: { slug: project }, body: (write: Write) => ({ files: [{ path: part, ...write }] }) },
  { id: 'documents.save', params: {}, body: (write: Write) => ({ id: `${project}/${part}`, filename: part, ...write }) },
];
type Write = { baseHash: string; source: string };

async function invoke(operation: (typeof operations)[number], twin: boolean, valid: boolean) {
  using workspace = await testWorkspace();
  await workspace.seed(
    [
      { path: 'ontology.yaml', source: rootSource },
      { path: part, source: JSON.stringify(partDefinition) },
    ],
    project,
  );
  await publishFixture(workspace);
  const access = createAccessControl({ ...accessFixture(), knownProjects: () => [project] });
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(workspace.root, 'mesh-parity-audit') });
  const handler = createHandler(workspace.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5418, remoteCredentials: allowEveryRemote() });
  const baseHash = workspace.ws.readFile(project, part, LOCAL_READER).hash;
  const next = { ...partDefinition, ontology: [{ ...partDefinition.ontology[0], description: 'A recorded sale.' }] };
  const source = JSON.stringify(valid ? next : { ...next, name: 'Unexpected part header' });
  const params = Object.fromEntries(Object.entries(operation.params).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])));
  const request = buildTwinRequest(operation.id, { params, body: operation.body({ baseHash, source }) });
  const response = twin
    ? (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response
    : await handler(
        new Request(origin + new URL(request.url).pathname, {
          method: request.method,
          body: await request.text(),
          headers: { ...Object.fromEntries(request.headers), Origin: origin, 'X-SW-Request': '1' },
        }),
      );
  const body = await response.json();
  return { status: response.status, findings: body.findings ?? body.issues ?? [], committedHash: workspace.ws.readFile(project, part, LOCAL_READER).hash, baseHash };
}

for (const operation of operations) {
  test(`${operation.id} accepts a valid part and rejects an invalid fragment equally through both routes`, async () => {
    for (const valid of [true, false]) {
      const http = await invoke(operation, false, valid);
      const twin = await invoke(operation, true, valid);
      expect(twin).toEqual(http);
      expect(http.status).toBe(valid ? 200 : 400);
      if (!valid) expect(http.findings).toMatchObject([{ code: 'tessera-part-shape', path: '/name' }]);
      expect(http.committedHash).toBe(http.baseHash);
    }
  }, 15000);
}

test('provider listing and dependency reads preserve access and output across operation transports', async () => {
  using fixture = await meshWorkspace('shared');
  const options = accessFixture();
  const projects = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
  const configured = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/grants.json', 'utf8')).grants;
  const grants = configured
    .filter((grant: { id: string }) => grant.id === 'retail-author')
    .map((grant: { scope: object }) => ({
      ...grant,
      scope: { kind: 'projects', projects: ['finance', 'retail'] },
    }));
  const access = createAccessControl({ ...options, knownProjects: () => [...MESH_PROJECTS], config: { ...options.config, projects, grants } });
  const principal = access.principalFor(person('alice'));
  const audit = createAuditLog({ dir: join(fixture.fixture.root, 'mesh-read-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5418, remoteCredentials: allowEveryRemote() });
  async function read(id: string, params: Record<string, string>, query?: Record<string, string>) {
    const request = buildTwinRequest(id, { params, query });
    const target = new URL(request.url);
    const http = await handler(new Request(origin + target.pathname + target.search));
    const twin = (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response;
    const content = await http.text();
    expect(twin.status).toBe(http.status);
    expect(await twin.text()).toBe(content);
    return { status: http.status, content };
  }
  const providers = await read('mesh.providers.list', {});
  expect(providers.status).toBe(200);
  expect(JSON.parse(providers.content).providers).toMatchObject([{ project: 'finance', concepts: ['Currency', 'Invoice'] }]);
  const hidden = await read('mesh.providers.list', {}, { project: 'units' });
  const missing = await read('mesh.providers.list', {}, { project: 'missing' });
  expect(hidden).toEqual(missing);
  expect(JSON.parse(hidden.content)).toEqual({ providers: [], cursor: null });
  const dependencies = await read('mesh.dependencies.read', { slug: 'retail' });
  expect(dependencies.status).toBe(200);
  expect(JSON.parse(dependencies.content)).toEqual({ roots: [], manifestHash: null });
});
