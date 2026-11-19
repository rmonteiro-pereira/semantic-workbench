import { expect, test } from 'bun:test';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishFixture } from '../helpers/published-workspace';
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

test('a page of fifty published consumers contains the allowed fields and a stable continuation', async () => {
  using fixture = await meshWorkspace('shared');
  await publishDependent(fixture);
  const directory = join(fixture.fixture.root, 'projects', fixture.ws.repoOf('retail'));
  const importers = Array.from({ length: 50 }, (_, index) => ({ path: `shop-${index}`, name: `Shop ${index}` }));
  for (const importer of importers) cpSync(fixture.projectDirectory('retail'), join(directory, importer.path), { recursive: true });
  await fixture.ws.registerRepositoryProjects(fixture.ws.repoOf('retail'), [...MESH_PROJECTS.map(path => ({ path, name: path })), ...importers]);
  await publishFixture(fixture.fixture);
  // Measure the listing separately from the one-time rebuild of the derivative.
  expect(await fixture.ws.dependents.read()).toHaveLength(51);
  const path = 'http://localhost:4310/api/projects/finance/dependents';
  const start = performance.now();
  const first = await fixture.fixture.handler(new Request(path));
  const page = await first.json();
  console.log(`Mesh dependents: ${Math.round(performance.now() - start)} ms for a 50-row page.`);
  expect(first.status).toBe(200);
  expect(Object.keys(page).sort()).toEqual(['cursor', 'dependents']);
  expect(page.dependents).toHaveLength(50);
  const last = await fixture.fixture.handler(new Request(`${path}?cursor=${encodeURIComponent(page.cursor)}`));
  const remainder = await last.json();
  expect(last.status).toBe(200);
  expect(remainder.cursor).toBeNull();
  expect(remainder.dependents).toHaveLength(1);
  const all = [...page.dependents, ...remainder.dependents];
  expect(all.map(row => row.name).sort()).toEqual(['retail', ...importers.map(entry => entry.name)].sort());
  for (const row of all) {
    expect(row).toEqual({ name: row.name, domain: null, items: ['Invoice'], version: fixture.git('finance', ['rev-parse', 'HEAD']) });
  }
});
