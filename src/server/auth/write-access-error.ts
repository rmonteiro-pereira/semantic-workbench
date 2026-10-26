// A refused write target. It lives apart from authorizeWrite so the content guards can extend it
// without importing the request scope, which itself builds those guards.
import type { Action } from './actions';
import type { Decision, ResourceRef } from './resource';

/** A refused target, retained so the middleware audits the actual failed decision. */
export class WriteAccessError extends Error {
  constructor(
    public action: Action,
    public resource: ResourceRef,
    public decision: Decision,
  ) {
    super('Write target is not authorized.');
    this.name = 'WriteAccessError';
  }
}
