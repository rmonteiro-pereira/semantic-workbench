// Serves the built frontend with a same-origin policy and a bounded SPA fallback.
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Precompiled schema validators let scripts run without dynamic code evaluation.
const policy =
  "default-src 'self'; script-src 'self'; worker-src 'self' blob:; " +
  "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

async function staticFile(root: string, path: string) {
  try {
    const file = await realpath(resolve(root, `.${path}`));
    const base = await realpath(root);
    if (!file.startsWith(base + sep)) return null;
    if (!(await stat(file)).isFile()) return null;
    return Bun.file(file);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

/** Serves non-API files with security headers; HTTPS deployments alone receive HSTS. */
export async function serveStatic(request: Request, root = 'dist', publicUrl?: string) {
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    path = '\0';
  }
  if (/^\/(api|auth)(\/|$)/.test(path)) return null;
  const headers = new Headers({
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-cache',
  });
  if (publicUrl?.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) {
    return new Response('Forbidden', { status: 403, headers });
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers });
  }
  let file = await staticFile(root, path);
  if (!file && !extname(path) && !path.startsWith('/assets/')) {
    file = await staticFile(root, '/index.html');
  }
  if (!file) return new Response('Not found', { status: 404, headers });
  headers.set('Content-Type', file.type);
  if (path.startsWith('/assets/'))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(request.method === 'HEAD' ? null : file, { headers });
}
