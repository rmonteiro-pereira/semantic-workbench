// Lists evidence for moving files between projects and records accepted or rejected suggestions.
import { requestReader } from '../auth/middleware';
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
    if (m[2] === 'accept') return Response.json(await ws.acceptSuggestion(m[1], reader));
    ws.rejectSuggestion(m[1], reader);
    return Response.json({ rejected: m[1] });
  }
  return null;
};
