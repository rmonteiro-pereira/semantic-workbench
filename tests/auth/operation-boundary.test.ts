// Structural identity copies must not acquire authenticated caller provenance.
import { expect, test, spyOn } from 'bun:test';
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

import { operationClassifiers } from '../../src/server/auth/operation-classifiers';
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
    { path: '/api/projects/fixture/git/stage', method: 'POST', operationId: 'git.unstage' },
    { path: '/api/projects', operationId: 'unknown.operation' },
    { path: '/api/projects', operationId: 'files.read' },
  ];
  for (const entry of cases) {
    const result = await boundary.operate({ caller, request: new Request('http://operation.internal' + entry.path, { method: entry.method ?? 'GET' }), operationId: entry.operationId });
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
  for (const connection of ['first', 'second']) {
    const origin = 'mcp' as const;
    const caller = mintCaller({ principal: localPrincipal(), origin, connection: connection + '_connection' });
    expect((await handler.boundary.operate({ caller, request: request() })).response.status).toBe(200);
    expect(audit.recent(10).at(-1)).toMatchObject({ origin, tool: 'projects.list', connection: connection + '_connection', decision: 'allow', outcome: 'ok' });
  }
  expect(audit.recent(10)).toHaveLength(2);
});

import { hiddenResponses } from '../../src/server/request';
import { MAX_CLASSIFIED_RESPONSE_BYTES } from '../../src/server/auth/operation-outcome';

test('semantic outcomes classify bounded copies after hidden responses and preserve the original body', async () => {
  using fixture = await testWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'outcomes') });
  const access = createAccessControl({ ...accessFixture(), mode: 'local' });
  const body = { path: 'saved.yaml', hash: 'saved-hash', demoted: ['dependent.yaml'] };
  let response = Response.json(body);
  const boundary = createOperationBoundary(fixture.ws, { mode: 'server', audit, access }, async () => response);
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp' });
  const classifier = spyOn(operationClassifiers, 'fileSave');
  const invoke = () => boundary.operate({ caller, request: buildTwinRequest('files.save', { params: { slug: 'sales-metrics', '*': 'saved.yaml' }, body: {} }) });
  try {
    expect(await (await invoke()).response.json()).toEqual(body);
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
    expect(classifier).toHaveBeenCalledTimes(1);
  } finally {
    classifier.mockRestore();
  }
});

import * as operationMetrics from '../../src/server/observability/metrics';

test('a metric exporter failure cannot change the success of a completed write', async () => {
  using workspace = await testWorkspace();
  const handler = createHandler(workspace.ws);
  const metric = spyOn(operationMetrics, 'recordOperation').mockImplementation(() => {
    throw new Error('Exporter unavailable');
  });
  try {
    const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp' });
    const request = buildTwinRequest('projects.create', { params: {}, body: { name: 'Completed write' } });
    const result = await handler.boundary.operate({ caller, request });
    expect(result.response.status).toBe(200);
    expect(metric).toHaveBeenCalledTimes(1);
    expect(workspace.ws.state.registry().projects.some(project => project.name === 'Completed write')).toBe(true);
  } finally {
    metric.mockRestore();
  }
});
