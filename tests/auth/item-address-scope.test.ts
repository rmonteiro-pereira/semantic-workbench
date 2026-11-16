import { expect, test } from 'bun:test';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createHandler } from '../../src/server/handler';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

function scopedAccess() {
  const options = accessFixture();
  options.config.roles = [
    {
      id: 'r_path_editor',
      name: 'Path editor',
      description: 'One definition',
      createdBy: 'test',
      createdAt: '2026-11-16T00:00:00Z',
      permissions: [{ actions: ['read'] }, { actions: ['edit'], conditions: { path: 'sales.semantic.yaml' } }],
    },
  ];
  options.config.grants = [
    {
      id: 'path-editor',
      roleId: 'r_path_editor',
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'projects', projects: ['sales-metrics'] },
      addedBy: 'test',
      addedAt: '2026-11-16T00:00:00Z',
    },
  ];
  return createAccessControl(options);
}

test('path-restricted file editors can reconcile that same file through HTTP and twins', async () => {
  using fixture = await authWorkspace();
  const access = scopedAccess();
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, { mode: 'server', access, principal: () => principal, publicOrigin: 'http://localhost', remoteCredentials: allowEveryRemote() });
  const params = { slug: 'sales-metrics', '*': 'sales.semantic.yaml' };
  const caller = mintCaller({ principal, origin: 'mcp' });
  const file = fixture.ws.readFile(params.slug, params['*']);
  const save = await handler.boundary.operate({ caller, request: buildTwinRequest('files.save', { params, body: { baseHash: file.hash, patches: [] } }) });
  expect(save.response.status).toBe(200);
  const prefix = 'sw1:sales-metrics/sales.semantic.yaml#model:Sales%20semantic%20model/metric:';
  const body = { operationId: 'path-editor', from: prefix + 'old_revenue', to: prefix + 'gross_revenue' };
  const request = buildTwinRequest('itemAddresses.reconcile', { params, body });
  const response = await handler(
    new Request('http://localhost' + new URL(request.url).pathname, { method: 'POST', body: JSON.stringify(body), headers: { Origin: 'http://localhost', 'X-SW-Request': '1' } }),
  );
  expect(response.status).toBe(200);
  const repeated = await handler.boundary.operate({ caller, request });
  expect(repeated.response.status).toBe(200);
  expect(await repeated.response.json()).toEqual(await response.json());
});
