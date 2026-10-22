// Checks browser write intent before routes can mutate state.
import { timingSafeEqual } from 'node:crypto';

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
  const body = await request.clone().text();
  if (body.length > 4096) return false;
  const token = new URLSearchParams(body).get('csrf') ?? '';
  const supplied = Buffer.from(token);
  const expected = Buffer.from(csrf);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
