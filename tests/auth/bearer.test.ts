// Exercises machine identities through the real HTTP boundary with an in-memory provider.
import { expect, test } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';
import { oidcTransport } from '../helpers/oidc-transport';
import { AUTH_PROJECTS, authWorkspace } from '../helpers/auth-workspace';
import { TEST_CLIENTS } from '../helpers/auth-identities';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createHandler } from '../../src/server/handler';
import { openAdminRepository } from '../../src/server/auth/admin-repo';
import { ROUTE_ACTIONS } from '../../src/server/auth/route-actions';
import { compareAccess } from '../../src/server/auth/dry-run';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

async function clientToken(transport: Awaited<ReturnType<typeof oidcTransport>>, granted: boolean) {
  const identity = granted ? TEST_CLIENTS.granted : TEST_CLIENTS.ungranted;
  const response = await transport.fetch(transport.state.issuer + '/token', {
    method: 'POST',
    headers: {},
    redirect: 'manual',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: identity.clientId,
      client_secret: identity.secret,
      scope: transport.state.apiAudience + '/.default',
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()).access_token as string;
}

function auditEntries(folder: string, response: Response) {
  const entries = readdirSync(folder).flatMap(file =>
    readFileSync(join(folder, file), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line)),
  );
  return entries.filter(entry => entry.requestId === response.headers.get('X-Request-Id'));
}

async function setup() {
  const transport = await oidcTransport();
  transport.config.apiAudience = [transport.state.apiAudience];
  const fixture = await authWorkspace();
  let keysDown = false;
  // Discovery always answers; the key endpoint fails once a test takes the provider down.
  const providerFetch: typeof transport.fetch = (input, init) => {
    if (keysDown && String(input).endsWith('/keys')) {
      return Promise.reject(new TypeError('connection refused'));
    }
    return transport.fetch(input, init);
  };
  const client = await createOidcClient(transport.config, { fetch: providerFetch });
  const auth = await createServerAuthentication(fixture.ws, transport.config, client);
  const handler = createHandler(fixture.ws, auth);
  async function call(bearer: string, path = '/api/agent/catalog?project=sales-contracts', body?: unknown) {
    return handler(
      new Request(transport.config.publicUrl + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + bearer,
          Origin: transport.config.publicUrl,
          'X-SW-Request': '1',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  }
  return {
    transport,
    handler,
    fixture,
    auth,
    token: (granted = true) => clientToken(transport, granted),
    takeKeysDown: () => {
      keysDown = true;
    },
    call,
    audit: (response: Response) => auditEntries(join(fixture.ws.layout.state, 'audit'), response),
    [Symbol.dispose]() {
      auth.close();
      fixture[Symbol.dispose]();
    },
  };
}

test('client without app roles sees only granted mappings and every call is attributed', async () => {
  using app = await setup();
  const token = await app.token();
  expect(decodeJwt(token).roles).toBeUndefined();
  const response = await app.call(token);
  expect(response.status).toBe(200);
  const catalog = await response.text();
  expect(catalog).toContain('sales-contracts/sales.mapping.yaml');
  expect(catalog).not.toContain('sales-metrics/');
  expect(catalog).not.toContain('hr-people/');
  expect(app.audit(response)).toMatchObject([
    {
      principal: { kind: 'client', id: 'client:sw-agent', clientId: 'sw-agent' },
      action: 'agentRead',
      decision: 'allow',
    },
  ]);
  for (const mapping of ['people', 'sales']) {
    const context = await app.call(token, '/api/agent/context?project=sales-contracts&mappingId=sales-contracts/' + mapping + '.mapping.yaml');
    const text = await context.text();
    expect(text).not.toContain('LEAK-hr-people');
    expect(text).not.toContain('LEAK-shared-reference');
    expect(text).not.toContain('LEAK-sales-metrics');
    // The people mapping refers to a project the client cannot read, so nothing resolves; the sales mapping resolves inside its own project.
    if (mapping === 'people') {
      expect(text).toContain('resolves to 0 local documents');
      expect(JSON.parse(text).ontology).toEqual({});
      expect(JSON.parse(text).semanticModel).toEqual({});
    } else {
      expect(JSON.parse(text).findings).toEqual([]);
    }
    expect(app.audit(context)).toHaveLength(1);
  }
  const plan = await app.call(token, '/api/agent/plan', {
    project: 'sales-contracts',
    mappingId: 'sales-contracts/people.mapping.yaml',
    metrics: [],
    dimensions: [],
  });
  // The hidden ontology leaves the mapping unresolved, so planning is refused without naming it.
  expect(plan.status).toBe(400);
  expect(await plan.text()).not.toContain('LEAK-hr-people');
  expect(app.audit(plan)).toHaveLength(1);
  const policy = openAdminRepository({ root: app.fixture.root }).load();
  policy.agents.clients = [];
  app.auth.access.reload(policy);
  expect((await app.call(token)).status).toBe(403);
}, 30000);

test('ungranted client is refused and audited even with app roles', async () => {
  using app = await setup();
  const claims = { ...decodeJwt(await app.token(false)), roles: ['Admin', 'Agent'] };
  const key = app.transport.state.keys[0];
  const token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: key.kid }).sign(key.privateKey);
  const response = await app.call(token);
  expect(response.status).toBe(403);
  expect(app.audit(response)).toMatchObject([
    {
      principal: { id: 'client:sw-agent-ungranted', kind: 'client' },
      decision: 'deny',
    },
  ]);
});

