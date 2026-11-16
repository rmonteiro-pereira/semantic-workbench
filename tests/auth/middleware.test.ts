// Exercises request identity, existence hiding, and audit outcomes through the real handler.
import { expect, test, spyOn } from 'bun:test';
import { join } from 'node:path';
import { createAccessMiddleware, shouldAudit } from '../../src/server/auth/middleware';
import { routeFor } from '../../src/server/auth/route-actions';
import { createHandler } from '../../src/server/handler';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture } from './access-fixture';
import { localPrincipal } from '../../src/server/auth/principal';
import { testWorkspace } from '../helpers/temp-data-dir';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';

test('local reads preserve responses and request ids without audit entries', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const handler = createHandler(workspace.ws, { audit });
  const response = await handler(new Request('http://localhost/api/projects'));
  expect(response.status).toBe(200);
  expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(audit.entries(new Date().toISOString().slice(0, 7))).toEqual([]);
  expect((await handler(new Request('http://localhost/api/unmapped'))).status).toBe(404);
});
test('missing identities require sign-in and denied targets are audited with hidden existence', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const anonymous = createHandler(workspace.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    audit,
  });
  expect((await anonymous(new Request('http://localhost/api/projects'))).status).toBe(401);
  const explicit = createHandler(workspace.ws, { principal: () => null, audit });
  expect((await explicit(new Request('http://localhost/api/projects'))).status).toBe(401);
  const principal = { ...localPrincipal(), kind: 'person' as const, id: 'person', grants: [] };
  const handler = createHandler(workspace.ws, { principal: () => principal, audit });
  for (const [path, status] of [
    ['/api/projects', 403],
    ['/api/projects/missing/files/a.yaml', 404],
  ] as const) {
    const response = await handler(new Request('http://localhost' + path));
    expect(response.status).toBe(status);
    const entry = audit.entries(new Date().toISOString().slice(0, 7)).at(-1)!;
    expect(entry.decision).toBe('deny');
    expect(entry.requestId).toBe(response.headers.get('X-Request-Id')!);
  }
});
test('allowed writes record the operation outcome even when input is refused', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const handler = createHandler(workspace.ws, { audit });
  const response = await handler(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  expect(response.status).toBe(400);
  expect(audit.entries(new Date().toISOString().slice(0, 7))[0]).toMatchObject({
    decision: 'allow',
    outcome: 'failed',
    principal: { id: 'local' },
  });
});

test('immutable redirect headers preserve the response and receive a request id', async () => {
  using workspace = await testWorkspace();
  const handler = createAccessMiddleware(
    workspace.ws,
    {},
    () => null,
    async () => Response.redirect('https://example.org/next', 307),
  );
  const response = await handler(new Request('http://localhost/api/projects'));
  expect(response.status).toBe(307);
  expect(response.headers.get('Location')).toBe('https://example.org/next');
  expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
});

test('server writes require a configured origin and request marker before routing', async () => {
  using workspace = await testWorkspace();
  const access = createAccessControl({ ...accessFixture(), mode: 'local' });
  let calls = 0;
  const run = async () => {
    calls++;
    return new Response('done');
  };
  for (const [publicOrigin, origin, marker, status] of [
    [undefined, 'https://workbench.example', '1', 403],
    ['https://workbench.example', undefined, '1', 403],
    ['https://workbench.example', 'https://evil.example', '1', 403],
    ['https://workbench.example', 'https://workbench.example', undefined, 403],
    ['https://workbench.example', 'https://workbench.example', '0', 403],
    ['https://workbench.example', 'https://workbench.example', '1', 200],
  ] as const) {
    const handler = createAccessMiddleware(workspace.ws, { mode: 'server', publicOrigin, principal: localPrincipal, access }, () => null, run);
    const headers = new Headers();
    if (origin) headers.set('Origin', origin);
    if (marker) headers.set('X-SW-Request', marker);
    const response = await handler(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers,
      }),
    );
    expect(response.status).toBe(status);
  }
  expect(calls).toBe(1);
  const handler = createAccessMiddleware(workspace.ws, { mode: 'server', principal: localPrincipal, access }, () => null, run);
  expect((await handler(new Request('http://localhost/api/projects'))).status).toBe(200);
});

test('audit selection includes denials, writes, and allowed agent reads', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  const handler = createHandler(workspace.ws, { audit });
  for (const path of ['/api/agent/catalog', '/api/agent/context']) {
    const row = routeFor('GET', path)!.row;
    expect(row.audited).toBe(true);
    expect(shouldAudit(row, 'GET', 'allow')).toBe(true);
    await handler(new Request('http://localhost' + path));
  }
  const row = routeFor('GET', '/api/projects')!.row;
  expect(shouldAudit(row, 'GET', 'allow')).toBe(false);
  expect(shouldAudit(row, 'GET', 'deny')).toBe(true);
  expect(shouldAudit(row, 'POST', 'allow')).toBe(true);
  expect(audit.entries(new Date().toISOString().slice(0, 7))).toHaveLength(2);
});

