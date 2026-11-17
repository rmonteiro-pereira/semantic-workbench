// The standard-input bridge derives the mirrored headers, explains both failure cases, follows a rotation and never prints the capability.
import { expect, test } from 'bun:test';
import { answerLines, BRIDGE_TIMEOUT_MS, bridgeError, deliver, mirroredHeaders } from '../../scripts/mcp-stdio';
import { startLocalServer } from './helpers/local-server';

const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'bridge-test', version: '1' } };
const message = (id: number, method: string, params: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: meta } });

test('header derivation follows the message', () => {
  expect(mirroredHeaders(JSON.parse(message(1, 'tools/call', { name: 'read_file' })))).toEqual({ 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'read_file' });
  expect(mirroredHeaders(JSON.parse(message(1, 'tools/list')))).toEqual({ 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' });
  expect(mirroredHeaders({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).toEqual({});
  expect(bridgeError({ method: 'notifications/initialized' }, 'x')).toBeNull();
  expect(answerLines('text/event-stream', 'event: message\ndata: {"a":1}\n\n')).toEqual(['{"a":1}']);
});

test('a stopped workbench and server mode each get a clear answer', async () => {
  const stopped = await deliver(
    message(1, 'tools/list'),
    1,
    () => 'capability',
    () => Promise.reject(new Error('refused')),
  );
  expect(JSON.parse(stopped[0]).error.message).toContain('not running');
  const serverMode = await deliver(
    message(2, 'tools/list'),
    4310,
    () => 'capability',
    async () => new Response('Not found', { status: 404 }),
  );
  expect(JSON.parse(serverMode[0]).error.message).toContain('server mode');
  const noFile = await deliver(message(3, 'tools/list'), 4310, () => {
    throw new Error('missing');
  });
  expect(JSON.parse(noFile[0]).error.message).toContain('local mode');
});

test('the bridge process answers messages, follows a rotation and prints no capability', async () => {
  const server = await startLocalServer({ examples: ['mapped-commerce'] });
  try {
    const process_ = Bun.spawn(['bun', 'scripts/mcp-stdio.ts'], { env: { ...process.env, DATA_DIR: server.root, SW_PORT: String(server.port) }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const before = server.capability();
    process_.stdin.write(message(1, 'server/discover') + '\n');
    process_.stdin.write(message(2, 'tools/call', { name: 'list_projects', arguments: {} }) + '\n');
    await process_.stdin.flush();
    await Bun.sleep(1500);
    server.rotate();
    process_.stdin.write(message(3, 'tools/call', { name: 'list_projects', arguments: {} }) + '\n');
    await process_.stdin.flush();
    await Bun.sleep(1500);
    process_.stdin.end();
    const output = await new Response(process_.stdout).text();
    const errors = await new Response(process_.stderr).text();
    const answers = output
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(answers.map(answer => answer.id).sort()).toEqual([1, 2, 3]);
    expect(answers.find(answer => answer.id === 3).result.structuredContent.ok).toBe(true);
    for (const text of [output, errors]) {
      expect(text).not.toContain(before);
      expect(text).not.toContain(server.capability());
    }
  } finally {
    await server.close();
  }
});

test('a workbench that never answers ends the request with a clear error after the timeout', async () => {
  const hanging = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  const answered = await deliver(message(7, 'tools/list'), 4310, () => 'capability', hanging, 50);
  expect(JSON.parse(answered[0]).error.message).toContain('did not answer in time');
  expect(BRIDGE_TIMEOUT_MS).toBeGreaterThan(30_000);
});