test('bearer is refused outside agent routes including public and unknown routes', async () => {
  using app = await setup();
  const token = await app.token();
  for (const path of ['/api/projects', '/api/events', '/', '/auth/login', '/api/unknown']) {
    const response = await app.call(token, path);
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
    expect(app.audit(response)).toMatchObject([{ principal: { id: 'anonymous' }, reason: 'bearer-scope', decision: 'deny' }]);
  }
});

test('invalid application tokens are refused and audited without trusting their identity', async () => {
  using app = await setup();
  const claims = decodeJwt(await app.token());
  const now = Math.floor(Date.now() / 1000);
  const changes = [
    // A minute past the five-minute skew, so a slow run crossing a second boundary still fails.
    { exp: now - 360 },
    { nbf: now + 360 },
    { aud: 'other' },
    { iss: 'https://other.invalid' },
    { tid: 'other' },
    { idtyp: 'user' },
    { idtyp: undefined },
    { exp: undefined },
    { azp: undefined, appid: undefined },
    { scp: 'delegated' },
  ];
  for (const change of [...changes, { wrongSignature: true }]) {
    const key = app.transport.state.keys['wrongSignature' in change ? 1 : 0];
    const token = await new SignJWT({ ...claims, ...change }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).sign(key.privateKey);
    const response = await app.call(token);
    expect(response.status).toBe(401);
    expect(app.audit(response)).toMatchObject([
      {
        principal: { id: 'anonymous' },
        decision: 'deny',
        reason: 'tid' in change ? 'tenant-mismatch' : 'token-invalid',
      },
    ]);
    expect(JSON.stringify(app.audit(response))).not.toContain(token);
  }
});

