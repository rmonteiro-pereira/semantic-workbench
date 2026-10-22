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
  if (scope.principal.kind === 'local') return LOCAL_READER;
  return { view: scope.view(), owner: scope.principal.id };
}