test('audit failures preserve completed writes and prevent denied routes from running', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'audit') });
  audit.append = () => {
    throw new Error('disk full');
  };
  let calls = 0;
  const run = async () => {
    calls++;
    return new Response('created', { status: 201 });
  };
  const logging = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const allowed = createAccessMiddleware(workspace.ws, { audit }, () => null, run);
    const response = await allowed(new Request('http://localhost/api/projects', { method: 'POST' }));
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('created');
    expect(logging).toHaveBeenCalledTimes(1);
    expect(logging.mock.calls[0][0]).toContain(response.headers.get('X-Request-Id')!);
    for (const principal of [null, { ...localPrincipal(), kind: 'person' as const, id: 'nobody', grants: [] }]) {
      const denied = createAccessMiddleware(workspace.ws, { audit, principal: () => principal }, () => null, run);
      expect((await denied(new Request('http://localhost/api/projects'))).status).toBe(503);
    }
    expect(calls).toBe(1);
  } finally {
    logging.mockRestore();
  }
});

test('network refusals precede routing and identity decisions', async () => {
  using workspace = await testWorkspace();
  const mode = 'server';
  const access = createAccessControl(accessFixture());
  let runs = 0;
  const run = async () => {
    runs++;
    return Response.json({ reached: true });
  };
  const cases: { name: string; path: string; method: string; headers: Record<string, string>; status: number; body: unknown }[] = [
    { name: 'bearer before cross-site', path: '/api/agent/plan', method: 'POST', headers: { Authorization: 'Bearer invalid' }, status: 401, body: { error: 'sign-in required' } },
    { name: 'cross-site before routing', path: '/api/unmapped', method: 'POST', headers: {}, status: 403, body: 'Forbidden' },
    { name: 'principal before decision', path: '/api/projects', method: 'GET', headers: {}, status: 401, body: { error: 'sign-in required' } },
  ];
  for (const entry of cases) {
    const audit = createAuditLog({ dir: join(workspace.root, entry.name) });
    const handler = createAccessMiddleware(workspace.ws, { mode, access, audit, principal: () => null }, () => null, run);
    const response = await handler(new Request('http://localhost' + entry.path, { method: entry.method, headers: entry.headers }));
    expect(response.status, entry.name).toBe(entry.status);
    const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    expect(body, entry.name).toEqual(entry.body);
  }
  expect(runs).toBe(0);
});

test('client refusal precedes not-found and public routes precede principal resolution', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'order-audit') });
  let resolutions = 0;
  const principal = () => {
    resolutions++;
    return null;
  };
  const handler = createAccessMiddleware(
    workspace.ws,
    {
      mode: 'server',
      audit,
      principal,
      bearer: async () => ({ ...localPrincipal(), kind: 'client', id: 'client:order', clientId: 'order' }),
    },
    () => null,
    async () => new Response('public'),
  );
  const publicResponse = await handler(new Request('http://localhost/auth/style.css'));
  expect(await publicResponse.text()).toBe('public');
  // Rate limiting resolves the identity once before the public route bypasses operation authentication.
  expect(resolutions).toBe(1);
  const client = await handler(new Request('http://localhost/api/agent/unmapped', { headers: { Authorization: 'Bearer valid' } }));
  expect(client.status).toBe(404);
  expect(await client.json()).toEqual({ error: 'Not found.' });
  expect(audit.entries(new Date().toISOString().slice(0, 7)).at(-1)?.reason).toBe('unmapped-route');
});

test('rate limiting precedes bearer and local checks precede route selection', async () => {
  using workspace = await testWorkspace();
  let bearerCalls = 0;
  const limited = createAccessMiddleware(
    workspace.ws,
    {
      mode: 'server',
      principal: () => null,
      requestLimits: { requests: { burst: 0, perSecond: 1 }, signIn: { burst: 0, perSecond: 1 } },
      bearer: async () => {
        bearerCalls++;
        return localPrincipal();
      },
    },
    () => null,
    async () => new Response('ran'),
  );
  const response = await limited(new Request('http://localhost/api/agent/unmapped', { headers: { Authorization: 'Bearer invalid' } }));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('1');
  expect(bearerCalls).toBe(0);
  const local = createAccessMiddleware(
    workspace.ws,
    {},
    () => new Response('local refusal', { status: 403 }),
    async () => new Response('ran'),
  );
  expect(await (await local(new Request('http://localhost/api/unmapped'))).text()).toBe('local refusal');
});
