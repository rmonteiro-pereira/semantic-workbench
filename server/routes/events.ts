// Serves workspace invalidations as server-sent events.
import type { HandlerOptions } from '../auth/middleware';
import { requestReader, requestScope } from '../auth/request-scope';
import type { ServerAuthentication } from '../auth/authentication';
import type { EventAccess } from '../projects/event-access';
import type { Workspace } from '../projects/workspace';
import type { Route } from './http';
/** Handles the invalidation stream using the router’s origin checks. */
export function eventRoutes(options: HandlerOptions = {}): Route {
  return (ws, request, url) => {
    if (url.pathname !== '/api/events' || request.method !== 'GET') return null;
    if (options.authentication) return sessionEventResponse(ws, request, options.authentication);
    // Without server sessions nobody is told individually, so every policy reload closes the stream.
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
) {
  const session = await authentication.session(request);
  if (!session) return Response.json({ error: 'sign-in required' }, { status: 401 });
  // The administration service closes only the streams of the people a change affects, through
  // their sessions, so a policy reload alone leaves the others open.
  return ws.events.stream(
    request,
    listener => authentication.sessions.subscribe(session.id, listener),
    eventAccess(ws, request),
  );
}
