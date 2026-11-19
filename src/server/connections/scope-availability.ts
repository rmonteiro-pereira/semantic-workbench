// Which scopes a person's roles could ever use. A scope is available when a connection holding only that scope could reach at least one operation, so the consent page can show the others as unavailable instead of offering what would never work.
import { mintCaller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { Principal } from '../auth/principal';
import { scopeAllows } from '../auth/connection-scope';
import { offeredScopes, effectsOf, type OfferedScope } from './scopes';

/** For each offered scope, whether the person's roles allow any operation it carries. */
export type ScopeAvailability = Record<OfferedScope, boolean>;

// A connection's scope only filters operations the person's roles already admit, so one pass with
// every offered scope decides them all: a scope is available when an admitted operation's effects
// fit inside it. The pass stops as soon as every scope is known to be available.
export function scopeAvailability(boundary: OperationBoundary, principal: Principal): ScopeAvailability {
  const scopes = offeredScopes();
  const availability = Object.fromEntries(scopes.map(scope => [scope, false])) as ScopeAvailability;
  const probe = mintCaller({ principal, origin: 'mcp', connection: 'probe', scope: effectsOf(scopes) });
  let unknown = scopes.length;
  for (const operation of boundary.admittedOperations(probe)) {
    for (const scope of scopes) {
      if (availability[scope] || !scopeAllows(effectsOf([scope]), operation.effects)) continue;
      availability[scope] = true;
      unknown -= 1;
    }
    if (unknown === 0) break;
  }
  return availability;
}
