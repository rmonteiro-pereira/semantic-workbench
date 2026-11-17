// Classifiers see a bounded copy after existence hiding has been settled.
import { OPERATION_OUTCOMES, type OperationOutcome } from '../../shared/observability/operation';
import type { ToolErrorCode } from './call-attribution';
/** Semantic result of an authorized operation. */
export type { OperationOutcome } from '../../shared/observability/operation';
/** Closed outcomes accepted by audit classification and operation metrics. */
export { OPERATION_OUTCOMES } from '../../shared/observability/operation';
/** Classifies a bounded response without consuming the caller's response. */
export type OutcomeClassifier = (response: Response) => OperationOutcome | Promise<OperationOutcome>;
/** Maximum bytes buffered for semantic classification. */
export const MAX_CLASSIFIED_RESPONSE_BYTES = 1_000_000;
/** Maps a handler status or an access refusal without changing legacy allowed-call audit outcomes. */
export function statusOutcome(status: number, accessRefusal = false): OperationOutcome {
  if (accessRefusal && [401, 403, 404].includes(status)) return 'refused';
  if (status >= 200 && status < 300) return 'ok';
  return [409, 412, 428].includes(status) ? 'refused' : 'failed';
}

async function boundedCopy(response: Response): Promise<Response> {
  if (response.headers.get('Content-Type')?.includes('text/event-stream')) throw Error('Stream responses cannot be classified.');
  if (Number(response.headers.get('Content-Length')) > MAX_CLASSIFIED_RESPONSE_BYTES) throw Error('Response exceeds classification limit.');
  const clone = response.clone();
  if (!clone.body) return clone;
  const reader = clone.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_CLASSIFIED_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      throw Error('Response exceeds classification limit.');
    }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Converts unsupported or unsuccessful classification into an explicit failed audit outcome. */
export async function classifyOutcome(response: Response, classifier: OutcomeClassifier): Promise<OperationOutcome> {
  try {
    const result = await classifier(await boundedCopy(response));
    return OPERATION_OUTCOMES.includes(result) ? result : 'failed';
  } catch {
    // Classification cannot turn a completed operation into a retryable failure response.
    return 'failed';
  }
}

/** Git answers that are a refusal the person can act on, not a failure of Git. */
const GIT_REFUSAL = /^(Nothing to commit|Not committed|Nothing is staged|Resolve the conflicted)/;

/** The sentence a route answered with, when it answered one. */
function answerSentence(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return '';
}

/**
 * The one decision of what a failed call is: the code a protocol caller is told and the result an
 * audit record carries. It reads the operation, the HTTP status and the route's JSON body, so
 * the answer and the record cannot disagree.
 */
export function classifyCallFailure(operationId: string, status: number, body: unknown): ToolErrorCode {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = answerSentence(body);
  if (status === 404) return 'not_found';
  if (status === 403) return Array.isArray(record.guarded) ? 'guard_refused' : 'refused';
  if (status === 409 && record.code === 'no-published-snapshot') return 'not_published';
  if (status === 409 && record.error === 'precondition') return 'precondition_failed';
  if (status === 409) return 'conflict';
  if (status === 413) return 'limit_exceeded';
  if (status === 400 && /git is not available|not a git repository/i.test(message)) return 'unavailable';
  if (status === 400 && /not found|no such|does not exist/i.test(message)) return 'not_found';
  if (status === 400) return 'invalid_input';
  if (status === 500 && operationId.startsWith('git.')) return GIT_REFUSAL.test(message) ? 'refused' : 'unavailable';
  if (status >= 500) return 'internal';
  return 'refused';
}

/** The result of a call that has an answer: `ok` for a success, otherwise the classified failure. */
export function callResult(operationId: string, status: number, body: unknown): string {
  if (status >= 200 && status < 300) return 'ok';
  return classifyCallFailure(operationId, status, body);
}

/** The result of a call read from its response, without consuming the response. A body that cannot be read is classified by status alone. */
export async function callResultOf(operationId: string, response: Response): Promise<string> {
  if (response.ok) return 'ok';
  try {
    const copy = await boundedCopy(response);
    return callResult(operationId, response.status, JSON.parse(await copy.text()));
  } catch {
    return callResult(operationId, response.status, undefined);
  }
}
