import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createHandler } from '../../src/server/handler';
import { accessFixture, person } from '../auth/access-fixture';
import { apiRequest, ORIGIN } from '../auth/working-copy-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { MESH_PROJECTS, meshWorkspace, publishDependent } from '../helpers/mesh-workspace';

test('the mesh exposes only readable projects and gives hidden and missing targets one identity', async () => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  const options = accessFixture();
  const projects = JSON.parse(readFileSync('tests/fixtures/tessera/mesh/access/projects.json', 'utf8'));
  const grants = ['alice', 'bob'].map(name => ({
    id: 'scope-' + name,
    roleId: 'steward',
    member: { kind: 'email' as const, email: name + '@example.org' },
    scope: { kind: 'projects' as const, projects: name === 'alice' ? ['retail', 'units'] : [...MESH_PROJECTS] },
    addedBy: 'fixture',
    addedAt: '2026-11-17T00:00:00Z',
  }));
  const access = createAccessControl({
    ...options,
    knownProjects: () => fixture.ws.state.registry().projects.map(entry => entry.slug),
    config: { ...options.config, projects, grants },
  });
  function as(name: 'alice' | 'bob') {
    const principal = access.principalFor(person(name));
    const handler = createHandler(fixture.ws, { mode: 'server', access, principal: () => principal, publicOrigin: ORIGIN, remoteCredentials: allowEveryRemote() });
    return { principal, handler };
  }
  const alice = as('alice');
  const response = await alice.handler(apiRequest('/api/mesh'));
  const answer = await response.text();
  expect(response.status).toBe(200);
  const request = buildTwinRequest('mesh.graph', { params: {} });
  const twin = (await alice.handler.boundary.operate({ caller: mintCaller({ principal: alice.principal, origin: 'mcp' }), request })).response;
  expect(await twin.text()).toBe(answer);
  expect(JSON.parse(answer)).toEqual({
    projects: [
      { project: 'retail', name: 'retail', domain: 'Commerce' },
      { project: 'units', name: 'units', domain: null },
    ],
    links: [{ consumer: 'retail', provider: null, version: null, items: [] }],
  });
  const complete = await as('bob').handler(apiRequest('/api/mesh'));
  expect((await complete.json()).links).toEqual([{ consumer: 'retail', provider: 'finance', version: fixture.git('finance', ['rev-parse', 'HEAD']), items: ['Invoice'] }]);
  await fixture.ws.trash.deleteProject('finance');
  expect(await (await alice.handler(apiRequest('/api/mesh'))).text()).toBe(answer);
});
