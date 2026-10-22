// Presentation reads capabilities returned by the server; roles are labels, never browser rules.
import type { Me } from './useMe';

/** Project capabilities returned by the access boundary. */
export type ProjectCapabilities = { slug: string; actions?: string[] };

/** Answers a UI capability question without interpreting grants or role names. */
export function can(
  me: Me | null,
  projects: ProjectCapabilities[],
  action: string,
  project?: string,
): boolean {
  if (!me) return false;
  if (me.mode === 'local') return true;
  if (project)
    return projects.find(item => item.slug === project)?.actions?.includes(action) ?? false;
  return me.can?.[action] ?? false;
}

/** Displays the server's permission explanation without interpreting roles. */
export function requiredRole(action: string, me: Me | null): string {
  return me?.requires?.[action] ?? 'Requires permission';
}
