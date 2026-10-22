// Serves project files and validates save requests against their original content hashes.
import { MAX_INPUT_BYTES } from '../../src/diagnostics';
import { decodePath, readJson } from '../request';
import type { Route } from './http';
const HASH = /^[0-9a-f]{64}$/;
/** Handles file reads and saves with base hashes to detect stale edits. */
export const fileRoutes: Route = async (ws, req, url) => {
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]);
  const path = decodePath(m[2]);
  if (req.method === 'GET') return Response.json(ws.readFile(slug, path));
  if (req.method === 'PUT') {
    const body = await readJson(req, MAX_INPUT_BYTES * 6 + 4096);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(k => !['baseHash', 'source', 'patches'].includes(k))
    )
      throw Error('Expected {baseHash, source} or {baseHash, patches}.');
    if (body.baseHash !== null && (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)))
      throw Error(
        'baseHash must be the SHA-256 of the file version the edit started from, or null for a new file.',
      );
    if ((body.source === undefined) === (body.patches === undefined))
      throw Error('Send either source or patches.');
    if (body.source !== undefined && typeof body.source !== 'string')
      throw Error('source must be text.');
    return Response.json(await ws.saveFile(slug, path, body));
  }
  return null;
};
