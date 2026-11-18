// Turns an authenticated relay connection into a caller for the operation boundary, narrowed to what a panel session may do.
import { mintCaller, type Caller } from '../auth/caller';
import type { OperationEffect } from '../auth/operation-inventory';
import type { Principal } from '../auth/principal';
import type { Session } from '../auth/sessions';

/** The only effects a panel session may ever carry: reading files and saving them locally. Commit, publish and the rest are never offered. */
export const PANEL_EFFECTS: readonly OperationEffect[] = ['read', 'localWrite'];

/** The requested effects that a panel session may carry, in the order requested. */
export function narrowToPanelEffects(requested: readonly OperationEffect[]): OperationEffect[] {
  return PANEL_EFFECTS.filter(effect => requested.includes(effect));
}

/** What authentication established about one relay connection. */
export type RelayIdentity = {
  principal: Principal;
  connection: string;
  scope: readonly OperationEffect[];
  session?: Session | null;
};

/** The caller for every file request of one panel session. Its scope can narrow the person's roles and never widen them. */
export function mintAcpCaller(identity: RelayIdentity): Caller {
  return mintCaller({
    principal: identity.principal,
    origin: 'acp',
    connection: identity.connection,
    scope: narrowToPanelEffects(identity.scope),
    session: identity.session,
  });
}
