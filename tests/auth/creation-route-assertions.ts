import assert from 'node:assert/strict';
import { createHandler } from '../../src/server/handler';
import type { createAccessControl } from '../../src/server/auth/authorize';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from './access-fixture';

/** Checks all HTTP workflows gated by prospective project creation during a forbidden hour. */
export async function assertCreationRoutes(createControl: typeof createAccessControl) {
  using fixture = await authWorkspace();
  const options = accessFixture();
  options.config.adminRules = {
    creationHours: 'forbid(principal, action == SW::Action::"createProject", resource) when { context.hour == 13 };',
  };
  const access = createControl({ ...options, context: () => ({ hour: 13 }) });
  const origin = 'http://localhost';
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    access,
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    principal: () => access.principalFor(person('dave')),
  });
  for (const path of ['/api/projects', '/api/import', '/api/examples/commerce']) {
    const request = new Request(origin + path, {
      method: 'POST',
      headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal((await handler(request)).status, 403, path);
  }
  const response = await handler(new Request(origin + '/api/me'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).creationDomains, []);
}
