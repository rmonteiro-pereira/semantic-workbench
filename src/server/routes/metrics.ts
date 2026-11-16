// Lists project metrics and explains their inputs without executing SQL.
import { requestReader } from '../auth/request-scope';
import { requestSurface } from '../auth/request-surface';
import type { Workspace } from '../projects/workspace';
import { explainMetric, projectMetrics } from '../agent/explain';
import type { Route } from './http';
import { decodeSegment, decodePath } from '../request';
import { ownerVerifier } from '../auth/guards';
import { BadRequestError } from '../projects/errors';

async function withMetricDocuments(ws: Workspace, request: Request, project: string, use: (documents: ReturnType<Workspace['documentsFor']>) => Response) {
  const reader = requestReader(request);
  if (requestSurface(request) === 'browser') return use(ws.documentsFor(reader));
  return ws.published.withPin(async pin => {
    const documents = await ws.published.documents(pin, project);
    return use(documents.filter(document => !reader.view || reader.view.canRead(project, document.path)));
  });
}
// Match before the files route so `explain` is not treated as part of a file path.
/** Handles metric listings and explanations without executing SQL. */
export const metricRoutes: Route = async (ws, req, url) => {
  if (req.method !== 'GET') return null;
  const list = url.pathname.match(/^\/api\/projects\/([^/]+)\/metrics$/);
  if (list) {
    const slug = decodeSegment(list[1]);
    ws.project(slug);
    const reader = requestReader(req);
    return withMetricDocuments(ws, req, slug, documents => {
      const metrics = projectMetrics(documents, slug);
      if (!reader.view) return Response.json(metrics);
      // Only people known to the workspace can verify ownership in server mode.
      const verified = ownerVerifier(ws.state.users().users);
      return Response.json(metrics.map(metric => (metric.owner ? { ...metric, ownerVerified: verified(metric.owner) } : metric)));
    });
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(.+)\/explain\/([^/]+)$/);
  if (!match) return null;
  const slug = decodeSegment(match[1]);
  const path = decodePath(match[2]);
  const metric = decodeSegment(match[3]);
  ws.project(slug);
  const dimensions = url.searchParams.getAll('dimension');
  if (dimensions.length > 20 || dimensions.some(d => !/^[^.\s]+\.[^.\s]+$/.test(d))) throw new BadRequestError('dimension must be dataset.field (at most 20).');
  return withMetricDocuments(ws, req, slug, documents =>
    Response.json(
      explainMetric(documents, slug, path, metric, {
        grain: url.searchParams.get('grain'),
        dimensions,
        rollup: url.searchParams.get('rollup'),
      }),
    ),
  );
};
