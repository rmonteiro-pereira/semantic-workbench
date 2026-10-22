// Maps HTTP entry points to the access boundary before any route can run.
import type { Action } from './actions';
import type { ResourceRef } from './resource';
import { decodePath } from '../routes/http';

/** One HTTP route and the resource its initial decision protects. */
export type RouteAction = {
  method: string;
  methods?: string[];
  serverOnly?: true;
  path: string;
  pattern: RegExp;
  action: Action;
  resource: (match: RegExpMatchArray, url: URL) => ResourceRef;
  public?: true;
  audited?: true;
  targets?: 'body';
};
const workspace = (): ResourceRef => ({ type: 'workspace' });
const project = (match: RegExpMatchArray): ResourceRef => ({
  type: 'project',
  project: decodeURIComponent(match[1]),
});
const file = (match: RegExpMatchArray): ResourceRef => ({
  type: 'file',
  project: decodeURIComponent(match[1]),
  path: decodePath(match[2]),
});
function row(
  method: string,
  path: string,
  action: Action,
  resource: RouteAction['resource'],
): RouteAction {
  const pattern = new RegExp(
    '^' + path.replace(/:[a-z]+/g, '([^/]+)').replace(/\*/g, '(.+)') + '$',
  );
  return {
    method,
    path: `${method} ${path}`,
    pattern,
    action,
    resource,
  };
}
// Sign-in, sign-out and health endpoints answer before anyone is signed in.
const publicRow = (method: string, path: string): RouteAction => ({
  ...row(method, path, 'read', workspace),
  public: true,
});
/** Protects server pages and static assets with workspace read access. */
export const pageRow: RouteAction = {
  method: 'GET',
  methods: ['GET', 'HEAD'],
  serverOnly: true,
  path: 'GET/HEAD pages',
  pattern: /^(?!\/(?:api|auth)(?:\/|$)).*$/,
  action: 'read',
  resource: workspace,
};
/** Ordered route inventory; explanations precede generic file reads. */
export const ROUTE_ACTIONS: RouteAction[] = [
  row('GET', '/api/me', 'read', workspace),
  publicRow('GET', '/auth/style.css'),
  row('GET', '/api/events', 'read', workspace),
  row('GET', '/api/status', 'read', workspace),
  row('GET', '/api/projects', 'read', workspace),
  row('GET', '/api/trash', 'read', workspace),
  row('GET', '/api/suggestions', 'read', workspace),
  row('GET', '/api/documents', 'read', workspace),
  row('POST', '/api/projects', 'createProject', workspace),
  row('POST', '/api/import', 'createProject', workspace),
  row('POST', '/api/clear', 'clear', workspace),
  row('POST', '/api/clone', 'clone', workspace),
  { ...row('POST', '/api/documents', 'edit', workspace), targets: 'body' },
  row('POST', '/api/examples/:name', 'createProject', workspace),
  row('PATCH', '/api/projects/:slug', 'renameProject', project),
  row('DELETE', '/api/projects/:slug', 'deleteProject', project),
  row('POST', '/api/projects/:slug/move', 'move', project),
  row('POST', '/api/projects/:slug/import', 'import', project),
  row('POST', '/api/projects/:slug/save-batch', 'edit', project),
  row('POST', '/api/projects/:slug/gitignore', 'edit', project),
  row('GET', '/api/projects/:slug/metrics', 'read', project),
  row('GET', '/api/projects/:slug/delete-impact', 'read', project),
  row('POST', '/api/projects/:slug/metrics', 'edit', project),
  row('POST', '/api/projects/:slug/metrics/preview', 'read', project),
  row('POST', '/api/projects/:slug/kpis', 'edit', project),
  row('POST', '/api/projects/:slug/kpis/preview', 'read', project),
  row('GET', '/api/projects/:slug/files/*/explain/:metric', 'read', file),
  row('GET', '/api/projects/:slug/files/*', 'read', file),
  row('PUT', '/api/projects/:slug/files/*', 'edit', file),
  row('DELETE', '/api/projects/:slug/files/*', 'delete', file),
  row('GET', '/api/drafts', 'viewOwnState', workspace),
  row('GET', '/api/drafts/:slug/*', 'viewOwnState', file),
  row('PUT', '/api/drafts/:slug/*', 'edit', file),
  row('DELETE', '/api/drafts/:slug/*', 'edit', file),
  row('DELETE', '/api/trash', 'purge', workspace),
  row('DELETE', '/api/trash/:entry', 'purge', workspace),
  { ...row('POST', '/api/trash/:entry/undo', 'restoreOwn', workspace), targets: 'body' },
  { ...row('POST', '/api/trash/:entry/restore', 'restoreOwn', workspace), targets: 'body' },
  { ...row('POST', '/api/suggestions/:id/accept', 'move', workspace), targets: 'body' },
  { ...row('POST', '/api/suggestions/:id/reject', 'edit', workspace), targets: 'body' },
  row('GET', '/api/git/credential-helper', 'setIdentity', workspace),
  row('GET', '/api/projects/:slug/git/status', 'history', project),
  row('GET', '/api/projects/:slug/git/diff', 'history', project),
  row('GET', '/api/projects/:slug/git/branches', 'history', project),
  row('GET', '/api/projects/:slug/git/log', 'history', project),
  row('GET', '/api/projects/:slug/git/versions', 'history', project),
  row('GET', '/api/projects/:slug/git/show', 'history', project),
  row('GET', '/api/projects/:slug/git/identity', 'setIdentity', project),
  row('PUT', '/api/projects/:slug/git/identity', 'setIdentity', project),
  row('POST', '/api/projects/:slug/git/stage', 'stage', project),
  row('POST', '/api/projects/:slug/git/unstage', 'stage', project),
  row('POST', '/api/projects/:slug/git/commit', 'commit', project),
  row('POST', '/api/projects/:slug/git/revert', 'revert', project),
  row('POST', '/api/projects/:slug/git/switch', 'branch', project),
  row('POST', '/api/projects/:slug/git/fetch', 'fetch', project),
  row('POST', '/api/projects/:slug/git/pull', 'pull', project),
  row('POST', '/api/projects/:slug/git/sync', 'pull', project),
  row('POST', '/api/projects/:slug/git/push', 'push', project),
  row('POST', '/api/projects/:slug/git/cancel', 'cancelOwn', project),
  row('PUT', '/api/projects/:slug/git/remote', 'setRemote', project),
  row('DELETE', '/api/projects/:slug/git/remote', 'setRemote', project),
  row('POST', '/api/clone/:operation/cancel', 'clone', workspace),
  row('GET', '/api/repos/:repo/project-candidates', 'registerProjects', workspace),
  row('PUT', '/api/repos/:repo/projects', 'registerProjects', workspace),
  { ...row('GET', '/api/agent/catalog', 'read', workspace), audited: true },
  { ...row('GET', '/api/agent/context', 'read', workspace), audited: true },
  { ...row('POST', '/api/agent/plan', 'read', workspace), audited: true },
  row('GET', '/api/documents/:id/grouping', 'viewOwnState', workspace),
  // Grouping views are personal; the route resolves the document and refuses a hidden one.
  { ...row('PUT', '/api/documents/:id/grouping', 'viewOwnState', workspace), targets: 'body' },
  publicRow('GET', '/auth/login'),
  publicRow('GET', '/auth/callback'),
  publicRow('POST', '/auth/logout'),
  publicRow('GET', '/auth/no-access'),
  publicRow('GET', '/auth/signed-out'),
  publicRow('GET', '/auth/github/start'),
  publicRow('GET', '/auth/github/callback'),
  publicRow('GET', '/healthz'),
  publicRow('GET', '/readyz'),
  pageRow,
];
/** Finds the first matching method and path, or refuses an unmapped entry point. */
export function routeFor(method: string, pathname: string, mode: 'local' | 'server' = 'local') {
  for (const row of ROUTE_ACTIONS) {
    if (row.serverOnly && mode !== 'server') continue;
    if (!(row.methods ?? [row.method]).includes(method)) continue;
    const match = pathname.match(row.pattern);
    if (match) return { row, match };
  }
  return null;
}
