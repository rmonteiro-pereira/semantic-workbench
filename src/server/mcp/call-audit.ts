// What a protocol call is recorded with, and the interface that writes records for calls that never reach a twin route: discovery and listing, refused requests, unknown tools and failures decided before dispatch. Dispatched calls are recorded by the operation boundary; `src/server/routes/mcp-call-audit.ts` implements this interface.
import { MAXIMUM_CLIENT_LABEL_LENGTH } from '../auth/call-attribution';
import { hasControlCharacter } from '../../shared/validation/control-characters';

/** The identity and label every record of one protocol request carries. */
export type CallAttribution = { requestId: string; method: string; clientLabel?: string };

/** Records for calls the dispatched twins do not cover. */
export type CallAudit = {
  /** One record for a discovery or list call. */
  protocolCall(attribution: CallAttribution): void;
  /** A call to a tool that does not exist, or a request the gate refused. */
  denied(attribution: CallAttribution, reason: string): void;
  /** A tool call that failed before any twin ran, such as bad input or a rate limit. */
  undispatched(attribution: CallAttribution, operationId: string, code: string): void;
};

/** A client's own name for itself: control characters removed and at most the label length. */
export function clientLabelOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = [...value]
    .filter(character => !hasControlCharacter(character))
    .join('')
    .slice(0, MAXIMUM_CLIENT_LABEL_LENGTH);
  return cleaned || undefined;
}
