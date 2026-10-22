// Shares the current API capabilities with controls nested inside workspace views.
import { createContext, useContext, type ReactNode } from 'react';
import { can, requiredRole, type ProjectCapabilities } from './can';
import { useMe } from './useMe';

const Projects = createContext<ProjectCapabilities[]>([]);

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
    can: (action: string, target = project) => can(me, projects, action, target),
    control: (action: string) => ({
      disabled: !can(me, projects, action, project),
      title: can(me, projects, action, project) ? undefined : requiredRole(action, me),
    }),
  };
}
