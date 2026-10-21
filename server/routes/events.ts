import type {Route} from './http';
// GET /api/events: invalidation stream (contracts/sse-events.md). The origin check in the router
// applies here like everywhere else.
export const eventRoutes:Route=(ws,req,url)=>url.pathname==='/api/events'&&req.method==='GET'?ws.events.stream(req):null;
