// Clones a repository as a new project. Cloning contacts the remote, so it runs only from this
// explicit request.
import { readJson } from '../request';
import type { Route } from './http';

/** Starts and cancels clones. */
export const cloneRoutes: Route = async (ws, req, url) => {
  const path = url.pathname;
  if (path === '/api/clone' && req.method === 'POST') {
    const body = await readJson(req, 16_000);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(key => !['url', 'name'].includes(key))
    )
      throw Error('Expected {url, name?}.');
    if (!ws.gitAvailable) throw Error('Git is not available on this machine.');
    return Response.json(ws.clone(body.url, body.name));
  }
  const cancel = path.match(/^\/api\/clone\/([a-z0-9-]+)\/cancel$/);
  if (cancel && req.method === 'POST') return Response.json(ws.cancelClone(cancel[1]));
  return null;
};
