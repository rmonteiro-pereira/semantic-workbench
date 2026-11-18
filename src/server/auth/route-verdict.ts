// Shares the route admission decision between invocation and operation discovery.
import type { AccessScope } from './authorize';
import type { ResourceRef, Decision } from './resource';
import { routeResourceKind, type RouteAction } from './route-actions';
import { emptyAccessConfig } from './access-config';
import { projectResources } from './dry-run';
import { readableTrash, restoreAction, type TrashEntry } from '../projects/trash';
import { operationForRow } from './operation-inventory';
import { scopeAllows } from './connection-scope';
import type { Caller, CallerOrigin } from './caller';

/** Resolved target and caller constraints supplied without reading the request or workspace. */
export type RouteTarget = {
  resource: ResourceRef;
  origin?: CallerOrigin;
  trash?: Pick<TrashEntry, 'project' | 'path' | 'paths' | 'copy' | 'deletedBy'>;
  missingTrash?: boolean;
  auditProjects?: Set<string> | null;
  connectionScope?: Caller['scope'];
  projects?: () => Iterable<string>;
};

/** Admission result, including the effective action and legacy refusal disposition. */
export type RouteVerdict = {
  row: RouteAction;
  resource: ResourceRef;
  decision: Decision;
  noAccess: boolean;
  missing?: boolean;
  clientRefusal?: boolean;
};

function refusal(status: 403 | 404, reason: string): Decision {
  return { allow: false, status, rules: [], reason };
}

function routePass(scope: AccessScope, row: RouteAction, target: RouteTarget) {
  const resource = target.resource;
  const decision = scope.authorize(row.action, resource);
  const client = scope.principal.kind === 'client';
  if (decision.allow || target.trash || (row.targets !== 'body' && !client)) return { decision, resource };
  const projects = target.projects?.() ?? scope.view().readableProjects;
  const config = { ...emptyAccessConfig(), roles: scope.customRoles() };
  const files = row.targets !== 'body' && routeResourceKind(row) === 'file';
  const readAction = client ? 'agentRead' : 'read';
  for (const project of projects) {
    if (!scope.authorize(readAction, { type: 'project', project }).allow) continue;
    const candidates: ResourceRef[] = [{ type: 'project', project }];
    if (files) candidates.push(...projectResources(project, config, config));
    for (const candidate of candidates) {
      const permitted = scope.authorize(row.action, candidate);
      if (permitted.allow) return { decision: permitted, resource: candidate };
    }
  }
  return { decision: client ? { ...decision, status: 403 as const, reason: 'no-grant' } : decision, resource };
}

/** Decides one route with no request, workspace, audit, clock or response I/O. */
export function routeVerdict(scope: AccessScope, original: RouteAction, mode: 'local' | 'server', target: RouteTarget): RouteVerdict {
  const entry = operationForRow(original.path);
  const relay = target.origin === 'acp' && /^agentRelay\.(hello|frames|stream|bye)$/.test(entry?.id ?? '');
  if (target.origin && target.origin !== 'http' && !relay && (original.public || entry?.dispatch !== 'twin')) {
    return { row: original, resource: target.resource, decision: refusal(404, 'unmapped-route'), noAccess: false };
  }
  const client = scope.principal.kind === 'client';
  const noAccess = mode === 'server' && (scope.principal.deactivated || (!client && !scope.principal.grants.length));
  let row = client && original.clientAction ? { ...original, action: original.clientAction } : original;
  if (client && !original.clientAction) return { row, resource: target.resource, decision: refusal(403, 'bearer-scope'), noAccess, clientRefusal: true };
  if (mode === 'server' && target.trash && row.action === 'restoreOwn') row = { ...row, action: restoreAction(target.trash, scope) };
  if (noAccess) return { row, resource: target.resource, decision: refusal(403, 'no-grant'), noAccess };
  let { decision, resource } = routePass(scope, row, target);
  if (decision.allow && mode === 'server' && row.action === 'setIdentity') decision = refusal(404, 'local-only');
  if (row.action === 'readAudit' && target.auditProjects?.size) decision = { allow: true, status: 200, rules: ['steward-audit'] };
  if (mode === 'server' && target.missingTrash) {
    if (decision.allow && !noAccess) return { row, resource, decision, noAccess, missing: true };
    decision = { ...decision, allow: false, status: 404 };
  } else if (mode === 'server' && target.trash && !readableTrash(target.trash, scope)) {
    decision = refusal(404, 'not-readable');
  }
  if (decision.allow && entry && !scopeAllows(target.connectionScope, entry.effects)) decision = refusal(403, 'connection-scope');
  return { row, resource, decision, noAccess };
}

/** Candidate resources preserve the route's initial kind; body routes start at the workspace. */
export function* routeTargets(scope: AccessScope, row: RouteAction, projects: Iterable<string>, mode: 'local' | 'server' = 'server'): Generator<RouteTarget> {
  const trash = mode === 'server' && /^\w+ \/api\/trash\/:entry/.test(row.path);
  const kind = routeResourceKind(row);
  if (!trash && (row.targets === 'body' || kind === 'workspace')) {
    yield { resource: { type: 'workspace' } };
    return;
  }
  const config = { ...emptyAccessConfig(), roles: scope.customRoles() };
  for (const project of projects) {
    const resources: ResourceRef[] = kind === 'file' ? projectResources(project, config, config) : [{ type: 'project', project }];
    if (trash) resources.push(...projectResources(project, config, config));
    for (const resource of resources) {
      if (!trash) {
        yield { resource };
        continue;
      }
      for (const deletedBy of [scope.principal.id, 'another-person']) {
        yield { resource, trash: { project, ...(resource.type === 'file' ? { path: resource.path } : {}), deletedBy } };
      }
    }
  }
}
