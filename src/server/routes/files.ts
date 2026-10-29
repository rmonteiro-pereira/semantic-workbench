// Serves project files and validates save requests against their original content hashes.
import { MAX_INPUT_BYTES } from '../../shared/validation/diagnostics';
import { requestReader } from '../auth/request-scope';
import { decodeSegment, decodePath, readJson } from '../request';
import type { Route } from './http';
import { BadRequestError } from '../projects/errors';
const HASH = /^[0-9a-f]{64}$/;
/** Handles file reads and saves with base hashes to detect stale edits. */
export const fileRoutes: Route = async (ws, req, url) => {
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (!match) return null;
  const slug = decodeSegment(match[1]);
  const path = decodePath(match[2]);
  const reader = requestReader(req);
  if (req.method === 'GET') return Response.json(ws.readFile(slug, path, reader));
  if (req.method === 'PUT') {
    const body = await readJson(req, MAX_INPUT_BYTES * 6 + 4096);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['baseHash', 'source', 'patches'].includes(k)))
      throw new BadRequestError('Expected {baseHash, source} or {baseHash, patches}.');
    if (body.baseHash !== null && (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)))
      throw new BadRequestError('baseHash must be the SHA-256 of the file version the edit started from, or null for a new file.');
    if ((body.source === undefined) === (body.patches === undefined)) throw new BadRequestError('Send either source or patches.');
    if (body.source !== undefined && typeof body.source !== 'string') throw new BadRequestError('source must be text.');
    return Response.json(await ws.saveFile(slug, path, body, reader));
  }
  return null;
};
