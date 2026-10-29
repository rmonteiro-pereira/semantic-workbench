/** How the sidebar tree groups projects into repositories, and which project a group acts for. */
import type { ProjectInfo } from './api';

/** The projects of one repository; a group always holds at least one. */
export type RepositoryMembers = [ProjectInfo, ...ProjectInfo[]];
export type TreeEntry = { repo: string; projects: RepositoryMembers } | { project: ProjectInfo };

/**
 * The project a repository row acts for: the selected project when it lives in this repository,
 * otherwise the repository's first project.
 */
export function repositoryMember(members: RepositoryMembers, selectedProject?: string) {
  return members.find(project => project.slug === selectedProject) ?? members[0];
}

/**
 * Projects in tree order: a repository with subfolder projects becomes one group, placed where its
 * first project was; every other project stays a top-level row.
 */
export function treeEntries(projects: ProjectInfo[]) {
  const byRepo = new Map<string, ProjectInfo[]>();
  for (const project of projects) byRepo.set(project.repo, [...(byRepo.get(project.repo) ?? []), project]);
  const entries: TreeEntry[] = [];
  const placed = new Set<string>();
  for (const project of projects) {
    const members = byRepo.get(project.repo)!;
    if (!members.some(member => member.folder)) entries.push({ project: project });
    else if (!placed.has(project.repo)) {
      placed.add(project.repo);
      const [first, ...others] = members;
      entries.push({ repo: project.repo, projects: [first!, ...others] });
    }
  }
  return entries;
}
