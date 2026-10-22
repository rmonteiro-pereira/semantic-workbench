// Serves workspace invalidations as server-sent events.
import {
  requestReader,
  requestScope,
  type AccessControl,
  type HandlerOptions,
} from '../auth/middleware';
import type { ServerAuthentication } from '../auth/authentication';
import type { EventAccess } from '../projects/event-access';
import type { Workspace } from '../projects/workspace';
import type { Route } from './http';
/** Handles the invalidation stream using the router’s origin checks. */
export function eventRoutes(options: HandlerOptions = {}): Route {
  return (ws, request, url) => {
    if (url.pathname !== '/api/events' || request.method !== 'GET') return null;
    if (options.authentication)
      return sessionEventResponse(ws, request, options.authentication, options.access);
    return ws.events.stream(
      request,
      undefined,
      eventAccess(ws, request),
      options.access?.subscribe,
    );
  };
}

// A person's stream filters every event through their scope; a local stream sees everything.
function eventAccess(ws: Workspace, request: Request): EventAccess | undefined {
  if (!requestReader(request).view) return undefined;
  const scope = requestScope(request);
  const owner = scope.principal.id;
  return {
    scope,
    owner,
    suggestions: index => ws.suggestionCount({ view: scope.view(), owner }, index),
  };
}

/** Binds an authenticated event stream to revocation of its server-held session. */
export async function sessionEventResponse(
  ws: Workspace,
  request: Request,
  authentication: ServerAuthentication['authentication'],
  access?: AccessControl,
) {
  const session = await authentication.session(request);
  if (!session) return Response.json({ error: 'sign-in required' }, { status: 401 });
  return ws.events.stream(
    request,
    listener => authentication.sessions.subscribe(session.id, listener),
    eventAccess(ws, request),
    access?.subscribe,
  );
}
