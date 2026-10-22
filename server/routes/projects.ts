// Handles project management, imports, example loading, and workspace status.
import { creationDomain, assignProjectDomain } from '../auth/project-creation';
import { ACTIONS } from '../auth/actions';
import { requestReader, requestScope } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { readJson } from '../request';
import type { AdminRepository } from '../auth/admin-repo';
import type { Route } from './http';
const IMPORT_LIMIT = 64_000_000;
/**
 * Handles project management and imports, creating one project per new import batch. A created
 * project's domain is written to the given administration repository.
 */
export function projectRoutes(administration: AdminRepository): Route {
  return async (ws, req, url) => {
    const deps = { ws, administration };
    const p = url.pathname;
    if (p === '/api/status' && req.method === 'GET') {
      const scope = requestScope(req);
      if (requestReader(req).view && !scope.authorize('readStatus', { type: 'workspace' }).allow) {
        return Response.json({ mode: 'server', gitAvailable: ws.gitAvailable, ready: true });
      }
      return Response.json(await ws.status());
    }
    if (p === '/api/projects' && req.method === 'GET') {
      const projects = await ws.listProjects(requestReader(req));
      const scope = requestScope(req);
      if (scope.principal.kind === 'local') return Response.json(projects);
      // Each project lists the actions the caller may take on it, and how its classification
      // values are read, so the client can disable controls the server would refuse.
      return Response.json(
        projects.map(project => ({
          ...project,
          actions: ACTIONS.filter(
            action => scope.authorize(action, { type: 'project', project: project.slug }).allow,
          ),
          classification: scope.classification(project.slug),
        })),
      );
    }
    if (p === '/api/projects' && req.method === 'POST') {
      const body = await readJson(req, 16_000);
      const domain = creationDomain(req, body?.domain);
      const project = await ws.createProject(body?.name);
      await assignProjectDomain(deps, req, project.slug, domain);
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
        Object.keys(body).some(k => !['name', 'files', 'domain'].includes(k))
      )
        throw Error('Expected {name?, files: [{path, source}]}.');
      const domain = creationDomain(req, body.domain);
      const result = await ws.importBatch(body, requestReader(req), { domain });
      await assignProjectDomain(deps, req, result.slug, domain);
      return Response.json(result);
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
      authorizeWrite(req, 'move', [
        { type: 'file', project: decodeURIComponent(move[1]), path: body.path },
        { type: 'file', project: body.toProject, path: body.toPath ?? body.path },
      ]);
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
      if (!Array.isArray(body.files)) throw Error('files must be an array.');
      const project = decodeURIComponent(into[1]);
      const authorizePaths = (paths: string[]) => {
        authorizeWrite(
          req,
          'import',
          paths.map(path => ({ type: 'file', project, path })),
        );
      };
      const reader = requestReader(req);
      return Response.json(
        await ws.importInto(project, body.files, body.onConflict, reader, authorizePaths),
      );
    }
    const example = p.match(/^\/api\/examples\/([a-z0-9-]+)$/);
    if (example && req.method === 'POST') {
      const body = await readJson(req, 16_000, {});
      const domain = creationDomain(req, body.domain);
      const result = await ws.loadExample(example[1]);
      if (result.created) await assignProjectDomain(deps, req, result.slug, domain);
      return Response.json(result);
    }
    return null;
  };
}
