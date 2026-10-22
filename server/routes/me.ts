// Presents effective identity and grant provenance without provider credentials.
import { ACTIONS } from '../auth/actions';
import { requestScope } from '../auth/request-scope';
import { currentRoleNames, roleRequirements } from '../auth/role-requirements';
import type { HandlerOptions } from '../auth/middleware';

/** Shapes the current access scope for the person menu and permission-aware UI. */
export async function meResponse(request: Request, options: HandlerOptions): Promise<Response> {
  const scope = requestScope(request);
  const principal = scope.principal;
  const view = scope.view();
  const roles = {
    workspace: [
      ...new Set(
        principal.grants
          .filter(grant => grant.scope.kind === 'workspace')
          .map(grant => grant.roleId),
      ),
    ],
    projects: Object.fromEntries(
      [...view.readableProjects].map(project => [project, view.roles(project)]),
    ),
  };
  const roleNames = currentRoleNames(scope.customRoles(), options.roleNames);
  const body = {
    mode: options.mode ?? 'local',
    csrf: (await options.authentication?.session(request))?.csrf,
    id: principal.id,
    name: principal.name,
    verifiedEmail: principal.verifiedEmail,
    kind: principal.kind,
    roles,
    roleNames,
    roleSources: principal.grants.map(grant => ({
      roleId: grant.roleId,
      scope: grant.scope,
      via: grant.via,
      ...(grant.group ? { group: { id: grant.group } } : {}),
    })),
    groupsResolved: principal.groupsResolved,
    requires: roleRequirements(
      scope.customRoles(),
      principal.grants.map(grant => grant.roleId),
      roleNames,
    ),
    creationDomains: scope.creationDomains(),
    connected: { azureDevOps: false, github: false },
    can: {
      ...Object.fromEntries(
        ACTIONS.map(action => [action, scope.authorize(action, { type: 'workspace' }).allow]),
      ),
      admin: scope.authorize('admin', { type: 'workspace' }).allow,
      audit: scope.authorize('readAudit', { type: 'workspace' }).allow,
    },
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
