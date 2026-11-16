import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createAccessControl } from '../src/server/auth/authorize';
import { createAuditLog } from '../src/server/auth/audit';
import { mintCaller } from '../src/server/auth/caller';
import { createOperationBoundary } from '../src/server/auth/operation-boundary';
import { WriteAccessError } from '../src/server/auth/write-access';
import { errorResponse } from '../src/server/routes/http';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { accessFixture, person } from '../tests/auth/access-fixture';
import type * as ItemAddresses from '../src/server/routes/item-addresses';

function routeBoundary(candidate: typeof ItemAddresses, fixture: Awaited<ReturnType<typeof authWorkspace>>) {
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'address-route-mutations') });
  const caller = mintCaller({ principal: access.principalFor(person('alice')), origin: 'mcp' });
  const boundary = createOperationBoundary(fixture.ws, { mode: 'server', access, audit }, async request => {
    try {
      return (await candidate.itemAddressRoutes(fixture.ws, request, new URL(request.url))) ?? new Response(null, { status: 404 });
    } catch (error) {
      if (error instanceof WriteAccessError) throw error;
      return errorResponse(error, undefined, { serverMode: true });
    }
  });
  return async (action: string, body: unknown, project = 'sales-metrics', path = 'sales.semantic.yaml') =>
    (
      await boundary.operate({
        caller,
        operationId: `itemAddresses.${action}`,
        request: new Request(`http://operation.internal/api/projects/${project}/item-addresses/${action}${action === 'reconcile' ? '/' + path : ''}`, { method: 'POST', body: JSON.stringify(body) }),
      })
    ).response;
}

/** Exercises route predicates through the real caller, inventory and operation boundary. */
export async function itemAddressOperationCase(candidate: typeof ItemAddresses) {
  using fixture = await authWorkspace();
  const invoke = routeBoundary(candidate, fixture);
  const target = 'sw1:sales-metrics/sales.semantic.yaml#model:Sales%20semantic%20model/metric:gross_revenue';
  const valid = { address: target + '@opaque' };
  const resolved = await invoke('resolve', valid);
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).address, valid.address);
  assert.equal((await invoke('resolve', { address: target }, 'sales-contracts')).status, 400);
  assert.equal((await invoke('resolve', { address: 'sw1:sales-metrics' })).status, 400);
  assert.equal((await invoke('resolve', { ...valid, extra: true })).status, 400);
  const declaration = { operationId: 'route-mutation', from: target.replace('gross_revenue', 'missing_old'), to: target };
  assert.equal((await invoke('reconcile', { ...declaration, extra: true })).status, 400);
  assert.equal((await invoke('reconcile', { ...declaration, operationId: 123 })).status, 400);
  assert.equal((await invoke('reconcile', declaration, 'sales-metrics', 'other.yaml')).status, 400);
  const oversized = await invoke('resolve', { address: target, padding: 'x'.repeat(64_000) });
  assert.equal(oversized.status, 400);
  assert.equal((await oversized.json()).error, 'Request too large.');
}
