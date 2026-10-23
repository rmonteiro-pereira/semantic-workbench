// Resolves repository paths to their owning projects before Git can change shared state.
import type { Workspace } from '../projects/workspace';
import { projectPath, projectPrefix, repoDir } from '../projects/paths';
import { LOCAL_READER } from '../projects/reader';
import type { Action } from './actions';
import type { ResourceRef, DecisionContext } from './resource';
import { authorizeWrite } from './write-access';
import { requestReader, requestScope } from './request-scope';

/** The request and the project whose shared repository a Git command acts on. */
export interface GitTarget {
  ws: Workspace;
  request: Request;
  slug: string;
}

/** Which paths a Git command names, and whether they are relative to the repository root. */
export interface GitPaths {
  /** Explicit paths; when absent, every changed path of the repository is checked. */
  paths?: unknown;
  repository?: boolean;
}

/** Checks explicit paths, or every changed path for operations on the whole index. */
export async function authorizeGitPaths(
  target: GitTarget,
  action: Action,
  { paths, repository = false }: GitPaths = {},
): Promise<void> {
  const { ws, request, slug } = target;
  // Authorization must see every changed path, including ones hidden from the caller.
  const status = await ws.readScm(slug, requestReader(request)).status(slug, LOCAL_READER);
  const selected = paths === undefined ? status.changes.map(change => change.repoPath) : paths;
  if (!Array.isArray(selected) || selected.some(path => typeof path !== 'string')) {
    throw new Error('Git paths must be an array of strings.');
  }
  const owners = ws.state
    .registry()
    .projects.filter(project => repoDir(ws.layout, project.slug) === repoDir(ws.layout, slug))
    .map(project => ({ slug: project.slug, prefix: projectPrefix(ws.layout, project.slug) }))
    .sort((left, right) => right.prefix.length - left.prefix.length);
  const resources: ResourceRef[] = selected.map(path => {
    const relative = projectPath(path);
    const full =
      repository || paths === undefined ? relative : projectPrefix(ws.layout, slug) + relative;
    const owner = owners.find(project => full.startsWith(project.prefix));
    if (!owner) return { type: 'workspace' };
    return { type: 'file', project: owner.slug, path: full.slice(owner.prefix.length) };
  });
  authorizeWrite(request, action, resources);
}

/** Checks push separately, including a commit or sync that requests a push. */
export async function authorizeGitPush(target: GitTarget): Promise<void> {
  const scm = target.ws.readScm(target.slug, requestReader(target.request));
  const status = await scm.status(target.slug, LOCAL_READER);
  authorizeRepository(target, 'push', { branch: status.branch });
}

/**
 * A working copy that checks out a branch the person may not push could change it by committing,
 * so in server mode checking one out needs the right to publish to it. Whichever rule denies the
 * push, the baseline's protected branches or an Admin's own, counts.
 */
export function authorizeCheckout(target: GitTarget, branch: string): void {
  const scope = requestScope(target.request);
  if (scope.principal.kind === 'local') return;
  const push = scope.authorize('push', { type: 'project', project: target.slug }, { branch });
  if (push.allow) return;
  authorizeRepository(target, 'publish', { branch });
}

/**
 * The same decision as `authorizePublish`, as a yes or no: a fetch lets the published default
 * branch follow the remote only for someone who may publish it.
 */
export async function mayPublish(target: GitTarget): Promise<boolean> {
  const scope = requestScope(target.request);
  if (scope.principal.kind === 'local') return true;
  const { ws, slug } = target;
  const branch = await ws.worktrees.defaultBranch(ws.repoOf(slug));
  return repositoryProjects(target).every(
    resource => scope.authorize('publish', resource, { branch }).allow,
  );
}

/** Publishing moves the default branch, so it needs `publish` there on every sharing project. */
export async function authorizePublish(target: GitTarget, branch: unknown): Promise<void> {
  const { ws, slug } = target;
  const published = await ws.worktrees.defaultBranch(ws.repoOf(slug));
  if (branch !== undefined && branch !== published)
    throw Error(`Publishing goes to the default branch, ${published}.`);
  authorizeRepository(target, 'publish', { branch: published });
}

/** Checks every project affected by a command on the shared repository. */
export function authorizeRepository(
  target: GitTarget,
  action: Action,
  context: Partial<DecisionContext> = {},
): void {
  authorizeWrite(target.request, action, repositoryProjects(target), context);
}

/** Every project that shares the target's repository. */
function repositoryProjects({ ws, slug }: GitTarget) {
  const directory = repoDir(ws.layout, slug);
  return ws.state
    .registry()
    .projects.filter(project => repoDir(ws.layout, project.slug) === directory)
    .map(project => ({ type: 'project' as const, project: project.slug }));
}
