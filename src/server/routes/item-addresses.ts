import { parseAddress } from '../../shared/core/item-address';
import { requestReader } from '../auth/request-scope';
import { BadRequestError } from '../projects/errors';
import { ITEM_ADDRESS_REQUEST_LIMIT, decodePath, decodeSegment, readJson } from '../request';
import type { Route } from './http';

function projectItemAddress(value: unknown, project: string, path?: string): string {
  if (typeof value !== 'string') throw new BadRequestError('An item address must be text.');
  const parsed = parseAddress(value);
  if (!parsed.ok || parsed.address.project !== project || !parsed.address.chain.length) throw new BadRequestError('Expected a canonical absolute item address in the request project.');
  if (path !== undefined && parsed.address.document?.join('/') !== path) throw new BadRequestError('The target address must belong to the request file.');
  return value;
}

/** Dispatches structured item resolution and explicit reconciliation under the shared operation boundary. */
export const itemAddressRoutes: Route = async (workspace, request, url) => {
  const resolution = url.pathname.match(/^\/api\/projects\/([^/]+)\/item-addresses\/resolve$/);
  const reconciliation = url.pathname.match(/^\/api\/projects\/([^/]+)\/item-addresses\/reconcile\/(.+)$/);
  const match = resolution ?? reconciliation;
  if (!match || request.method !== 'POST') return null;
  const project = decodeSegment(match[1]);
  const body: unknown = await readJson(request, ITEM_ADDRESS_REQUEST_LIMIT);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('Expected an item-address request object.');
  if (resolution) {
    if (!('address' in body) || Object.keys(body).some(key => key !== 'address')) throw new BadRequestError('Expected {address}.');
    return Response.json(workspace.resolveAddress(projectItemAddress(body.address, project), requestReader(request)));
  }
  if (!('operationId' in body) || typeof body.operationId !== 'string' || !('from' in body) || !('to' in body) || Object.keys(body).some(key => !['operationId', 'from', 'to'].includes(key))) {
    throw new BadRequestError('Expected {operationId, from, to}.');
  }
  return Response.json(
    await workspace.reconcileAddress(request, {
      operationId: body.operationId,
      from: projectItemAddress(body.from, project),
      to: projectItemAddress(body.to, project, decodePath(reconciliation![2])),
    }),
  );
};
