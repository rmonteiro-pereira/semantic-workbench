// Protects recovery access independently of optional administrator-authored policies.
import type { AccessConfig } from './access-config';
import { createAccessControl } from './authorize';
import { PolicyLoadError } from './cedar';
import type { Bootstrap, GrantOptions } from './grants';
import type { NormalizedPrincipal } from './principal';

/** A recorded human identity with the last successful sign-in time. */
export type RecordedUser = Pick<NormalizedPrincipal, 'id' | 'kind' | 'groups' | 'groupsResolved' | 'verifiedEmail'> & { lastSignInAt: string };
/** Matches emergency identities without trusting an unverified address or display name. */
export function isBootstrapAdmin(principal: Pick<NormalizedPrincipal, 'id' | 'verifiedEmail'>, bootstrap: Bootstrap): boolean {
  return bootstrap.ids.includes(principal.id) || Boolean(principal.verifiedEmail && bootstrap.emails.some(email => email.toLowerCase() === principal.verifiedEmail!.toLowerCase()));
}

/** Settings of the last-Admin check: who signed in, the recovery identities and the clock. */
export type LastAdminOptions = {
  users: RecordedUser[];
  bootstrap: Bootstrap;
  sessionLifetimeHours: number;
  now: Date;
  groupMatch?: GrantOptions['groupMatch'];
};

function signInIdentity(user: RecordedUser): NormalizedPrincipal {
  return {
    id: user.id,
    key: user.id,
    kind: user.kind,
    name: user.id,
    username: user.id,
    verifiedEmail: user.verifiedEmail,
    groups: user.groups,
    groupsResolved: user.groupsResolved,
    groupOverage: false,
  };
}

/** People who signed in within one session lifetime and are not deactivated by `next`. */
function recentPeople(next: AccessConfig, options: LastAdminOptions): NormalizedPrincipal[] {
  const cutoff = options.now.getTime() - options.sessionLifetimeHours * 3_600_000;
  const disabled = new Set(next.deactivated.principals.map(principal => principal.id));
  return options.users
    .filter(user => user.kind === 'person' && !disabled.has(user.id) && Date.parse(user.lastSignInAt) >= cutoff && Date.parse(user.lastSignInAt) <= options.now.getTime())
    .map(signInIdentity);
}

/** One identity per configured bootstrap id or address, as it would sign in. */
function bootstrapIdentities(bootstrap: Bootstrap): NormalizedPrincipal[] {
  const byId = bootstrap.ids.map(id =>
    signInIdentity({
      id,
      kind: 'person',
      groups: [],
      groupsResolved: 'token',
      verifiedEmail: null,
      lastSignInAt: '',
    }),
  );
  const byEmail = bootstrap.emails.map(email =>
    signInIdentity({
      id: 'bootstrap:' + email.toLowerCase(),
      kind: 'person',
      groups: [],
      groupsResolved: 'token',
      verifiedEmail: email,
      lastSignInAt: '',
    }),
  );
  return [...byId, ...byEmail];
}

/** The access boundary `next` would create, or null when it cannot be loaded. */
function proposedAccess(next: AccessConfig, options: LastAdminOptions) {
  try {
    return createAccessControl({
      mode: 'server',
      config: next,
      bootstrap: options.bootstrap,
      groupMatch: options.groupMatch ?? 'exact',
      knownProjects: () => [],
      context: () => ({ hour: options.now.getUTCHours() }),
    });
  } catch (error) {
    if (error instanceof PolicyLoadError) return null;
    throw error;
  }
}

/**
 * Refuses a proposed configuration under which no recent human Admin and no bootstrap identity
 * would be allowed the `admin` action. The proposed grants, roles and rules are evaluated by a
 * separate access boundary, so a policy that forbids Admins counts as removing them.
 */
export function checkLastAdmin(next: AccessConfig, options: LastAdminOptions): { ok: true } | { ok: false; reason: 'last-admin' } {
  const proposed = proposedAccess(next, options);
  const bootstrap = bootstrapIdentities(options.bootstrap);
  // Proposals are validated before this check. A configuration that still cannot be loaded leaves
  // only the bootstrap identities, which the server recognizes from its own settings.
  if (!proposed) return bootstrap.length > 0 ? { ok: true } : { ok: false, reason: 'last-admin' };
  const allowed = [...recentPeople(next, options), ...bootstrap].some(identity => proposed.authorize(proposed.principalFor(identity), 'admin', { type: 'workspace' }).allow);
  if (allowed) return { ok: true };
  return { ok: false, reason: 'last-admin' };
}
