// Routes API requests and preserves the legacy document interface. Host and origin checks restrict
// access to local clients.
import { HiddenResourceError } from './projects/errors';
import { requestReader } from './auth/request-scope';
import { authorizeWrite, WriteAccessError } from './auth/write-access';
import {
  createAccessMiddleware,
  defaultAccess,
  defaultAdministration,
  type HandlerOptions,
} from './auth/middleware';
import type { AdminRepository } from './auth/admin-repo';
import { agentCatalog, buildContext, selectContext, planQuery } from './agent/runtime';
import { readJson } from './request';
import { InputError, MAX_INPUT_BYTES } from '../src/diagnostics';
import { NotFoundError, StaleError, type Workspace } from './projects/workspace';
import { errorResponse, type Route } from './routes/http';
import { authRoutes } from './routes/auth';
import { meResponse } from './routes/me';
import { serveStatic, securityHeaders } from './static';
import { eventRoutes } from './routes/events';
import { projectRoutes } from './routes/projects';
import { fileRoutes } from './routes/files';
import { draftRoutes } from './routes/drafts';
import { trashRoutes } from './routes/trash';
import { suggestionRoutes } from './routes/suggestions';
import { metricRoutes } from './routes/metrics';
import { kpiRoutes } from './routes/kpis';
import { gitRoutes } from './routes/git';
import { cloneRoutes } from './routes/clone';
import { repoRoutes } from './routes/repos';
/** Local browser origins allowed to call the API. */
export const ALLOWED_ORIGINS = allowedOrigins(4310);
/** Includes the configured API origin and the Vite development server. */
export function allowedOrigins(port: number) {
  return [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
}

// Legacy clients still use document, grouping, and agent endpoints.
// Document IDs use `<project>/<path>`; older IDs resolve through legacy-ids.json.
const legacyRoutes: Route = async (ws, req, url) => {
  // Mapping fragments identify embedded mappings and must survive legacy document ID translation.
  const mappingRef = (id: string) => {
    const hash = id.indexOf('#');
    const doc = hash < 0 ? id : id.slice(0, hash);
    const rest = hash < 0 ? '' : id.slice(hash);
    const legacy = ws.state.legacyIds().ids[doc];
    return legacy ? `${legacy.project}/${legacy.path}${rest}` : id;
  };
  if (url.pathname === '/api/agent/catalog' && req.method === 'GET')
    return Response.json(agentCatalog(ws.documentsFor(requestReader(req))));
  if (url.pathname === '/api/agent/context' && req.method === 'GET') {
    const mappingId = url.searchParams.get('mappingId');
    if (!mappingId) throw Error('mappingId is required. List mappings at /api/agent/catalog.');
    requireReadableDocument(ws, req, mappingRef(mappingId));
    let context = buildContext(ws.documentsFor(requestReader(req)), mappingRef(mappingId));
    const concepts = url.searchParams.getAll('concept');
    if (concepts.length) context = selectContext(context, concepts);
    return Response.json(context);
  }
  if (url.pathname === '/api/agent/plan' && req.method === 'POST') {
    const body = await readJson(req, 64_000);
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).some(
        k => !['mappingId', 'concepts', 'metrics', 'dimensions'].includes(k),
      ) ||
      typeof body.mappingId !== 'string'
    )
      throw Error(
        'Expected mappingId, optional concepts, metrics and dimensions. Expressions and metric overrides are not accepted.',
      );
    for (const key of ['concepts', 'metrics', 'dimensions'])
      if (
        (key !== 'concepts' || body[key] !== undefined) &&
        (!Array.isArray(body[key]) ||
          body[key].length > 100 ||
          body[key].some((id: any) => typeof id !== 'string' || !id.trim() || id.length > 4096))
      )
        throw Error(`${key} must be an array of at most 100 non-empty ids.`);
    requireReadableDocument(ws, req, mappingRef(body.mappingId));
    return Response.json(
      planQuery(
        buildContext(ws.documentsFor(requestReader(req)), mappingRef(body.mappingId)),
        body,
      ),
    );
  }
  const groupingPath = url.pathname.match(/^\/api\/documents\/([^/]+)\/grouping$/);
  if (groupingPath) {
    const id = decodeURIComponent(groupingPath[1]);
    const reader = requestReader(req);
    try {
      if (req.method === 'GET') return Response.json(ws.grouping(id, reader));
      if (req.method === 'PUT') {
        const value = await readJson(req, 256_000);
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          Object.keys(value).some(k => !['mode', 'assignments', 'names'].includes(k)) ||
          !['auto', 'declared', 'namespaces', 'suggested', 'types', 'example'].includes(
            value.mode ?? 'auto',
          )
        )
          throw Error('Invalid grouping view.');
        for (const key of ['assignments', 'names'])
          if (
            value[key] !== undefined &&
            (typeof value[key] !== 'object' ||
              !value[key] ||
              Array.isArray(value[key]) ||
              Object.keys(value[key]).length > 10000 ||
              Object.entries(value[key]).some(
                ([k, v]) =>
                  k.length > 4096 || typeof v !== 'string' || !v.trim() || v.length > 4096,
              ))
          )
            throw Error('Invalid grouping corrections.');
        return Response.json(await ws.saveGrouping(id, value, reader));
      }
    } catch (e) {
      // Legacy local clients expect a 400; server mode answers a missing document like a hidden one.
      if (e instanceof NotFoundError && !reader.view) throw Error('Document not found.');
      throw e;
    }
  }
  if (url.pathname === '/api/documents' && req.method === 'GET')
    return Response.json(ws.documentsFor(requestReader(req)));
  if (url.pathname === '/api/documents' && req.method === 'POST') {
    // Bound the request stream before parsing; JSON escaping can expand a 2 MB source.
    const reader = req.body?.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    if (!reader) throw Error('Expected a JSON document request.');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_INPUT_BYTES * 6 + 4096) {
        await reader.cancel();
        return Response.json({ error: 'Request too large.' }, { status: 413 });
      }
      chunks.push(value);
    }
    const raw = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    let body: any;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw Error('Malformed JSON request.');
    }
    if (
      !body ||
      Array.isArray(body) ||
      typeof body.filename !== 'string' ||
      typeof body.source !== 'string'
    )
      throw Error('Expected filename and source strings.');
    if (
      body.id !== undefined &&
      (typeof body.id !== 'string' || !body.id.trim() || body.id.length > 1300)
    )
      throw Error('Invalid document id.');
    if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 1))
      throw Error('Revision must be a positive integer.');
    if (
      body.baseHash !== undefined &&
      (typeof body.baseHash !== 'string' || !/^[0-9a-f]{64}$/.test(body.baseHash))
    )
      throw Error('baseHash must be a SHA-256 hex digest.');
    if (body.id !== undefined) {
      const reference = ws.resolveId(body.id);
      authorizeWrite(req, 'edit', [
        {
          type: 'file',
          ...reference,
        },
      ]);
    }
    // A new document's final name is known only once the workspace has chosen a free one.
    const authorizeTargets = (targets: { project: string; path: string }[]) => {
      authorizeWrite(
        req,
        'edit',
        targets.map(target => ({ type: 'file', ...target })),
      );
    };
    const version = { revision: body.revision, baseHash: body.baseHash };
    try {
      return Response.json(
        await ws.saveDocument(
          body.filename,
          body.source,
          requestReader(req),
          body.id,
          version,
          authorizeTargets,
        ),
      );
    } catch (e) {
      if (e instanceof StaleError) throw Error('Document changed. Reload before saving.');
      if (e instanceof NotFoundError) throw Error('Document not found.');
      throw e;
    }
  }
  return null;
};
function requireReadableDocument(ws: Workspace, request: Request, id: string) {
  const { view } = requestReader(request);
  if (!view) return;
  const resource = ws.resolveId(id.split('#')[0]);
  if (!view.canRead(resource.project, resource.path)) throw new HiddenResourceError();
}
function workspaceRoutes(administration: AdminRepository): Route[] {
  return [
    trashRoutes,
    suggestionRoutes,
    projectRoutes(administration),
    metricRoutes,
    kpiRoutes,
    gitRoutes,
    cloneRoutes(administration),
    repoRoutes,
    fileRoutes,
    draftRoutes,
    legacyRoutes,
  ];
}
/** Accepts loopback hostnames or a missing Host header. */
export function loopbackHost(host: string | null) {
  if (host === null) return true;
  const name = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.replace(/:\d+$/, '');
  return ['127.0.0.1', 'localhost', '[::1]'].includes(name.toLowerCase());
}
/** Creates the API handler with local-access checks and shared error responses. */
export function createHandler(ws: Workspace, options: HandlerOptions = {}) {
  const access = options.access ?? defaultAccess(ws, options.mode ?? 'local');
  const administration = options.administration ?? defaultAdministration(ws, access);
  const routes: Route[] = [
    ...(options.authentication ? [authRoutes(options.authentication)] : []),
    (_workspace, request, url) =>
      url.pathname === '/api/me' && request.method === 'GET' ? meResponse(request, options) : null,
    eventRoutes(options),
    ...workspaceRoutes(administration),
  ];
  function localCheck(req: Request): Response | null {
    const origin = req.headers.get('origin');
    if (origin && !allowedOrigins(options.port ?? 4310).includes(origin))
      return new Response('Forbidden', { status: 403 });
    // DNS rebinding: a page on another name resolved to 127.0.0.1 sends its own name as Host, and a
    // same-origin GET carries no Origin. Only loopback names are served.
    if (!loopbackHost(req.headers.get('host'))) return new Response('Forbidden', { status: 403 });
    return null;
  }
  const run = async (req: Request) => {
    const url = new URL(req.url);
    try {
      if (options.mode === 'server') {
        const staticResponse = await serveStatic(
          req,
          options.staticRoot,
          options.publicOrigin,
          options.mode,
        );
        if (staticResponse) return staticResponse;
      }
      for (const route of routes) {
        const response = await route(ws, req, url);
        if (response) return response;
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      // The access boundary audits a refused target, so it must see the original error.
      if (e instanceof WriteAccessError) throw e;
      if (
        options.mode === 'server' &&
        (e instanceof NotFoundError || e instanceof HiddenResourceError)
      ) {
        return errorResponse(e, options.publicOrigin);
      }
      // Legacy document and agent clients expect errors to use HTTP 400.
      if (url.pathname.startsWith('/api/documents') || url.pathname.startsWith('/api/agent/'))
        return Response.json(
          { error: (e as Error).message, ...(e instanceof InputError ? { issues: e.issues } : {}) },
          { status: 400 },
        );
      return errorResponse(e, options.publicOrigin);
    }
  };
  const boundary = createAccessMiddleware(ws, { ...options, access }, localCheck, run);
  if (options.mode !== 'server') return boundary;
  return async (request: Request) => {
    const response = await boundary(request);
    for (const [name, value] of securityHeaders(options.publicOrigin, options.providerOrigin)) {
      if (name.toLowerCase() !== 'cache-control') response.headers.set(name, value);
    }
    if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}
