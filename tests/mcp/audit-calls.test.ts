// One audit record per call with the protocol fields, a denial for refused requests and unknown tools, no arguments or file text, and no capability anywhere.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
  client = await server.connect('audit-client');
}, 120_000);
afterAll(async () => {
  await server.close();
});

type Entry = Record<string, any>;
function records(): Entry[] {
  const directory = join(server.root, 'state', 'audit');
  return readdirSync(directory)
    .filter(name => name.endsWith('.jsonl'))
    .flatMap(name =>
      readFileSync(join(directory, name), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line)),
    );
}
const mcp = () => records().filter(entry => entry.origin === 'mcp');

test('each call writes one record with its method, tool, label and result', async () => {
  const before = mcp().length;
  await client.listTools();
  const afterList = mcp();
  expect(afterList.length).toBeGreaterThan(before);
  expect(afterList.at(-1)).toMatchObject({ origin: 'mcp', method: 'tools/list', connection: 'local', result: 'ok', action: 'protocol' });
  const mark = mcp().length;
  await client.callTool({ name: 'list_files', arguments: { project: PROJECT } });
  const entries = mcp().slice(mark);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ method: 'tools/call', tool: 'documents.list', result: 'ok', decision: 'allow', outcome: 'ok' });
  // The earlier protocol era names the client only in its first message, so the label comes from a current-era request.
  const mark2 = mcp().length;
  await server.raw({
    method: 'tools/call',
    params: { name: 'list_files', arguments: { project: PROJECT }, _meta: { 'io.modelcontextprotocol/clientInfo': { name: `audit-client\u0007${'x'.repeat(100)}`, version: '1' } } },
  });
  const labelled = mcp().slice(mark2);
  expect(labelled).toHaveLength(1);
  expect(labelled[0].clientLabel).toBe(`audit-client${'x'.repeat(52)}`);
});

test('a failure is recorded with its result, a refused tool call as a denial, and an unknown tool as a denial', async () => {
  let mark = mcp().length;
  await client.callTool({ name: 'read_file', arguments: { project: PROJECT, path: 'missing.yaml' } });
  expect(mcp().slice(mark)).toMatchObject([{ tool: 'files.read', result: 'not_found' }]);
  mark = mcp().length;
  await client.callTool({ name: 'read_file', arguments: { project: PROJECT } });
  expect(mcp().slice(mark)).toMatchObject([{ tool: 'files.read', result: 'invalid_input', outcome: 'refused' }]);
  mark = mcp().length;
  await server.raw({ method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } });
  expect(
    mcp()
      .slice(mark)
      .some(entry => entry.decision === 'deny' && entry.reason === 'unknown-tool'),
  ).toBe(true);
  mark = mcp().length;
  const refused = await fetch(server.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect(refused.status).toBe(401);
  expect(
    mcp()
      .slice(mark)
      .some(entry => entry.decision === 'deny' && String(entry.reason).startsWith('mcp-')),
  ).toBe(true);
});

test('no record holds arguments, file text or the capability, and every record keeps the chain', async () => {
  await client.callTool({ name: 'validate_text', arguments: { project: PROJECT, path: 'commerce.mapping.yaml', source: 'SECRET-FILE-TEXT: 1' } });
  const text = JSON.stringify(records());
  expect(text).not.toContain('SECRET-FILE-TEXT');
  expect(text).not.toContain(server.capability());
  for (const entry of mcp()) expect(Object.keys(entry).filter(key => ['arguments', 'args', 'source', 'text'].includes(key))).toEqual([]);
  const { verifyAuditChain, readStoredMonths } = await import('../../src/server/auth/audit');
  expect(verifyAuditChain(readStoredMonths(join(server.root, 'state', 'audit'))).ok).toBe(true);
});

test('a failure the tool decides after its twin answered is recorded with the code the caller was told', async () => {
  const mark = mcp().length;
  const answer = (await client.callTool({ name: 'read_file', arguments: { project: PROJECT, path: 'commerce.mapping.yaml', expectedVersion: 'a'.repeat(64) } })) as {
    structuredContent?: { error?: { code: string } };
  };
  expect(answer.structuredContent?.error?.code).toBe('version_changed');
  expect(mcp().slice(mark)).toMatchObject([
    { tool: 'files.read', result: 'ok' },
    { tool: 'files.read', result: 'version_changed', outcome: 'refused' },
  ]);
});
