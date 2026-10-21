import { MAX_INPUT_BYTES } from '../../src/diagnostics';
import { readJson } from '../request';
import { projectPath, assertSlug } from '../projects/paths';
import { decodePath, type Route } from './http';
// Drafts survive restarts and cache deletion (FR-078): text plus the hash of the base version.
export const draftRoutes: Route = async (ws, req, url) => {
  if (url.pathname === '/api/drafts' && req.method === 'GET')
    return Response.json(
      ws.state
        .drafts()
        .map(d => ({
          project: d.project,
          path: d.path,
          baseHash: d.baseHash,
          updatedAt: d.updatedAt,
        })),
    );
  const m = url.pathname.match(/^\/api\/drafts\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const slug = assertSlug(decodeURIComponent(m[1])),
    path = projectPath(decodePath(m[2]));
  if (!ws.state.registry().projects.some(p => p.slug === slug))
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  if (req.method === 'GET') {
    const d = ws.state.draft(slug, path);
    return d ? Response.json(d) : Response.json({ error: 'No draft.' }, { status: 404 });
  }
  if (req.method === 'PUT') {
    const body = await readJson(req, MAX_INPUT_BYTES * 12 + 4096);
    if (
      !body ||
      typeof body !== 'object' ||
      (body.baseHash !== null && typeof body.baseHash !== 'string') ||
      typeof body.text !== 'string'
    )
      throw Error('Expected {baseHash, text, patches}.');
    const patches = body.patches ?? [];
    if (!Array.isArray(patches)) throw Error('patches must be an array.');
    const d = ws.state.writeDraft(slug, path, {
      baseHash: body.baseHash,
      text: body.text,
      patches,
    });
    return Response.json({ updatedAt: d.updatedAt });
  }
  if (req.method === 'DELETE') {
    ws.state.deleteDraft(slug, path);
    return new Response(null, { status: 204 });
  }
  return null;
};
