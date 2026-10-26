// Streams a project's files as a zip download, holding only the files the person may read.
import { requestReader, requestScope } from '../auth/request-scope';
import { decodeSegment } from '../request';
import { BadRequestError } from '../projects/errors';
import { exportFileName } from '../projects/project-export';
import { zipStream } from '../projects/zip';
import type { Route } from './http';

/** The most bytes one export may hold; the same ceiling an import batch is held to. */
export const EXPORT_LIMIT_BYTES = 64_000_000;
const EXPORT_ROUTE = /^\/api\/projects\/([^/]+)\/export$/;

function includeHistory(url: URL) {
  const value = url.searchParams.get('history');
  if (value === null || value === '0') return false;
  if (value === '1') return true;
  throw new BadRequestError('history must be 1 or 0.');
}

/** Answers `GET /api/projects/:slug/export` with a zip, or a 4xx before any byte of it is sent. */
export const exportRoutes: Route = async (ws, req, url) => {
  const match = url.pathname.match(EXPORT_ROUTE);
  if (!match || req.method !== 'GET') return null;
  const slug = decodeSegment(match[1]);
  const scope = requestScope(req);
  const historyAllowed = scope.authorize('history', { type: 'project', project: slug }).allow;
  const options = { includeHistory: includeHistory(url), historyAllowed };
  const plan = await ws.exportProject(slug, requestReader(req), options, EXPORT_LIMIT_BYTES);
  const headers = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${exportFileName(slug, plan.includesHistory)}"`,
    'Content-Length': String(plan.zipBytes),
    'X-Export-Files': String(plan.fileCount),
    'X-Export-Omitted': String(plan.omittedCount),
    'Cache-Control': 'no-store',
  };
  return new Response(zipStream(plan.entries), { headers });
};
