// Classifiers see a bounded copy after existence hiding has been settled.
/** Semantic result of an authorized operation. */
export type OperationOutcome = 'ok' | 'refused' | 'failed' | 'degraded';
/** Classifies a bounded response without consuming the caller's response. */
export type OutcomeClassifier = (response: Response) => OperationOutcome | Promise<OperationOutcome>;
/** Maximum bytes buffered for semantic classification. */
export const MAX_CLASSIFIED_RESPONSE_BYTES = 1_000_000;
const outcomes: readonly OperationOutcome[] = ['ok', 'refused', 'failed', 'degraded'];

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
    return outcomes.includes(result) ? result : 'failed';
  } catch {
    // Classification cannot turn a completed operation into a retryable failure response.
    return 'failed';
  }
}
