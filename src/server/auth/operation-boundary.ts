// Decides and executes operations through the same handler and durable audit path.
import { receiptReplay, type ReceiptReplay, type ReceiptReplayRequest } from './receipt-replay';
import { executeOperation } from './operation-execution';
import { operationClassifiers } from './operation-classifiers';
import { recordOperation } from '../observability/metrics';
import { withSpan } from '../observability/tracing';
import { callResultOf, classifyOutcome, statusOutcome, OPERATION_OUTCOMES, type OperationOutcome, type OutcomeClassifier } from './operation-outcome';
import type { Workspace } from '../projects/workspace';
import { routeVerdict, routeTargets, type RouteVerdict } from './route-verdict';
import type { RemoteCredentials } from './remote-credentials';
import type { AccessControl, AccessScope } from './authorize';
import { auditableProjects, reportAuditFailure, type AuditLog } from './audit';
import { assertMinted, type Caller, type CallerOrigin } from './caller';
import { log } from '../observability/log';
import { CALLER_ORIGINS, operationById, operationForRow, type OperationEffect } from './operation-inventory';
import { ROUTE_ACTIONS, routeFor, routeResourceKind, type RouteAction } from './route-actions';
import type { ResourceRef, Decision } from './resource';
import { WriteAccessError } from './write-access';
import { GuardedChangeError } from './guards';
import { READ_ACTIONS } from '../../shared/auth/actions';
import { attachIdentity, requestDisclosureShown, requestProposal, requestPublication, requestPublicationRefusal, type AccessRequest } from './request-scope';
import { hiddenResponses, requestAuditId } from '../request';
import { actorPseudonym, setRequestActor } from '../observability/request-context';
import { auditDenial, agentRefusal } from './refusal';
import { requestSurface } from './request-surface';
import { routeTarget } from '../usage/usage-items';
import type { UsageRecorder } from '../usage/usage-recorder';

/** Dependencies needed to decide and execute authenticated operations. */
export type OperationBoundaryOptions = {
  mode?: 'local' | 'server';
  access: AccessControl;
  audit: AuditLog;
  remoteCredentials?: RemoteCredentials;
  /** Counts the items of successful counted answers; absent or no-op when counters are off. */
  usage?: UsageRecorder;
};

/** The original resource metadata a restore receipt carries across retries. */
export type { ReceiptReplay, ReceiptTrashTarget } from './receipt-replay';

/** One authenticated request to authorize and execute. */
export type OperationCall = {
  caller: Caller;
  request: Request;
  operationId?: string;
  replay?: ReceiptReplay;
};

