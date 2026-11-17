// Applies one request-scoped decision and records outcomes before returning an HTTP response.
import type { BearerValidator } from './bearer';
import type { LocalCapability } from '../mcp/local-capability';
import type { CallLimitSettings } from '../mcp/call-limits';
import { createOperationBoundary } from './operation-boundary';
import { mintCaller } from './caller';
export { shouldAudit } from './operation-boundary';
import { createRequestAuthentication } from './request-authentication';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Workspace } from '../projects/workspace';
import { createAccessControl, type AccessControl } from './authorize';
import { emptyAccessConfig } from './access-config';
import { openAdminRepository, AdminConfigError, type AdminRepository } from './admin-repo';
import { createAuditLog, type AuditLog } from './audit';
import type { Principal } from './principal';
import { routeFor, routeTemplate } from './route-actions';
import type { ServerAuthentication } from './authentication';
import type { GroupName } from './directory';
import type { ProviderStatus } from './oidc';
import { type AccessRequest } from './request-scope';
import { internalErrorResponse, requestAuditId, requestSourceIp } from '../request';
import type { RequestLimits } from './rate-limit';
import type { RemoteCredentials } from './remote-credentials';
import { observeRequest } from '../observability/http-request';
import { log } from '../observability/log';

/** The access boundary instance shared across requests. */
export type { AccessControl } from './authorize';
/** Optional dependencies for server authentication and isolated middleware tests. */
export type HandlerOptions = {
  sourceIp?: (request: Request) => string | undefined;
  /**
   * The address a request is limited by. It differs from `sourceIp`, which policies compare
   * against the direct socket peer, when trusted reverse proxies forward the client address.
   */
  clientAddress?: (request: Request) => string | undefined;
  /** The clock of the limits and the audit gate; tests replace it. */
  now?: () => number;
  /**
   * Stops the server closing a long-lived response, such as the event stream, for being idle.
   * Every other connection keeps the server's idle timeout.
   */
  keepOpen?: (request: Request) => void;
  /** Per-address request limits of server mode; the defaults suit a busy deployment. */
  requestLimits?: RequestLimits;
  groupName?: (id: string) => Promise<GroupName>;
  providerStatus?: ProviderStatus;
  access?: AccessControl;
  bearer?: BearerValidator;
  principal?: (request: Request) => Principal | null | Promise<Principal | null>;
  audit?: AuditLog;
  mode?: 'local' | 'server';
  publicOrigin?: string;
  /** Origin of the provider's end-session page, which the sign-out form is redirected to. */
  providerOrigin?: string;
  /** Origin of the issuer, the only page allowed to frame the front-channel logout route. */
  issuerOrigin?: string;
  port?: number;
  authentication?: ServerAuthentication['authentication'];
  /** The one administration repository of the process, which project creation writes to. */
  administration?: AdminRepository;
  /** Display names for built-in roles; custom roles always show their current policy name. */
  roleNames?: Record<string, string>;
  staticRoot?: string;
  /** Server mode: each person's own credentials for remote Git commands. */
  remoteCredentials?: RemoteCredentials;
  /** True when exported telemetry is on, so browsers may send their error reports. */
  browserReports?: boolean;
  /** Local mode: the capability that opens the agent endpoint. Without it the endpoint is not mounted. */
  mcp?: { capability: LocalCapability; limits?: CallLimitSettings };
};
/** The access boundary of a handler that was given none, read from the data root's settings. */
export function defaultAccess(ws: Workspace, mode: 'local' | 'server'): AccessControl {
  let config = emptyAccessConfig();
  if (existsSync(join(ws.layout.root, 'admin'))) {
    try {
      config = openAdminRepository({ root: ws.layout.root }).load();
    } catch (error) {
      if (mode !== 'local' || !(error instanceof AdminConfigError)) throw error;
      log.warn('admin.config-invalid', { detail: error.message, fallback: 'local defaults' });
    }
  }
  return createAccessControl({
    mode,
    config,
    bootstrap: { emails: [], ids: [] },
    groupMatch: 'exact',
    knownProjects: () => projectSlugs(ws),
    context: () => ({ hour: new Date().getUTCHours() }),
  });
}
/**
 * The administration repository of a handler that was given none. Server authentication supplies
 * its own; this one serves a handler built alone and keeps that handler's decisions current.
 */
