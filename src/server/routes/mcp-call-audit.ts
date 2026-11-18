// Writes the audit records of protocol calls that never reach a twin route: discovery and listing, refused requests, unknown tools and tool failures decided before dispatch. Dispatched calls are recorded by the operation boundary.
import type { AuditInput, AuditLog } from '../auth/audit';
import type { CallAudit, CallAttribution } from '../mcp/call-audit';
import { localPrincipal } from '../auth/principal';
import { operationById } from '../auth/operation-inventory';
import { ROUTE_ACTIONS } from '../auth/route-actions';
import type { Action } from '../../shared/auth/actions';

function actionOf(operationId: string): Action {
  const row = operationById(operationId)?.row;
  return ROUTE_ACTIONS.find(candidate => candidate.path === row)?.action ?? 'read';
}

/** Records for calls the dispatched twins do not cover. Every append is best effort: a failed audit never changes a tool's answer. */
export function createCallAudit(audit: AuditLog, identity: { principal: AuditInput['principal']; connection?: string } = { principal: localPrincipal(), connection: 'local' }): CallAudit {
  const { principal, connection } = identity;
  function append(attribution: CallAttribution, fields: { action: string; decision: 'allow' | 'deny'; outcome?: 'ok' | 'refused' | 'failed'; reason?: string; result: string; tool?: string }) {
    audit.append({
      requestId: attribution.requestId,
      origin: 'mcp',
      connection,
      method: attribution.method,
      ...(attribution.clientLabel ? { clientLabel: attribution.clientLabel } : {}),
      principal,
      resource: { type: 'workspace' },
      rules: [],
      ...fields,
    });
  }
  return {
    /** One record for a discovery or list call. */
    protocolCall(attribution: CallAttribution) {
      append(attribution, { action: 'protocol', decision: 'allow', outcome: 'ok', result: 'ok' });
    },
    /** A call to a tool that does not exist, or a request the gate refused. */
    denied(attribution: CallAttribution, reason: string) {
      append(attribution, { action: 'protocol', decision: 'deny', reason, result: 'refused' });
    },
    /** A tool call that failed before any twin ran, such as bad input or a rate limit. */
    undispatched(attribution: CallAttribution, operationId: string, code: string) {
      const failed = code === 'internal' || code === 'uncertain';
      append(attribution, { action: actionOf(operationId), decision: 'allow', outcome: failed ? 'failed' : 'refused', result: code, tool: operationId });
    },
  };
}
