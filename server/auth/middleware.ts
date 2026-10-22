// Applies one request-scoped decision and records outcomes before returning an HTTP response.
import { readableTrash } from '../projects/trash';
import { LOCAL_READER, type Reader } from '../projects/reader';
import { hiddenResponses } from '../routes/http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Workspace } from '../projects/workspace';
import { errorResponse } from '../routes/http';
import { createAccessControl, type AccessControl, type AccessScope } from './authorize';
import { emptyAccessConfig } from './access-config';
import { openAdminRepository, AdminConfigError } from './admin-repo';
import { createAuditLog, type AuditLog } from './audit';
import { localPrincipal, type Principal } from './principal';
import { routeFor, type RouteAction } from './route-actions';
import type { ResourceRef, Decision } from './resource';
import { validCsrf } from './csrf';
import type { ServerAuthentication } from './authentication';
import { READ_ACTIONS } from './actions';
import { requestAuditId } from '../request';

/** The access boundary instance shared across requests. */
export type { AccessControl } from './authorize';
/** Optional dependencies for server authentication and isolated middleware tests. */
export type HandlerOptions = {
  access?: AccessControl;
  principal?: (request: Request) => Principal | null | Promise<Principal | null>;
  audit?: AuditLog;
  mode?: 'local' | 'server';
  publicOrigin?: string;
  /** Origin of the provider's end-session page, which the sign-out form is redirected to. */
  providerOrigin?: string;
  port?: number;
  authentication?: ServerAuthentication['authentication'];
  roleNames?: Record<string, string>;
  staticRoot?: string;
};
/** Request scope attached for downstream filtering without repeating identity resolution. */
export const requestAccess = Symbol('requestAccess');
/** A request carrying its already resolved access scope. */
export type AccessRequest = Request & {
  [requestAuditId]?: string;
  [requestAccess]?: AccessScope;
};

/** The request's access scope; an unattached request is a programming error. */
export function requestScope(request: Request): AccessScope {
  const scope = (request as AccessRequest)[requestAccess];
  if (!scope) throw Error('Request has no access scope.');
  return scope;
}

/** Resolves the read boundary once; an unattached request is a programming error. */
export function requestReader(request: Request): Reader {
  const scope = requestScope(request);
  return scope.principal.kind === 'local'
    ? LOCAL_READER
    : { view: scope.view(), owner: scope.principal.id };
}

function defaultAccess(ws: Workspace, mode: 'local' | 'server'): AccessControl {
  let config = emptyAccessConfig();
  if (existsSync(join(ws.layout.root, 'admin'))) {
    try {
      config = openAdminRepository({ root: ws.layout.root }).load();
    } catch (error) {
      if (mode !== 'local' || !(error instanceof AdminConfigError)) throw error;
      console.error(`Invalid administration configuration; using local defaults: ${error.message}`);
    }
  }
  return createAccessControl({
    mode,
    config,
    bootstrap: { emails: [], ids: [] },
    groupMatch: 'exact',
    knownProjects: () => ws.state.registry().projects.map(project => project.slug),
  });
}
function outcome(status: number): 'ok' | 'refused' | 'failed' {
  if (status >= 200 && status < 300) return 'ok';
  if ([409, 412, 428].includes(status)) return 'refused';
  return 'failed';
}

