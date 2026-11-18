import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createHandler } from '../../src/server/handler';
import { accessFixture, person } from '../auth/access-fixture';
import { apiRequest, ORIGIN } from '../auth/working-copy-fixture';
import { MESH_PROJECTS, meshWorkspace, publishDependent } from '../helpers/mesh-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

const file = 'tests/fixtures/tessera/mesh/access/projects.json';

test.each(['steward', 'admin', 'editor', 'viewer'] as const)('access to dependents follows provider publish authorization for %s', async roleId => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  const options = accessFixture();
  const projects = JSON.parse(readFileSync(file, 'utf8'));
  const identity = person('bob');
  const grants = [
    {
      id: 'finance-grant',
      roleId,
      member: { kind: 'email' as const, email: 'bob@example.org' },
      scope: roleId === 'admin' ? { kind: 'workspace' as const } : { kind: 'projects' as const, projects: ['finance'] },
      addedBy: 'fixture',
      addedAt: '2026-11-17T00:00:00Z',
    },
  ];
  const access = createAccessControl({ ...options, knownProjects: () => [...MESH_PROJECTS], config: { ...options.config, grants, projects } });
  const principal = access.principalFor(identity);
  const handler = createHandler(fixture.ws, { mode: 'server', publicOrigin: ORIGIN, access, principal: () => principal, remoteCredentials: allowEveryRemote() });

  const path = (slug: string) => `/api/projects/${slug}/dependents`;
  const http = await handler(apiRequest(path('finance')));
  const request = buildTwinRequest('mesh.dependents.read', { params: { slug: 'finance' } });
  const twin = (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response;
  const payload = await http.text();
  expect(twin.status).toBe(http.status);
  expect(await twin.text()).toBe(payload);
  if (roleId === 'editor' || roleId === 'viewer') {
    const unknown = await handler(apiRequest(path('missing')));
    expect(http.status).toBe(404);
    expect(payload).toBe(await unknown.text());
    return;
  }
  expect(http.status).toBe(200);
  expect(JSON.parse(payload)).toEqual({
    dependents: [
      {
        name: 'retail',
        domain: 'Commerce',
        items: ['Invoice'],
        version: fixture.git('finance', ['rev-parse', 'HEAD']),
      },
    ],
    cursor: null,
  });
  if (roleId === 'steward') expect((await handler(apiRequest('/api/projects/retail/dependencies'))).status).toBe(404);
});
