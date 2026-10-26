// Lists project metrics and explains their inputs without executing SQL.
import { requestReader } from '../auth/request-scope';
import { explainMetric, projectMetrics } from '../agent/explain';
import type { Route } from './http';
import { decodeSegment, decodePath } from '../request';
import { ownerVerifier } from '../auth/guards';
import { BadRequestError } from '../projects/errors';
// Match before the files route so `explain` is not treated as part of a file path.
/** Handles metric listings and explanations without executing SQL. */
export const metricRoutes: Route = (ws, req, url) => {
  if (req.method !== 'GET') return null;
  const list = url.pathname.match(/^\/api\/projects\/([^/]+)\/metrics$/);
  if (list) {
    const slug = decodeSegment(list[1]);
    ws.project(slug);
    const reader = requestReader(req);
    const metrics = projectMetrics(ws.documentsFor(reader), slug);
    if (!reader.view) return Response.json(metrics);
    // In server mode an owner that names nobody who has signed in is shown as unverified.
    const verified = ownerVerifier(ws.state.users().users);
    return Response.json(
      metrics.map(metric =>
        metric.owner ? { ...metric, ownerVerified: verified(metric.owner) } : metric,
      ),
    );
  }
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)\/explain\/([^/]+)$/);
  if (!m) return null;
  const slug = decodeSegment(m[1]);
  const path = decodePath(m[2]);
  const metric = decodeSegment(m[3]);
  ws.project(slug);
  const dimensions = url.searchParams.getAll('dimension');
  if (dimensions.length > 20 || dimensions.some(d => !/^[^.\s]+\.[^.\s]+$/.test(d)))
    throw new BadRequestError('dimension must be dataset.field (at most 20).');
  return Response.json(
    explainMetric(ws.documentsFor(requestReader(req)), slug, path, metric, {
      grain: url.searchParams.get('grain'),
      dimensions,
      rollup: url.searchParams.get('rollup'),
    }),
  );
};
