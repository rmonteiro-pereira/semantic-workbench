// Serves the browser's comparison of two authorized project sides.
import { parseSide, SIDE_NAMES, type DiffSide } from '../../shared/item-diff/sides';
import { readDiffSide } from '../auth/item-diff-access';
import { requestReader } from '../auth/request-scope';
import { requestSurface } from '../auth/request-surface';
import { BadRequestError } from '../projects/errors';
import { compareProjectItems } from '../projects/item-diff';
import { ITEM_DIFF_QUERY_LIMIT, decodeSegment } from '../request';
import type { Route } from './http';

const route = /^\/api\/projects\/([^/]+)\/item-diff$/;

function query(url: URL): [DiffSide, DiffSide] {
  if (url.search.length > ITEM_DIFF_QUERY_LIMIT) throw new BadRequestError('The comparison query is too long.');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to || url.searchParams.size !== 2) throw new BadRequestError('Name one from side and one to side.');
  try {
    return [parseSide(from), parseSide(to)];
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new BadRequestError(`Invalid comparison side. Supported sides: ${SIDE_NAMES.join(', ')}.`);
  }
}

/** Answers the inventoried item comparison using the reader established by the operation boundary. */
export const itemDiffRoutes: Route = async (workspace, request, url) => {
  const match = url.pathname.match(route);
  if (!match || request.method !== 'GET' || requestSurface(request) !== 'browser') return null;
  const project = decodeSegment(match[1]);
  const [from, to] = query(url);
  const reader = requestReader(request);
  const result = await readDiffSide(reader, project, () => {
    workspace.project(project);
    return compareProjectItems(workspace.itemDiffSides, project, from, to, reader);
  });
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
};
