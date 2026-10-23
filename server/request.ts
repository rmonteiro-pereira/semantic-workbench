// Reads JSON request bodies with a byte limit, decodes request path segments and marks hidden
// responses.
import { PathError } from './projects/paths';
import { BadRequestError } from './projects/errors';
import { log } from './observability/log';

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
export function internalErrorResponse(e: unknown, requestId = 'unknown') {
  log.failure('http.unexpected-error', e, { requestId });
  return Response.json({ error: 'Internal error.' }, { status: 500 });
}
