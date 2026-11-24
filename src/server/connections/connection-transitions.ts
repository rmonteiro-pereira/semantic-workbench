// The state changes of a connection as pure functions: starting, rotating tokens, ending, and deciding whether a registration still allows it. Nothing here reads a clock, a file or a session.
import { RETIRED_REFRESH_LIMIT, type ConnectionRecord, type EndReason } from './connection-store';
import type { CallerOrigin } from '../auth/caller';
import { CALLER_ORIGINS } from '../auth/operation-inventory';
import type { Program } from './programs';
import type { ConnectionOrigin } from './pending-grants';
import type { Scope } from './scopes';

/** How long an access token is accepted. Assumed: short enough that a leaked one is of little use, long enough that a program refreshes rarely. */
export const ACCESS_TOKEN_LIFETIME_MS = 10 * 60_000;

/** What a person or an Admin sees of a connection. It never holds a hash, a token or a session reference. */
export type ConnectionView = {
  id: string;
  clientId: string;
  programName: string;
  personName: string;
  origin: ConnectionOrigin;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string;
  state: 'active' | 'ended';
  endReason?: EndReason;
};

/** The fields a new connection needs from the grant that produced it. */
export type NewConnection = {
  id: string;
  person: string;
  personName: string;
  clientId: string;
  programName: string;
  scopes: Scope[];
  resource: string;
  redirectUri?: string;
  origin: ConnectionOrigin;
  sessionReference: string;
  accessHash: string;
  refreshHash: string;
  now: number;
};

export function startConnection(input: NewConnection): ConnectionRecord {
  return {
    formatVersion: 1,
    id: input.id,
    person: input.person,
    personName: input.personName,
    clientId: input.clientId,
    programName: input.programName,
    scopes: [...input.scopes],
    resource: input.resource,
    ...(input.redirectUri === undefined ? {} : { redirectUri: input.redirectUri }),
    origin: input.origin,
    sessionReference: input.sessionReference,
    createdAt: input.now,
    lastUsedAt: input.now,
    access: { hash: input.accessHash, expiresAt: input.now + ACCESS_TOKEN_LIFETIME_MS },
    refresh: input.refreshHash,
    retiredRefresh: [],
    generation: 0,
    state: 'active',
  };
}

/** Replaces both tokens. The refresh token that was current is retired, and only the newest few are remembered. */
export function rotateTokens(record: ConnectionRecord, input: { accessHash: string; refreshHash: string; now: number }): ConnectionRecord {
  const retired = record.refresh ? [record.refresh, ...record.retiredRefresh] : record.retiredRefresh;
  return {
    ...record,
    access: { hash: input.accessHash, expiresAt: input.now + ACCESS_TOKEN_LIFETIME_MS },
    refresh: input.refreshHash,
    retiredRefresh: retired.slice(0, RETIRED_REFRESH_LIMIT),
    generation: record.generation + 1,
    lastUsedAt: input.now,
  };
}

/** Ends a connection and drops every hash, so the record cannot be used as a credential and replay of an old token reads as unknown. */
export function endConnection(record: ConnectionRecord, reason: EndReason, now: number): ConnectionRecord {
  return { ...record, state: 'ended', endedAt: now, endReason: reason, access: null, refresh: null, retiredRefresh: [] };
}

/** Whether the access token is still inside its lifetime. */
export function accessTokenLive(record: ConnectionRecord, now: number): boolean {
  return record.access !== null && record.access.expiresAt > now;
}

/**
 * Why the current registration no longer allows a connection, or null when it does. A removed
 * program, a removed redirect address or a scope the program no longer holds each end it.
 */
export function registrationEndReason(record: ConnectionRecord, program: Program | undefined): EndReason | null {
  if (!program) return 'program-removed';
  if (record.redirectUri !== undefined && !program.redirectUris.includes(record.redirectUri)) return 'program-removed';
  const scopeKept = record.scopes.every(scope => (program.scopes as Scope[]).includes(scope));
  return scopeKept ? null : 'scope-removed';
}

/** Which audit action records the end of a connection for a reason. */
export function endAuditAction(reason: EndReason): 'connection.replay' | 'connection.revoked' | 'connection.ended' {
  if (reason === 'replay' || reason === 'code-reuse') return 'connection.replay';
  if (reason === 'revoked-by-person' || reason === 'revoked-by-admin') return 'connection.revoked';
  return 'connection.ended';
}

/** The reason recorded when a session ends for a given session-store reason. */
export function endReasonForSession(sessionReason: string): EndReason {
  if (sessionReason === 'sign-out') return 'signed-out';
  if (sessionReason === 'expired') return 'expired';
  return 'session-ended';
}

export function viewOf(record: ConnectionRecord): ConnectionView {
  return {
    id: record.id,
    clientId: record.clientId,
    programName: record.programName,
    personName: record.personName,
    origin: record.origin,
    scopes: [...record.scopes],
    createdAt: new Date(record.createdAt).toISOString(),
    lastUsedAt: new Date(record.lastUsedAt).toISOString(),
    state: record.state,
    ...(record.endReason ? { endReason: record.endReason } : {}),
  };
}

/**
 * The caller and audit origin of a connection. The list of origins gains `acp` together with the
 * agent panel, so the conversion is made in this one place.
 */
export function connectionCallerOrigin(origin: ConnectionOrigin): CallerOrigin {
  if (!(CALLER_ORIGINS as readonly string[]).includes(origin)) {
    throw new Error(`Connection origin ${origin} requires operation and audit support before tokens can be issued.`);
  }
  return origin as CallerOrigin;
}
