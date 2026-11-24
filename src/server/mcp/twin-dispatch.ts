// Runs a tool's request as the in-process twin of an ordinary route through the operation boundary, and turns the route's HTTP answer into a tool result. Nothing here reads project files or decides access.
//
// The boundary entry point is `handler.boundary.operate({ caller, request })`. The caller is minted with the `mcp` origin, and the request is built by `buildTwinRequest` from the inventory id, so a tool can only reach the route its inventory entry names. `availableOperations(caller)` lists the ids the caller may use.
import type { Caller } from '../auth/caller';
import type { OperationBoundary, ReceiptReplay } from '../auth/operation-boundary';
import { classifyCallFailure } from '../auth/operation-outcome';
import { buildTwinRequest, type TwinRequestInput } from '../auth/twin-request';
import { BadRequestError, FAILURE_CODE_HEADER } from '../projects/errors';
import { fail, type ToolResult } from './tool-results';

/** What a twin answered, with the headers a tool may report, such as the published snapshot id. */
export type TwinAnswer = { status: number; body: unknown; headers: Headers };

/** Calls the twin of an inventory operation. A failed call is already a tool result. */
export type TwinCall = (
  operationId: string,
  input: TwinRequestInput & { replay?: ReceiptReplay },
) => Promise<{ ok: true; answer: TwinAnswer } | { ok: false; failure: ToolResult; answer?: TwinAnswer }>;

function plainSentence(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.length < 400) return body.error;
  return fallback;
}

const NOT_AVAILABLE = 'The target does not exist or is not available to you.';

/**
 * Maps a failed twin answer to a tool failure. The code comes from the one classifier the audit
 * record also uses. This function adds only the sentence and the details, and it names no path
 * and quotes no file text on an unexpected failure.
 */
export function mapTwinFailure(operationId: string, answer: TwinAnswer): ToolResult {
  const { status, body } = answer;
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = plainSentence(body, 'The workbench could not complete this request.');
  const code = classifyCallFailure(operationId, status, body, answer.headers.get(FAILURE_CODE_HEADER));
  switch (code) {
    case 'not_found':
      return fail(code, NOT_AVAILABLE);
    case 'guard_refused':
      return fail(code, message, { guarded: record.guarded });
    case 'not_published':
      return fail(code, 'No published snapshot answers this request yet. Publish the project from the browser first.', { reason: record.reason });
    case 'precondition_failed':
      return fail(code, 'The repository changed since this commit was prepared. Read the state again and retry.', { changed: record.changed });
    case 'conflict':
      if (record.error === 'stale') return fail(code, 'The file changed since the version this edit started from.', { currentVersion: record.currentHash ?? null });
      return fail(code, message, record.paths ? { paths: record.paths } : undefined);
    case 'limit_exceeded':
      return fail(code, message, { limit: record.limitBytes ?? 'request' });
    case 'unavailable':
      return fail(code, status === 400 ? 'Git is not available for this project.' : 'Git could not answer this request.');
    case 'invalid_input':
      return fail(code, message, Array.isArray(record.issues) ? { issues: record.issues } : undefined);
    case 'refused':
      return fail(code, message);
    default:
      return fail('internal', 'The workbench could not complete this request.');
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Builds the call function a tool uses: one caller, one boundary, one signal for cancellation. */
export function createTwinCall(boundary: OperationBoundary, caller: Caller, signal?: AbortSignal): TwinCall {
  return async (operationId, input) => {
    let request: Request;
    try {
      request = buildTwinRequest(operationId, { ...input, signal });
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      return { ok: false, failure: fail('invalid_input', error.message) };
    }
    if (input.replay && signal?.aborted) return { ok: false, failure: fail('refused', 'The connection ended.') };
    const { response } = await boundary.operate({ caller, request, operationId, replay: input.replay });
    if (input.replay && signal?.aborted) return { ok: false, failure: fail('refused', 'The connection ended.') };
    const answer: TwinAnswer = { status: response.status, body: await readBody(response), headers: response.headers };
    if (answer.status >= 200 && answer.status < 300) return { ok: true, answer };
    return { ok: false, failure: mapTwinFailure(operationId, answer), answer };
  };
}
