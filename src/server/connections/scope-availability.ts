// Which scopes a person's roles could ever use. A scope is available when a connection holding only that scope could reach at least one operation, so the consent page can show the others as unavailable instead of offering what would never work.
import { mintCaller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { Principal } from '../auth/principal';
import { offeredScopes, effectsOf, type OfferedScope } from './scopes';

/** For each offered scope, whether the person's roles allow any operation it carries. */
export type ScopeAvailability = Record<OfferedScope, boolean>;

export function scopeAvailability(boundary: OperationBoundary, principal: Principal): ScopeAvailability {
  const availability = {} as ScopeAvailability;
  for (const scope of offeredScopes()) {
    const probe = mintCaller({ principal, origin: 'mcp', connection: 'probe', scope: effectsOf([scope]) });
    availability[scope] = boundary.availableOperations(probe).length > 0;
  }
  return availability;
}
