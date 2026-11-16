// Classifiers see a bounded copy after existence hiding has been settled.
/** Semantic result of an authorized operation. */
export type OperationOutcome = (typeof OPERATION_OUTCOMES)[number];
/** Closed outcomes accepted by audit classification and operation metrics. */
export const OPERATION_OUTCOMES = ['ok', 'refused', 'failed', 'degraded'] as const;
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
