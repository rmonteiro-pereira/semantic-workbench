// Serves durable drafts, including the source hash needed to detect conflicting edits.
import { requestReader } from '../auth/request-scope';
import { MAX_INPUT_BYTES } from '../../shared/validation/diagnostics';
import { decodeSegment, decodePath, readJson } from '../request';
import { projectPath, assertSlug } from '../projects/paths';
import type { PersonalState } from '../projects/state';
import type { Workspace } from '../projects/workspace';
import type { Route } from './http';
import { BadRequestError } from '../projects/errors';

/** The most unsaved edits one person keeps for one project. */
export const MAX_DRAFTS_PER_PROJECT = 200;
/** The most unsaved edits one person keeps across all projects. */
export const MAX_DRAFTS_PER_OWNER = 1000;
// A draft holds the text and the patches that produced it, so it may be about twice a saved file.
const MAX_DRAFT_BODY_BYTES = MAX_INPUT_BYTES * 2 + 4096;

// A new draft is refused once the person holds the most drafts allowed; replacing one is not new.
export function assertRoomForDraft(drafts: { project: string; path: string }[], slug: string, path: string) {
  if (drafts.some(draft => draft.project === slug && draft.path === path)) return;
  if (drafts.length >= MAX_DRAFTS_PER_OWNER) throw new BadRequestError('Too many unsaved edits. Save or discard some first.');
  if (drafts.filter(draft => draft.project === slug).length >= MAX_DRAFTS_PER_PROJECT) throw new BadRequestError('Too many unsaved edits in this project. Save or discard some first.');
}
type DraftTarget = {
  ws: Workspace;
  req: Request;
  reader: ReturnType<typeof requestReader>;
  state: PersonalState;
};

// Stores the text of one draft, if the person has the file and keeps room for another draft.
async function saveDraft({ ws, req, reader, state }: DraftTarget, slug: string, path: string) {
  const body = await readJson(req, MAX_DRAFT_BODY_BYTES);
  if (!body || typeof body !== 'object' || (body.baseHash !== null && typeof body.baseHash !== 'string') || typeof body.text !== 'string')
    throw new BadRequestError('Expected {baseHash, text, patches}.');
  const patches = body.patches ?? [];
  if (!Array.isArray(patches)) throw new BadRequestError('patches must be an array.');
  // A draft belongs to a file the person has; anything else would only fill the disk.
  if (!ws.hasFile(slug, path, reader)) return Response.json({ error: 'File not found.' }, { status: 404 });
  assertRoomForDraft(state.drafts(), slug, path);
  const saved = state.writeDraft(slug, path, { baseHash: body.baseHash, text: body.text, patches });
  return Response.json({ updatedAt: saved.updatedAt });
}
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
        .map(draft => ({
          project: draft.project,
          path: draft.path,
          baseHash: draft.baseHash,
          updatedAt: draft.updatedAt,
        })),
    );
  const match = url.pathname.match(/^\/api\/drafts\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const slug = assertSlug(decodeSegment(match[1]));
  const path = projectPath(decodePath(match[2]));
  if (!ws.state.registry().projects.some(p => p.slug === slug)) return Response.json({ error: 'Project not found.' }, { status: 404 });
  if (req.method === 'GET') {
    const draft = state.draft(slug, path);
    return draft ? Response.json(draft) : Response.json({ error: 'No draft.' }, { status: 404 });
  }
  if (req.method === 'PUT') {
    const target = { ws, req, reader, state };
    return saveDraft(target, slug, path);
  }
  if (req.method === 'DELETE') {
    state.deleteDraft(slug, path);
    return new Response(null, { status: 204 });
  }
  return null;
};
