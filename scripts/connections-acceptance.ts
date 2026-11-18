import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { openConnectionServer, type ConnectionServer } from '../tests/helpers/connection-server';

/** Runs the reference transport against a real loopback server with connection tokens. */
export async function connectionAcceptance(): Promise<void> {
  let app: ConnectionServer | undefined;
  let listener: ReturnType<typeof Bun.serve> | undefined;
  const client = new Client({ name: 'reference-client', version: '2.4.0' });
  try {
    for (let port = 5401; port <= 5499 && !listener; port++) {
      try {
        listener = Bun.serve({ hostname: '127.0.0.1', port, fetch: request => (app ? app.handler(request) : new Response(null, { status: 503 })) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      }
    }
    if (!listener) throw new Error('No spare development port.');
    const origin = `http://127.0.0.1:${listener.port}`;
    app = await openConnectionServer({ publicUrl: origin });
    const { tokens } = await app.connect('alice', 'read validate edit commit');
    assert.equal(typeof tokens.access_token, 'string');
    const transport = new StreamableHTTPClientTransport(new URL(app.resource), { requestInit: { headers: { Authorization: 'Bearer ' + tokens.access_token } } });
    await client.connect(transport);
    const listed = (await client.listTools()).tools;
    assert.equal(listed.length, 21);
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.notEqual(result.isError, true);
    assert.equal((result.structuredContent as { ok: boolean }).ok, true);
    app.auth.connections.service.end(app.auth.connections.service.listAll()[0].id, 'revoked-by-person');
    const denied = await fetch(app.resource, { method: 'POST', headers: { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 401);
    console.log('Server MCP reference acceptance: 21 tools, authenticated project read and revoked-token challenge passed. Browser authorization remains blocked separately.');
  } finally {
    await client.close();
    await listener?.stop(true);
    app?.close();
  }
}
