import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHandler } from '../src/server/handler';
import { createAccessControl } from '../src/server/auth/authorize';
import { createAuditLog } from '../src/server/auth/audit';
import { mintCaller } from '../src/server/auth/caller';
import { buildTwinRequest } from '../src/server/auth/twin-request';
import { addressMigrationFile, readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { accessFixture, person } from './auth/access-fixture';
import { authWorkspace } from './helpers/auth-workspace';
import { allowEveryRemote } from './helpers/remote-credentials-fixture';

const project = 'sales-metrics';
const prefix = 'sw1:sales-metrics/sales.semantic.yaml#model:Sales%20semantic%20model/metric:';
const target = prefix + 'gross_revenue';
const declaration = { operationId: 'boundary-reconcile', from: prefix + 'old_revenue', to: target };

function setup(workspace: Awaited<ReturnType<typeof authWorkspace>>, username: 'alice' | 'carol' = 'alice') {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(username));
  const audit = createAuditLog({ dir: join(workspace.root, `address-audit-${username}`) });
  const handler = createHandler(workspace.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: 'http://localhost', remoteCredentials: allowEveryRemote() });
  return { handler, audit, principal };
}

test('HTTP and twin reads preserve opaque snapshots and audit the same resolved item', async () => {
  using workspace = await authWorkspace();
  const context = setup(workspace);
  const body = { address: target + '@opaque' };
  const request = buildTwinRequest('itemAddresses.resolve', { params: { slug: project }, body });
  const http = await context.handler(
    new Request('http://localhost' + new URL(request.url).pathname, { method: 'POST', body: JSON.stringify(body), headers: { Origin: 'http://localhost', 'X-SW-Request': '1' } }),
  );
  const twin = await context.handler.boundary.operate({ caller: mintCaller({ principal: context.principal, origin: 'mcp' }), request });
  expect(http.status).toBe(200);
  expect(twin.response.status).toBe(200);
  const resolved = await http.json();
  expect(resolved).toMatchObject({ status: 'found', address: body.address });
  expect(await twin.response.json()).toEqual(resolved);
  expect(context.audit.recent(10)).toMatchObject([
    { decision: 'allow', action: 'read' },
    { decision: 'allow', origin: 'mcp', tool: 'itemAddresses.resolve' },
  ]);
});

test('a lost reconciliation reply replays through the twin with one migration and unchanged definitions', async () => {
  using workspace = await authWorkspace();
  const context = setup(workspace);
  const layout = dataLayout(workspace.root);
  const original = workspace.ws.readFile(project, 'sales.semantic.yaml').source;
  const invoke = (body = declaration, scope?: ('read' | 'localWrite')[]) =>
    context.handler.boundary.operate({
      caller: mintCaller({ principal: context.principal, origin: 'mcp', scope }),
      request: buildTwinRequest('itemAddresses.reconcile', { params: { slug: project, '*': 'sales.semantic.yaml' }, body }),
    });
  expect((await invoke(declaration, ['read'])).response.status).toBe(403);
  const accepted = await context.handler(
    new Request(`http://localhost/api/projects/${project}/item-addresses/reconcile/sales.semantic.yaml`, {
      method: 'POST',
      body: JSON.stringify(declaration),
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
    }),
  );
  expect(accepted.status).toBe(200);
  const record = await accepted.json();
  const bytes = readFileSync(addressMigrationFile(layout, project));
  const repeated = await invoke();
  expect(repeated.response.status).toBe(200);
  expect(await repeated.response.json()).toEqual(record);
  expect(readFileSync(addressMigrationFile(layout, project))).toEqual(bytes);
  expect(readAddressMigrations(layout, project, LOCAL_READER)).toEqual([record]);
  expect(workspace.ws.readFile(project, 'sales.semantic.yaml').source).toBe(original);
  expect((await invoke({ ...declaration, to: prefix + 'order_count' })).response.status).toBe(400);
  expect(context.audit.recent(10).filter(entry => entry.decision === 'allow' && entry.outcome === 'ok')).toHaveLength(2);
});

test('address requests reject malformed or foreign bodies and hide unreadable files like missing items', async () => {
  using workspace = await authWorkspace();
  const context = setup(workspace);
  const caller = mintCaller({ principal: context.principal, origin: 'mcp' });
  const invoke = (body: unknown) => context.handler.boundary.operate({ caller, request: buildTwinRequest('itemAddresses.resolve', { params: { slug: 'sales-contracts' }, body }) });
  const missing = await invoke({ address: 'sw1:sales-contracts/missing.yaml#ontology:O' });
  const hidden = await invoke({ address: 'sw1:sales-contracts/finance/revenue-recognition.odcs.yaml#contract:Secret' });
  expect(await hidden.response.json()).toEqual(await missing.response.json());
  expect((await invoke({ address: target })).response.status).toBe(400);
  expect((await invoke({ address: 'sw1:#metric:X' })).response.status).toBe(400);
  expect((await invoke({ address: 'sw1:sales-contracts' })).response.status).toBe(400);
  expect((await invoke({ address: 42 })).response.status).toBe(400);
  expect((await invoke({ address: target, extra: true })).response.status).toBe(400);
  const viewer = setup(workspace, 'carol');
  const denied = await viewer.handler.boundary.operate({
    caller: mintCaller({ principal: viewer.principal, origin: 'mcp' }),
    request: buildTwinRequest('itemAddresses.reconcile', { params: { slug: project, '*': 'sales.semantic.yaml' }, body: declaration }),
  });
  expect([403, 404]).toContain(denied.response.status);
});
