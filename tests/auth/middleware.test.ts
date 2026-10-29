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
