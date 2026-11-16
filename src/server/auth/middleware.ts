// Applies one request-scoped decision and records outcomes before returning an HTTP response.
import { readableTrash, restoreAction } from '../projects/trash';
import type { BearerValidator } from './bearer';
import { createRequestAuthentication, agentRefusal, auditDenial } from './request-authentication';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Workspace } from '../projects/workspace';
import { createAccessControl, type AccessControl, type AccessScope } from './authorize';
import { emptyAccessConfig } from './access-config';
import { openAdminRepository, AdminConfigError, type AdminRepository } from './admin-repo';
import { auditableProjects, createAuditLog, reportAuditFailure, type AuditLog } from './audit';
import type { Principal } from './principal';
import { routeFor, routeTemplate, type RouteAction } from './route-actions';
import type { ResourceRef, Decision } from './resource';
import type { ServerAuthentication } from './authentication';
import { WriteAccessError } from './write-access';
import type { GroupName } from './directory';
import type { ProviderStatus } from './oidc';
import { GuardedChangeError } from './guards';
import { READ_ACTIONS } from '../../shared/auth/actions';
import { requestAccess, requestAuditProjects, type AccessRequest } from './request-scope';
import { hiddenResponses, internalErrorResponse, requestAuditId, requestSourceIp } from '../request';
import type { RequestLimits } from './rate-limit';
import type { RemoteCredentials } from './remote-credentials';
import { observeRequest } from '../observability/http-request';
import { actorPseudonym, setRequestActor } from '../observability/request-context';
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
/** The projects whose audit records the caller may read: null for an Admin, who reads them all. */
function auditScope(scope: AccessScope, ws: Workspace): Set<string> | null {
  if (scope.authorize('admin', { type: 'workspace' }).allow) return null;
  return auditableProjects(scope, projectSlugs(ws));
}
function projectSlugs(ws: Workspace): string[] {
  return ws.state.registry().projects.map(project => project.slug);
}
function outcome(status: number): 'ok' | 'refused' | 'failed' {
  if (status >= 200 && status < 300) return 'ok';
  if ([409, 412, 428].includes(status)) return 'refused';
  return 'failed';
}

