// Lists and registers the project folders of a Git repository that holds several projects.
import { readJson } from '../request';
import { requestReader } from '../auth/request-scope';
import { checkRepositoryRemotes } from '../auth/remote-credentials';
import type { Route } from './http';

/** Handles the project candidates of a repository and the user's confirmed choice. */
export const repoRoutes: Route = async (ws, req, url) => {
  const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/(project-candidates|projects)$/);
  if (!match) return null;
  const repo = decodeURIComponent(match[1]);
  if (match[2] === 'project-candidates' && req.method === 'GET')
    return Response.json(await ws.projectCandidates(repo, requestReader(req)));
  if (match[2] === 'projects' && req.method === 'PUT') {
    const body = await readJson(req, 256_000);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(key => !['projects', 'saveManifest', 'manifestBaseHash'].includes(key))
    )
      throw Error('Expected {projects: [{path, name?}], saveManifest?, manifestBaseHash?}.');
    if (body.saveManifest !== undefined && typeof body.saveManifest !== 'boolean')
      throw Error('saveManifest must be true or false.');
    await checkRepositoryRemotes(ws, req, repo);
    return Response.json(
      await ws.registerRepositoryProjects(
        repo,
        body.projects,
        {
          saveManifest: body.saveManifest === true,
          manifestBaseHash: body.manifestBaseHash,
        },
        requestReader(req),
      ),
    );
  }
  return null;
};
