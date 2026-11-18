// Serves `POST /api/mcp` after mode-specific authentication. This file does transport work only: it applies the request gate, reads the body under its caps and hands the message to the protocol library. Each tool call then reaches the workbench through the operation boundary, as the twin of an ordinary route.
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { AuditLog } from '../auth/audit';
import { ATTRIBUTED_METHODS } from '../auth/call-attribution';
import { decideServerRequest } from '../mcp/server-mode-gate';
import { bearerChallenge } from '../connections/server-metadata';
import type { ConnectionService } from '../connections/connection-service';
import { mintCaller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import { localPrincipal } from '../auth/principal';
import { createAnonymousAuditGate } from '../auth/rate-limit';
import { requestAuditId, requestSourceIp, type AuditRequest } from '../request';
import { clientLabelOf, type CallAttribution } from '../mcp/call-audit';
import { createCallAudit } from './mcp-call-audit';
import { createCallLimits, DEFAULT_CALL_LIMITS, type CallLimitSettings } from '../mcp/call-limits';
import { createCursorCodec } from '../mcp/cursors';
import { DEFAULT_TOOL_REQUEST_CAP_BYTES, GLOBAL_REQUEST_CAP_BYTES, readBodyUnderCap } from '../mcp/body-limits';
import type { LocalCapability } from '../mcp/local-capability';
import type { ReceiptStore } from '../mcp/receipts';
import { decideRequest } from '../mcp/request-gate';
import { buildToolServer } from '../mcp/server-factory';
import type { ToolDefinition } from '../mcp/tool-definition';
import type { Route } from './http';

/** The path the transport answers on. */
export const MCP_PATH = '/api/mcp';

/** What the route needs. The boundary is a function because the handler creates it after the routes. */
export type McpRouteDependencies = {
  capability?: LocalCapability;
  server?: { service: ConnectionService; publicUrl: string };
  port: number;
  boundary: () => OperationBoundary;
  audit: AuditLog;
  tools: ToolDefinition[];
  receipts: ReceiptStore;
  limits?: CallLimitSettings;
  now?: () => number;
};

type ParsedMessage = { method: string; toolName: string | null; clientLabel: string | undefined };

/** The method, tool name and client label of a JSON-RPC message, or null when the body is not one. */
function parseMessage(text: string): ParsedMessage | null {
  try {
    const message = JSON.parse(text);
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const method = typeof message.method === 'string' && ATTRIBUTED_METHODS.includes(message.method) ? message.method : 'unknown';
    const toolName = method === 'tools/call' && typeof message.params?.name === 'string' ? message.params.name : null;
    const info = message.params?._meta?.['io.modelcontextprotocol/clientInfo'] ?? message.params?.clientInfo;
    return { method, toolName, clientLabel: clientLabelOf(info?.name) };
  } catch {
    return null;
  }
}

/** The id of a JSON-RPC message, so an error answer can name the request it answers. */
function messageId(text: string): unknown {
  try {
    return JSON.parse(text).id ?? null;
  } catch {
    return null;
  }
}

function emptyResponse(status: number): Response {
  return new Response(null, { status, ...(status === 405 ? { headers: { Allow: 'POST' } } : {}) });
}

/** Creates the transport route. Its state (cursors, limits, the audit gate) lives for the life of the process. */
export function createMcpRoute(dependencies: McpRouteDependencies): Route {
  const clock = dependencies.now ?? Date.now;
  const localCaller = mintCaller({ principal: localPrincipal(), origin: 'mcp', connection: 'local' });
  const cursors = createCursorCodec({ now: clock });
  const limits = createCallLimits(dependencies.limits ?? DEFAULT_CALL_LIMITS, clock);
  const gateAudit = createCallAudit(dependencies.audit, dependencies.server ? { principal: { id: 'anonymous', kind: 'anonymous' } } : undefined);
  const auditGate = createAnonymousAuditGate(clock);
  const capFor = (name: string | null) => dependencies.tools.find(tool => tool.name === name)?.requestCapBytes ?? DEFAULT_TOOL_REQUEST_CAP_BYTES;

  function refuseAtGate(request: Request, reason: string, status: number): Response {
    const source = (request as AuditRequest)[requestSourceIp];
    const admission = auditGate(source, `mcp-${reason}`);
    const requestId = (request as AuditRequest)[requestAuditId] ?? crypto.randomUUID();
    if (admission.record) gateAudit.denied({ requestId, method: 'unknown' }, `mcp-${reason}`);
    const response = emptyResponse(status);
    if (dependencies.server) {
      response.headers.set('Cache-Control', 'no-store');
      if (status === 401) response.headers.set('WWW-Authenticate', bearerChallenge(dependencies.server.publicUrl));
    }
    return response;
  }

  return async (_workspace, request, url) => {
    if (url.pathname !== MCP_PATH) return null;
    const gateRequest = {
      method: request.method,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      authorization: request.headers.get('authorization'),
      contentType: request.headers.get('content-type'),
    };
    const gate = dependencies.server
      ? await decideServerRequest(gateRequest, dependencies.server.service)
      : decideRequest(gateRequest, { port: dependencies.port, capabilityMatches: value => dependencies.capability?.matches(value) ?? false });
    if (!gate.allow) return refuseAtGate(request, gate.reason, gate.status);
    const caller = 'caller' in gate ? gate.caller : localCaller;
    const audit = createCallAudit(dependencies.audit, caller);
    const signal = dependencies.server && caller.connection ? AbortSignal.any([request.signal, dependencies.server.service.endSignal(caller.connection)]) : request.signal;
    const named = request.headers.get('mcp-name');
    const body = await readBodyUnderCap(request, named ? capFor(named) : GLOBAL_REQUEST_CAP_BYTES);
    if (!body.ok) return emptyResponse(body.reason === 'too-large' ? 413 : 400);
    const message = parseMessage(body.text);
    const size = Buffer.byteLength(body.text);
    const capAfterParsing = (parsed: ParsedMessage | null) => (parsed === null ? GLOBAL_REQUEST_CAP_BYTES : capFor(parsed.toolName));
    if (size > capAfterParsing(message)) return emptyResponse(413);
    // The release serves no change notices, so a subscription stream is a method that does not exist.
    if (message?.method === 'subscriptions/listen') return Response.json({ jsonrpc: '2.0', id: messageId(body.text), error: { code: -32601, message: 'Method not found.' } }, { status: 404 });
    const requestId = (request as AuditRequest)[requestAuditId] ?? crypto.randomUUID();
    const attribution: CallAttribution = { requestId, method: message?.method ?? 'unknown', clientLabel: message?.clientLabel };
    const known = !message?.toolName || dependencies.tools.some(tool => tool.name === message.toolName);
    if (!known) audit.denied(attribution, 'unknown-tool');
    const boundary = dependencies.boundary();
    const listing = message?.method === 'tools/list';
    const handler = createMcpHandler(
      () =>
        buildToolServer({
          tools: dependencies.tools,
          visibleOperations: listing ? new Set(boundary.availableOperations(caller)) : null,
          boundary,
          caller: mintCaller({ ...caller, attribution: { method: attribution.method, clientLabel: attribution.clientLabel } }),
          cursors,
          receipts: dependencies.receipts,
          limits,
          audit,
          attribution,
          signal,
        }),
      { legacy: 'stateless', maxRequestBodySize: GLOBAL_REQUEST_CAP_BYTES },
    );
    const forwarded = new Request(request.url, { method: 'POST', headers: request.headers, body: body.text, signal });
    const response = await handler.fetch(forwarded);
    if (known && message && message.method !== 'tools/call') audit.protocolCall(attribution);
    return response;
  };
}
