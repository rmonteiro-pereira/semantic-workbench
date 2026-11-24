import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createReceiptStore } from '../../src/server/mcp/receipts';
import { fail, succeed } from '../../src/server/mcp/tool-results';
import { openConnectionServer } from '../helpers/connection-server';

const commitArgs = {
  project: 'sales-contracts',
  message: 'Earlier authorized commit',
  files: [{ path: 'orders.odcs.yaml', version: 'a'.repeat(64) }],
  expectedBranch: 'main',
  expectedHead: 'b'.repeat(40),
  idempotencyKey: 'same-person-commit-retry',
};

async function commitRequest(server: Awaited<ReturnType<typeof openConnectionServer>>, token: string) {
  const response = await server.handler(
    new Request(server.resource, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'git_commit', arguments: commitArgs } }),
    }),
  );
  if (response.status !== 200) return { status: response.status, ok: false };
  const text = await response.text();
  const event = text.split('\n').find(line => line.startsWith('data: '));
  const body = JSON.parse(event ? event.slice(6) : text);
  return body.result.structuredContent;
}

async function seedCompletedReceipt(server: Awaited<ReturnType<typeof openConnectionServer>>, token: string) {
  const resolved = await server.auth.connections.service.resolve(token);
  if (!resolved.ok) throw new Error('The test connection must resolve.');
  const receipts = createReceiptStore(join(server.fixture.ws.layout.state, 'mcp-receipts'));
  const result = succeed({ commit: 'c'.repeat(40) });
  await receipts.run({
    principalId: resolved.caller.principal.id,
    connectionId: resolved.connection,
    tool: 'git_commit',
    idempotencyKey: commitArgs.idempotencyKey,
    args: commitArgs,
    effect: async () => result,
    verify: async () => null,
  });
  return { id: resolved.connection, result };
}

test('a narrowed connection refuses both another connection’s result and a prior result of its own', async () => {
  const server = await openConnectionServer();
  try {
    const { tokens: original } = await server.connect('alice', 'read commit');
    const { result } = await seedCompletedReceipt(server, original.access_token);
    expect(await commitRequest(server, original.access_token)).toEqual(result);
    const { tokens: narrow } = await server.connect('alice', 'read');
    expect(await commitRequest(server, narrow.access_token)).toMatchObject({ ok: false });
    await seedCompletedReceipt(server, narrow.access_token);
    expect(await commitRequest(server, narrow.access_token)).toMatchObject({ ok: false });
  } finally {
    server.close();
  }
}, 30000);

test('a completed receipt cannot outlive the owner’s current grant or connection', async () => {
  const server = await openConnectionServer();
  try {
    const { tokens } = await server.connect('alice', 'read commit');
    const { id, result } = await seedCompletedReceipt(server, tokens.access_token);
    expect(await commitRequest(server, tokens.access_token)).toEqual(result);
    const repository = server.auth.administration;
    const grants = JSON.parse(repository.files()['grants.json']);
    for (const grant of grants.grants) if (grant.roleId === 'editor') grant.roleId = 'viewer';
    await repository.write(
      { 'grants.json': JSON.stringify(grants) },
      {
        author: { name: 'Test Admin', email: 'admin@example.org' },
        baseVersion: await repository.version(),
        message: 'grants: Remove editor access',
      },
    );
    expect(await commitRequest(server, tokens.access_token)).toMatchObject({ ok: false });
    server.auth.connections.service.end(id, 'revoked-by-person');
    expect(await commitRequest(server, tokens.access_token)).toEqual({ status: 401, ok: false });
  } finally {
    server.close();
  }
}, 30000);

test('a completed receipt requires the original person and connection plus a current authorization', async () => {
  const server = await openConnectionServer();
  try {
    const store = createReceiptStore(join(server.fixture.root, 'receipt-ownership'));
    let deny = false;
    let effects = 0;
    const request = {
      principalId: 'person-a',
      connectionId: 'connection-a',
      tool: 'git_commit',
      idempotencyKey: 'receipt-owner-test',
      args: { project: 'sales-contracts' },
      authorizeReplay: async () => (deny ? fail('refused', 'Current authorization refused this operation.') : undefined),
      effect: async () => succeed({ attempt: ++effects }),
      verify: async () => null,
    };
    expect(await store.run(request)).toEqual(succeed({ attempt: 1 }));
    expect(await store.run(request)).toEqual(succeed({ attempt: 1 }));
    expect(await store.run({ ...request, principalId: 'person-b' })).toEqual(succeed({ attempt: 2 }));
    expect(await store.run({ ...request, connectionId: 'connection-b' })).toEqual(succeed({ attempt: 3 }));
    deny = true;
    expect(await store.run(request)).toMatchObject({ ok: false, error: { code: 'refused' } });
    expect(effects).toBe(3);
  } finally {
    server.close();
  }
}, 30000);
