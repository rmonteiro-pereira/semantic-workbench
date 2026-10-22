// Normalizes trusted identity claims without consulting provider roles or external services.
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
export class ClaimError extends Error {}

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

function identity(claims: Record<string, unknown>, mapping: ClaimMapping) {
  if (mapping.provider !== 'entra') {
    return { id: `${required(claims, 'iss')}|${required(claims, 'sub')}` };
  }
  const tenant = required(claims, 'tid');
  const object = required(claims, 'oid').toLowerCase();
  if (mapping.tenantId && tenant.toLowerCase() !== mapping.tenantId.toLowerCase()) {
    throw new ClaimError('Identity tenant does not match the configured tenant.');
  }
  if (claims.idtyp !== 'app') return { id: `${tenant}:${object}` };
  const clientId = string(claims.azp) || required(claims, 'appid');
  return { id: `client:${clientId}`, clientId };
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
    kind: identified.clientId ? 'client' : 'person',
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
