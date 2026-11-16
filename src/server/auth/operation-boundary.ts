// Decides and executes operations through the same handler and durable audit path.
import type { Workspace } from '../projects/workspace';
import { readableTrash, restoreAction } from '../projects/trash';
import type { HandlerOptions } from './middleware';
import type { AccessControl, AccessScope } from './authorize';
import { auditableProjects, reportAuditFailure, type AuditLog } from './audit';
import { assertMinted, type Caller } from './caller';
import { scopeAllows } from './connection-scope';
import { operationForRow } from './operation-inventory';
import { routeFor, type RouteAction } from './route-actions';
import type { ResourceRef, Decision } from './resource';
import { WriteAccessError } from './write-access';
import { GuardedChangeError } from './guards';
import { READ_ACTIONS } from '../../shared/auth/actions';
import { attachIdentity, type AccessRequest } from './request-scope';
import { hiddenResponses, requestAuditId } from '../request';
import { actorPseudonym, setRequestActor } from '../observability/request-context';
import { auditDenial, agentRefusal } from './request-authentication';

/** One authenticated request to authorize and execute. */
export type OperationCall = {
  caller: Caller;
  request: Request;
  operation?: string;
  tool?: string;
  outcome?: (response: Response) => Promise<'ok' | 'refused' | 'failed' | 'degraded'> | 'ok' | 'refused' | 'failed' | 'degraded';
};

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

/** Creates the shared operation decision and execution boundary. */
export function createOperationBoundary(ws: Workspace, options: HandlerOptions & { access: AccessControl; audit: AuditLog }, run: (request: Request) => Promise<Response>) {
  const { access, audit } = options;
  const mode = options.mode ?? 'local';
  async function execute(request: AccessRequest, requestId: string, target: { row: RouteAction; resource: ResourceRef }, caller: Caller): Promise<Response> {
    const { principal } = caller;
    const scope = access.forRequest(principal, { sourceIp: caller.sourceIp });
    const projects = target.row.action === 'readAudit' ? auditScope(scope, ws) : undefined;
    attachIdentity(request, caller, { scope, requestId, remote: options.remoteCredentials ?? 'local', auditProjects: projects });
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
    const entry = operationForRow(target.row.path);
    if (entry && !scopeAllows(caller.scope, entry.effects)) decision = { allow: false, status: 403, rules: [], reason: 'connection-scope' };
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
      // Dynamic effects belong to the enclosing operation's audit record.
      const denied = error.decision.reason === 'connection-scope' ? new WriteAccessError(row.action, resource, error.decision) : error;
      return refusedTarget(audit, requestId, scope, denied);
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
  async function operate(call: OperationCall): Promise<{ response: Response; requestId: string }> {
    assertMinted(call.caller);
    const { caller } = call;
    const request = call.request as AccessRequest;
    const requestId = request[requestAuditId] ?? crypto.randomUUID();
    const url = new URL(request.url);
    const found = routeFor(request.method, url.pathname, mode);
    const entry = found ? operationForRow(found.row.path) : undefined;
    const wrongRow = call.operation !== undefined && call.operation !== entry?.id;
    const wrongTool = call.tool !== undefined && call.tool !== entry?.id;
    if (wrongRow || wrongTool || (caller.origin !== 'http' && (!found || found.row.public || entry?.dispatch !== 'twin'))) {
      const failure = auditDenial(audit, { requestId, principal: caller.principal, action: 'read', resource: { type: 'workspace' }, decision: 'deny', rules: [], reason: 'unmapped-route' });
      return { response: failure ?? Response.json({ error: 'Not found.' }, { status: 404 }), requestId };
    }
    const refused = caller.principal.kind === 'client' ? clientRouteRefusal(found) : null;
    if (refused) return { response: agentRefusal(audit, { requestId, principal: caller.principal, ...refused }), requestId };
    if (!found) return { response: new Response('Not found', { status: 404 }), requestId };
    const row = caller.principal.kind === 'client' ? clientRow(found.row) : found.row;
    const response = await execute(request, requestId, { row, resource: row.resource(found.match, url) }, caller);
    return { response, requestId };
  }
  return { operate };
}
