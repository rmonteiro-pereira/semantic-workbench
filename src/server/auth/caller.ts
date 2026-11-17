// Runtime provenance distinguishes authenticated callers from structural TypeScript copies.
import type { RequestSurface } from './request-surface';
import type { Principal } from './principal';
import type { Session } from './sessions';
import type { OperationEffect } from './operation-inventory';

import type { CallerOrigin } from '../../shared/observability/operation';
/** Transport that authenticated one operation's caller. */
export type { CallerOrigin } from '../../shared/observability/operation';

/** Authenticated identity and connection context, created by authentication code. */
export type Caller = Readonly<{
  principal: Principal;
  origin: CallerOrigin;
  surface?: RequestSurface;
  sourceIp?: string;
  session?: Session | null;
  connection?: string;
  scope?: readonly OperationEffect[];
}>;

const minted = new WeakSet<Caller>();

/** Mints a caller after authentication has established the identity and connection. */
export function mintCaller(identity: Caller): Caller {
  const caller = Object.freeze({ ...identity });
  minted.add(caller);
  return caller;
}

/** Refuses identities that did not pass through the caller mint. */
export function assertMinted(caller: Caller): void {
  if (!minted.has(caller)) throw new Error('Caller was not minted by authentication.');
}
