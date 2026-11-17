// Lets an agent that starts programs reach the local workbench: it reads one protocol message per line from standard input, posts each to the running local server with the capability and the mirrored headers, and writes each answer to standard output. It starts no server, opens no port and never prints the capability.
// Usage: bun scripts/mcp-stdio.ts. It reads DATA_DIR (default data) and SW_PORT (default 4310), like the server.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DEFAULT_CALL_LIMITS } from '../src/server/mcp/call-limits';

const DEFAULT_PORT = 4310;
/** How long the bridge waits for an answer: a little longer than the server's own deadline for one call, so the server's answer arrives first. */
export const BRIDGE_TIMEOUT_MS = DEFAULT_CALL_LIMITS.deadlineMs + 5000;
const PROTOCOL_META = 'io.modelcontextprotocol/protocolVersion';

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: unknown; _meta?: Record<string, unknown> } };

/** The mirrored headers a message of the current protocol revision must carry, or none for an earlier-era message. */
export function mirroredHeaders(message: Message): Record<string, string> {
  const version = message.params?._meta?.[PROTOCOL_META];
  if (typeof version !== 'string' || typeof message.method !== 'string') return {};
  return {
    'MCP-Protocol-Version': version,
    'Mcp-Method': message.method,
    ...(message.method === 'tools/call' && typeof message.params?.name === 'string' ? { 'Mcp-Name': message.params.name } : {}),
  };
}

/** An error answer for a request the bridge could not deliver. */
export function bridgeError(message: Message, text: string): string | null {
  if (message.id === undefined) return null;
  return JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: text } });
}

function capabilityPath(): string {
  return join(process.env.DATA_DIR || 'data', 'state', 'mcp-capability');
}

/** The messages in an answer body: one JSON object, or the data lines of an event stream. */
export function answerLines(contentType: string, body: string): string[] {
  if (contentType.includes('text/event-stream')) {
    return body
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .filter(Boolean);
  }
  const trimmed = body.trim();
  return trimmed ? [trimmed] : [];
}

/** Posts one message. Returns the lines to write, which may be none for a notification. */
export async function deliver(
  line: string,
  port: number,
  readCapability: () => string,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
  timeoutMs = BRIDGE_TIMEOUT_MS,
): Promise<string[]> {
  let message: Message;
  try {
    message = JSON.parse(line);
  } catch {
    return [JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The message is not valid JSON.' } })];
  }
  let capability: string;
  try {
    capability = readCapability();
  } catch {
    return [bridgeError(message, 'Start the workbench in local mode first; no capability file exists yet.')].filter((entry): entry is string => entry !== null);
  }
  try {
    const response = await send(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${capability}`, ...mirroredHeaders(message) },
      body: line,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (response.status === 404 && !text.includes('jsonrpc'))
      return [bridgeError(message, 'MCP is not available in server mode yet. Run the workbench in local mode.')].filter((entry): entry is string => entry !== null);
    if (response.status === 401)
      return [bridgeError(message, 'The workbench refused the capability. If it was rotated, retry; otherwise check DATA_DIR.')].filter((entry): entry is string => entry !== null);
    return answerLines(response.headers.get('content-type') ?? '', text);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      return [bridgeError(message, 'The workbench did not answer in time. Check that it is still running, then retry.')].filter((entry): entry is string => entry !== null);
    return [bridgeError(message, `The workbench is not running on port ${port}. Start it in local mode with bun run dev.`)].filter((entry): entry is string => entry !== null);
  }
}

if (import.meta.main) {
  const port = Number(process.env.SW_PORT || DEFAULT_PORT);
  const readCapability = () => readFileSync(capabilityPath(), 'utf8').trim();
  const pending: Promise<void>[] = [];
  const input = createInterface({ input: process.stdin });
  input.on('line', line => {
    if (!line.trim()) return;
    pending.push(deliver(line, port, readCapability).then(lines => lines.forEach(answer => process.stdout.write(answer + '\n'))));
  });
  input.on('close', () => void Promise.all(pending));
}
