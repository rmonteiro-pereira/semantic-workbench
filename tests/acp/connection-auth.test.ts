// A panel caller is minted only here, carries origin acp, and its scope refuses every effect except read and local write.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { assertMinted, type Caller } from '../../src/server/auth/caller';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { mintAcpCaller, narrowToPanelEffects } from '../../src/server/acp/connection-auth';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';

async function boundary() {
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(fixture.root, 'panel-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: 'http://localhost:5312', port: 5312, remoteCredentials: allowEveryRemote() });
  return { fixture, handler, principal, audit };
}

test('the caller carries origin acp, the connection and a scope narrowed to read and local write', async () => {
  const { fixture, principal } = await boundary();
  using _fixture = fixture;
  const caller = mintAcpCaller({ principal, connection: 'acp-abc', scope: ['read', 'localWrite', 'commit', 'publish', 'administration'] });
  expect(() => assertMinted(caller)).not.toThrow();
  expect(caller.origin).toBe('acp');
  expect(caller.connection).toBe('acp-abc');
  expect(caller.scope).toEqual(['read', 'localWrite']);
  expect(narrowToPanelEffects(['commit'])).toEqual([]);
});

test('a caller written as a literal, not minted, is refused by the boundary', async () => {
  const { fixture, handler, principal } = await boundary();
  using _fixture = fixture;
  const literal: Caller = { principal, origin: 'acp', connection: 'acp-abc', scope: ['read'] };
  const request = buildTwinRequest('projects.list', { params: {} });
  await expect(handler.boundary.operate({ caller: literal, request })).rejects.toThrow('not minted');
});

test('reading and saving work and a commit is refused by the scope even for an admin', async () => {
  const { fixture, handler, principal, audit } = await boundary();
  using _fixture = fixture;
  const caller = mintAcpCaller({ principal, connection: 'acp-abc', scope: ['read', 'localWrite', 'commit'] });
  const read = await handler.boundary.operate({ caller, request: buildTwinRequest('files.read', { params: { slug: 'sales-contracts', '*': 'orders.odcs.yaml' } }) });
  expect(read.response.status).toBe(200);
  const commit = await handler.boundary.operate({
    caller,
    request: buildTwinRequest('git.commit', { params: { slug: 'sales-contracts' }, body: { message: 'Not allowed', paths: ['orders.odcs.yaml'] } }),
  });
  expect(commit.response.status).toBeGreaterThanOrEqual(400);
  expect(audit.recent(5).some(entry => entry.origin === 'acp' && entry.decision === 'deny')).toBe(true);
});
