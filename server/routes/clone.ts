// Clones a repository as a new project. Cloning contacts the remote, so it runs only from this
// explicit request.
import { requestReader } from '../auth/request-scope';
import { creationDomain, assignProjectDomains } from '../auth/project-creation';
import type { AdminRepository } from '../auth/admin-repo';
import { readJson } from '../request';
import type { Route } from './http';

/** Starts and cancels clones; the projects a clone creates get their domain in one commit. */
export function cloneRoutes(administration: AdminRepository): Route {
  return async (ws, req, url) => {
    const path = url.pathname;
    if (path === '/api/clone' && req.method === 'POST') {
      const body = await readJson(req, 16_000);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some(key => !['url', 'name', 'domain'].includes(key))
      )
        throw Error('Expected {url, name?}.');
      if (!ws.gitAvailable) throw Error('Git is not available on this machine.');
      const domain = creationDomain(req, body.domain);
      const result = ws.clone(body.url, body.name, requestReader(req), slugs =>
        assignProjectDomains({ ws, administration }, req, slugs, domain),
      );
      return Response.json(result);
    }
    const cancel = path.match(/^\/api\/clone\/([a-z0-9-]+)\/cancel$/);
    if (cancel && req.method === 'POST') return Response.json(ws.cancelClone(cancel[1]));
    return null;
  };
}
