// Clones a repository as a new project. Cloning contacts the remote, so it runs only from this
// explicit request.
import { requestReader } from '../auth/request-scope';
import { creationDomain, assignProjectDomains } from '../auth/project-creation';
import type { AdminRepository } from '../auth/admin-repo';
import { readJson } from '../request';
import { cloneCredential } from '../auth/remote-credentials';
import type { Route } from './http';
import { BadRequestError } from '../projects/errors';

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
        Object.keys(body).some(
          key => !['url', 'name', 'domain', 'folder', 'createFolder'].includes(key),
        )
      )
        throw new BadRequestError('Expected {url, name?, folder?, createFolder?}.');
      if (body.createFolder !== undefined && typeof body.createFolder !== 'boolean')
        throw new BadRequestError('createFolder must be true or false.');
      if (!ws.gitAvailable) throw new BadRequestError('Git is not available on this machine.');
      const domain = creationDomain(req, body.domain);
      // Also refuses a host that is not allowed, before anything is cloned.
      const { address, credential } = await cloneCredential(req, body.url);
      const result = ws.clone(
        address,
        body.name,
        requestReader(req),
        slugs => assignProjectDomains({ ws, administration }, req, slugs, domain),
        credential,
        { folder: body.folder, createFolder: body.createFolder },
      );
      return Response.json(result);
    }
    const cancel = path.match(/^\/api\/clone\/([a-z0-9-]+)\/cancel$/);
    if (cancel && req.method === 'POST') return Response.json(ws.cancelClone(cancel[1]));
    return null;
  };
}
