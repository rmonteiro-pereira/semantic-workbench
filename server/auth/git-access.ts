// Resolves repository paths to their owning projects before Git can change shared state.
import type { Workspace } from '../projects/workspace';
import { projectPath, projectPrefix, repoDir } from '../projects/paths';
import { LOCAL_READER } from '../projects/reader';
import type { Action } from './actions';
import type { ResourceRef, DecisionContext } from './resource';
import { authorizeWrite } from './write-access';

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
  const status = await ws.scm.status(slug, LOCAL_READER);
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
  const status = await target.ws.scm.status(target.slug, LOCAL_READER);
  authorizeRepository(target, 'push', { branch: status.branch });
}

/** Checks every project affected by a command on the shared repository. */
export function authorizeRepository(
  target: GitTarget,
  action: Action,
  context: Partial<DecisionContext> = {},
): void {
  const { ws, request, slug } = target;
  const directory = repoDir(ws.layout, slug);
  const resources = ws.state
    .registry()
    .projects.filter(project => repoDir(ws.layout, project.slug) === directory)
    .map(project => ({ type: 'project' as const, project: project.slug }));
  authorizeWrite(request, action, resources, context);
}
