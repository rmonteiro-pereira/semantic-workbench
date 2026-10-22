// Presents effective identity and grant provenance without provider credentials.
import { requestAccess, type AccessRequest, type HandlerOptions } from '../auth/middleware';
import builtin from '../../policies/builtin-roles.json';

/** Shapes the current access scope for the person menu and permission-aware UI. */
export async function meResponse(
  request: AccessRequest,
  options: HandlerOptions,
): Promise<Response> {
  const scope = request[requestAccess]!;
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
  const roleNames =
    options.roleNames ?? Object.fromEntries(builtin.roles.map(role => [role.id, role.name]));
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
    connected: { azureDevOps: false, github: false },
    can: {
      admin: scope.authorize('admin', { type: 'workspace' }).allow,
      audit: scope.authorize('readAudit', { type: 'workspace' }).allow,
    },
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
