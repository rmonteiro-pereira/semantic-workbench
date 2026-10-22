// Lists project metrics and explains their inputs without executing SQL.
import { requestReader } from '../auth/middleware';
import { explainMetric, projectMetrics } from '../agent/explain';
import { decodePath, type Route } from './http';
// Match before the files route so `explain` is not treated as part of a file path.
/** Handles metric listings and explanations without executing SQL. */
export const metricRoutes: Route = (ws, req, url) => {
  if (req.method !== 'GET') return null;
  const list = url.pathname.match(/^\/api\/projects\/([^/]+)\/metrics$/);
  if (list) {
    const slug = decodeURIComponent(list[1]);
    ws.project(slug);
    return Response.json(projectMetrics(ws.documentsFor(requestReader(req)), slug));
  }
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)\/explain\/([^/]+)$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]);
  const path = decodePath(m[2]);
  const metric = decodeURIComponent(m[3]);
  ws.project(slug);
  const dimensions = url.searchParams.getAll('dimension');
  if (dimensions.length > 20 || dimensions.some(d => !/^[^.\s]+\.[^.\s]+$/.test(d)))
    throw Error('dimension must be dataset.field (at most 20).');
  return Response.json(
    explainMetric(ws.documentsFor(requestReader(req)), slug, path, metric, {
      grain: url.searchParams.get('grain'),
      dimensions,
      rollup: url.searchParams.get('rollup'),
    }),
  );
};
