// Serves project files and validates save requests against their original content hashes.
import { declaredAddressMigrations, declaredDeletedItems } from '../projects/address-migrations';
import { FILE_SAVE_REQUEST_LIMIT } from '../request';
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
    const body = await readJson(req, FILE_SAVE_REQUEST_LIMIT);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['baseHash', 'source', 'patches', 'declaredMigrations', 'deletedItems'].includes(k)))
      throw new BadRequestError('Expected {baseHash, source} or {baseHash, patches}.');
    if (body.baseHash !== null && (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)))
      throw new BadRequestError('baseHash must be the SHA-256 of the file version the edit started from, or null for a new file.');
    if ((body.source === undefined) === (body.patches === undefined)) throw new BadRequestError('Send either source or patches.');
    if (body.source !== undefined && typeof body.source !== 'string') throw new BadRequestError('source must be text.');
    const declaredMigrations = declaredAddressMigrations(body.declaredMigrations, slug, [path]);
    const deletedItems = declaredDeletedItems(body.deletedItems, slug, [path]);
    return Response.json(await ws.saveFile(slug, path, { ...body, declaredMigrations, deletedItems }, reader));
  }
  return null;
};