export function defaultAdministration(ws: Workspace, access: AccessControl): AdminRepository {
  return openAdminRepository({ root: ws.layout.root, committed: config => access.reload(config) });
}
/** Builds the standalone handler's audit log with the administration retention setting. */
export function defaultAudit(ws: Workspace, mode: 'local' | 'server', administration: AdminRepository): AuditLog {
  let retentionDays: number | undefined;
  if (existsSync(join(ws.layout.root, 'admin', 'settings.json'))) {
    try {
      retentionDays = administration.settings().audit?.retentionDays;
    } catch (error) {
      if (mode !== 'local' || !(error instanceof AdminConfigError)) throw error;
      log.warn('admin.config-invalid', { detail: error.message, fallback: 'local defaults' });
    }
  }
  return createAuditLog({ dir: join(ws.layout.state, 'audit'), retentionDays });
}
function projectSlugs(ws: Workspace): string[] {
  return ws.state.registry().projects.map(project => project.slug);
}
function requestIdResponse(response: Response, requestId: string): Response {
  try {
    response.headers.set('X-Request-Id', requestId);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

// The handler passes the shared error mapping in; this fallback only keeps isolated tests from
// leaking an exception, and never reveals the error text.
function internalError(error: unknown, requestId: string): Response {
  return internalErrorResponse(error, requestId);
}

/** Wraps routing with fail-closed access checks, request ids, and durable audit outcomes. */
export function createAccessMiddleware(
  ws: Workspace,
  options: HandlerOptions,
  localCheck: (request: Request) => Response | null,
  run: (request: Request) => Promise<Response>,
  failure: (error: unknown, requestId: string) => Response = internalError,
) {
  const mode = options.mode ?? 'local';
  const access = options.access ?? defaultAccess(ws, mode);
  const audit = options.audit ?? defaultAudit(ws, mode, options.administration ?? defaultAdministration(ws, access));
  const authentication = createRequestAuthentication(options, audit, localCheck);
  const boundary = createOperationBoundary(ws, { mode, access, audit, remoteCredentials: options.remoteCredentials }, run);
  async function dispatch(request: AccessRequest, requestId: string): Promise<Response> {
    const client = await authentication.authenticate(request, requestId);
    if (client instanceof Response) return client;
    const url = new URL(request.url);
    const page = mode === 'server' && !/^\/(api|auth)(\/|$)/.test(url.pathname);
    const found = routeFor(request.method, url.pathname, mode);
    if (client) return invoke(client, request);
    if (!found) return new Response('Not found', { status: 404 });
    const row = found.row;
    if (row.public) return run(request);
    const principal = await authentication.resolve(request);
    if (!principal) {
      const failure = authentication.auditAnonymousDenial(request, requestId, row.action);
      if (failure) return failure;
      if (page && options.authentication) {
        return options.authentication.login(url.pathname + url.search, request);
      }
      return Response.json({ error: 'sign-in required' }, { status: 401 });
    }
    return invoke(principal, request);
  }
  async function invoke(principal: Principal, request: Request): Promise<Response> {
    const session = principal.kind === 'person' ? await options.authentication?.session(request) : undefined;
    const site = request.headers.get('sec-fetch-site');
    const browser = mode === 'local' ? site === 'same-origin' || site === 'same-site' : principal.kind === 'person' && Boolean(session);
    const caller = mintCaller({ principal, origin: 'http', surface: browser ? 'browser' : 'agent', sourceIp: options.sourceIp?.(request), session });
    return (await boundary.operate({ caller, request })).response;
  }
  const httpAdapter = async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    (request as AccessRequest)[requestAuditId] = requestId;
    const address = (options.clientAddress ?? options.sourceIp)?.(request);
    (request as AccessRequest)[requestSourceIp] = address;
    return observeRequest({
      request,
      requestId,
      route: routeTemplate(request.method, new URL(request.url).pathname, mode),
      async handle() {
        let response: Response;
        try {
          response = await dispatch(request, requestId);
        } catch (error) {
          response = failure(error, requestId);
        }
        return requestIdResponse(response, requestId);
      },
    });
  };
  return Object.assign(httpAdapter, { boundary });
}
