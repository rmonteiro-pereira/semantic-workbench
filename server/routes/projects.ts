// Handles project management, imports, example loading, and workspace status.
import { requestReader, requestScope } from '../auth/middleware';
import { readJson } from '../request';
import type { Route } from './http';
const IMPORT_LIMIT = 64_000_000;
/** Handles project management and imports, creating one project per new import batch. */
export const projectRoutes: Route = async (ws, req, url) => {
  const p = url.pathname;
  if (p === '/api/status' && req.method === 'GET') {
    const scope = requestScope(req);
    if (requestReader(req).view && !scope.authorize('readStatus', { type: 'workspace' }).allow) {
      return Response.json({ mode: 'server', gitAvailable: ws.gitAvailable, ready: true });
    }
    return Response.json(await ws.status());
  }
  if (p === '/api/projects' && req.method === 'GET')
    return Response.json(await ws.listProjects(requestReader(req)));
  if (p === '/api/projects' && req.method === 'POST') {
    const body = await readJson(req, 16_000);
    const project = await ws.createProject(body?.name);
    return Response.json({ slug: project.slug, name: project.name });
  }
  const one = p.match(/^\/api\/projects\/([^/]+)$/);
  if (one && req.method === 'PATCH') {
    const body = await readJson(req, 16_000);
    if (!body || typeof body !== 'object' || Object.keys(body).some(k => k !== 'name'))
      throw Error('Expected {name}.');
    return Response.json(await ws.renameProject(decodeURIComponent(one[1]), body.name));
  }
  if (p === '/api/import' && req.method === 'POST') {
    const body = await readJson(req, IMPORT_LIMIT);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(k => !['name', 'files'].includes(k))
    )
      throw Error('Expected {name?, files: [{path, source}]}.');
    return Response.json(await ws.importBatch(body));
  }
  const move = p.match(/^\/api\/projects\/([^/]+)\/move$/);
  if (move && req.method === 'POST') {
    const body = await readJson(req, 16_000);
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).some(k => !['path', 'toProject', 'toPath'].includes(k)) ||
      typeof body.path !== 'string' ||
      typeof body.toProject !== 'string' ||
      (body.toPath !== undefined && typeof body.toPath !== 'string')
    )
      throw Error('Expected {path, toProject, toPath?}.');
    return Response.json(
      await ws.moveFile(
        decodeURIComponent(move[1]),
        body.path,
        body.toProject,
        body.toPath,
        false,
        requestReader(req),
      ),
    );
  }
  const into = p.match(/^\/api\/projects\/([^/]+)\/import$/);
  if (into && req.method === 'POST') {
    const body = await readJson(req, IMPORT_LIMIT);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(k => !['files', 'onConflict'].includes(k))
    )
      throw Error('Expected {files: [{path, source}], onConflict?}.');
    return Response.json(
      await ws.importInto(
        decodeURIComponent(into[1]),
        body.files,
        body.onConflict,
        requestReader(req),
      ),
    );
  }
  const example = p.match(/^\/api\/examples\/([a-z0-9-]+)$/);
  if (example && req.method === 'POST') return Response.json(await ws.loadExample(example[1]));
  return null;
};
