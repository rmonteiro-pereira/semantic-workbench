// Decides whether the agent panel exists for this server and builds its routes. Without its prerequisites, the panel has no routes and the person menu shows no entry.
import type { AuditLog } from '../auth/audit';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { LocalCapability } from '../mcp/local-capability';
import type { Route } from '../routes/http';
import { createAcpPanelRoutes } from '../routes/acp-panel';
import { createAcpRelayRoutes } from '../routes/acp-relay';
import type { ConnectionDirectory } from './connection-directory';
import { createPanelService, type PanelService } from './panel-service';
import { bearerOf, createLocalRelayAuthenticator, type RelayAuthenticator } from './relay-authentication';

/** What mounting needs. Local mode needs the capability that opens the agent endpoint; server mode needs the connection directory. */
export type AgentPanelMountOptions = {
  mode: 'local' | 'server';
  port: number;
  publicOrigin?: string;
  capability?: LocalCapability;
  connections?: ConnectionDirectory;
  boundary: () => OperationBoundary;
  audit: AuditLog;
  keepOpen?: (request: Request) => void;
  now?: () => number;
};

/** The relay's bearer token is a connection of the panel's own kind, or nothing. A connection made for another kind of program is refused. */
function createConnectionAuthenticator(connections: ConnectionDirectory): RelayAuthenticator {
  return async request => {
    if (request.headers.has('origin')) return { ok: false };
    const token = bearerOf(request);
    if (!token) return { ok: false };
    const resolved = await connections.resolve(token);
    if (!resolved.ok || resolved.caller.origin !== 'acp') return { ok: false };
    const { caller } = resolved;
    return { ok: true, principal: caller.principal, connection: resolved.connection, scope: caller.scope, session: caller.session };
  };
}

/** The panel's service and routes, or undefined when this server cannot offer the panel. */
export function mountAgentPanel(options: AgentPanelMountOptions): { service: PanelService; routes: Route[] } | undefined {
  let authenticateRelay: RelayAuthenticator | undefined;
  let workbenchUrl = '';
  if (options.mode === 'local' && options.capability) {
    authenticateRelay = createLocalRelayAuthenticator({ capability: options.capability, port: options.port });
    workbenchUrl = `http://127.0.0.1:${options.port}`;
  }
  if (options.mode === 'server' && options.connections && options.publicOrigin) {
    authenticateRelay = createConnectionAuthenticator(options.connections);
    workbenchUrl = options.publicOrigin;
  }
  if (!authenticateRelay) return undefined;
  const service = createPanelService({ mode: options.mode, boundary: options.boundary, audit: options.audit, workbenchUrl, authenticateRelay, connections: options.connections, now: options.now });
  service.startSweeper();
  return { service, routes: [createAcpPanelRoutes(service, { keepOpen: options.keepOpen }), createAcpRelayRoutes(service, { now: options.now, keepOpen: options.keepOpen })] };
}

/** Answers every panel path "not found" when the panel is not offered, before any other route can look at the request. */
export const agentPanelAbsentRoute: Route = (_workspace, _request, url) => (url.pathname.startsWith('/api/acp/') ? new Response('Not found', { status: 404 }) : null);
