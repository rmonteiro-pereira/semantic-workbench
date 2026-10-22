// Serves workspace invalidations as server-sent events.
import type { Route } from './http';
/** Handles the invalidation stream using the router’s origin checks. */
export function eventRoutes(options: import('../auth/middleware').HandlerOptions = {}): Route {
  return (ws, request, url) => {
    if (url.pathname !== '/api/events' || request.method !== 'GET') return null;
    if (options.authentication) return sessionEventResponse(ws, request, options.authentication);
    return ws.events.stream(request);
  };
}

/** Binds an authenticated event stream to revocation of its server-held session. */
export async function sessionEventResponse(
  ws: import('../projects/workspace').Workspace,
  request: Request,
  authentication: import('../auth/authentication').ServerAuthentication['authentication'],
) {
  const session = await authentication.session(request);
  if (!session) return Response.json({ error: 'sign-in required' }, { status: 401 });
  return ws.events.stream(request, listener =>
    authentication.sessions.subscribe(session.id, listener),
  );
}
