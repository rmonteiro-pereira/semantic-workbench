// The panel has routes and a menu flag only when its prerequisites exist: the local capability, or in server mode the connection service.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { CAPABILITY_FILE, openLocalCapability } from '../../src/server/mcp/local-capability';
import { testDoubleConnections } from './helpers/connection-double';
import { authWorkspace } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { testWorkspace } from '../helpers/temp-data-dir';
import { accessFixture, person } from '../auth/access-fixture';

const sameOrigin = { 'sec-fetch-site': 'same-origin', 'x-sw-request': '1', 'content-type': 'application/json' };
const local = (path: string, init: RequestInit = {}) => new Request('http://localhost' + path, { headers: sameOrigin, ...init });

test('local mode without the capability has no panel routes and no menu flag', async () => {
  using workspace = await testWorkspace();
  const handler = createHandler(workspace.ws, { port: 4310 });
  expect((await handler(local('/api/acp/sessions', { method: 'POST', body: '{}' }))).status).toBe(404);
  expect((await handler(local('/api/acp/relay/x/hello', { method: 'POST', body: '{}' }))).status).toBe(404);
  expect(((await (await handler(local('/api/me'))).json()) as { agentPanel: boolean }).agentPanel).toBe(false);
  expect((handler as unknown as { agentPanel?: unknown }).agentPanel).toBeUndefined();
});

test('local mode with the capability has the routes and the flag', async () => {
  using workspace = await testWorkspace();
  const opened = openLocalCapability(join(workspace.root, 'state', CAPABILITY_FILE));
  if (!opened.ok) throw new Error(opened.reason);
  const handler = createHandler(workspace.ws, { port: 4310, mcp: { capability: opened.capability } });
  expect(((await (await handler(local('/api/me'))).json()) as { agentPanel: boolean }).agentPanel).toBe(true);
  expect((await handler(local('/api/acp/sessions', { method: 'POST', body: '{}' }))).status).toBe(201);
});

async function serverHandler(withConnections: boolean) {
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person('dave'));
  const audit = createAuditLog({ dir: join(fixture.root, 'mount-audit') });
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    access,
    audit,
    principal: () => principal,
    publicOrigin: 'https://workbench.test',
    port: 5312,
    remoteCredentials: allowEveryRemote(),
    ...(withConnections ? { acp: { connections: testDoubleConnections().directory } } : {}),
  });
  return { fixture, handler };
}
const server = (path: string, init: RequestInit = {}) => new Request('https://workbench.test' + path, { headers: { ...sameOrigin, Origin: 'https://workbench.test' }, ...init });

test('server mode without the connection service has no panel', async () => {
  const { fixture, handler } = await serverHandler(false);
  using _fixture = fixture;
  expect((await handler(server('/api/acp/sessions', { method: 'POST', body: '{}' }))).status).toBe(404);
  expect(((await (await handler(server('/api/me'))).json()) as { agentPanel: boolean }).agentPanel).toBe(false);
});

test('server mode with the connection service has the panel', async () => {
  const { fixture, handler } = await serverHandler(true);
  using _fixture = fixture;
  expect(((await (await handler(server('/api/me'))).json()) as { agentPanel: boolean }).agentPanel).toBe(true);
});
