// Carries additional target decisions back to the request boundary for a single audit record.
import type { Action } from '../../shared/auth/actions';
import type { ResourceRef, DecisionContext } from './resource';
import { requestScope } from './request-scope';
import { WriteAccessError } from './write-access-error';

export { WriteAccessError };

/** Checks every target before an operation can change any of them. */
export function authorizeWrite(
  request: Request,
  action: Action,
  resources: ResourceRef[],
  context: Partial<DecisionContext> = {},
): void {
  const scope = requestScope(request);
  if (scope.principal.kind === 'local') return;
  for (const resource of resources) {
    const decision = scope.authorize(action, resource, context);
    if (!decision.allow) throw new WriteAccessError(action, resource, decision);
  }
}
