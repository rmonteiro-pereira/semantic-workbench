// A person's own agent connections: the list and revocation. Another person's connection is answered like one that does not exist, so ids reveal nothing.
import { requestScope } from '../auth/request-scope';
import type { ConnectionService } from '../connections/connection-service';
import { decodeSegment } from '../request';
import type { Route } from './http';

export const CONNECTIONS_PATH = '/api/connections';

/** One answer for a missing connection and for someone else's. */
function notFound(): Response {
  return Response.json({ error: 'Not found.' }, { status: 404 });
}

export function createConnectionRoutes(service: ConnectionService): Route {
  return (_workspace, request, url) => {
    if (request.method === 'GET' && url.pathname === CONNECTIONS_PATH) {
      return Response.json(service.listFor(requestScope(request).principal.id));
    }
    const target = /^\/api\/connections\/([^/]+)$/.exec(url.pathname);
    if (request.method !== 'DELETE' || !target) return null;
    const id = decodeSegment(target[1]);
    if (service.ownerOf(id) !== requestScope(request).principal.id) return notFound();
    service.end(id, 'revoked-by-person');
    return Response.json({ ended: true });
  };
}
