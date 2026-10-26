// Lists evidence for moving files between projects and records accepted or rejected suggestions.
import { requestReader } from '../auth/request-scope';
import { authorizeWrite } from '../auth/write-access';
import { NotFoundError } from '../projects/errors';
import type { Route } from './http';
// Rejections are remembered by file hash and target project so unchanged suggestions stay
// dismissed.
/** Handles file grouping suggestions and the user’s accept or reject decision. */
export const suggestionRoutes: Route = async (ws, req, url) => {
  if (!url.pathname.startsWith('/api/suggestions')) return null;
  const reader = requestReader(req);
  if (url.pathname === '/api/suggestions' && req.method === 'GET')
    return Response.json(ws.suggestions(reader));
  const m = url.pathname.match(/^\/api\/suggestions\/([0-9a-f]{20})\/(accept|reject)$/);
  if (m && req.method === 'POST') {
    const suggestion = ws.suggestions(reader).find(item => item.id === m[1]);
    if (!suggestion) throw new NotFoundError('Suggestion not found.');
    const source = {
      type: 'file' as const,
      project: suggestion.file.project,
      path: suggestion.file.path,
    };
    const target = {
      type: 'file' as const,
      project: suggestion.targetProject,
      path: suggestion.file.path,
    };
    const accepting = m[2] === 'accept';
    authorizeWrite(req, accepting ? 'move' : 'edit', accepting ? [source, target] : [source]);
    if (accepting) return Response.json(await ws.acceptSuggestion(m[1], reader));
    ws.rejectSuggestion(m[1], reader);
    return Response.json({ rejected: m[1] });
  }
  return null;
};
