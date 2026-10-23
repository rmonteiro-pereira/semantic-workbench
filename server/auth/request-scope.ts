// Carries the resolved identity and policy snapshot from the access boundary to route handlers.
import type { Action } from './actions';
import type { AccessScope } from './authorize';
import type { RemoteCredentials } from './remote-credentials';
import { LOCAL_READER, type CopyAccess, type Reader } from '../projects/reader';
import { requestAuditId, requestSourceIp } from '../request';
import { guardFor } from './guards';

/** Request scope attached after identity resolution, so routes never resolve identity again. */
export const requestAccess = Symbol('requestAccess');
/** Server mode's per-person remote Git credentials, or `local`, attached before routes run. */
export const requestRemote = Symbol('requestRemote');
/** A request carrying its already resolved access scope. */
export type AccessRequest = Request & {
  [requestAuditId]?: string;
  [requestSourceIp]?: string;
  [requestAccess]?: AccessScope;
  [requestAuditProjects]?: Set<string> | null;
  [requestRemote]?: RemoteCredentials | 'local';
};
/**
 * The projects whose audit records an audit request may read, decided once by the access
 * boundary: null for an Admin, who reads every project's records.
 */
export const requestAuditProjects = Symbol('requestAuditProjects');

/**
 * Makes the server's credential service reachable from the routes of this request; `local` says
 * Git keeps using the machine's own credential configuration.
 */
export function attachRemoteCredentials(request: Request, remote: RemoteCredentials | 'local') {
  (request as AccessRequest)[requestRemote] = remote;
}

/** The request's access scope; an unattached request is a programming error. */
export function requestScope(request: Request): AccessScope {
  const scope = (request as AccessRequest)[requestAccess];
  if (!scope) throw Error('Request has no access scope.');
  return scope;
}

// Holding any of these on a project means the person changes it, so they read their own copy.
const COPY_ACTIONS: Action[] = ['edit', 'import', 'move', 'delete', 'revert', 'stage', 'commit'];

/**
 * Resolves the read boundary once, with the governance guard of the person's content writes; an
 * unattached request is a programming error.
 */
export function requestReader(request: Request): Reader {
  const scope = requestScope(request);
  const { principal } = scope;
  if (principal.kind === 'local') return LOCAL_READER;
  const reader = { view: scope.view(), owner: principal.id, guard: guardFor(scope) };
  if (principal.kind !== 'person') return reader;
  // Only a person who may edit a project works in a copy of it; everyone else reads the
  // published state.
  const copy: CopyAccess = {
    key: principal.key,
    author: {
      name: principal.name,
      email: principal.verifiedEmail ?? principal.username,
      id: principal.id,
    },
    editable: project =>
      COPY_ACTIONS.some(action => scope.authorize(action, { type: 'project', project }).allow),
  };
  return { ...reader, copy };
}

/** The audit projects the boundary decided; a request it did not decide is a programming error. */
export function auditProjects(request: Request): Set<string> | null {
  const projects = (request as AccessRequest)[requestAuditProjects];
  if (projects === undefined) throw Error('Request has no audit scope.');
  return projects;
}
