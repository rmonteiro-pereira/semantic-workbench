/**
 * The selected project is the context of the whole app: nobody works on two projects at once,
 * so every view shows the documents of that project only.
 */

import { documentsOfProject } from './project-scope';

/** The parts of a project that decide which one is selected. */
type ProjectChoice = { slug: string };

/**
 * The project the app works on. A recorded choice that no longer exists falls back to the first
 * project, and an empty workspace has none.
 */
export function resolveSelectedProject(projects: ProjectChoice[], chosen: string) {
  if (projects.some(project => project.slug === chosen)) return chosen;
  return projects[0]?.slug ?? '';
}

/** Changes whenever a document of the project changes, so a view of the project reloads. */
export function projectRevisionKey<Document extends { id: string; project?: string; hash: string }>(
  documents: Document[],
  project: string,
) {
  return documentsOfProject(documents, project)
    .map(document => document.id + ':' + document.hash)
    .join('|');
}
