// Shares durable refusals between authenticated operations and network authentication.
import type { AuditLog } from './audit';
import type { Principal } from './principal';

/** Appends a refusal before answering, failing closed when storage is unavailable. */
export function auditDenial(audit: AuditLog, input: Parameters<AuditLog['append']>[0]): Response | null {
  try {
    audit.append(input);
    return null;
  } catch {
    return Response.json({ error: 'Audit unavailable' }, { status: 503 });
  }
}

/** One refused agent call: who made it, if known, and why it was refused. */
interface AgentRefusal {
  requestId: string;
  /** False when the refusal comes from an anonymous caller and was left out of the audit log. */
  audited?: boolean;
  /** Refusals of this kind left out of the audit log since its last record. */
  suppressed?: number;
  /** Absent when the token was not validated, so nothing in it is trusted or recorded. */
  principal?: Principal;
  reason: string;
  status: keyof typeof AGENT_REFUSAL_ERRORS;
}

const AGENT_REFUSAL_ERRORS = {
  401: 'sign-in required',
  403: 'forbidden',
  404: 'Not found.',
  503: 'identity provider unavailable',
};

/**
 * Audits a refused agent call and answers it. A refused token gets the challenge RFC 6750 asks
 * for; an unreachable provider is not the token's fault, so it gets 503 without one.
 */
export function agentRefusal(audit: AuditLog, refusal: AgentRefusal): Response {
  const { requestId, principal, reason, status, audited = true, suppressed } = refusal;
  const failure = audited
    ? auditDenial(audit, {
        requestId,
        principal: principal ?? { id: 'anonymous', kind: 'anonymous' },
        action: 'agentRead',
        resource: { type: 'workspace' },
        decision: 'deny',
        rules: [],
        reason,
        suppressed,
      })
    : null;
  if (failure) return failure;
  const headers = new Headers();
  if (status === 401) headers.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  return Response.json({ error: AGENT_REFUSAL_ERRORS[status] }, { status, headers });
}
