import { explainMetric, projectMetrics } from '../agent/explain';
import { decodePath, type Route } from './http';
// GET /api/projects/:slug/metrics and GET /api/projects/:slug/files/*path/explain/:metric. Read only:
// the explanation never executes SQL. Matched before the files route, which would read `…/explain/x` as a path.
export const metricRoutes: Route = (ws, req, url) => {
  if (req.method !== 'GET') return null;
  const list = url.pathname.match(/^\/api\/projects\/([^/]+)\/metrics$/);
  if (list) {
    const slug = decodeURIComponent(list[1]);
    ws.project(slug);
    return Response.json(projectMetrics(ws.documents(), slug));
  }
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)\/explain\/([^/]+)$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]),
    path = decodePath(m[2]),
    metric = decodeURIComponent(m[3]);
  ws.project(slug);
  const dimensions = url.searchParams.getAll('dimension');
  if (dimensions.length > 20 || dimensions.some(d => !/^[^.\s]+\.[^.\s]+$/.test(d)))
    throw Error('dimension must be dataset.field (at most 20).');
  return Response.json(
    explainMetric(ws.documents(), slug, path, metric, {
      grain: url.searchParams.get('grain'),
      dimensions,
      rollup: url.searchParams.get('rollup'),
    }),
  );
};
