// Serves durable drafts, including the source hash needed to detect conflicting edits.
import { requestReader } from '../auth/request-scope';
import { MAX_INPUT_BYTES } from '../../src/diagnostics';
import { decodePath, readJson } from '../request';
import { projectPath, assertSlug } from '../projects/paths';
import type { Route } from './http';
/** Handles persistent draft reads, saves, and removal. */
export const draftRoutes: Route = async (ws, req, url) => {
  if (!url.pathname.startsWith('/api/drafts')) return null;
  const reader = requestReader(req);
  const { view, owner } = reader;
  const state = owner ? ws.state.forOwner(owner) : ws.state;
  if (url.pathname === '/api/drafts' && req.method === 'GET')
    return Response.json(
      state
        .drafts()
        .filter(d => !view || view.canRead(d.project, d.path))
        .map(d => ({
          project: d.project,
          path: d.path,
          baseHash: d.baseHash,
          updatedAt: d.updatedAt,
        })),
    );
  const m = url.pathname.match(/^\/api\/drafts\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const slug = assertSlug(decodeURIComponent(m[1]));
  const path = projectPath(decodePath(m[2]));
  if (!ws.state.registry().projects.some(p => p.slug === slug))
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  if (req.method === 'GET') {
    const d = state.draft(slug, path);
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
    const d = state.writeDraft(slug, path, {
      baseHash: body.baseHash,
      text: body.text,
      patches,
    });
    return Response.json({ updatedAt: d.updatedAt });
  }
  if (req.method === 'DELETE') {
    state.deleteDraft(slug, path);
    return new Response(null, { status: 204 });
  }
  return null;
};
