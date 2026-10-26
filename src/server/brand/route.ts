// Serves the brand bundle at /brand/<file> from memory. The file names are looked up in the
// loaded bundle, so no request path ever reaches the file system.
import { activeBrand } from './bundle';
import { contentSecurityPolicyOf, isBrandFileName } from './files';

const BRAND_PREFIX = '/brand/';

/** Answers a /brand/* request, or returns null for any other path. */
export function serveBrand(request: Request, path: string, baseHeaders: Headers): Response | null {
  if (!path.startsWith(BRAND_PREFIX)) return null;
  const headers = new Headers(baseHeaders);
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers });
  }
  const name = path.slice(BRAND_PREFIX.length);
  const notFound = new Response('Not found', { status: 404, headers });
  if (!isBrandFileName(name)) return notFound;
  const file = activeBrand().files.get(name);
  if (!file) return notFound;
  headers.set('Content-Type', file.contentType);
  headers.set('Content-Security-Policy', contentSecurityPolicyOf(name));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'no-cache');
  return new Response(request.method === 'HEAD' ? null : file.body, { headers });
}
