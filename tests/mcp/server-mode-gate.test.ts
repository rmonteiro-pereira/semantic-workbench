import { afterEach, expect, test } from 'bun:test';
import { decideServerRequest } from '../../src/server/mcp/server-mode-gate';
import type { GateRequest } from '../../src/server/mcp/request-gate';
import { openConnectionServer, type ConnectionServer } from '../helpers/connection-server';

const servers: ConnectionServer[] = [];
afterEach(() => servers.splice(0).forEach(server => server.close()));
const valid: GateRequest = { method: 'POST', origin: null, host: null, contentType: 'application/json', authorization: 'Bearer ' + 'x'.repeat(43) };

test('transport checks stop before connection lookup in the required order', async () => {
  let lookups = 0;
  const service = {
    resolve: async () => {
      lookups++;
      return { ok: false as const };
    },
  };
  const cases = [
    { change: { method: 'GET', origin: 'null' }, status: 405 },
    { change: { origin: '', contentType: 'text/plain' }, status: 403 },
    { change: { contentType: 'text/plain', authorization: null }, status: 415 },
    { change: { authorization: 'Bearer not-a-token' }, status: 401 },
  ];
  for (const entry of cases) {
    expect(await decideServerRequest({ ...valid, ...entry.change }, service)).toMatchObject({ allow: false, status: entry.status });
  }
  expect(lookups).toBe(0);
  expect(await decideServerRequest(valid, service)).toMatchObject({ allow: false, status: 401 });
  expect(lookups).toBe(1);
});

async function open() {
  const server = await openConnectionServer();
  servers.push(server);
  return server;
}

function request(server: ConnectionServer, headers: Record<string, string>) {
  return server.handler(
    new Request(server.resource, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
}

test('server MCP ignores cookies and gives identical empty challenges for every invalid credential', async () => {
  const server = await open();
  const { cookie, tokens } = await server.connect('alice', 'read');
  for (const authorization of ['', 'Bearer invalid', 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.signature', 'Bearer ' + 'x'.repeat(43)]) {
    const response = await request(server, { Cookie: cookie, Authorization: authorization });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${server.origin}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  }
  const response = await request(server, { Authorization: 'Bearer ' + tokens.access_token });
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain('list_projects');
  expect(body).not.toContain('save_file');
  const browser = await request(server, { Authorization: 'Bearer ' + tokens.access_token, Origin: server.origin });
  expect(browser.status).toBe(403);
  const wrongResource = await server.get('/api/agent/catalog', { Authorization: 'Bearer ' + tokens.access_token, Cookie: cookie });
  expect(wrongResource.status).toBe(401);
}, 30000);
