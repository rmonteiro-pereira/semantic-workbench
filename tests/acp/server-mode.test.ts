// The real authentication assembly binds panel sessions to rotating person connections.
import { expect, spyOn, test } from 'bun:test';
import type { PanelService } from '../../src/server/acp/panel-service';
import { openConnectionServer, referenceProgram } from '../helpers/connection-server';

const relayProgram = { ...referenceProgram, clientId: 'acp-relay', scopes: ['read', 'edit'] as ('read' | 'edit')[] };
type Server = Awaited<ReturnType<typeof openConnectionServer>>;

async function openPanel() {
  let clock = Date.now();
  const server = await openConnectionServer({ programs: [referenceProgram, relayProgram], handlerOptions: { now: () => clock } });
  const service = (server.handler as typeof server.handler & { agentPanel: PanelService }).agentPanel;
  const cookie = await server.signIn('alice');
  const response = await server.json('/api/acp/sessions', 'POST', cookie, {});
  expect(response.status).toBe(201);
  const panel = await response.json();
  const credential = /SW_ACP_CREDENTIAL=([^ ]+)/.exec(panel.command)?.[1];
  if (!credential) throw new Error('Panel did not return a setup credential.');
  const exchange = await server.token({
    grant_type: 'urn:semantic-workbench:grant-type:setup',
    setup_credential: credential,
    client_id: 'acp-relay',
    resource: server.resource,
  });
  expect(exchange.status).toBe(200);
  const tokens = await exchange.json();
  const resolved = await server.auth.connections.service.resolve(tokens.access_token);
  if (!resolved.ok) throw new Error('Relay token did not resolve.');
  return {
    server,
    service,
    cookie,
    panel,
    tokens,
    resolved,
    advance: () => {
      clock += 20;
    },
  };
}

function relay(server: Server, id: string, token: string, action: string, body?: unknown) {
  return server.handler(
    new Request(`${server.origin}/api/acp/relay/${id}/${action}`, {
      method: action === 'stream' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

test('real relay calls keep the browser idle clock unchanged and every relay route rejects an MCP token', async () => {
  const { server, service, cookie, panel, tokens, resolved, advance } = await openPanel();
  try {
    expect(resolved.caller).toMatchObject({ origin: 'acp', scope: ['read', 'localWrite'] });
    const { tokens: mcp } = await server.connect('alice', 'read');
    for (const action of ['hello', 'frames', 'stream', 'bye']) {
      const refused = await relay(server, panel.id, mcp.access_token, action, action === 'stream' ? undefined : { code: panel.code });
      expect(refused.status).toBe(404);
      expect(await refused.text()).toBe('');
    }
    expect((await relay(server, panel.id, tokens.access_token, 'hello', { code: panel.code })).status).toBe(200);
    const reference = resolved.caller.session!.reference!;
    const before = (await server.auth.authentication.sessions.getByReference(reference))!.lastSeenAt;
    const browserReads = spyOn(server.auth.authentication.sessions, 'get');
    for (let index = 0; index < 1_000; index++) {
      advance();
      const request = new Request(`${server.origin}/api/acp/relay/${panel.id}/frames`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: [] }),
      });
      const response = await server.handler(request);
      expect(response.status).toBe(200);
    }
    const touches = browserReads.mock.calls.filter(([, touch]) => touch !== false).length;
    browserReads.mockRestore();
    expect(touches).toBe(0);
    expect((await server.auth.authentication.sessions.getByReference(reference))!.lastSeenAt).toBe(before);
    console.log('Relay idle proof: 1,000 calls; 0 session touches; lastSeenAt unchanged.');
    const listing = await (await server.get('/api/connections', { Cookie: cookie })).json();
    expect(listing).toContainEqual(expect.objectContaining({ id: resolved.connection, origin: 'acp' }));
    expect((await server.json(`/api/connections/${resolved.connection}`, 'DELETE', cookie)).status).toBe(200);
    expect(service.store.findForRelay(panel.id)?.timing.endReason).toBe('revoked');
    expect((await relay(server, panel.id, tokens.access_token, 'frames', { frames: [] })).status).toBe(404);
  } finally {
    service.stopSweeper();
    server.close();
  }
}, 120_000);

test('the MCP endpoint refuses a panel token and refresh preserves its origin', async () => {
  const { server, service, panel, tokens } = await openPanel();
  try {
    const response = await server.handler(
      new Request(server.resource, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    );
    expect(response.status).toBe(401);
    const refreshed = await server.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'acp-relay', resource: server.resource });
    expect(refreshed.status).toBe(200);
    const next = await refreshed.json();
    expect(await server.auth.connections.service.resolve(tokens.access_token)).toEqual({ ok: false });
    expect(await server.auth.connections.service.resolve(next.access_token)).toMatchObject({ ok: true, caller: { origin: 'acp' } });
    expect((await relay(server, panel.id, next.access_token, 'hello', { code: panel.code })).status).toBe(200);
    const replay = await server.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'acp-relay', resource: server.resource });
    expect(replay.status).toBe(400);
    expect(service.store.findForRelay(panel.id)?.timing.endReason).toBe('revoked');
  } finally {
    service.stopSweeper();
    server.close();
  }
}, 30_000);

for (const ending of ['sign-out', 'expired', 'deactivated'] as const) {
  test(`the real connection lifecycle ends the panel after ${ending}`, async () => {
    const { server, service, cookie, panel, tokens, resolved } = await openPanel();
    try {
      expect((await relay(server, panel.id, tokens.access_token, 'hello', { code: panel.code })).status).toBe(200);
      if (ending === 'deactivated') {
        const admin = await server.signIn('dave');
        const path = `/api/admin/users/${encodeURIComponent(resolved.caller.principal.id)}/deactivate`;
        expect((await server.json(path, 'POST', admin, { reason: 'Leave' })).status).toBe(200);
      } else {
        if (ending === 'sign-out') expect((await server.json('/auth/logout', 'POST', cookie, {})).status).toBe(200);
        else {
          server.auth.authentication.sessions.configure({ idleHours: 0, absoluteHours: 0 });
          await server.auth.authentication.sessions.sweep();
        }
      }
      expect(await server.auth.connections.service.resolve(tokens.access_token)).toEqual({ ok: false });
      expect(service.store.findForRelay(panel.id)?.timing.endReason).toBe(ending === 'deactivated' ? 'expired' : ending);
      expect((await relay(server, panel.id, tokens.access_token, 'frames', { frames: [] })).status).toBe(404);
    } finally {
      service.stopSweeper();
      server.close();
    }
  }, 30_000);
}
