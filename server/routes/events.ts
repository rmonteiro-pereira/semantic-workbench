// Serves workspace invalidations as server-sent events.
import type { Route } from './http';
/** Handles the invalidation stream using the router’s origin checks. */
export const eventRoutes: Route = (ws, req, url) =>
  url.pathname === '/api/events' && req.method === 'GET' ? ws.events.stream(req) : null;