test('client identity comes from azp with domain grants and no human membership', async () => {
  using app = await setup();
  const policy = openAdminRepository({ root: app.fixture.root }).load();
  policy.agents.clients[0].projects = [];
  policy.agents.clients[0].domains = ['sales'];
  app.auth.access.reload(policy);
  const key = app.transport.state.keys[0];
  const claims = decodeJwt(await app.token());
  const token = await new SignJWT({
    ...claims,
    email: 'bob@example.org',
    email_verified: true,
    roles: ['Admin'],
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .sign(key.privateKey);
  const response = await app.call(token);
  expect(response.status).toBe(200);
  const catalog = await response.text();
  expect(catalog).toContain('sales-contracts/');
  expect(catalog).not.toContain('hr-people/');
  expect(catalog).not.toContain('shared-reference/');
  // Only v2 tokens pass the issuer check, so a v1-style appid without azp names no client.
  const appidOnly = await new SignJWT({ ...claims, azp: undefined, appid: claims.azp }).setProtectedHeader({ alg: 'RS256', kid: key.kid }).sign(key.privateKey);
  expect((await app.call(appidOnly)).status).toBe(401);
});

test('a browser session cannot rescue invalid or ungranted bearer credentials', async () => {
  using app = await setup();
  const origin = app.transport.config.publicUrl;
  const login = await app.handler(new Request(origin + '/'));
  const callback = app.transport.authorize(login.headers.get('location')!, 'dave');
  const signedIn = await app.handler(
    new Request(callback, {
      headers: { Cookie: login.headers.getSetCookie()[0].split(';')[0] },
    }),
  );
  const cookie = signedIn.headers
    .getSetCookie()
    .find(value => value.startsWith('sw-session='))!
    .split(';')[0];
  for (const [token, status] of [
    ['invalid', 401],
    [await app.token(false), 403],
  ] as const) {
    const response = await app.handler(
      new Request(origin + '/api/agent/catalog?project=sales-contracts', {
        headers: { Cookie: cookie, Authorization: 'Bearer ' + token },
      }),
    );
    expect(response.status).toBe(status);
  }
  // A granted client's token next to the Admin's cookie is decided and audited as the client.
  const granted = await app.handler(
    new Request(origin + '/api/agent/catalog?project=sales-contracts', {
      headers: { Cookie: cookie, Authorization: 'Bearer ' + (await app.token()) },
    }),
  );
  expect(granted.status).toBe(200);
  expect(app.audit(granted)).toMatchObject([{ principal: { id: 'client:sw-agent', kind: 'client' }, action: 'agentRead' }]);
  const browser = await app.handler(
    new Request(origin + '/api/agent/catalog?project=sales-contracts', {
      headers: { Cookie: cookie },
    }),
  );
  expect(browser.status).toBe(200);
  expect(app.audit(browser)).toMatchObject([{ principal: { kind: 'person' } }]);
});

test('a client needs no cross-site headers, and unmapped agent routes are audited', async () => {
  using app = await setup();
  const token = await app.token();
  const body = { mappingId: 'sales-contracts/sales.mapping.yaml', metrics: [], dimensions: [] };
  const plan = await app.handler(
    new Request(app.transport.config.publicUrl + '/api/agent/plan', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  expect(plan.status).not.toBe(403);
  expect(app.audit(plan)).toMatchObject([{ principal: { id: 'client:sw-agent' }, action: 'agentRead', decision: 'allow' }]);
  const unknown = await app.call(token, '/api/agent/unknown');
  expect(unknown.status).toBe(404);
  expect(app.audit(unknown)).toMatchObject([
    {
      principal: { id: 'client:sw-agent' },
      reason: 'unmapped-route',
      decision: 'deny',
    },
  ]);
});

test('a client cannot write: write routes refuse its token before any file changes', async () => {
  using app = await setup();
  const token = await app.token();
  const file = app.fixture.ws.readFile('sales-contracts', 'sales.mapping.yaml');
  const response = await app.call(token, '/api/projects/sales-contracts/save-batch', {
    files: [{ path: 'sales.mapping.yaml', baseHash: file.hash, source: file.source + '\n' }],
  });
  // Write routes are outside the agent routes, so the token is refused before it is read.
  expect(response.status).toBe(401);
  expect(app.audit(response)).toMatchObject([{ principal: { id: 'anonymous' }, reason: 'bearer-scope', decision: 'deny' }]);
  expect(app.fixture.ws.readFile('sales-contracts', 'sales.mapping.yaml').source).toBe(file.source);
});

test('a client is refused on a row that declares no client action', async () => {
  using app = await setup();
  const token = await app.token();
  const catalog = ROUTE_ACTIONS.find(row => row.path === 'GET /api/agent/catalog')!;
  const clientAction = catalog.clientAction;
  delete catalog.clientAction;
  try {
    const response = await app.call(token);
    expect(response.status).toBe(403);
    expect(app.audit(response)).toMatchObject([{ principal: { id: 'client:sw-agent' }, reason: 'bearer-scope', decision: 'deny' }]);
  } finally {
    catalog.clientAction = clientAction;
  }
});

test('an unreachable key endpoint answers 503 without a bearer challenge', async () => {
  using app = await setup();
  const token = await app.token();
  app.takeKeysDown();
  const response = await app.call(token);
  expect(response.status).toBe(503);
  expect(response.headers.get('WWW-Authenticate')).toBeNull();
  expect(app.audit(response)).toMatchObject([{ principal: { id: 'anonymous' }, reason: 'provider-unreachable', decision: 'deny' }]);
});

test('a granted client cannot open documents of ungranted projects or restricted files', async () => {
  using app = await setup();
  const token = await app.token();
  const hidden = ['hr-people/people.ontology.yaml', 'shared-reference/reference.ontology.yaml', 'sales-contracts/finance/revenue-recognition.odcs.yaml'];
  for (const mappingId of hidden) {
    const project = 'sales-contracts';
    const context = await app.call(token, `/api/agent/context?project=${project}&mappingId=${mappingId}`);
    expect(context.status).toBe(404);
    expect(await context.json()).toEqual({ error: 'Not found.' });
    expect(app.audit(context)).toMatchObject([{ principal: { id: 'client:sw-agent' }, decision: 'deny', reason: 'not-readable' }]);
    const plan = await app.call(token, '/api/agent/plan', {
      project,
      mappingId,
      metrics: [],
      dimensions: [],
    });
    expect(plan.status).toBe(404);
  }
});

test('a client discovers only the projects it may read, and hidden slugs look unknown', async () => {
  using app = await setup();
  const token = await app.token();
  const listed = await app.call(token, '/api/agent/projects');
  expect(listed.status).toBe(200);
  const { projects } = await listed.json();
  expect(projects.map((project: { slug: string }) => project.slug)).toEqual(['sales-contracts']);
  expect(Object.keys(projects[0]).sort()).toEqual(['name', 'slug']);
  const hidden = await app.call(token, '/api/agent/catalog?project=hr-people');
  const unknown = await app.call(token, '/api/agent/catalog?project=no-such-project');
  expect(hidden.status).toBe(400);
  expect(unknown.status).toBe(hidden.status);
  expect(await hidden.json()).toEqual(await unknown.json());
  const hiddenPlan = await app.call(token, '/api/agent/plan', {
    project: 'hr-people',
    mappingId: 'sales-contracts/sales.mapping.yaml',
  });
  const unknownPlan = await app.call(token, '/api/agent/plan', {
    project: 'no-such-project',
    mappingId: 'sales-contracts/sales.mapping.yaml',
  });
  expect(hiddenPlan.status).toBe(400);
  expect(await hiddenPlan.json()).toEqual(await unknownPlan.json());
});

test('a deactivated client is refused although agents.json still grants it', async () => {
  using app = await setup();
  const token = await app.token();
  const policy = openAdminRepository({ root: app.fixture.root }).load();
  const at = new Date().toISOString();
  policy.deactivated.principals = [{ id: 'client:sw-agent', at, by: 'dave', reason: 'retired' }];
  app.auth.access.reload(policy);
  const response = await app.call(token);
  expect(response.status).toBe(403);
  expect(app.audit(response)).toMatchObject([{ principal: { id: 'client:sw-agent' }, decision: 'deny', reason: 'no-grant' }]);
});

test('an audited agent call carries the configured client name', async () => {
  using app = await setup();
  const response = await app.call(await app.token());
  expect(response.status).toBe(200);
  expect(app.audit(response)).toMatchObject([{ principal: { id: 'client:sw-agent', name: 'Sales agent', clientId: 'sw-agent' } }]);
});

test('a dry run that removes the project from a client changes its replayed agent call', async () => {
  using app = await setup();
  const response = await app.call(await app.token());
  expect(response.status).toBe(200);
  const [entry] = app.audit(response);
  // The call passed through a readable project, which the audit records for replay.
  expect(entry.resource).toEqual({ type: 'project', project: 'sales-contracts' });
  const config = openAdminRepository({ root: app.fixture.root }).load();
  const next = structuredClone(config);
  next.agents.clients[0].projects = [];
  const options = {
    mode: 'server' as const,
    config,
    bootstrap: { emails: [], ids: [] },
    groupMatch: 'exact' as const,
    knownProjects: () => [...AUTH_PROJECTS],
  };
  const result = compareAccess(options, next, { users: [], audit: [entry] });
  expect(result.auditCases).toBe(1);
  expect(result.changed).toMatchObject([{ case: entry.requestId, before: true, after: false }]);
});
