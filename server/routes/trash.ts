import { readJson } from '../request';
import { decodePath, type Route } from './http';
// Delete, undo, restore, purge and Clear (contracts/http-api.md). Every destructive call needs
// an explicit `{confirm: true}` body, which the UI sends only from its confirmation dialog.
export function requireConfirm(body: any) {
  if (!body || body.confirm !== true)
    throw Error('This removes data; send {"confirm": true} after the user confirmed.');
}
const ENTRY = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const trashRoutes: Route = async (ws, req, url) => {
  const p = url.pathname;
  const impact = p.match(/^\/api\/projects\/([^/]+)\/delete-impact$/);
  if (impact && req.method === 'GET') {
    const path = url.searchParams.get('path');
    return Response.json(ws.deleteImpact(decodeURIComponent(impact[1]), path ?? undefined));
  }
  const file = p.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/);
  if (file && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(
      await ws.trash.deleteFile(decodeURIComponent(file[1]), decodePath(file[2])),
    );
  }
  const project = p.match(/^\/api\/projects\/([^/]+)$/);
  if (project && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(await ws.trash.deleteProject(decodeURIComponent(project[1])));
  }
  if (p === '/api/clear' && req.method === 'POST') {
    requireConfirm(await readJson(req, 4096));
    return Response.json(await ws.trash.clear());
  }
  if (p === '/api/trash' && req.method === 'GET') return Response.json(ws.trash.list());
  if (p === '/api/trash' && req.method === 'DELETE') {
    requireConfirm(await readJson(req, 4096));
    ws.trash.purgeAll();
    return new Response(null, { status: 204 });
  }
  const entry = p.match(/^\/api\/trash\/([^/]+)(\/undo|\/restore)?$/);
  if (entry && ENTRY.test(entry[1])) {
    const id = entry[1];
    if (entry[2] === '/undo' && req.method === 'POST')
      return Response.json(await ws.trash.undo(id));
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
      return Response.json(await ws.trash.restore(id, body));
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
