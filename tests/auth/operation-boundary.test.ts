// Structural identity copies must not acquire authenticated caller provenance.
import { expect, test } from 'bun:test';
import { assertMinted, mintCaller, type Caller } from '../../src/server/auth/caller';
import { localPrincipal } from '../../src/server/auth/principal';

test('only the minted caller has authenticated provenance', () => {
  const identity: Caller = { principal: localPrincipal(), origin: 'http' };
  const caller = mintCaller(identity);
  expect(() => assertMinted(caller)).not.toThrow();
  expect(() => assertMinted(identity)).toThrow('not minted');
  expect(() => assertMinted({ ...caller })).toThrow('not minted');
  expect(() => assertMinted(structuredClone(caller))).toThrow('not minted');
  expect(() => assertMinted({ principal: localPrincipal(), origin: 'http' })).toThrow('not minted');
  expect(Object.isFrozen(caller)).toBe(true);
});

import { createOperationBoundary } from '../../src/server/auth/operation-boundary';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { join } from 'node:path';
import { testWorkspace } from '../helpers/temp-data-dir';
import { accessFixture } from './access-fixture';

test('twins refuse forged callers, transport routes and a different named row before handlers run', async () => {
  using workspace = await testWorkspace();
  const audit = createAuditLog({ dir: join(workspace.root, 'boundary-audit') });
  let runs = 0;
  const boundary = createOperationBoundary(
    workspace.ws,
    {
      access: createAccessControl({ ...accessFixture(), mode: 'local' }),
      audit,
    },
    async () => {
      runs++;
      return Response.json({ ran: true });
    },
  );
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp' });
  await expect(boundary.operate({ caller: { ...caller }, request: new Request('http://operation.internal/api/projects') })).rejects.toThrow('not minted');
  const cases = [
    { path: '/healthz' },
    { path: '/api/events' },
    { path: '/catalog' },
    { path: '/api/me' },
    { path: '/api/projects/fixture/git/stage', method: 'POST', operation: 'git.unstage' },
    { path: '/api/projects', operation: 'unknown.operation' },
    { path: '/api/projects', tool: 'files.read' },
  ];
  for (const entry of cases) {
    const result = await boundary.operate({ caller, request: new Request('http://operation.internal' + entry.path, { method: entry.method ?? 'GET' }), operation: entry.operation, tool: entry.tool });
    expect(result.response.status, entry.path).toBe(404);
    expect(await result.response.json()).toEqual({ error: 'Not found.' });
  }
  expect(runs).toBe(0);
  expect(audit.entries(new Date().toISOString().slice(0, 7))).toHaveLength(cases.length);
});

import { createHandler } from '../../src/server/handler';
import { buildTwinRequest } from '../../src/server/auth/twin-request';

test('each non-HTTP read records its actual operation and connection exactly once', async () => {
  using fixture = await testWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'read-origins') });
  const handler = createHandler(fixture.ws, { audit });
  const request = () => buildTwinRequest('projects.list', { params: {} });
  expect((await handler(new Request('http://localhost/api/projects'))).status).toBe(200);
  expect(audit.recent(10)).toEqual([]);
  for (const origin of ['mcp', 'acp'] as const) {
    const caller = mintCaller({ principal: localPrincipal(), origin, connection: origin + '_connection' });
    expect((await handler.boundary.operate({ caller, request: request() })).response.status).toBe(200);
    expect(audit.recent(10).at(-1)).toMatchObject({ origin, tool: 'projects.list', connection: origin + '_connection', decision: 'allow', outcome: 'ok' });
  }
  expect(audit.recent(10)).toHaveLength(2);
});

import { hiddenResponses } from '../../src/server/request';
import { MAX_CLASSIFIED_RESPONSE_BYTES } from '../../src/server/auth/operation-outcome';

test('semantic outcomes classify bounded copies after hidden responses and preserve the original body', async () => {
  using fixture = await testWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'outcomes') });
  const access = createAccessControl({ ...accessFixture(), mode: 'local' });
  let response = Response.json({ ok: false });
  const boundary = createOperationBoundary(fixture.ws, { mode: 'server', audit, access }, async () => response);
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp' });
  let calls = 0;
  const classifier = async (copy: Response) => {
    calls++;
    return (await copy.json()).ok === true ? ('ok' as const) : ('degraded' as const);
  };
  const invoke = () => boundary.operate({ caller, request: buildTwinRequest('projects.list', { params: {} }), outcome: classifier });
  expect(await (await invoke()).response.json()).toEqual({ ok: false });
  expect(audit.recent(10).at(-1)?.outcome).toBe('degraded');
  response = new Response('event', { headers: { 'Content-Type': 'text/event-stream' } });
  await invoke();
  expect(audit.recent(10).at(-1)?.outcome).toBe('failed');
  response = new Response('x'.repeat(MAX_CLASSIFIED_RESPONSE_BYTES + 1));
  const oversized = await invoke();
  expect((await oversized.response.text()).length).toBe(MAX_CLASSIFIED_RESPONSE_BYTES + 1);
  expect(audit.recent(10).at(-1)?.outcome).toBe('failed');
  response = Response.json({ secret: 'hidden' });
  hiddenResponses.add(response);
  expect((await invoke()).response.status).toBe(404);
  expect(audit.recent(10).at(-1)).toMatchObject({ decision: 'deny', reason: 'not-readable' });
  expect(calls).toBe(1);
});

test('protocol discovery, listing, subscription lifecycle and denial each record once', async () => {
  using fixture = await testWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'protocol') });
  const handler = createHandler(fixture.ws, { audit });
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp', connection: 'protocol_connection' });
  for (const method of ['discover', 'tools/list', 'resources/subscribe', 'subscriptions/listen'] as const) {
    handler.boundary.recordProtocolCall({ caller, method, decision: 'allow', outcome: 'ok' });
  }
  handler.boundary.recordProtocolCall({ caller, method: 'tools/list', decision: 'deny', reason: 'no-grant', outcome: 'refused' });
  const records = audit.recent(100);
  expect(records).toHaveLength(5);
  expect(records.every(entry => entry.origin === 'mcp' && entry.connection === 'protocol_connection' && entry.action === 'protocol')).toBe(true);
  expect(records.at(-1)).toMatchObject({ decision: 'deny', reason: 'no-grant' });
  expect(() => handler.boundary.recordProtocolCall({ caller: { ...caller }, method: 'tools/list', decision: 'allow', outcome: 'ok' })).toThrow('not minted');
});