/** The projects whose audit records the caller may read: null for an Admin, who reads them all. */
function auditScope(scope: AccessScope, ws: Workspace): Set<string> | null {
  if (scope.authorize('admin', { type: 'workspace' }).allow) return null;
  return auditableProjects(scope, projectSlugs(ws));
}
function projectSlugs(ws: Workspace): string[] {
  return ws.state.registry().projects.map(project => project.slug);
}
/** What a refused protocol caller is told: a hidden target reads as missing, any other refusal as refused. */
function deniedResult(input: { decision: 'allow' | 'deny'; reason?: string }): string | undefined {
  if (input.decision !== 'deny') return undefined;
  return input.reason === 'not-readable' ? 'not_found' : 'refused';
}
/** Selects denials, explicitly audited routes, and operations other than ordinary reads. */
export function shouldAudit(row: RouteAction, method: string, decision: 'allow' | 'deny', origin: CallerOrigin = 'http'): boolean {
  if (decision === 'deny' || origin !== 'http') return true;
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
function refusedTarget(audit: AuditLog, requestId: string, scope: AccessScope, error: WriteAccessError, publication: AccessRequest[typeof requestPublication]): Response {
  const denied = auditInput({
    requestId,
    principal: scope.principal,
    action: error.action,
    resource: error.resource,
    decision: error.decision,
  });
  const failure = auditDenial(audit, { ...denied, decision: 'deny', ...(publication ? { publication } : {}) });
  return failure ?? refusal(error.decision, error);
}

/**
 * Finds the entry a trash route names, so the decision and the audit use its original target.
 * Local mode leaves the lookup to the route, which keeps its own "not found" message.
 */
function trashLookup(ws: Workspace, request: ReceiptReplayRequest) {
  const original = request[receiptReplay]?.trash;
  if (original) return { entry: original };
  const trashId = new URL(request.url).pathname.match(/^\/api\/trash\/([^/]+)/)?.[1];
  if (!trashId) return undefined;
  return { entry: ws.trash.list().find(candidate => candidate.entryId === trashId) };
}

function trashResource(entry: { project: string; path?: string }): ResourceRef {
  if (entry.path) return { type: 'file', project: entry.project, path: entry.path };
  return { type: 'project', project: entry.project };
}

/** Creates the shared operation decision and execution boundary. */
export function createOperationBoundary(ws: Workspace, options: OperationBoundaryOptions, run: (request: Request) => Promise<Response>) {
  const { access, audit: sharedAudit } = options;
  const mode = options.mode ?? 'local';
  type Execution = {
    request: AccessRequest;
    requestId: string;
    target: { row: RouteAction; resource: ResourceRef };
    caller: Caller;
    audit: AuditLog;
    classifier?: OutcomeClassifier;
    observation: { outcome?: OperationOutcome };
  };

  function decide(input: Execution) {
    const { request, requestId, caller, target } = input;
    const scope = access.forRequest(caller.principal, { sourceIp: caller.sourceIp });
    const projects = target.row.action === 'readAudit' ? auditScope(scope, ws) : undefined;
    attachIdentity(request, caller, { scope, requestId, remote: options.remoteCredentials ?? 'local', auditProjects: projects });
    setRequestActor(actorPseudonym(scope.principal));
    const trash = mode === 'server' ? trashLookup(ws, request) : undefined;
    const verdict = routeVerdict(scope, target.row, mode, {
      resource: trash?.entry ? trashResource(trash.entry) : target.resource,
      trash: trash?.entry,
      missingTrash: Boolean(trash && !trash.entry),
      auditProjects: projects,
      connectionScope: caller.scope,
      origin: caller.origin,
    });
    const record = auditInput({ requestId, principal: scope.principal, action: verdict.row.action, resource: verdict.resource, decision: verdict.decision });
    return { scope, verdict, record };
  }

  function deniedResponse(input: Execution, verdict: RouteVerdict, record: ReturnType<typeof auditInput>): Response {
    const { audit, request, requestId, caller } = input;
    if (verdict.clientRefusal) return agentRefusal(audit, { requestId, principal: caller.principal, reason: 'bearer-scope', status: 403 });
    const failure = auditDenial(audit, { ...record, decision: 'deny' });
    if (failure) return failure;
    if (!verdict.noAccess) return refusal(verdict.decision);
    if (new URL(request.url).pathname.startsWith('/api')) return Response.json({ error: 'no access' }, { status: 403 });
    return new Response(null, { status: 302, headers: { Location: '/auth/no-access' } });
  }

  async function runAuthorized(input: Execution, scope: AccessScope, verdict: RouteVerdict, record: ReturnType<typeof auditInput>) {
    let response: Response;
    try {
      const entry = operationForRow(verdict.row.path);
      if (!entry) throw new Error(`Missing operation inventory entry: ${verdict.row.path}.`);
      response = await executeOperation(entry, () => run(input.request));
    } catch (error) {
      if (!(error instanceof WriteAccessError)) throw error;
      // Dynamic effects belong to the enclosing operation's audit record.
      const denied = error.decision.reason === 'connection-scope' ? new WriteAccessError(verdict.row.action, verdict.resource, error.decision) : error;
      return { response: refusedTarget(input.audit, input.requestId, scope, denied, input.request[requestPublication]), denied: true };
    }
    if (mode === 'server' && hiddenResponses.has(response)) {
      const failure = auditDenial(input.audit, { ...record, decision: 'deny', reason: 'not-readable' });
      return { response: failure ?? Response.json({ error: 'Not found.' }, { status: 404 }), denied: true };
    }
    return { response, denied: false };
  }

  function auditAllowed(input: Execution, verdict: RouteVerdict, record: ReturnType<typeof auditInput>, semanticOutcome: OperationOutcome, result: string | undefined): void {
    if (!shouldAudit(verdict.row, input.request.method, 'allow', input.caller.origin)) return;
    try {
      const publication = input.request[requestPublication];
      const reason = input.request[requestPublicationRefusal];
      const proposal = input.request[requestProposal];
      const disclosure = input.request[requestDisclosureShown];
      input.audit.append({
        ...record,
        ...(disclosure ? { disclosureShown: true } : {}),
        decision: 'allow',
        outcome: semanticOutcome,
        ...(result ? { result } : {}),
        ...(publication ? { publication } : {}),
        ...(proposal ? { proposal } : {}),
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      // The operation already ran; a failure response could trigger a duplicate write on retry.
      reportAuditFailure({ requestId: input.requestId, action: verdict.row.action, error });
    }
  }

  async function execute(input: Execution): Promise<Response> {
    const { scope, verdict, record } = decide(input);
    if (verdict.missing) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (!verdict.decision.allow) return deniedResponse(input, verdict, record);
    const { response, denied } = await runAuthorized(input, scope, verdict, record);
    if (denied) return response;
    const semanticOutcome = input.classifier ? await classifyOutcome(response, input.classifier) : statusOutcome(response.status);
    input.observation.outcome = semanticOutcome;
    const operationId = operationForRow(verdict.row.path)?.id ?? '';
    const result = input.caller.attribution ? await callResultOf(operationId, response) : undefined;
    auditAllowed(input, verdict, record, semanticOutcome, result);
    if (mode === 'server' && response.status === 404) return Response.json({ error: 'Not found.' }, { status: 404 });
    return response;
  }
  async function operate(call: OperationCall): Promise<{ response: Response; requestId: string }> {
    assertMinted(call.caller);
    const { caller } = call;
    const request = call.request as AccessRequest & ReceiptReplayRequest;
    if (call.replay) request[receiptReplay] = call.replay;
    const requestId = request[requestAuditId] ?? crypto.randomUUID();
    const url = new URL(request.url);
    const found = routeFor(request.method, url.pathname, mode);
    const entry = found ? operationForRow(found.row.path) : undefined;
    const audit: AuditLog =
      caller.origin === 'http'
        ? sharedAudit
        : {
            ...sharedAudit,
            append: input =>
              sharedAudit.append({
                ...input,
                origin: caller.origin,
                tool: entry?.id,
                connection: caller.connection,
                ...caller.attribution,
                ...(caller.attribution ? { result: input.result ?? deniedResult(input) } : {}),
              }),
          };
    const wrongRow = call.operationId !== undefined && call.operationId !== entry?.id;
    if (wrongRow || (caller.origin !== 'http' && !found)) {
      const failure = auditDenial(audit, { requestId, principal: caller.principal, action: 'read', resource: { type: 'workspace' }, decision: 'deny', rules: [], reason: 'unmapped-route' });
      return { response: failure ?? Response.json({ error: 'Not found.' }, { status: 404 }), requestId };
    }
    if (!found) {
      const response =
        caller.principal.kind === 'client' ? agentRefusal(audit, { requestId, principal: caller.principal, reason: 'unmapped-route', status: 404 }) : new Response('Not found', { status: 404 });
      return { response, requestId };
    }
    const row = found.row;
    const started = performance.now();
    const observation: { outcome?: OperationOutcome } = {};
    const classifier = caller.origin !== 'http' && entry?.outcomeClassifier ? operationClassifiers[entry.outcomeClassifier] : undefined;
    const invoke = () => execute({ request, requestId, target: { row, resource: row.resource(found.match, url) }, caller, audit, classifier, observation });
    const response = caller.origin === 'http' || !entry ? await invoke() : await withSpan('operation.' + entry.id, { attributes: { origin: caller.origin, operation: entry.id } }, invoke);
    const responseOutcome = statusOutcome(response.status, true);
    try {
      if (entry) {
        const outcome = observation.outcome ?? responseOutcome;
        if (!CALLER_ORIGINS.includes(caller.origin) || !operationById(entry.id) || !OPERATION_OUTCOMES.includes(outcome)) throw Error('Invalid operation metric labels.');
        recordOperation(caller.origin, entry.id, outcome, performance.now() - started);
      }
    } catch (error) {
      // A telemetry exporter cannot make a completed write appear retryable.
      log.warn('operation.metrics-failed', { requestId, operation: entry?.id, errorMessage: error instanceof Error ? error.message : String(error) });
    }
    // Counting happens after the answer exists and never waits for the disk or changes the answer.
    try {
      // A tool call runs inside the agent endpoint's own operation, which does not own the snapshot read that
      // counting does, so counting runs as the counted operation itself.
      if (entry?.usage) {
        const counted = {
          operationId: entry.id,
          origin: caller.origin,
          surface: requestSurface(request),
          outcome: observation.outcome ?? responseOutcome,
          target: routeTarget(row.resource(found.match, url)),
          response,
        };
        executeOperation(entry, () => options.usage?.record(counted));
      }
    } catch {
      log.warn('usage.record-failed', { requestId });
    }
    return { response, requestId };
  }
  /** Lists sorted operation ids admitted by effective policy and connection effects. */
  /** Yields, in route inventory order, each operation the caller may use, deciding each one only when asked. */
  function* admittedOperations(caller: Caller): Generator<{ id: string; effects: readonly OperationEffect[] }> {
    assertMinted(caller);
    const scope = access.forRequest(caller.principal, { sourceIp: caller.sourceIp });
    let projects: string[] | undefined;
    const probeProjects = () => (projects ??= scope.probeProjects());
    let auditProjects: Set<string> | null | undefined;
    const permitted = new Map<string, boolean>();
    for (const row of ROUTE_ACTIONS) {
      const entry = operationForRow(row.path);
      if (entry?.dispatch !== 'twin') continue;
      const trash = /\/api\/trash\/:entry/.test(row.path);
      const key = JSON.stringify([row.action, row.clientAction, row.targets ?? routeResourceKind(row), trash, entry.effects]);
      if (!permitted.has(key)) {
        if (row.action === 'readAudit' && auditProjects === undefined) auditProjects = auditScope(scope, ws);
        const targets = routeTargets(scope, row, probeProjects(), mode);
        let admitted = false;
        for (const target of targets) {
          const verdict = routeVerdict(scope, row, mode, { ...target, projects: probeProjects, auditProjects, connectionScope: caller.scope, origin: caller.origin });
          if (!verdict.decision.allow) continue;
          admitted = true;
          break;
        }
        permitted.set(key, admitted);
      }
      if (permitted.get(key)) yield { id: entry.id, effects: entry.effects };
    }
  }
  /** The ids of every operation the caller may use, sorted. */
  function availableOperations(caller: Caller): string[] {
    return [...admittedOperations(caller)].map(operation => operation.id).sort();
  }
  return { operate, availableOperations, admittedOperations };
}

/** The decision and execution boundary a transport adapter calls with an authenticated caller. */
export type OperationBoundary = ReturnType<typeof createOperationBoundary>;
