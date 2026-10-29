// Checks browser write intent before routes can mutate state.
import { timingSafeEqual } from 'node:crypto';

/** The largest logout form body that is read; the real one is a few hundred bytes. */
const MAX_FORM_BYTES = 4096;

/**
 * Reads a form body of at most MAX_FORM_BYTES, or returns null. A body that declares more is
 * refused unread, and one that does not declare its size is cut off as soon as it passes the
 * limit, so a caller cannot make the server buffer a large body before it is refused.
 */
async function readSmallForm(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_FORM_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_FORM_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** Requires the public origin and a request marker or the logout form's session token. */
export async function validCsrf(request: Request, publicOrigin?: string, csrf?: string) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  if (!publicOrigin || request.headers.get('Origin') !== publicOrigin) return false;
  if (request.headers.get('X-SW-Request') === '1') return true;
  if (new URL(request.url).pathname !== '/auth/logout' || request.method !== 'POST' || !csrf) {
    return false;
  }
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return false;
  }
  const body = await readSmallForm(request);
  if (body === null) return false;
  const token = new URLSearchParams(body).get('csrf') ?? '';
  const supplied = Buffer.from(token);
  const expected = Buffer.from(csrf);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
