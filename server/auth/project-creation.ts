// Assigns access metadata before returning a newly created project to its creator.
import { isDeepStrictEqual } from 'node:util';
import type { Workspace } from '../projects/workspace';
import type { AccessConfig } from './access-config';
import { requestScope } from './request-scope';
import { AdminStaleError, type AdminRepository } from './admin-repo';
import { authorizeWrite, WriteAccessError } from './write-access';
import { newProjectIn } from './resource';
import { BadRequestError } from '../projects/errors';

/** Validates the chosen domain using the request's policy decisions. */
export function creationDomain(request: Request, value: unknown): string | undefined {
  const scope = requestScope(request);
  if (scope.principal.kind === 'local') return undefined;
  if (value !== undefined && typeof value !== 'string')
    throw new BadRequestError('domain must be text.');
  const domains = scope.creationDomains();
  const admin = scope.authorize('admin', { type: 'workspace' }).allow;
  const domain = value ?? (!admin && domains.length === 1 ? domains[0].id : undefined);
  if (domain === undefined && !admin) {
    throw new WriteAccessError(
      'createProject',
      { type: 'workspace' },
      {
        allow: false,
        status: 403,
        rules: [],
        reason: 'choose-domain',
      },
    );
  }
  if (domain !== undefined) {
    authorizeWrite(request, 'createProject', [newProjectIn(domain)]);
  }
  return domain;
}

/** Where a domain assignment is written, and the workspace that undoes a failed creation. */
export type AssignmentDeps = { ws: Workspace; administration: AdminRepository };

/** Persists the domain of one newly created project; see assignProjectDomains. */
export function assignProjectDomain(
  deps: AssignmentDeps,
  request: Request,
  slug: string,
  domain: string | undefined,
): Promise<void> {
  return assignProjectDomains(deps, request, [slug], domain);
}

/**
 * Persists the domain of every project one creation made, in a single administration commit.
 * When the commit fails, all of those projects move to the trash, so none stays without the
 * access metadata its creator chose.
 */
export async function assignProjectDomains(
  deps: AssignmentDeps,
  request: Request,
  slugs: string[],
  domain: string | undefined,
): Promise<void> {
  const scope = requestScope(request);
  if (scope.principal.kind === 'local') return;
  const { ws, administration } = deps;
  try {
    await administration.ensure();
    try {
      await writeAssignments(deps, request, slugs, domain);
    } catch (error) {
      if (!(error instanceof AdminStaleError)) throw error;
      await writeAssignments(deps, request, slugs, domain);
    }
  } catch (error) {
    await ws.trash.deleteProjects(slugs, scope.principal.id);
    throw error;
  }
}

/** The projects document with each slug given the domain, or null when nothing would change. */
function assignedProjects(
  config: AccessConfig,
  slugs: string[],
  domain: string | undefined,
): AccessConfig['projects'] | null {
  const projects = structuredClone(config.projects);
  if (domain === undefined) {
    // A reused slug can still carry the metadata of a deleted project; it is removed.
    const stale = slugs.filter(slug => Object.hasOwn(projects.projects, slug));
    if (!stale.length) return null;
    for (const slug of stale) delete projects.projects[slug];
    return projects;
  }
  const entry = { domain, stewards: [], restricted: [], protectedBranches: [] };
  const unchanged = slugs.every(slug => isDeepStrictEqual(projects.projects[slug], entry));
  if (unchanged) return null;
  for (const slug of slugs) projects.projects[slug] = structuredClone(entry);
  return projects;
}

async function writeAssignments(
  { ws, administration }: AssignmentDeps,
  request: Request,
  slugs: string[],
  domain: string | undefined,
): Promise<void> {
  const scope = requestScope(request);
  const baseVersion = await administration.version();
  const projects = assignedProjects(administration.load(), slugs, domain);
  if (!projects) return;
  await administration.write(
    { 'projects.json': JSON.stringify(projects, null, 2) + '\n' },
    {
      baseVersion,
      author: {
        name: scope.principal.name,
        email: scope.principal.verifiedEmail ?? 'workbench@localhost',
      },
      message: `projects: assign ${slugs.join(', ')} to ${domain ?? 'no domain'}`,
    },
  );
  // The workspace announced the projects before they had a domain, so only Admins could read that
  // event. Announcing them again reaches everyone the domain now lets read them.
  ws.events.emit('projects', { added: slugs, removed: [], renamed: [] }, { projects: slugs });
}
