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
