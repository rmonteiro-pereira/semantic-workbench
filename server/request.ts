// Reads JSON request bodies with a byte limit, decodes request path segments and marks hidden
// responses.
import { PathError } from './projects/paths';

/** Parses a body within maxBytes, using empty for an absent or empty optional body. */
export async function readJson(req: Request, maxBytes: number, empty?: object) {
  const reader = req.body?.getReader();
  if (!reader) {
    if (empty) return empty;
    throw Error('Expected a JSON request.');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw Error('Request too large.');
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
    throw Error('Malformed JSON request.');
  }
}

/** Correlates authentication events with the enclosing HTTP request. */
export const requestAuditId = Symbol('requestAuditId');
/** A request with its audit correlation identifier. */
export type AuditRequest = Request & { [requestAuditId]?: string };

/**
 * Responses that answer 404 for a resource the caller may not see. The access middleware audits
 * them as denials without adding a header the client could read.
 */
export const hiddenResponses = new WeakSet<Response>();

/** Decodes URL path segments; callers must validate the resulting project path. */
export function decodePath(raw: string) {
  return raw
    .split('/')
    .map(s => {
      try {
        return decodeURIComponent(s);
      } catch {
        throw new PathError('Malformed path encoding.');
      }
    })
    .join('/');
}
