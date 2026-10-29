// What the workspace tells the browser for governance: people to pick as metric owners, whether
// an owner is verified, how classifications are read, and that local mode is unchanged.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import type { Workspace } from '../../src/server/projects/workspace';
import type { TestUserName } from '../helpers/auth-identities';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';
import { LOCAL_READER } from '../../src/server/projects/reader';

const origin = 'http://localhost';
function serverAs(ws: Workspace, name: TestUserName) {
  const access = createAccessControl(accessFixture());
  for (const signedIn of ['alice', 'bob', 'carol', 'erin'] as const) {
    ws.state.recordUser(access.principalFor(person(signedIn)), '2026-10-22T00:00:00Z');
  }
  const principal = access.principalFor(person(name));
  return createHandler(ws, {
    mode: 'server',
    access,
    principal: () => principal,
    publicOrigin: origin,
    remoteCredentials: allowEveryRemote(),
  });
}
async function get(handler: ReturnType<typeof createHandler>, path: string) {
  const response = await handler(new Request(origin + path));
  expect(response.status, path).toBe(200);
  return response.json();
}

test('owner choices list only people who may read the project; local mode gets none', async () => {
  using fixture = await authWorkspace();
  const path = '/api/projects/sales-metrics/people';
  const people = await get(serverAs(fixture.ws, 'alice'), path);
  // Carol signed in too, but she works in the HR domain and may not read this project.
  expect(people).toEqual([
    { name: 'Alice Andrade', owner: 'alice@example.org' },
    { name: 'Bob Barros', owner: 'bob@example.org' },
  ]);
  const viewer = await serverAs(fixture.ws, 'hank')(new Request(origin + path));
  expect(viewer.status).toBe(403);
  const carol = await serverAs(
    fixture.ws,
    'carol',
  )(new Request(origin + '/api/projects/hr-people/people'));
  expect(carol.status).toBe(403);
  expect(await get(createHandler(fixture.ws), path)).toEqual([]);
});

test('an owner who names nobody who signed in is marked unverified in server mode only', async () => {
  using fixture = await authWorkspace();
  const file = fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml');
  const source = file.source.replace('"owner": "frank@example.org"', '"owner": "Sales team"');
  await fixture.ws.saveFile(
    'sales-metrics',
    'sales.semantic.yaml',
    {
      baseHash: file.hash,
      source,
    },
    LOCAL_READER,
  );
  const metrics = await get(serverAs(fixture.ws, 'bob'), '/api/projects/sales-metrics/metrics');
  const verified = Object.fromEntries(
    metrics.map((metric: any) => [metric.name, metric.ownerVerified]),
  );
  expect(verified).toEqual({
    gross_revenue: true,
    order_count: true,
    average_order_value: false,
  });
  const local = await get(createHandler(fixture.ws), '/api/projects/sales-metrics/metrics');
  expect(local.some((metric: any) => 'ownerVerified' in metric)).toBe(false);
});

test('each project tells the browser how its classification values are read', async () => {
  using fixture = await authWorkspace();
  const projects = await get(serverAs(fixture.ws, 'bob'), '/api/projects');
  const contracts = projects.find((project: any) => project.slug === 'sales-contracts');
  expect(contracts.classification).toEqual({
    aliases: { sensitive: 'confidential', secret: 'restricted', pii: 'confidential' },
    protectedLevel: 'confidential',
  });
  const me = await get(serverAs(fixture.ws, 'bob'), '/api/me');
  expect(me.username).toBe('Bob@Example.org');
});

test('local mode saves governed changes exactly as before', async () => {
  using fixture = await authWorkspace();
  const local = createHandler(fixture.ws);
  const file = fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml');
  const edited = file.source
    .replace("'SUM(orders.amount)'", "'SUM(orders.amount) * 2'")
    .replace('"status": "proposed"', '"status": "approved"');
  const response = await local(
    new Request('http://127.0.0.1:4310/api/projects/sales-metrics/files/sales.semantic.yaml', {
      method: 'PUT',
      body: JSON.stringify({ baseHash: file.hash, source: edited }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(['findings', 'hash', 'path']);
  expect(fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml').source).toBe(edited);
});
