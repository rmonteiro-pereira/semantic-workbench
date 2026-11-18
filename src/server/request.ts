// Reads JSON request bodies with a byte limit, decodes request path segments and marks hidden
// responses.
import { PathError } from './projects/paths';
import { BadRequestError } from './projects/errors';
import { log } from './observability/log';

import { MAX_INPUT_BYTES } from '../shared/validation/diagnostics';
import { MAX_REPORT_BODY_BYTES } from '../shared/observability/browser-report';

/** Maximum encoded JSON body for a file or batch save. */
export const FILE_SAVE_REQUEST_LIMIT = MAX_INPUT_BYTES * 6 + 4096;
/** Maximum body for project metadata and clone requests. */
export const PROJECT_REQUEST_LIMIT = 16_000;
/** Maximum body for Git requests. */
export const GIT_REQUEST_LIMIT = 64_000;
/** Maximum body for deterministic agent plan requests. */
export const AGENT_PLAN_REQUEST_LIMIT = 64_000;
/** Maximum body for imported project definitions. */
export const IMPORT_REQUEST_LIMIT = 64_000_000;
/** Maximum body for metric edits and repository registration. */
export const METRIC_REQUEST_LIMIT = 256_000;
/** Maximum body for canonical item resolution and reconciliation. */
export const ITEM_ADDRESS_REQUEST_LIMIT = 64_000;
/** Maximum body for personal grouping corrections. */
export const GROUPING_REQUEST_LIMIT = 256_000;
/** Maximum body for a personal draft and its patches. */
export const DRAFT_REQUEST_LIMIT = MAX_INPUT_BYTES * 2 + 4096;
/** Maximum body for confirmed trash operations. */
export const TRASH_REQUEST_LIMIT = 4096;
/** Maximum body for administration proposals. */
export const ADMIN_REQUEST_LIMIT = 1_000_000;
/** Maximum body for a browser diagnostic report. */
export const BROWSER_REPORT_REQUEST_LIMIT = MAX_REPORT_BODY_BYTES;
/** Maximum body for the token endpoint and the connection forms, which hold a few short fields. Assumed. */
export const OAUTH_REQUEST_LIMIT = 4096;
/** Named byte limits consumed by route parsers and the operation inventory. */
export const REQUEST_LIMITS = {
  FILE_SAVE_REQUEST_LIMIT,
  PROJECT_REQUEST_LIMIT,
  GIT_REQUEST_LIMIT,
  AGENT_PLAN_REQUEST_LIMIT,
  IMPORT_REQUEST_LIMIT,
  METRIC_REQUEST_LIMIT,
  ITEM_ADDRESS_REQUEST_LIMIT,
  GROUPING_REQUEST_LIMIT,
  DRAFT_REQUEST_LIMIT,
  TRASH_REQUEST_LIMIT,
  ADMIN_REQUEST_LIMIT,
  BROWSER_REPORT_REQUEST_LIMIT,
  OAUTH_REQUEST_LIMIT,
} as const;

/** Parses a body within maxBytes, using empty for an absent or empty optional body. */
export async function readJson(req: Request, maxBytes: number, empty?: object) {
  const reader = req.body?.getReader();
  if (!reader) {
    if (empty) return empty;
    throw new BadRequestError('Expected a JSON request.');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new BadRequestError('Request too large.');
    }
    chunks.push(value);
  }
  // An optional body may be absent or empty; anything else must be valid JSON within the limit.
  if (!bytes && empty) return empty;
  const raw = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new BadRequestError('Malformed JSON request.');
  }
}

/** Correlates authentication events with the enclosing HTTP request. */
export const requestAuditId = Symbol('requestAuditId');
/** The address of the peer that sent the request, attached once at the HTTP boundary. */
export const requestSourceIp = Symbol('requestSourceIp');
/** A request with its audit correlation identifier and source address. */
export type AuditRequest = Request & { [requestAuditId]?: string; [requestSourceIp]?: string };

/**
 * Responses that answer 404 for a resource the caller may not see. The access middleware audits
 * them as denials without adding a header the client could read.
 */
export const hiddenResponses = new WeakSet<Response>();

/** Decodes one URL path segment; a malformed escape is the caller's mistake, not a failure. */
export function decodeSegment(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new PathError('Malformed path encoding.');
  }
}

/** Decodes URL path segments; callers must validate the resulting project path. */
export function decodePath(raw: string) {
  return raw.split('/').map(decodeSegment).join('/');
}

/**
 * Answers an error nobody planned for. The client learns only that something failed; the cause
 * goes to the server log with the request id, because its text can hold file paths or library
 * internals.
 */
export function internalErrorResponse(error: unknown, requestId = 'unknown') {
  log.failure('http.unexpected-error', error, { requestId });
  return Response.json({ error: 'Internal error.' }, { status: 500 });
}
