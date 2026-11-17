// Protocol conformance rows of the contract, through the mounted route with raw requests and the reference client.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { startLocalServer, type LocalServer } from './helpers/local-server';

let server: LocalServer;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
});
afterAll(async () => {
  await server.close();
});

test('C1 discovery answers with tools only and C7 carries result metadata', async () => {
  const answer = await server.raw({ method: 'server/discover' });
  expect(answer.status).toBe(200);
  const result = (answer.json as { result: Record<string, any> }).result;
  expect(result.supportedVersions).toEqual(['2026-07-28']);
  expect(Object.keys(result.capabilities)).toEqual(['tools']);
  expect(result.resultType).toBe('complete');
  expect(result.cacheScope).toBe('private');
});

test('C2 and C3 missing or disagreeing headers are refused with -32020', async () => {
  const missing = await server.raw({ method: 'tools/list' }, { 'mcp-method': '' });
  expect(missing.status).toBe(400);
  expect((missing.json as any).error.code).toBe(-32020);
  const disagreeing = await server.raw({ method: 'tools/list' }, { 'mcp-method': 'tools/call' });
  expect(disagreeing.status).toBe(400);
  expect((disagreeing.json as any).error.code).toBe(-32020);
});

test('C4 an unsupported revision lists the supported one', async () => {
  const answer = await server.raw({ method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } }, { 'mcp-protocol-version': '2099-01-01' });
  expect(answer.status).toBe(400);
  expect((answer.json as any).error.code).toBe(-32022);
  expect((answer.json as any).error.data.supported).toEqual(['2026-07-28']);
});

test('C5 and C16 unknown methods, resources, prompts and subscriptions answer -32601', async () => {
  for (const method of ['bogus/method', 'resources/list', 'prompts/list', 'subscriptions/listen']) {
    const answer = await server.raw({ method });
    expect(answer.status, method).toBe(404);
    expect((answer.json as any).error.code, method).toBe(-32601);
  }
});

test('C6 a body without the client envelope is refused with -32602', async () => {
  const response = await fetch(server.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${server.capability()}`, 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  expect(response.status).toBe(400);
  expect(((await response.json()) as any).error.code).toBe(-32602);
});

test('C8 and C15 the list is sorted, stable and carries the contract hints', async () => {
  const first = await server.raw({ method: 'tools/list' });
  const second = await server.raw({ method: 'tools/list' });
  expect(first.text).toBe(second.text);
  const tools = (first.json as any).result.tools as { name: string; annotations: Record<string, boolean>; inputSchema: { additionalProperties: boolean } }[];
  expect(tools.map(tool => tool.name)).toEqual(TOOLS.map(tool => tool.name));
  expect((first.json as any).result.cacheScope).toBe('private');
  for (const tool of tools) {
    const definition = TOOLS.find(candidate => candidate.name === tool.name)!;
    expect(tool.annotations.readOnlyHint, tool.name).toBe(definition.hints.readOnly);
    expect(tool.annotations.destructiveHint, tool.name).toBe(definition.hints.destructive);
    expect(tool.annotations.idempotentHint, tool.name).toBe(definition.hints.idempotent);
    expect(tool.annotations.openWorldHint, tool.name).toBe(definition.hints.openWorld);
    expect(tool.inputSchema.additionalProperties).toBe(false);
  }
});

test('C10 a notification is acknowledged without a body', async () => {
  const answer = await server.raw({ method: 'notifications/initialized', id: undefined });
  expect(answer.status).toBe(202);
  expect(answer.text).toBe('');
});

test('C12 invalid input is a tool error naming the field', async () => {
  const answer = await server.raw({ method: 'tools/call', params: { name: 'read_file', arguments: { project: 'x' } } });
  const result = (answer.json as any).result;
  expect(result.isError).toBe(true);
  expect(result.structuredContent.error).toMatchObject({ code: 'invalid_input', details: { field: 'path' } });
  const extra = await server.raw({ method: 'tools/call', params: { name: 'list_projects', arguments: { surprise: 1 } } });
  expect((extra.json as any).result.structuredContent.error.details.field).toBe('surprise');
});

test('C13 a header naming a read tool with a body naming a write tool is refused before dispatch', async () => {
  const answer = await server.raw({ method: 'tools/call', params: { name: 'delete_file', arguments: {} } }, { 'mcp-name': 'read_file' });
  expect(answer.status).toBe(400);
  expect((answer.json as any).error.code).toBe(-32020);
});

test('a reference client lists and calls tools through the route', async () => {
  const client = await server.connect();
  const listed = await client.listTools();
  expect(listed.tools).toHaveLength(21);
  const called = (await client.callTool({ name: 'list_projects', arguments: {} })) as any;
  expect(called.structuredContent.data.items[0].project).toBe('mapped-commerce');
  const discovered = await client.getServerCapabilities();
  expect(discovered).toBeDefined();
});

test('no response sets or requires a session id', async () => {
  const answer = await server.raw({ method: 'server/discover' });
  expect(answer.headers.get('mcp-session-id')).toBeNull();
});
