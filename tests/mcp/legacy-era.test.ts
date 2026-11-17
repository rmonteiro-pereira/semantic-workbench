// A client of the earlier protocol era is served request and response from the same definitions, with no sessions.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startLocalServer, type LocalServer } from './helpers/local-server';

let server: LocalServer;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
});
afterAll(async () => {
  await server.close();
});

async function legacy(body: unknown, method = 'POST') {
  const response = await fetch(server.endpoint, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${server.capability()}` },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, text: await response.text(), headers: response.headers };
}

test('C14 initialize, list and call work without a session and GET and DELETE are refused', async () => {
  const initialize = await legacy({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'old-client', version: '1' } } });
  expect(initialize.status).toBe(200);
  expect(initialize.text).toContain('tools');
  expect(initialize.headers.get('mcp-session-id')).toBeNull();
  const listed = await legacy({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  expect(listed.status).toBe(200);
  expect(listed.text).toContain('list_projects');
  const called = await legacy({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_projects', arguments: {} } });
  expect(called.status).toBe(200);
  expect(called.text).toContain('mapped-commerce');
  expect((await legacy({}, 'GET')).status).toBe(405);
  expect((await legacy({}, 'DELETE')).status).toBe(405);
});
