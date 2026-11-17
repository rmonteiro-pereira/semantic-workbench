// Runs a tool's request as the in-process twin of an ordinary route through the operation boundary, and turns the route's HTTP answer into a tool result. Nothing here reads project files or decides access.
//
// The boundary entry point is `handler.boundary.operate({ caller, request })`. The caller is minted with the `mcp` origin, and the request is built by `buildTwinRequest` from the inventory id, so a tool can only reach the route its inventory entry names. `availableOperations(caller)` lists the ids the caller may use.
import type { Caller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import { buildTwinRequest, type TwinRequestInput } from '../auth/twin-request';
import { BadRequestError } from '../projects/errors';
import { fail, type ToolResult } from './tool-results';

/** What a twin answered, with the headers a tool may report, such as the published snapshot id. */
export type TwinAnswer = { status: number; body: unknown; headers: Headers };

/** Calls the twin of an inventory operation. A failed call is already a tool result. */
export type TwinCall = (operationId: string, input: TwinRequestInput) => Promise<{ ok: true; answer: TwinAnswer } | { ok: false; failure: ToolResult; answer?: TwinAnswer }>;

function plainSentence(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.length < 400) return body.error;
  return fallback;
}

/** Git answers that are a refusal the person can act on, not a failure of Git. */
const GIT_REFUSAL = /^(Nothing to commit|Not committed|Nothing is staged|Resolve the conflicted)/;

/** Local agent and document routes answer every error as 400, so a missing target is recognised by its sentence. */
function looksMissing(message: string): boolean {
  return /not found|no such|does not exist/i.test(message);
}

/**
 * Maps a failed twin answer to a tool failure. Hidden targets and missing targets answer alike,
 * guard refusals carry the guard's own sentence, and anything unexpected is a generic internal
 * failure that names no path and quotes no file text.
 */
export function mapTwinFailure(operationId: string, answer: TwinAnswer): ToolResult {
  const { status, body } = answer;
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = plainSentence(body, 'The workbench could not complete this request.');
  if (status === 404) return fail('not_found', 'The target does not exist or is not available to you.');
  if (status === 403 && Array.isArray(record.guarded)) return fail('guard_refused', message, { guarded: record.guarded });
  if (status === 403) return fail('refused', message);
  if (status === 409 && record.code === 'no-published-snapshot')
    return fail('not_published', 'No published snapshot answers this request yet. Publish the project from the browser first.', { reason: record.reason });
  if (status === 409 && record.error === 'precondition')
    return fail('precondition_failed', 'The repository changed since this commit was prepared. Read the state again and retry.', { changed: record.changed });
  if (status === 409 && record.error === 'stale') return fail('conflict', 'The file changed since the version this edit started from.', { currentVersion: record.currentHash ?? null });
  if (status === 409) return fail('conflict', message, record.paths ? { paths: record.paths } : undefined);
  if (status === 413) return fail('limit_exceeded', message, { limit: record.limitBytes ?? 'request' });
  if (status === 400 && /git is not available|not a git repository/i.test(message)) return fail('unavailable', 'Git is not available for this project.');
  if (status === 400 && looksMissing(message)) return fail('not_found', 'The target does not exist or is not available to you.');
  if (status === 400) return fail('invalid_input', message, Array.isArray(record.issues) ? { issues: record.issues } : undefined);
  if (status === 500 && operationId.startsWith('git.') && GIT_REFUSAL.test(message)) return fail('refused', message);
  if (status === 500 && operationId.startsWith('git.')) return fail('unavailable', 'Git could not answer this request.');
  return fail('internal', 'The workbench could not complete this request.');
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
    const { response } = await boundary.operate({ caller, request, operationId });
    const answer: TwinAnswer = { status: response.status, body: await readBody(response), headers: response.headers };
    if (answer.status >= 200 && answer.status < 300) return { ok: true, answer };
    return { ok: false, failure: mapTwinFailure(operationId, answer), answer };
  };
}
