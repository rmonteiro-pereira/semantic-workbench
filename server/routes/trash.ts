// Handles deletion, undo, restoration, and permanent removal with explicit confirmation for
// destructive calls.
import { requestReader, requestScope } from '../auth/request-scope';
import type { ResourceRef } from '../auth/resource';
import { readableTrash, restoreAction, type TrashEntry } from '../projects/trash';
import { authorizeWrite } from '../auth/write-access';
import { decodePath, readJson } from '../request';
import type { Route } from './http';
/** Requires an explicit confirmation flag before a destructive operation. */
export function requireConfirm(body: any) {
  if (!body || body.confirm !== true)
    throw Error('This removes data; send {"confirm": true} after the user confirmed.');
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
/** Handles trash operations, requiring confirmation before destructive actions. */
export const trashRoutes: Route = async (ws, req, url) => {
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
    return Response.json(ws.deleteImpact(decodeURIComponent(impact[1]), path ?? undefined, reader));
  }
  const file = p.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (file && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(
      await ws.trash.deleteFile(decodeURIComponent(file[1]), decodePath(file[2]), owner, reader),
    );
  }
  const project = p.match(/^\/api\/projects\/([^/]+)$/);
  if (project && req.method === 'DELETE') {
    const body = await readJson(req, 4096);
    // Remove from workspace deletes nothing; deleting the folder needs the confirmation.
    if (body?.mode === 'remove')
      return Response.json(await ws.removeProject(decodeURIComponent(project[1])));
    if (body?.mode !== undefined && body.mode !== 'delete')
      throw Error('mode is "remove" or "delete".');
    requireConfirm(body);
    return Response.json(await ws.trash.deleteProject(decodeURIComponent(project[1]), owner));
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
      return Response.json(await ws.trash.undo(id, reader));
    }
    if (entry[2] === '/restore' && req.method === 'POST') {
      const body = await readJson(req, 4096, {});
      if (
        !body ||
        typeof body !== 'object' ||
        Object.keys(body).some(k => !['toProject', 'toPath'].includes(k))
      )
        throw Error('Expected {toProject?, toPath?}.');
      for (const k of ['toProject', 'toPath'])
        if (body[k] !== undefined && typeof body[k] !== 'string') throw Error(`${k} must be text.`);
      const target = ws.trash.entry(id);
      authorizeWrite(req, restoreAction(target, scope), [
        ...restoreResources(target),
        ...restoreResources(target, body.toProject ?? target.project, body.toPath ?? target.path),
      ]);
      return Response.json(await ws.trash.restore(id, body, reader));
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
