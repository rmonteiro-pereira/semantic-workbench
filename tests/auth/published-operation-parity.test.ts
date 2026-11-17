// Published consumers and browser-only operations share the authenticated operation dispatcher.
import { expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { operationStep } from '../../src/server/auth/operation-execution';
import { buildTwinRequest, type TwinRequestInput } from '../../src/server/auth/twin-request';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

const origin = 'http://localhost:5312';

function payload(response: Response) {
  return response.json();
}

test('snapshot catalog and metrics have identical HTTP and MCP bodies and immutable pins', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, principal: () => principal, publicOrigin: origin });
  const caller = mintCaller({ principal, origin: 'mcp' });
  const operations: (TwinRequestInput & { id: string })[] = [
    { id: 'agent.catalog.read', params: {}, query: { project: 'sales-contracts' } },
    { id: 'metrics.list', params: { slug: 'sales-contracts' } },
  ];
  for (const operation of operations) {
    const request = buildTwinRequest(operation.id, operation);
    const http = await handler(new Request(origin + new URL(request.url).pathname + new URL(request.url).search));
    const twin = (await handler.boundary.operate({ caller, request })).response;
    expect(http.status, operation.id).toBe(200);
    expect(twin.status).toBe(http.status);
    expect(http.headers.get('X-Workbench-Snapshot')).toMatch(/^[a-f0-9]{40,64}$/);
    expect(twin.headers.get('X-Workbench-Snapshot')).toBe(http.headers.get('X-Workbench-Snapshot'));
    expect(await payload(twin)).toEqual(await payload(http));
  }
});

test('browser previews and personal publication notices refuse protocol dispatch without changing state', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(fixture.root, 'publication-parity-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, audit, principal: () => principal, publicOrigin: origin });
  const caller = mintCaller({ principal, origin: 'mcp', surface: 'browser' });
  const routes = [
    ['GET', '/api/preview/catalog?project=sales-contracts'],
    ['GET', '/api/preview/context?project=sales-contracts&mappingId=sales-contracts/sales.mapping.yaml'],
    ['POST', '/api/preview/plan'],
    ['POST', '/api/projects/sales-contracts/git/acknowledge-publication'],
  ];
  const before = fixture.ws.state.forOwner(principal.id).view('sales-contracts');
  for (const [method, path] of routes) {
    const request = new Request(origin + path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    const result = await handler.boundary.operate({ caller, request });
    expect(result.response.status, path).toBe(404);
    expect(audit.recent(1)[0]).toMatchObject({ origin: 'mcp', decision: 'deny', reason: 'unmapped-route' });
  }
  expect(fixture.ws.state.forOwner(principal.id).view('sales-contracts')).toEqual(before);
  expect(handler.boundary.availableOperations(caller)).not.toContain('preview.catalog');
  expect(handler.boundary.availableOperations(caller)).not.toContain('git.acknowledgePublication');
});

test('the admitted snapshot operation cannot execute a pointer advance step', async () => {
  using fixture = await authWorkspace();
  const unexpected = spyOn(fixture.ws.published, 'readableDocuments').mockImplementation(async () => {
    operationStep('publication.advance', () => {});
    return { commit: 'a'.repeat(40), documents: [] };
  });
  try {
    const response = await fixture.handler(new Request('http://localhost/api/agent/catalog?project=sales-contracts'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'agent.catalog.read does not own internal step publication.advance.' });
  } finally {
    unexpected.mockRestore();
  }
});

test('startup upgrade cannot be selected by a protocol caller', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, principal: () => principal, publicOrigin: origin });
  const before = fixture.ws.state.published();
  const result = await handler.boundary.operate({
    caller: mintCaller({ principal, origin: 'mcp' }),
    request: new Request(origin + '/api/projects'),
    operationId: 'publication.upgrade',
  });
  expect(result.response.status).toBe(404);
  expect(fixture.ws.state.published()).toEqual(before);
  expect(handler.boundary.availableOperations(mintCaller({ principal, origin: 'mcp' }))).not.toContain('publication.upgrade');
});
