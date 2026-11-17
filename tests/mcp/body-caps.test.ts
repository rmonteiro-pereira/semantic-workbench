// Request caps are enforced while the body streams: the global cap, the per-tool cap from the tool name, and a body that lies about its length.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { DEFAULT_TOOL_REQUEST_CAP_BYTES, GLOBAL_REQUEST_CAP_BYTES } from '../../src/server/mcp/body-limits';
import { startLocalServer, type LocalServer } from './helpers/local-server';

let server: LocalServer;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
}, 120_000);
afterAll(async () => {
  await server.close();
});

const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'caps', version: '1' } };

function toolCall(name: string, padding: number) {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { project: 'mapped-commerce', path: 'x'.repeat(padding) }, _meta: meta } });
}

function post(body: string | ReadableStream<Uint8Array>, headers: Record<string, string>) {
  return fetch(server.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${server.capability()}`,
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      ...headers,
    },
    body,
    // Bun streams a ReadableStream body without a declared length.
    ...(typeof body === 'string' ? {} : { duplex: 'half' }),
  } as RequestInit);
}

test('a declared length over the global cap is refused before the body is read', async () => {
  const response = await post('x'.repeat(GLOBAL_REQUEST_CAP_BYTES + 1), { 'mcp-name': 'save_file' });
  expect(response.status).toBe(413);
});

test('the cap of the named tool applies, and a larger tool may carry more', async () => {
  const large = toolCall('read_file', DEFAULT_TOOL_REQUEST_CAP_BYTES + 100);
  expect((await post(large, { 'mcp-name': 'read_file' })).status).toBe(413);
  const bigButFine = toolCall('save_file', DEFAULT_TOOL_REQUEST_CAP_BYTES + 100);
  expect((await post(bigButFine, { 'mcp-name': 'save_file' })).status).not.toBe(413);
});

test('a client with no tool name is checked again after parsing', async () => {
  const response = await post(toolCall('read_file', DEFAULT_TOOL_REQUEST_CAP_BYTES + 100), { 'mcp-name': '' });
  expect(response.status).toBe(413);
});

test('a body that lies about its length is cut off at the cap', async () => {
  const chunk = new TextEncoder().encode('y'.repeat(65_536));
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent > DEFAULT_TOOL_REQUEST_CAP_BYTES * 4) return controller.close();
      sent += chunk.length;
      controller.enqueue(chunk);
    },
  });
  const response = await post(stream, { 'mcp-name': 'read_file' });
  expect(response.status).toBe(413);
});
