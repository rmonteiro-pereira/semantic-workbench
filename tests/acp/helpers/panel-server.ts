// Starts a local-mode workbench with the agent panel mounted on a spare port, and hands out the browser's and the relay's requests with the headers each really sends.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../../src/server/handler';
import { CAPABILITY_FILE, openLocalCapability } from '../../../src/server/mcp/local-capability';
import type { PanelService } from '../../../src/server/acp/panel-service';
import type { PanelEvent } from '../../../src/server/acp/panel-events';
import { testWorkspace } from '../../helpers/temp-data-dir';

export type PanelServer = Awaited<ReturnType<typeof startPanelServer>>;

/** Starts the server. `examples` names shipped examples to load into the workspace. */
export async function startPanelServer(options: { examples?: string[]; now?: () => number } = {}) {
  const workspace = await testWorkspace();
  for (const example of options.examples ?? []) await workspace.ws.loadExample(example);
  const capabilityFile = join(workspace.root, 'state', CAPABILITY_FILE);
  const opened = openLocalCapability(capabilityFile);
  if (!opened.ok) throw new Error(opened.reason);
  let handler: ReturnType<typeof createHandler> | undefined;
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, idleTimeout: 255, fetch: request => handler!(request) });
  handler = createHandler(workspace.ws, { port: server.port as number, mcp: { capability: opened.capability }, now: options.now });
  const url = `http://127.0.0.1:${server.port}`;
  const capability = () => readFileSync(capabilityFile, 'utf8').trim();
  const service = (handler as unknown as { agentPanel: PanelService }).agentPanel;

  /** A request the workbench page makes: same origin, the page's marker, JSON. */
  function browser(path: string, init: RequestInit & { json?: unknown; headers?: Record<string, string> } = {}) {
    const { json, headers, ...rest } = init;
    return fetch(url + path, {
      ...rest,
      headers: { 'sec-fetch-site': 'same-origin', 'x-sw-request': '1', ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  }
  /** A request the relay makes: no Origin, the capability as bearer. */
  function relay(path: string, init: RequestInit & { json?: unknown; headers?: Record<string, string>; bearer?: string | null } = {}) {
    const { json, headers, bearer, ...rest } = init;
    const token = bearer === undefined ? capability() : bearer;
    return fetch(url + path, {
      ...rest,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  }
  /** Starts a session and returns what the browser is shown. */
  async function startSession(confirmReplace = false) {
    const response = await browser('/api/acp/sessions', { method: 'POST', json: { confirmReplace } });
    return { response, body: (await response.json()) as { id: string; code: string; command: string; statement: string; scopes: string[]; expiresAt: number } };
  }
  /** Reads the browser event stream until `until` returns true or the stream ends. */
  async function readEvents(id: string, until: (events: PanelEvent[]) => boolean, after = 0, timeoutMs = 10_000): Promise<PanelEvent[]> {
    const controller = new AbortController();
    const response = await browser(`/api/acp/sessions/${id}/events?after=${after}`, { signal: controller.signal });
    const events: PanelEvent[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + timeoutMs;
    // One read stays pending across the short waits, so a chunk that arrives meanwhile is never lost.
    let pendingRead: ReturnType<typeof reader.read> | undefined;
    try {
      while (Date.now() < deadline && !until(events)) {
        pendingRead ??= reader.read();
        const chunk = await Promise.race([pendingRead, Bun.sleep(100).then(() => null)]);
        if (chunk === null) continue;
        pendingRead = undefined;
        if (chunk.done || !chunk.value) break;
        buffer += decoder.decode(chunk.value);
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const data = buffer
            .slice(0, boundary)
            .split('\n')
            .find(line => line.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      controller.abort();
    }
    return events;
  }
  return {
    ...workspace,
    url,
    port: server.port as number,
    service,
    capability,
    browser,
    relay,
    startSession,
    readEvents,
    async close() {
      service.stopSweeper();
      await server.stop(true);
      workspace.dispose();
    },
  };
}
