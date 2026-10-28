import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { meResponse } from '../../src/server/routes/me';
import { requestAccess, type AccessRequest } from '../../src/server/auth/request-scope';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createSessionStore } from '../../src/server/auth/sessions';
import { validCsrf } from '../../src/server/auth/csrf';
import { tempDataDir } from '../helpers/temp-data-dir';
import { accessFixture, person } from './access-fixture';
import { createProviderState } from '../helpers/mock-oidc-state';
import { tokenEndpoint } from '../helpers/mock-oidc-grants';
import { TEST_WORKBENCH_CLIENT } from '../helpers/auth-identities';

test('person response supplies the native logout token but never provider credentials', async () => {
  const directory = tempDataDir();
  try {
    const access = createAccessControl(accessFixture());
    const sessions = createSessionStore({ dir: directory.root, key: randomBytes(32) });
    const session = await sessions.create({
      principal: access.principalFor(person('alice')),
      tokens: {
        accessToken: 'private-access',
        idToken: 'private-id',
        refreshToken: 'private-refresh',
        expiresAt: Date.now() + 60000,
      },
    });
    const request: AccessRequest = new Request('http://127.0.0.1:50000/api/me');
    request[requestAccess] = access.forRequest(session.principal);
    const response = await meResponse(request, {
      mode: 'server',
      authentication: {
        sessions,
        session: async () => session,
        callback: async () => new Response(null, { status: 302 }),
        logout: async () => new Response(null, { status: 303 }),
        frontChannelLogout: async () => new Response(null, { status: 200 }),
        login: async () => new Response(null, { status: 302 }),
      },
    });
    const body = await response.json();
    expect(body.csrf).toBe(session.csrf);
    expect(JSON.stringify(body)).not.toContain('private-');
    const logout = new Request('http://127.0.0.1:50000/auth/logout', {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:50000' },
      body: new URLSearchParams({ csrf: body.csrf }),
    });
    expect(await validCsrf(logout, 'http://127.0.0.1:50000', session.csrf)).toBe(true);
    const local = await (await meResponse(request, {})).json();
    expect(local.mode).toBe('local');
    expect(local.csrf).toBeUndefined();
  } finally {
    directory.cleanup();
  }
});

test('mock confidential client accepts the per-run secret and refuses the fixture default', async () => {
  const state = await createProviderState({ clientSecret: 'generated-for-this-run' });
  const request = new Request('http://127.0.0.1/token', { method: 'POST' });
  const parameters = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
    client_id: TEST_WORKBENCH_CLIENT.clientId,
    client_secret: TEST_WORKBENCH_CLIENT.secret,
  });
  expect((await tokenEndpoint(state, request, parameters)).status).toBe(401);
  parameters.set('client_secret', 'generated-for-this-run');
  expect((await tokenEndpoint(state, request, parameters)).status).toBe(200);
});

test('permission explanations come from server role definitions, including custom sources', async () => {
  const { ACTIONS } = await import('../../src/shared/auth/actions');
  const builtin = (await import('../../policies/builtin-roles.json')).default;
  const access = createAccessControl(accessFixture());
  for (const name of ['alice', 'hank'] as const) {
    const request: AccessRequest = new Request('http://localhost/api/me');
    request[requestAccess] = access.forRequest(access.principalFor(person(name)));
    const body = await (await meResponse(request, { mode: 'server' })).json();
    expect(Object.keys(body.requires)).toEqual([...ACTIONS]);
    if (name === 'hank') {
      expect(body.requires.approveMetric).toBe('Requires Metric reviewer');
      continue;
    }
    for (const action of ACTIONS) {
      const lowest = builtin.roles.find(role =>
        role.permissions.some(permission => permission.actions.includes(action)),
      );
      expect(body.requires[action]).toBe('Requires ' + (lowest?.name ?? 'permission'));
    }
  }
});
