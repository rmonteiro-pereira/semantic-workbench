// Carries the resolved identity and policy snapshot from the access boundary to route handlers.
import type { AccessScope } from './authorize';
import { LOCAL_READER, type Reader } from '../projects/reader';
import { requestAuditId } from '../request';

/** Request scope attached after identity resolution, so routes never resolve identity again. */
export const requestAccess = Symbol('requestAccess');
/** A request carrying its already resolved access scope. */
export type AccessRequest = Request & {
  [requestAuditId]?: string;
  [requestAccess]?: AccessScope;
  [requestAuditProjects]?: Set<string> | null;
};
/**
 * The projects whose audit records an audit request may read, decided once by the access
 * boundary: null for an Admin, who reads every project's records.
 */
export const requestAuditProjects = Symbol('requestAuditProjects');

/** The request's access scope; an unattached request is a programming error. */
export function requestScope(request: Request): AccessScope {
  const scope = (request as AccessRequest)[requestAccess];
  if (!scope) throw Error('Request has no access scope.');
  return scope;
}

/** Resolves the read boundary once; an unattached request is a programming error. */
export function requestReader(request: Request): Reader {
  const scope = requestScope(request);
  if (scope.principal.kind === 'local') return LOCAL_READER;
  return { view: scope.view(), owner: scope.principal.id };
}

/** The audit projects the boundary decided; a request it did not decide is a programming error. */
export function auditProjects(request: Request): Set<string> | null {
  const projects = (request as AccessRequest)[requestAuditProjects];
  if (projects === undefined) throw Error('Request has no audit scope.');
  return projects;
}
