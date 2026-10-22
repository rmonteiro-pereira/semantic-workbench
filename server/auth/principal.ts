// Normalizes trusted identity claims and applies explicitly supplied directory membership.
import { createHash } from 'node:crypto';
import type { MatchedGrant } from './grants';

/** Provider-specific names and tenant restriction for trusted claims. */
export type ClaimMapping = {
  provider: 'entra' | 'keycloak' | 'generic';
  groupClaim: string;
  tenantId: string | null;
};

/** Identity fields retained after token validation. */
export type NormalizedPrincipal = {
  id: string;
  key: string;
  kind: 'person' | 'client' | 'local';
  clientId?: string;
  name: string;
  username: string;
  verifiedEmail: string | null;
  groups: string[];
  groupsResolved: 'token' | 'directory' | 'failed';
  groupOverage: boolean;
};

/** A request identity with its matched access grants. */
export type Principal = NormalizedPrincipal & { grants: MatchedGrant[]; deactivated: boolean };

/** Invalid identity claims that cannot identify a trusted principal. */
export class ClaimError extends Error {
  constructor(
    message: string,
    public readonly reason: 'tenant-mismatch' | 'token-invalid' = 'token-invalid',
  ) {
    super(message);
  }
}

/** Stable, filesystem-safe key derived solely from the principal id. */
export function principalKey(id: string): string {
  return 'u' + createHash('sha256').update(id).digest('hex').slice(0, 20);
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function required(claims: Record<string, unknown>, name: string): string {
  const value = string(claims[name]);
  if (!value) throw new ClaimError(`Missing identity claim: ${name}`);
  return value;
}

function address(value: unknown): string | null {
  const candidate = string(value).trim().toLowerCase();
  return candidate.includes('@') && !candidate.includes('#ext#') ? candidate : null;
}

function verifiedAddress(claims: Record<string, unknown>, entra: boolean): string | null {
  if (!entra) return claims.email_verified === true ? address(claims.email) : null;
  const verified = claims.xms_edov === true || claims.xms_edov === 'true';
  return (
    (verified ? address(claims.email) : null) ??
    address(claims.upn) ??
    address(claims.preferred_username)
  );
}

/** Refuses an Entra tenant other than the configured one. */
function refuseOtherTenant(tenant: string, mapping: Pick<ClaimMapping, 'tenantId'>): void {
  if (mapping.tenantId && tenant.toLowerCase() !== mapping.tenantId.toLowerCase()) {
    throw new ClaimError(
      'Identity tenant does not match the configured tenant.',
      'tenant-mismatch',
    );
  }
}

function identity(claims: Record<string, unknown>, mapping: ClaimMapping) {
  if (mapping.provider !== 'entra') {
    return { id: `${required(claims, 'iss')}|${required(claims, 'sub')}` };
  }
  const tenant = required(claims, 'tid');
  const object = required(claims, 'oid').toLowerCase();
  refuseOtherTenant(tenant, mapping);
  // Applications sign in only as agent clients, through clientFromToken on the agent API.
  if (claims.idtyp === 'app') throw new ClaimError('An application cannot sign in.');
  return { id: `${tenant}:${object}` };
}

/** Converts validated provider claims into the identity used by access grants. */
export function normalizeClaims(
  claims: Record<string, unknown>,
  mapping: ClaimMapping,
): NormalizedPrincipal {
  const identified = identity(claims, mapping);
  const entra = mapping.provider === 'entra';
  const sources = claims._claim_names;
  const groupOverage =
    entra &&
    (claims.hasgroups === true ||
      Boolean(
        sources && typeof sources === 'object' && 'groups' in sources && string(sources.groups),
      ));
  const groupClaim = claims[mapping.groupClaim];
  const groups = Array.isArray(groupClaim)
    ? groupClaim.filter((group): group is string => typeof group === 'string')
    : [];
  const username =
    string(claims.preferred_username) ||
    string(claims.email) ||
    string(claims.sub) ||
    identified.id;
  return {
    ...identified,
    key: principalKey(identified.id),
    kind: 'person',
    name: string(claims.name) || username,
    username,
    verifiedEmail: verifiedAddress(claims, entra),
    groups: groupOverage ? [] : groups.map(group => (entra ? group.toLowerCase() : group)),
    groupsResolved: groupOverage ? 'failed' : 'token',
    groupOverage,
  };
}

/** Applies a directory lookup without retaining stale groups after a failed lookup. */
export function withDirectoryGroups<T extends NormalizedPrincipal>(
  principal: T,
  groups: string[] | null,
): T {
  return {
    ...principal,
    groups: groups?.map(group => group.toLowerCase()) ?? [],
    groupsResolved: groups === null ? 'failed' : 'directory',
  };
}

/** Creates the implicit workspace Admin used by the local decision boundary. */
export function localPrincipal(): Principal {
  return {
    id: 'local',
    key: principalKey('local'),
    kind: 'local',
    name: 'Local',
    username: 'local',
    verifiedEmail: null,
    groups: [],
    groupsResolved: 'token',
    groupOverage: false,
    grants: [{ grantId: 'local', roleId: 'admin', scope: { kind: 'workspace' }, via: 'local' }],
    deactivated: false,
  };
}

/** Resolves overage through the supplied directory edge before grants are matched. */
export async function resolvePrincipalGroups(
  principal: NormalizedPrincipal,
  lookup: (oid: string) => Promise<string[] | null>,
): Promise<NormalizedPrincipal> {
  if (!principal.groupOverage) return principal;
  return withDirectoryGroups(principal, await lookup(principal.id.split(':')[1]));
}

/**
 * The only way to build an agent client principal, used by the bearer path, the Admin panel's
 * simulator and its dry runs alike. The client starts with no grants: only its entry in
 * agents.json authorizes it.
 */
export function clientPrincipal(clientId: string, name: string = clientId): Principal {
  const id = `client:${clientId}`;
  return {
    id,
    key: principalKey(id),
    clientId,
    kind: 'client',
    name,
    username: clientId,
    verifiedEmail: null,
    groups: [],
    groupsResolved: 'token',
    groupOverage: false,
    grants: [],
    deactivated: false,
  };
}

/**
 * Turns a validated application token into its client. App roles, groups and addresses in the
 * token are never read.
 */
export function clientFromToken(
  claims: Record<string, unknown>,
  tenantId: string | null,
): Principal {
  // Delegated tokens carry `scp`; a person's token must never act as an agent client.
  if (claims.idtyp !== 'app' || claims.scp !== undefined) {
    throw new ClaimError('Expected an application token.');
  }
  if (tenantId) refuseOtherTenant(required(claims, 'tid'), { tenantId });
  // Only v2 tokens pass the issuer check, and they name the calling application in `azp`.
  return clientPrincipal(required(claims, 'azp'));
}
