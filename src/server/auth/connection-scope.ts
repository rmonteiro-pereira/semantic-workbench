// Connection effects can restrict an authenticated caller but never grant a permission.
import type { Caller } from './caller';
import { requestConnectionScope, requestScope, type AccessRequest } from './request-scope';
import type { OperationEffect } from './operation-inventory';
import { WriteAccessError } from './write-access-error';

/** Whether a connection permits every effect an operation requires. */
export function scopeAllows(scope: Caller['scope'], effects: readonly OperationEffect[]): boolean {
  return scope === undefined || effects.every(effect => scope.includes(effect));
}

/** Refuses a dynamic effect before a handler performs it. */
export function requireEffect(request: Request, effect: OperationEffect): void {
  if (scopeAllows((request as AccessRequest)[requestConnectionScope], [effect])) return;
  requestScope(request);
  throw new WriteAccessError('read', { type: 'workspace' }, { allow: false, status: 403, rules: [], reason: 'connection-scope' });
}
