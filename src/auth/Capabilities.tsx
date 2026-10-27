// Shares the current API capabilities with controls nested inside workspace views.
import { createContext, useContext, type ReactNode } from 'react';
import { useMe, type Me } from './useMe';
import type { ClassificationSettings } from '../governance/guards';

/** Project capabilities returned by the access boundary. */
export type ProjectCapabilities = {
  slug: string;
  actions?: string[];
  classification?: ClassificationSettings;
};

const Projects = createContext<ProjectCapabilities[]>([]);

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

/** Supplies project actions to the workspace's nested controls. */
export function Capabilities({
  projects,
  children,
}: {
  projects: ProjectCapabilities[];
  children: ReactNode;
}) {
  return <Projects.Provider value={projects}>{children}</Projects.Provider>;
}

/** Produces capability checks and accessible explanations for the current project. */
export function useCapabilities(project?: string) {
  const { me } = useMe();
  const projects = useContext(Projects);
  return {
    local: me?.mode === 'local',
    /** Whether the person is an Admin of the workspace; the local user always is. */
    admin: can(me, [], 'admin'),
    /** How the project reads classification values; absent in local mode. */
    classification: projects.find(item => item.slug === project)?.classification,
    can: (action: string, target = project) => can(me, projects, action, target),
    control: (action: string) => ({
      disabled: !can(me, projects, action, project),
      title: can(me, projects, action, project) ? undefined : requiredRole(action, me),
    }),
  };
}
