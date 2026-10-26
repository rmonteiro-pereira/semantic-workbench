// Handles deletion, undo, restoration, and permanent removal with explicit confirmation for
// destructive calls.
import type { AdminRepository } from '../auth/admin-repo';
import { creationDomain, assignProjectDomain } from '../auth/project-creation';
import { requestReader, requestScope } from '../auth/request-scope';
import type { ResourceRef } from '../auth/resource';
import type { Workspace } from '../projects/workspace';
import { readableTrash, restoreAction, type TrashEntry } from '../projects/trash';
import { authorizeWrite } from '../auth/write-access';
import { decodeSegment, decodePath, readJson } from '../request';
import type { Route } from './http';
import { BadRequestError } from '../projects/errors';
/** Requires an explicit confirmation flag before a destructive operation. */
export function requireConfirm(body: any) {
  if (!body || body.confirm !== true)
    throw new BadRequestError(
      'This removes data; send {"confirm": true} after the user confirmed.',
    );
}
/** The places a restoration writes: the original target, or the destination the body names. */
function restoreResources(
  entry: TrashEntry,
  project = entry.project,
  path = entry.path,
): ResourceRef[] {
  if (entry.kind === 'file' && path) return [{ type: 'file', project, path }];
  return (entry.projects ?? [{ slug: project }]).map(item => ({
    type: 'project',
    project: item.slug,
  }));
}

const ENTRY = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Restoring a file whose project is gone makes a new project for it.
function makesProject(ws: Workspace, entry: TrashEntry, toProject: string | undefined) {
  return (
    entry.kind === 'file' &&
    toProject === undefined &&
    !ws.state.registry().projects.some(project => project.slug === entry.project)
  );
}

/**
 * Runs a restoration. One that makes a new project is a project creation: the person must be
 * allowed to create one in the domain they choose, and the domain is recorded for it, exactly as
 * for an import.
 */
async function restoring(
  context: { ws: Workspace; req: Request; administration?: AdminRepository },
  entry: TrashEntry,
  body: { toProject?: string; domain?: string },
  restore: () => Promise<{ project: string }>,
) {
  const { ws, req, administration } = context;
  if (!makesProject(ws, entry, body.toProject)) return restore();
  const domain = creationDomain(req, body.domain);
  const isLocal = requestScope(req).principal.kind === 'local';
  if (!administration && !isLocal)
    throw new BadRequestError('Restoring into a new project is not available.');
  const result = await restore();
  if (administration)
    await assignProjectDomain({ ws, administration }, req, result.project, domain);
  return result;
}

/** Handles trash operations; a restoration that makes a project records its domain. */
export function trashRoutesWith(administration?: AdminRepository): Route {
  return (ws, req, url) => handleTrash(ws, req, url, administration);
}
/** Trash operations for a handler that records no project domains, such as local mode. */
export const trashRoutes: Route = trashRoutesWith();

/** Handles trash operations, requiring confirmation before destructive actions. */
const handleTrash = async (
  ws: Workspace,
  req: Request,
  url: URL,
  administration?: AdminRepository,
) => {
  const p = url.pathname;
  if (!p.startsWith('/api/')) return null;
  const reader = requestReader(req);
  const { view, owner } = reader;
  const scope = requestScope(req);
  const visibleEntries = () =>
    ws.trash.list().filter(entry => !view || readableTrash(entry, scope));
  const impact = p.match(/^\/api\/projects\/([^/]+)\/delete-impact$/);
  if (impact && req.method === 'GET') {
    const path = url.searchParams.get('path');
    const slug = decodeSegment(impact[1]);
    const result = ws.deleteImpact(slug, path ?? undefined, reader);
    // Deleting a whole project in server mode also discards everyone's unpublished work on it.
    // Who did that work and how much of it is for those who may delete the project to know.
    if (!view || path !== null) return Response.json(result);
    const mayDelete = scope.authorize('deleteProject', { type: 'project', project: slug }).allow;
    if (!mayDelete) return Response.json(result);
    return Response.json({ ...result, unpublished: await ws.unpublishedWork(slug) });
  }
  const file = p.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (file && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(await ws.deleteFile(decodeSegment(file[1]), decodePath(file[2]), reader));
  }
  const project = p.match(/^\/api\/projects\/([^/]+)$/);
  if (project && req.method === 'DELETE') {
    const body = await readJson(req, 4096);
    // Remove from workspace deletes nothing; deleting the folder needs the confirmation.
    if (body?.mode === 'remove')
      return Response.json(await ws.removeProject(decodeSegment(project[1])));
    if (body?.mode !== undefined && body.mode !== 'delete')
      throw new BadRequestError('mode is "remove" or "delete".');
    requireConfirm(body);
    return Response.json(await ws.trash.deleteProject(decodeSegment(project[1]), owner));
  }
  if (p === '/api/clear' && req.method === 'POST') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(await ws.trash.clear(owner));
  }
  if (p === '/api/trash' && req.method === 'GET') return Response.json(visibleEntries());
  if (p === '/api/trash' && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    if (view) {
      for (const entry of visibleEntries()) ws.trash.purge(entry.entryId);
    } else ws.trash.purgeAll();
    return new Response(null, { status: 204 });
  }
  const entry = p.match(/^\/api\/trash\/([^/]+)(\/undo|\/restore)?$/);
  if (entry && ENTRY.test(entry[1])) {
    const id = entry[1];
    if (entry[2] === '/undo' && req.method === 'POST') {
      const target = ws.trash.entry(id);
      authorizeWrite(req, restoreAction(target, scope), restoreResources(target));
      const context = { ws, req, administration };
      const body = await readJson(req, 4096, {});
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some(key => key !== 'domain') ||
        (body.domain !== undefined && typeof body.domain !== 'string')
      )
        throw new BadRequestError('Expected {domain?}.');
      const undone = () => ws.trash.undo(id, reader);
      return Response.json(await restoring(context, target, body, undone));
    }
    if (entry[2] === '/restore' && req.method === 'POST') {
      const body = await readJson(req, 4096, {});
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some(k => !['toProject', 'toPath', 'domain'].includes(k))
      )
        throw new BadRequestError('Expected {toProject?, toPath?, domain?}.');
      for (const k of ['toProject', 'toPath'])
        if (body[k] !== undefined && typeof body[k] !== 'string')
          throw new BadRequestError(`${k} must be text.`);
      const target = ws.trash.entry(id);
      authorizeWrite(req, restoreAction(target, scope), [
        ...restoreResources(target),
        ...restoreResources(target, body.toProject ?? target.project, body.toPath ?? target.path),
      ]);
      const context = { ws, req, administration };
      return Response.json(
        await restoring(context, target, body, () => ws.trash.restore(id, body, reader)),
      );
    }
    if (!entry[2] && req.method === 'DELETE') {
      requireConfirm(await readJson(req, 4096));
      ws.trash.purge(id);
      return new Response(null, { status: 204 });
    }
  }
  if (entry && !ENTRY.test(entry[1]))
    return Response.json({ error: 'Trash entry not found.' }, { status: 404 });
  return null;
};
