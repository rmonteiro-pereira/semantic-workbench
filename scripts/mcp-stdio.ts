// Lets an agent that starts programs reach the local workbench: it reads one protocol message per line from standard input, posts each to the running local server with the capability and the mirrored headers, and writes each answer to standard output. It starts no server, opens no port and never prints the capability.
// Usage: bun scripts/mcp-stdio.ts. In server mode set SW_SERVER_URL and SW_CLIENT_ID.
// Supply a one-use credential with --setup-credential-file or SW_SETUP_CREDENTIAL.
// Use --sign-out after revoking or signing out in the workbench.
import { forgetServerCredentials, openServerCredentials, readSetupCredential } from './mcp-server-credentials';
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
  server?: ReturnType<typeof openServerCredentials>,
): Promise<string[]> {
  let message: Message;
  try {
    message = JSON.parse(line);
  } catch {
    return [JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The message is not valid JSON.' } })];
  }
  let capability: string;
  try {
    capability = server ? await server.access() : readCapability();
  } catch (error) {
    if (server) return [bridgeError(message, serverError(error))].filter((entry): entry is string => entry !== null);
    return [bridgeError(message, 'Start the workbench in local mode first; no capability file exists yet.')].filter((entry): entry is string => entry !== null);
  }
  try {
    const endpoint = server?.resource ?? `http://127.0.0.1:${port}/api/mcp`;
    const post = (token: string) =>
      send(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, ...mirroredHeaders(message) },
        body: line,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    let response = await post(capability);
    if (server && response.status === 401) {
      await response.body?.cancel();
      response = await post(await server.access(capability));
    }
    if (server && response.status === 401)
      return [bridgeError(message, 'The refreshed connection was refused. Check the connection in the workbench.')].filter((entry): entry is string => entry !== null);
    const text = await response.text();
    if (response.status === 404 && !text.includes('jsonrpc'))
      return [bridgeError(message, 'MCP is not available in server mode yet. Run the workbench in local mode.')].filter((entry): entry is string => entry !== null);
    if (response.status === 401)
      return [bridgeError(message, 'The workbench refused the capability. If it was rotated, retry; otherwise check DATA_DIR.')].filter((entry): entry is string => entry !== null);
    return answerLines(response.headers.get('content-type') ?? '', text);
  } catch (error) {
    if (server) return [bridgeError(message, serverError(error))].filter((entry): entry is string => entry !== null);
    if (error instanceof Error && error.name === 'TimeoutError')
      return [bridgeError(message, 'The workbench did not answer in time. Check that it is still running, then retry.')].filter((entry): entry is string => entry !== null);
    return [bridgeError(message, `The workbench is not running on port ${port}. Start it in local mode with bun run dev.`)].filter((entry): entry is string => entry !== null);
  }
}

function serverError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Connection ended.')) return error.message;
  return 'The server connection could not be used. Check the server address, credentials and owner-only permissions.';
}

function configuredServer() {
  const address = process.env.SW_SERVER_URL;
  const setup = process.env.SW_SETUP_CREDENTIAL;
  delete process.env.SW_SETUP_CREDENTIAL;
  if (!address) return undefined;
  if (process.argv.includes('--sign-out')) {
    forgetServerCredentials(address);
    process.exit(0);
  }
  const fileIndex = process.argv.indexOf('--setup-credential-file');
  const file = fileIndex < 0 ? undefined : process.argv[fileIndex + 1];
  if (fileIndex >= 0 && !file) throw new Error('Provide a setup credential file path.');
  const clientId = process.env.SW_CLIENT_ID;
  if (!clientId?.trim()) throw new Error('Set SW_CLIENT_ID to the registered agent program ID.');
  return openServerCredentials(address, clientId, file ? readSetupCredential(file) : setup);
}

if (import.meta.main) {
  let server: ReturnType<typeof configuredServer>;
  try {
    server = configuredServer();
  } catch {
    console.error('Bridge configuration refused. Check SW_SERVER_URL, SW_CLIENT_ID and owner-only credential file permissions.');
    process.exit(1);
  }
  const port = Number(process.env.SW_PORT || DEFAULT_PORT);
  const readCapability = () => readFileSync(capabilityPath(), 'utf8').trim();
  const pending: Promise<void>[] = [];
  const input = createInterface({ input: process.stdin });
  input.on('line', line => {
    if (!line.trim()) return;
    pending.push(deliver(line, port, readCapability, fetch, BRIDGE_TIMEOUT_MS, server).then(lines => lines.forEach(answer => process.stdout.write(answer + '\n'))));
  });
  input.on('close', () => void Promise.all(pending));
}
