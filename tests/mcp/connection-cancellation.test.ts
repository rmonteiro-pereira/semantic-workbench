import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createMcpRoute } from '../../src/server/routes/mcp';
import { createAuditLog } from '../../src/server/auth/audit';
import { createReceiptStore } from '../../src/server/mcp/receipts';
import { fail } from '../../src/server/mcp/tool-results';
import type { ToolDefinition } from '../../src/server/mcp/tool-definition';
import { openConnectionServer } from '../helpers/connection-server';

test('revoking a connection aborts work already opened through its transport', async () => {
  const server = await openConnectionServer();
  const started = Promise.withResolvers<void>();
  let stopped = false;
  const tool: ToolDefinition = {
    name: 'slow_read',
    description: 'Wait for cancellation.',
    inputSchema: { type: 'object' },
    hints: { readOnly: true, destructive: false, idempotent: true, openWorld: false },
    operation: 'projects.list',
    retryClass: 'repeatable',
    requestCapBytes: 64000,
    run: async (_args, context) => {
      started.resolve();
      await new Promise<void>(resolve =>
        context.signal.addEventListener(
          'abort',
          () => {
            stopped = true;
            resolve();
          },
          { once: true },
        ),
      );
      return fail('unavailable', 'Connection ended.');
    },
  };
  try {
    const { tokens } = await server.connect('alice', 'read');
    const connection = server.auth.connections.service.listAll()[0].id;
    const route = createMcpRoute({
      port: 5401,
      server: { service: server.auth.connections.service, publicUrl: server.origin },
      boundary: () => server.handler.boundary,
      audit: createAuditLog({ dir: join(server.fixture.root, 'slow-audit') }),
      receipts: createReceiptStore(join(server.fixture.root, 'slow-receipts')),
      tools: [tool],
    });
    const request = new Request(server.resource, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + tokens.access_token },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: {} } }),
    });
    const pending = Promise.resolve(route(server.fixture.ws, request, new URL(server.resource)));
    await started.promise;
    server.auth.connections.service.end(connection, 'revoked-by-person');
    await pending.catch(() => null);
    expect(stopped).toBe(true);
  } finally {
    server.close();
  }
}, 30000);
