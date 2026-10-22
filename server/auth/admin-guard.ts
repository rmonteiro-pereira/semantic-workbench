// Protects recovery access independently of optional administrator-authored policies.
import type { AccessConfig } from './access-config';
import { adminHolders, type Bootstrap, type GrantOptions } from './grants';
import type { NormalizedPrincipal } from './principal';

/** A recorded human identity with the last successful sign-in time. */
export type RecordedUser = Pick<
  NormalizedPrincipal,
  'id' | 'kind' | 'groups' | 'groupsResolved' | 'verifiedEmail'
> & { lastSignInAt: string };
/** Matches emergency identities without trusting an unverified address or display name. */
export function isBootstrapAdmin(
  principal: Pick<NormalizedPrincipal, 'id' | 'verifiedEmail'>,
  bootstrap: Bootstrap,
): boolean {
  return (
    bootstrap.ids.includes(principal.id) ||
    Boolean(
      principal.verifiedEmail &&
      bootstrap.emails.some(
        email => email.toLowerCase() === principal.verifiedEmail!.toLowerCase(),
      ),
    )
  );
}
/** Refuses a proposed configuration with no recent human Admin and no bootstrap recovery. */
export function checkLastAdmin(
  next: AccessConfig,
  options: {
    users: RecordedUser[];
    bootstrap: Bootstrap;
    sessionLifetimeHours: number;
    now: Date;
    groupMatch?: GrantOptions['groupMatch'];
  },
): { ok: true } | { ok: false; reason: 'last-admin' } {
  const cutoff = options.now.getTime() - options.sessionLifetimeHours * 3_600_000;
  const disabled = new Set(next.deactivated.principals.map(principal => principal.id));
  const users = options.users.filter(
    user =>
      user.kind === 'person' &&
      !disabled.has(user.id) &&
      Date.parse(user.lastSignInAt) >= cutoff &&
      Date.parse(user.lastSignInAt) <= options.now.getTime(),
  );
  const holders = adminHolders(
    users,
    next.grants,
    options.bootstrap,
    options.groupMatch ?? 'exact',
  );
  if (holders.ids.length + holders.bootstrapCount > 0) return { ok: true };
  return { ok: false, reason: 'last-admin' };
}
