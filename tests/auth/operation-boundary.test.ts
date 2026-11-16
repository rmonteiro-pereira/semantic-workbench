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