/** Selects denials, explicitly audited routes, and operations other than ordinary reads. */
export function shouldAudit(row: RouteAction, method: string, decision: 'allow' | 'deny'): boolean {
  if (decision === 'deny') return true;
  if (row.unaudited) return false;
  return row.audited === true || !(READ_ACTIONS.includes(row.action) && method === 'GET');
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

function auditInput(request: { requestId: string; principal: AccessScope['principal']; action: RouteAction['action']; resource: ResourceRef; decision: Decision }) {
  const { requestId, principal, action, resource, decision } = request;
  return {
    requestId,
    principal,
    action,
    resource,
    rules: decision.rules,
    reason: decision.reason,
    snapshot: {
      grants: principal.grants.map(grant => grant.grantId),
      roles: [...new Set(principal.grants.map(grant => grant.roleId))],
      groups: [...principal.groups],
      emailMatched: principal.grants.some(grant => grant.via === 'email'),
      resourceAttrs: { ...resource },
    },
  };
}

/** A refusal body that never names a resource the caller may not see. */
function refusal(decision: Decision, error?: WriteAccessError): Response {
  // A guarded write names the guarded parts of readable files so the person knows what to undo.
  if (error instanceof GuardedChangeError) {
    return Response.json({ error: error.message, guarded: error.guarded }, { status: 403 });
  }
  const body = decision.status === 404 ? { error: 'Not found.' } : { error: 'forbidden', rule: decision.rules[0] ?? decision.reason };
  return Response.json(body, { status: decision.status });
}

/** Audits the target a route refused and answers like a refusal at the boundary. */
function refusedTarget(audit: AuditLog, requestId: string, scope: AccessScope, error: WriteAccessError): Response {
  const denied = auditInput({
    requestId,
    principal: scope.principal,
    action: error.action,
    resource: error.resource,
    decision: error.decision,
  });
  const failure = auditDenial(audit, { ...denied, decision: 'deny' });
  return failure ?? refusal(error.decision, error);
}

/**
 * Finds the entry a trash route names, so the decision and the audit use its original target.
 * Local mode leaves the lookup to the route, which keeps its own "not found" message.
 */
function trashLookup(ws: Workspace, request: Request) {
  const trashId = new URL(request.url).pathname.match(/^\/api\/trash\/([^/]+)/)?.[1];
  if (!trashId) return undefined;
  return { entry: ws.trash.list().find(candidate => candidate.entryId === trashId) };
}

function trashResource(entry: { project: string; path?: string }): ResourceRef {
  if (entry.path) return { type: 'file', project: entry.project, path: entry.path };
  return { type: 'project', project: entry.project };
}

/** What one route decision is about: its resource, the server mode, and a found trash entry. */
interface RouteCheck {
  resource: ResourceRef;
  mode: 'local' | 'server';
  /** True when the route's real target was already resolved, such as a trash entry. */
  resolvedTarget: boolean;
}

/** A route decision and the resource it was made on, which the audit records and replays. */
interface RouteVerdict {
  decision: Decision;
  resource: ResourceRef;
}

/**
 * Decides the route's own action. A row whose targets are named in the body passes when the
 * action is allowed somewhere the caller can read; the route then checks each actual target.
 * An agent client is granted projects, never the workspace, so a workspace row passes for it
 * the same way. A pass through a project names that project, so a dry run can replay it.
 */
function routeDecision(scope: AccessScope, row: RouteAction, { resource, mode, resolvedTarget }: RouteCheck): RouteVerdict {
  const decision = scope.authorize(row.action, resource);
  // Identity settings exist only in local mode. Authorization runs first, so a caller without the
  // permission is refused and audited as for any other route.
  if (decision.allow && mode === 'server' && row.action === 'setIdentity') {
    return { decision: { allow: false, status: 404, rules: [], reason: 'local-only' }, resource };
  }
  const client = scope.principal.kind === 'client';
  if (decision.allow || resolvedTarget || (row.targets !== 'body' && !client)) {
    return { decision, resource };
  }
  for (const project of scope.view().readableProjects) {
    const candidate: ResourceRef = { type: 'project', project };
    const allowed = scope.authorize(row.action, candidate);
    if (allowed.allow) return { decision: allowed, resource: candidate };
  }
  if (client) return { decision: { ...decision, status: 403, reason: 'no-grant' }, resource };
  return { decision, resource };
}

/**
 * How an agent client is decided, in one place with the functions after it. The bearer path
 * validated its token on the agent API, and it skips the cross-site check that guards cookies.
 * Only a row that declares a client action admits it, and that action replaces the row's own.
 * The policies in auth/authorize.ts give the client the projects of its agents.json entry, so
 * routeDecision passes a workspace row when one of them is readable.
 */
function clientRouteRefusal(found: ReturnType<typeof routeFor>): { reason: string; status: 403 | 404 } | null {
  if (!found) return { reason: 'unmapped-route', status: 404 };
  if (!found.row.clientAction) return { reason: 'bearer-scope', status: 403 };
  return null;
}

/** The row as a client is decided on it: by its client action instead of its own. */
function clientRow(row: RouteAction): RouteAction {
  return { ...row, action: row.clientAction ?? row.action };
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
  const audit = options.audit ?? createAuditLog({ dir: join(ws.layout.state, 'audit') });
  const authentication = createRequestAuthentication(options, audit, localCheck);
  async function dispatch(request: AccessRequest, requestId: string): Promise<Response> {
    const client = await authentication.authenticate(request, requestId);
    if (client instanceof Response) return client;
    const url = new URL(request.url);
    const page = mode === 'server' && !/^\/(api|auth)(\/|$)/.test(url.pathname);
    const found = routeFor(request.method, url.pathname, mode);
    const clientRefused = client ? clientRouteRefusal(found) : null;
    if (client && clientRefused) {
      return agentRefusal(audit, { requestId, principal: client, ...clientRefused });
    }
    if (!found) return new Response('Not found', { status: 404 });
    const { match } = found;
    const row = client ? clientRow(found.row) : found.row;
    if (row.public) return run(request);
    const principal = client ?? (await authentication.resolve(request));
    if (!principal) {
      const failure = authentication.auditAnonymousDenial(request, requestId, row.action);
      if (failure) return failure;
      if (page && options.authentication) {
        return options.authentication.login(url.pathname + url.search, request);
      }
      return Response.json({ error: 'sign-in required' }, { status: 401 });
    }
    return execute(request, requestId, { row, resource: row.resource(match, url) }, principal);
  }
  async function execute(request: AccessRequest, requestId: string, target: { row: RouteAction; resource: ResourceRef }, principal: Principal): Promise<Response> {
    const scope = access.forRequest(principal, { sourceIp: options.sourceIp?.(request) });
    request[requestAccess] = scope;
    setRequestActor(actorPseudonym(scope.principal));
    // A client never holds grants of its own: its agents.json entry decides through the policies.
    const withoutGrants = scope.principal.kind !== 'client' && !scope.principal.grants.length;
    const noAccess = mode === 'server' && (scope.principal.deactivated || withoutGrants);
    const trash = mode === 'server' ? trashLookup(ws, request) : undefined;
    let row = target.row;
    let resource = target.resource;
    if (trash?.entry) {
      resource = trashResource(trash.entry);
      if (row.action === 'restoreOwn') row = { ...row, action: restoreAction(trash.entry, scope) };
    }
    const verdict = routeDecision(scope, row, {
      resource,
      mode,
      resolvedTarget: Boolean(trash?.entry),
    });
    let decision = verdict.decision;
    resource = verdict.resource;
    if (row.action === 'readAudit') {
      const projects = auditScope(scope, ws);
      request[requestAuditProjects] = projects;
      // Audit routes are workspace routes, yet a Steward may read the records of their projects.
      // The rule name records in the audit why the workspace route was allowed.
      if (projects?.size) decision = { allow: true, status: 200, rules: ['steward-audit'] };
    }
    if (trash && !trash.entry) {
      // A missing entry is not a denial; a caller who could not act on any entry still is one.
      if (decision.allow && !noAccess) return Response.json({ error: 'Not found.' }, { status: 404 });
      decision = { ...decision, allow: false, status: 404 };
    } else if (trash?.entry && !readableTrash(trash.entry, scope)) {
      decision = { allow: false, status: 404, rules: [], reason: 'not-readable' };
    }
    if (noAccess) decision = { allow: false, status: 403, rules: [], reason: 'no-grant' };
    const input = auditInput({
      requestId,
      principal: scope.principal,
      action: row.action,
      resource,
      decision,
    });
    if (!decision.allow) {
      const failure = auditDenial(audit, { ...input, decision: 'deny' });
      if (failure) return failure;
      if (noAccess) {
        const api = new URL(request.url).pathname.startsWith('/api');
        if (api) return Response.json({ error: 'no access' }, { status: 403 });
        return new Response(null, { status: 302, headers: { Location: '/auth/no-access' } });
      }
      return refusal(decision);
    }
    let response: Response;
    try {
      response = await run(request);
    } catch (error) {
      if (!(error instanceof WriteAccessError)) throw error;
      return refusedTarget(audit, requestId, scope, error);
    }
    if (mode === 'server' && hiddenResponses.has(response)) {
      const failure = auditDenial(audit, {
        ...input,
        decision: 'deny',
        reason: 'not-readable',
      });
      return failure ?? Response.json({ error: 'Not found.' }, { status: 404 });
    }
    if (shouldAudit(row, request.method, 'allow')) {
      try {
        audit.append({ ...input, decision: 'allow', outcome: outcome(response.status) });
      } catch (error) {
        // The operation already ran; a failure response could trigger a duplicate write on retry.
        reportAuditFailure({ requestId, action: row.action, error });
      }
    }
    if (mode === 'server' && response.status === 404) {
      return Response.json({ error: 'Not found.' }, { status: 404 });
    }
    return response;
  }
  return async (request: Request): Promise<Response> => {
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
}
