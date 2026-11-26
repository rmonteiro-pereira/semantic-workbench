// Serves project files and validates save requests against their original content hashes.
import { declaredAddressMigrations, declaredDeletedItems } from '../projects/address-migrations';
import { FILE_SAVE_REQUEST_LIMIT } from '../request';
import { callerOriginOf, requestReader } from '../auth/request-scope';
import { decodeSegment, decodePath, readJson } from '../request';
import type { Route } from './http';
import { checkImports } from '../mesh/dependency-check';
import { DEPENDENCY_MANIFEST_PATH } from '../../shared/tessera/dependency-manifest';
import type { OntologyUnit } from '../../shared/tessera/unit-structure';
import { InputError } from '../../shared/validation/diagnostics';
import type { Reader } from '../projects/reader';
import type { Workspace } from '../projects/workspace';
import { readOntologySet } from '../mesh/unit-reader';
import { BadRequestError, HiddenResourceError, NotFoundError, SnapshotUnavailableError } from '../projects/errors';
const HASH = /^[0-9a-f]{64}$/;

type SavedFile = ReturnType<Workspace['readFile']>;

function readableSource(ws: Workspace, project: string, path: string, reader: Reader) {
  if (reader.view && !reader.view.canRead(project, path)) return null;
  try {
    return ws.readFile(project, path, reader).source;
  } catch (error) {
    if (error instanceof HiddenResourceError || error instanceof NotFoundError) return null;
    throw error;
  }
}

async function checkSetImports(ws: Workspace, project: string, reader: Reader, unit: OntologyUnit) {
  const lock = readableSource(ws, project, DEPENDENCY_MANIFEST_PATH, reader);
  if (lock === null) return undefined;
  const repo = ws.repoOf(project);
  const projects = new Set(ws.state.registry().projects.map(entry => entry.slug));
  return ws.published.withPin(async pin => {
    const next = pin.commits.get(repo)?.commit;
    if (!next) return undefined;
    const source = {
      snapshots: ws.published,
      candidateDocuments: (provider: string) => ws.published.documents(pin, provider),
      repositoryOf: (provider: string) => (projects.has(provider) ? ws.repoOf(provider) : null),
    };
    try {
      return await checkImports(source, pin, { repo, next }, reader, unit, { source: lock });
    } catch (error) {
      if (error instanceof InputError || error instanceof SnapshotUnavailableError) return undefined;
      throw error;
    }
  });
}

/** Checks the saved ontology set a root or part belongs to, as far as the reader may see it. Other files have no set. */
function savedSetValidation(ws: Workspace, slug: string, file: SavedFile, reader: Reader) {
  return readOntologySet(
    file,
    {
      available: name => {
        const indexed = ws.indexedFile(slug, name, reader);
        const readable = !reader.view || reader.view.canRead(slug, name);
        return Boolean(indexed?.visible && readable);
      },
      read: name => readableSource(ws, slug, name, reader),
      rootPaths: () =>
        ws
          .documentsFor(reader)
          .filter(doc => doc.project === slug)
          .map(doc => doc.path),
    },
    unit => checkSetImports(ws, slug, reader, unit),
  );
}

/** Whether the saved set of a root or part could be checked; validation itself checks only the proposed file. A file not saved yet has no set. */
async function savedSetNotice(ws: Workspace, slug: string, path: string, reader: Reader) {
  let file: SavedFile;
  try {
    file = ws.readFile(slug, path, reader);
  } catch (error) {
    if (error instanceof NotFoundError) return {};
    throw error;
  }
  const validation = await savedSetValidation(ws, slug, file, reader);
  return validation ? { setNotChecked: validation.setNotChecked } : {};
}

/** Checks proposed text with the save pipeline and answers its findings and guard outcome without writing. */
async function validateRoute(ws: Workspace, req: Request, slug: string, path: string) {
  const body = await readJson(req, FILE_SAVE_REQUEST_LIMIT);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['baseHash', 'source', 'patches'].includes(key)))
    throw new BadRequestError('Expected {source} or {baseHash, patches}.');
  if (body.baseHash !== undefined && body.baseHash !== null && (typeof body.baseHash !== 'string' || !HASH.test(body.baseHash)))
    throw new BadRequestError('baseHash must be the SHA-256 of the file version the edit started from.');
  if ((body.source === undefined) === (body.patches === undefined)) throw new BadRequestError('Send either source or patches.');
  if (body.source !== undefined && typeof body.source !== 'string') throw new BadRequestError('source must be text.');
  if (body.patches !== undefined && body.baseHash === undefined) throw new BadRequestError('Patches need the baseHash they were made against.');
  const reader = requestReader(req);
  const validation = await ws.validateFile(slug, path, body, reader);
  return Response.json({ ...validation, ...(await savedSetNotice(ws, slug, path, reader)) });
}
/** Handles file reads, saves and save-free validation, with base hashes to detect stale edits. */
export const fileRoutes: Route = async (ws, req, url) => {
  const validation = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)\/validate$/);
  if (validation && req.method === 'POST') return validateRoute(ws, req, decodeSegment(validation[1]), decodePath(validation[2]));
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (!match) return null;
  const slug = decodeSegment(match[1]);
  const path = decodePath(match[2]);
  const reader = requestReader(req);
  if (req.method === 'GET') {
    const file = ws.readFile(slug, path, reader);
    const validation = await savedSetValidation(ws, slug, file, reader);
    return Response.json(validation ? { ...file, unitValidation: validation } : file);
  }
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
    // A protocol caller's save leaves the person's unsaved draft in place, so the editor shows the change as an outside edit.
    const keepDrafts = ['mcp', 'acp'].includes(callerOriginOf(req));
    return Response.json(await ws.saveFile(slug, path, { ...body, declaredMigrations, deletedItems, keepDrafts }, reader));
  }
  return null;
};