/** Selects denials, explicitly audited routes, and operations other than ordinary reads. */
export function shouldAudit(row: RouteAction, method: string, decision: 'allow' | 'deny'): boolean {
  return (
    decision === 'deny' ||
    row.audited === true ||
    !(READ_ACTIONS.includes(row.action) && method === 'GET')
  );
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

function auditDenial(audit: AuditLog, input: Parameters<AuditLog['append']>[0]): Response | null {
  try {
    audit.append(input);
    return null;
  } catch {
    return Response.json({ error: 'Audit unavailable' }, { status: 503 });
  }
}

function auditInput(request: {
  requestId: string;
  principal: AccessScope['principal'];
  action: RouteAction['action'];
  resource: ResourceRef;
  decision: Decision;
}) {
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

/** Wraps routing with fail-closed access checks, request ids, and durable audit outcomes. */
export function createAccessMiddleware(
  ws: Workspace,
  options: HandlerOptions,
  localCheck: (request: Request) => Response | null,
  run: (request: Request) => Promise<Response>,
) {
  const mode = options.mode ?? 'local';
  const access = options.access ?? defaultAccess(ws, mode);
  const audit = options.audit ?? createAuditLog({ dir: join(ws.layout.state, 'audit') });
  const resolve = options.principal ?? (() => (mode === 'local' ? localPrincipal() : null));
  async function dispatch(request: AccessRequest, requestId: string): Promise<Response> {
    if (mode === 'local') {
      const refused = localCheck(request);
      if (refused) return refused;
    }
    const url = new URL(request.url);
    if (
      mode === 'server' &&
      !(await validCsrf(
        request,
        options.publicOrigin,
        url.pathname === '/auth/logout'
          ? (await options.authentication?.session(request))?.csrf
          : undefined,
      ))
    ) {
      return new Response('Forbidden', { status: 403 });
    }
    const page = mode === 'server' && !/^\/(api|auth)(\/|$)/.test(url.pathname);
    const found = routeFor(request.method, url.pathname, mode);
    if (!found) return new Response('Not found', { status: 404 });
    const { row, match } = found;
    if (row.public) return run(request);
    const principal = await resolve(request);
    if (!principal) {
      const failure = auditDenial(audit, {
        requestId,
        principal: { id: 'anonymous', kind: 'anonymous' },
        action: row.action,
        resource: { type: 'workspace' },
        decision: 'deny',
        rules: [],
        reason: 'sign-in-required',
      });
      if (failure) return failure;
      if (page && options.authentication) {
        return options.authentication.login(url.pathname + url.search, request);
      }
      return Response.json({ error: 'sign-in required' }, { status: 401 });
    }
    return execute(request, requestId, { row, resource: row.resource(match, url) }, principal);
  }
  async function execute(
    request: AccessRequest,
    requestId: string,
    target: { row: RouteAction; resource: ResourceRef },
    principal: Principal,
  ): Promise<Response> {
    let { row, resource } = target;
    const scope = access.forRequest(principal);
    request[requestAccess] = scope;
    const noAccess =
      mode === 'server' && (scope.principal.deactivated || !scope.principal.grants.length);
    // Local mode leaves trash lookups to the route, which keeps its own "not found" message.
    const trashId =
      mode === 'server'
        ? new URL(request.url).pathname.match(/^\/api\/trash\/([^/]+)/)?.[1]
        : undefined;
    const trashEntry = trashId
      ? ws.trash.list().find(entry => entry.entryId === trashId)
      : undefined;
    const hiddenTrash = Boolean(trashId) && (!trashEntry || !readableTrash(trashEntry, scope));
    if (!noAccess && trashId && !trashEntry) {
      return Response.json({ error: 'Not found.' }, { status: 404 });
    }
    if (trashEntry) {
      resource = trashEntry.path
        ? { type: 'file', project: trashEntry.project, path: trashEntry.path }
        : { type: 'project', project: trashEntry.project };
      if (row.action === 'restoreOwn' && trashEntry.owner !== scope.principal.id) {
        row = { ...row, action: 'restoreOthers' };
      }
    }
    let decision = scope.authorize(row.action, resource);
    if (hiddenTrash) decision = { allow: false, status: 404, rules: [], reason: 'not-readable' };
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
      const body =
        decision.status === 404
          ? { error: 'Not found.' }
          : { error: 'forbidden', rule: decision.rules[0] ?? decision.reason };
      return Response.json(body, { status: decision.status });
    }
    const response = await run(request);
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
      } catch {
        // The operation already ran; a failure response could trigger a duplicate write on retry.
        console.error(`Audit append failed for request ${requestId}`);
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
    let response: Response;
    try {
      response = await dispatch(request, requestId);
    } catch (error) {
      response = errorResponse(error, options.publicOrigin);
    }
    return requestIdResponse(response, requestId);
  };
}
