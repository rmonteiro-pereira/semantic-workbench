// Effects constrain real operation dispatch in addition to the role's permissions.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { localPrincipal } from '../../src/server/auth/principal';
import { scopeAllows } from '../../src/server/auth/connection-scope';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { createAccessControl } from '../../src/server/auth/authorize';
import { accessFixture, person } from './access-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { authWorkspace } from '../helpers/auth-workspace';

test('connection effects restrict dynamic pushes and static publish before mutation', async () => {
  using fixture = await authWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'scope-audit') });
  const handler = createHandler(fixture.ws, { audit });
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp', scope: ['read', 'commit'] });
  const commit = buildTwinRequest('git.commit', { params: { slug: 'sales-contracts' }, body: { message: 'Scoped commit', push: true } });
  const result = await handler.boundary.operate({ caller, request: commit });
  expect(result.response.status).toBe(403);
  expect(await result.response.json()).toMatchObject({ rule: 'connection-scope' });
  const publish = buildTwinRequest('git.publish', { params: { slug: 'sales-contracts' }, body: {} });
  expect((await handler.boundary.operate({ caller, request: publish })).response.status).toBe(403);
  const records = audit.recent(10);
  expect(records).toHaveLength(2);
  expect(records.map(record => record.action)).toEqual(['commit', 'publish']);
  expect(records.every(record => record.reason === 'connection-scope')).toBe(true);
  expect(scopeAllows(undefined, ['remote', 'publish'])).toBe(true);
  expect(scopeAllows(['remote'], ['remote', 'publish'])).toBe(false);
  expect(scopeAllows([], [])).toBe(true);
});

test('an unrestricted connection cannot grant an action the role refuses', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('alice'));
  const handler = createHandler(fixture.ws, { mode: 'server', remoteCredentials: allowEveryRemote(), access, principal: () => principal });
  const caller = mintCaller({ principal, origin: 'mcp', scope: ['read', 'administration'] });
  const request = buildTwinRequest('projects.create', { params: {}, body: { name: 'Forbidden', domain: 'hr' } });
  expect((await handler.boundary.operate({ caller, request })).response.status).toBe(403);
});

import { createAccessMiddleware } from '../../src/server/auth/middleware';
import type { OperationEffect } from '../../src/server/auth/operation-inventory';

test('read-only computations and local default-branch merges use their actual effects', async () => {
  using fixture = await authWorkspace();
  let runs = 0;
  const adapter = createAccessMiddleware(
    fixture.ws,
    {},
    () => null,
    async () => {
      runs++;
      return Response.json({ ran: true });
    },
  );
  const cases: { id: string; scope: OperationEffect[]; params: Record<string, string> }[] = [
    { id: 'agent.plan.run', scope: ['read'], params: {} },
    { id: 'projects.metrics.preview.run', scope: ['read'], params: { slug: 'sales-contracts' } },
    { id: 'projects.kpis.preview.run', scope: ['read'], params: { slug: 'sales-contracts' } },
    { id: 'git.pull.default', scope: ['localWrite'], params: { slug: 'sales-contracts' } },
  ];
  for (const entry of cases) {
    const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp', scope: [...entry.scope] });
    expect(adapter.boundary.availableOperations(caller), entry.id).toContain(entry.id);
    const request = buildTwinRequest(entry.id, { params: entry.params, body: {} });
    expect((await adapter.boundary.operate({ caller, request })).response.status, entry.id).toBe(200);
  }
  expect(runs).toBe(cases.length);
  const localOnly = mintCaller({ principal: localPrincipal(), origin: 'mcp', scope: ['localWrite'] });
  expect(adapter.boundary.availableOperations(localOnly)).not.toContain('git.pull');
});
