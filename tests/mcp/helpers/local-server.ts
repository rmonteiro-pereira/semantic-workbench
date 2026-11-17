// Starts a local-mode workbench on a spare port with a temporary data root, the shipped examples loaded and the agent endpoint mounted, and hands out reference clients and raw requests.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { join } from 'node:path';
import { createHandler } from '../../../src/server/handler';
import { CAPABILITY_FILE, openLocalCapability, rotateCapability } from '../../../src/server/mcp/local-capability';
import { testWorkspace } from '../../helpers/temp-data-dir';
import { readFileSync } from 'node:fs';

/** The protocol revision the endpoint speaks. */
export const PROTOCOL_VERSION = '2026-07-28';

export type LocalServer = Awaited<ReturnType<typeof startLocalServer>>;

/** Starts a server. `examples` lists the shipped examples to load, such as `commerce`. */
export async function startLocalServer(options: { examples?: string[]; handlerOptions?: Parameters<typeof createHandler>[1] } = {}) {
  const workspace = await testWorkspace();
  for (const example of options.examples ?? []) await workspace.ws.loadExample(example);
  const capabilityFile = join(workspace.root, 'state', CAPABILITY_FILE);
  const opened = openLocalCapability(capabilityFile);
  if (!opened.ok) throw new Error(opened.reason);
  let handler: ReturnType<typeof createHandler> | undefined;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => handler!(request) });
  handler = createHandler(workspace.ws, { port: server.port as number, mcp: { capability: opened.capability }, ...options.handlerOptions });
  const url = `http://127.0.0.1:${server.port}`;
  const capability = () => readFileSync(capabilityFile, 'utf8').trim();
  const clients: Client[] = [];
  return {
    ...workspace,
    url,
    endpoint: `${url}/api/mcp`,
    port: server.port as number,
    capability,
    capabilityFile,
    rotate: () => rotateCapability(capabilityFile),
    /** A reference client connected through the real route with the current capability. */
    async connect(label = 'reference-client') {
      const client = new Client({ name: label, version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${url}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${capability()}` } } });
      await client.connect(transport);
      clients.push(client);
      return client;
    },
    /** A raw protocol request with the headers a conforming client sends. Pass `headers` to override or add. */
    async raw(message: Record<string, unknown>, headers: Record<string, string> = {}) {
      const method = String(message.method);
      const params = (message.params ?? {}) as Record<string, unknown>;
      const meta = {
        'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': { name: 'raw-client', version: '1' },
      };
      const body = { jsonrpc: '2.0', id: 1, ...message, params: { ...params, _meta: { ...meta, ...(params._meta as object) } } };
      const response = await fetch(`${url}/api/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${capability()}`,
          'mcp-protocol-version': PROTOCOL_VERSION,
          'mcp-method': method,
          ...(method === 'tools/call' ? { 'mcp-name': String(params.name) } : {}),
          ...headers,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, json: text ? safeJson(text) : undefined };
    },
    async close() {
      for (const client of clients) await client.close().catch(() => undefined);
      await server.stop(true);
      workspace.dispose();
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
