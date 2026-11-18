// Writes the audit records about the life of connections. A record names the connection, the person and the program, and never a token, code, credential, verifier or hash.
import { reportAuditFailure, type AuditLog } from '../auth/audit';
import type { CallerOrigin } from '../auth/caller';
import type { Scope } from './scopes';

/** The audit actions of connection events. */
export type ConnectionAction =
  | 'connection.consent'
  | 'connection.setup-created'
  | 'connection.issued'
  | 'connection.refreshed'
  | 'connection.replay'
  | 'connection.revoked'
  | 'connection.ended'
  | 'connection.refused';

/** What one event says. Fields that are unknown at that point, such as the person of a refused token request, are left out. */
export type ConnectionEvent = {
  action: ConnectionAction;
  origin: CallerOrigin;
  outcome: 'ok' | 'refused';
  connection?: string;
  person?: { id: string; name: string };
  program?: string;
  scopes?: readonly Scope[];
  /** A short word from a closed list, such as an end reason or `deny`. */
  reason?: string;
  requestId?: string;
  /** Refusals of this kind left out of the log since its last record. */
  suppressed?: number;
};

/** Builds the recorder over an audit log. Failure to write one event is reported and never undoes what the event describes. */
export function createConnectionEvents(audit: AuditLog) {
  function record(event: ConnectionEvent): void {
    const requestId = event.requestId ?? crypto.randomUUID();
    try {
      audit.append({
        requestId,
        origin: event.origin,
        connection: event.connection,
        principal: event.person
          ? { id: event.person.id, kind: 'person', name: event.person.name, ...(event.program ? { clientId: event.program } : {}) }
          : { id: 'anonymous', kind: 'anonymous', ...(event.program ? { clientId: event.program } : {}) },
        action: event.action,
        resource: { type: 'workspace' },
        decision: event.outcome === 'ok' ? 'allow' : 'deny',
        // The rules field carries the scope set, so a reader can see what the event concerned.
        rules: (event.scopes ?? []).map(scope => `scope:${scope}`),
        reason: event.reason,
        outcome: event.outcome,
        suppressed: event.suppressed,
      });
    } catch (error) {
      reportAuditFailure({ requestId, action: event.action, error });
    }
  }
  return { record };
}

export type ConnectionEvents = ReturnType<typeof createConnectionEvents>;
