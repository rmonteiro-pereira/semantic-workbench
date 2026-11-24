// Connection origin does not weaken receipt ownership or current operation authorization.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createCursorCodec } from '../../src/server/mcp/cursors';
import { createReceiptStore } from '../../src/server/mcp/receipts';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { succeed } from '../../src/server/mcp/tool-results';
import { createTwinCall } from '../../src/server/mcp/twin-dispatch';
import { openConnectionServer, referenceProgram } from '../helpers/connection-server';

test('ACP receipt replay requires its original person, connection, scope and current grants', async () => {
  const server = await openConnectionServer();
  const connections = server.auth.connections.service;
  const receipts = createReceiptStore(join(server.fixture.root, 'acp-receipts'));
  const args = {
    project: 'sales-contracts',
    message: 'Earlier authorized commit',
    files: [{ path: 'orders.odcs.yaml', version: 'a'.repeat(64) }],
    expectedBranch: 'main',
    expectedHead: 'b'.repeat(40),
    idempotencyKey: 'owned-commit-retry',
  };
  async function connect(username: string, scopes: ('read' | 'commit')[]) {
    const cookie = await server.signIn(username);
    const session = await server.auth.authentication.session(new Request(server.origin, { headers: { Cookie: cookie } }));
    if (!session) throw new Error('Browser session is missing.');
    const issued = connections.createConnectionForSession({ session, clientId: referenceProgram.clientId, scopes, origin: 'acp' });
    if (!issued.ok) throw new Error('Setup was refused.');
    const response = await server.token({
      grant_type: 'urn:semantic-workbench:grant-type:setup',
      setup_credential: issued.credential,
      client_id: referenceProgram.clientId,
      resource: server.resource,
    });
    expect(response.status).toBe(200);
    return (await response.json()).access_token as string;
  }
  async function replay(token: string) {
    const resolved = await connections.resolve(token);
    if (!resolved.ok) return { ok: false };
    expect(resolved.caller.origin).toBe('acp');
    return TOOLS.find(tool => tool.name === 'git_commit')!.run(args, {
      twin: createTwinCall(server.handler.boundary, resolved.caller, connections.endSignal(resolved.connection)),
      cursors: createCursorCodec(),
      receipts,
      principalId: resolved.caller.principal.id,
      connectionId: resolved.connection,
      signal: connections.endSignal(resolved.connection),
    });
  }
  async function seed(token: string) {
    const resolved = await connections.resolve(token);
    if (!resolved.ok) throw new Error('Connection is missing.');
    const result = succeed({ commit: 'c'.repeat(40) });
    await receipts.run({
      principalId: resolved.caller.principal.id,
      connectionId: resolved.connection,
      tool: 'git_commit',
      idempotencyKey: args.idempotencyKey,
      args,
      effect: async () => result,
      verify: async () => null,
    });
    return { result, connection: resolved.connection };
  }
  try {
    const original = await connect('alice', ['read', 'commit']);
    const { result, connection } = await seed(original);
    expect(await replay(original)).toEqual(result);
    expect(await replay(await connect('alice', ['read', 'commit']))).toMatchObject({ ok: false });
    expect(await replay(await connect('dave', ['read', 'commit']))).toMatchObject({ ok: false });
    const narrow = await connect('alice', ['read']);
    await seed(narrow);
    expect(await replay(narrow)).toMatchObject({ ok: false });
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
    expect(await replay(original)).toMatchObject({ ok: false });
    connections.end(connection, 'revoked-by-person');
    expect(await replay(original)).toMatchObject({ ok: false });
  } finally {
    server.handler.agentPanel?.stopSweeper();
    server.close();
  }
}, 30_000);
