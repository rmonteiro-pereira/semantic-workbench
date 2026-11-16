// Shares catalog, context and planning handlers across explicit definition sources.
import { documentsOfProject } from '../../shared/core/project-scope';
import { agentCatalog, buildContext, selectContext, wholeContext, planQuery } from '../agent/runtime';
import { requestSurface } from '../auth/request-surface';
import { requestReader } from '../auth/request-scope';
import { BadRequestError, HiddenResourceError } from '../projects/errors';
import type { Workspace } from '../projects/workspace';
import { readJson } from '../request';
import type { Route } from './http';

/** A complete document set supplied before deterministic catalog, context or planning work. */
export type AgentDocumentSource = (
  workspace: Workspace,
  request: Request,
  project: string,
  use: (documents: ReturnType<Workspace['documentsFor']>) => Response | Promise<Response>,
) => Promise<Response>;

/** Reads the caller's authoring view for browser planning and context previews. */
export const editingAgentDocuments: AgentDocumentSource = async (workspace, request, project, use) => use(documentsOfProject(workspace.documentsFor(requestReader(request)), project));

/** Holds one immutable publication through the response and applies the caller's current visibility. */
export const publishedAgentDocuments: AgentDocumentSource = (workspace, request, project, use) =>
  workspace.published.withPin(async pin => {
    const { commit, documents } = await workspace.published.readableDocuments(pin, project, requestReader(request));
    const response = await use(documents);
    response.headers.set('X-Workbench-Snapshot', commit);
    return response;
  });

function requireReadableDocument(ws: Workspace, request: Request, id: string) {
  const { view } = requestReader(request);
  if (!view) return;
  const resource = ws.resolveId(id.split('#')[0]);
  if (!view.canRead(resource.project, resource.path)) throw new HiddenResourceError();
}
/** The projects the caller may read: the slugs an agent request can name. */
function agentProjects(ws: Workspace, request: Request) {
  const { view } = requestReader(request);
  return ws.state
    .registry()
    .projects.filter(project => !view || view.readableProjects.has(project.slug))
    .map(({ slug, name }) => ({ slug, name }));
}
/** A mapping is resolved inside its own project, so the request must name that project. */
function requireMappingInProject(ws: Workspace, mappingId: string, project: string) {
  const owner = ws.resolveId(mappingId.split('#')[0]).project;
  if (owner !== project) throw new BadRequestError(`mappingId belongs to project ${owner}, not ${project}.`);
}
function requireProject(ws: Workspace, request: Request, project: unknown): asserts project is string {
  if (typeof project !== 'string' || !project) throw new BadRequestError('project is required. List projects at /api/agent/projects.');
  if (!agentProjects(ws, request).some(known => known.slug === project)) throw new BadRequestError('Project not found.');
}

/** Creates the agent route group using one explicit source of definition documents. */
export function createAgentRoutes(source: AgentDocumentSource, prefix = '/api/agent'): Route {
  return async (ws, req, url) => {
    // Mapping fragments identify embedded mappings and must survive legacy document ID translation.
    const mappingRef = (id: string) => {
      const hash = id.indexOf('#');
      const doc = hash < 0 ? id : id.slice(0, hash);
      const rest = hash < 0 ? '' : id.slice(hash);
      const legacy = ws.state.legacyIds().ids[doc];
      return legacy ? `${legacy.project}/${legacy.path}${rest}` : id;
    };
    if (prefix === '/api/agent' && url.pathname === '/api/agent/projects' && req.method === 'GET') return Response.json({ projects: agentProjects(ws, req) });
    if (url.pathname === `${prefix}/catalog` && req.method === 'GET') {
      const project = url.searchParams.get('project');
      requireProject(ws, req, project);
      return source(ws, req, project, documents => Response.json(agentCatalog(documents)));
    }
    if (url.pathname === `${prefix}/context` && req.method === 'GET') {
      const mappingId = url.searchParams.get('mappingId');
      if (!mappingId) throw new BadRequestError('mappingId is required. List mappings at /api/agent/catalog.');
      const project = url.searchParams.get('project') ?? '';
      requireProject(ws, req, project);
      return source(ws, req, project, documents => {
        requireReadableDocument(ws, req, mappingRef(mappingId));
        requireMappingInProject(ws, mappingRef(mappingId), project);
        const context = buildContext(documents, mappingRef(mappingId));
        const concepts = url.searchParams.getAll('concept');
        return Response.json(concepts.length ? selectContext(context, concepts) : wholeContext(context));
      });
    }
    if (url.pathname === `${prefix}/plan` && req.method === 'POST') {
      const body = await readJson(req, 64_000);
      if (!body || Array.isArray(body) || Object.keys(body).some(k => !['project', 'mappingId', 'concepts', 'metrics', 'dimensions'].includes(k)) || typeof body.mappingId !== 'string')
        throw new BadRequestError('Expected project, mappingId, optional concepts, metrics and dimensions. Expressions and metric overrides are not accepted.');
      for (const key of ['concepts', 'metrics', 'dimensions'])
        if (
          (key !== 'concepts' || body[key] !== undefined) &&
          (!Array.isArray(body[key]) || body[key].length > 100 || body[key].some((id: any) => typeof id !== 'string' || !id.trim() || id.length > 4096))
        )
          throw new BadRequestError(`${key} must be an array of at most 100 non-empty ids.`);
      requireProject(ws, req, body.project);
      return source(ws, req, body.project, documents => {
        requireReadableDocument(ws, req, mappingRef(body.mappingId));
        requireMappingInProject(ws, mappingRef(body.mappingId), body.project);
        return Response.json(planQuery(buildContext(documents, mappingRef(body.mappingId)), body));
      });
    }
    return null;
  };
}

/** Serves authoring previews only to requests admitted through the browser surface. */
export function createPreviewRoutes(): Route {
  const preview = createAgentRoutes(editingAgentDocuments, '/api/preview');
  return (workspace, request, url) => {
    if (requestSurface(request) !== 'browser') return null;
    return preview(workspace, request, url);
  };
}
