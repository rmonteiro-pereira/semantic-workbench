import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createReceiptStore } from '../../src/server/mcp/receipts';
import { succeed } from '../../src/server/mcp/tool-results';
import { openConnectionServer } from '../helpers/connection-server';

test.todo('a read-only connection refuses a completed commit receipt owned by the same person', async () => {
  const server = await openConnectionServer();
  try {
    const { tokens } = await server.connect('alice', 'read');
    const resolved = await server.auth.connections.service.resolve(tokens.access_token);
    if (!resolved.ok) throw new Error('The test connection must resolve.');
    const person = resolved.caller.principal.id;
    const args = {
      project: 'sales-contracts',
      message: 'Earlier authorized commit',
      files: [{ path: 'orders.odcs.yaml', version: 'a'.repeat(64) }],
      expectedBranch: 'main',
      expectedHead: 'b'.repeat(40),
      idempotencyKey: 'same-person-commit-retry',
    };
    const receipts = createReceiptStore(join(server.fixture.ws.layout.state, 'mcp-receipts'));
    await receipts.run({ principalId: person, tool: 'git_commit', idempotencyKey: args.idempotencyKey, args, effect: async () => succeed({ commit: 'c'.repeat(40) }), verify: async () => null });
    const response = await server.handler(
      new Request(server.resource, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'git_commit', arguments: args } }),
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const event = text.split('\n').find(line => line.startsWith('data: '));
    const body = JSON.parse(event ? event.slice(6) : text);
    expect(body.result.structuredContent.ok).toBe(false);
  } finally {
    server.close();
  }
}, 30000);
