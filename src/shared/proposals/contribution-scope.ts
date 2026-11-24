// Decides which project each changed file belongs to and whether a set of changes stays inside the
// projects a proposal declared. Pure, so every boundary case is a table in the tests.
import type { ChangedPath } from './proposal';

/** A project's folder inside the repository: `''` for a project at the root, else `folder/`. */
export type ProjectFolder = { slug: string; prefix: string };

/** A changed file as its owning project sees it. */
export type OwnedFile = { project: string; path: string; status: ChangedPath['status']; repositoryPath: string };

/** The files of a change split by whether they belong to a declared project. */
export type ScopeJudgement = {
  inside: OwnedFile[];
  /** Files that belong to a project the proposal did not declare. */
  outside: OwnedFile[];
  /** Repository paths that belong to no project at all. */
  projectless: string[];
};

/** The project that owns a repository path: the one with the longest matching folder. */
export function ownerOfPath(projects: ProjectFolder[], repositoryPath: string): { project: string; path: string } | null {
  const ordered = [...projects].sort((left, right) => right.prefix.length - left.prefix.length);
  const owner = ordered.find(project => repositoryPath.startsWith(project.prefix));
  if (!owner) return null;
  return { project: owner.slug, path: repositoryPath.slice(owner.prefix.length) };
}

/** Sorts changed files into declared, undeclared and project-less, keeping a rename's two paths apart. */
export function judgeScope(changes: ChangedPath[], projects: ProjectFolder[], declared: readonly string[]): ScopeJudgement {
  const judgement: ScopeJudgement = { inside: [], outside: [], projectless: [] };
  for (const change of changes) {
    const owner = ownerOfPath(projects, change.path);
    if (!owner) {
      judgement.projectless.push(change.path);
      continue;
    }
    const file: OwnedFile = { ...owner, status: change.status, repositoryPath: change.path };
    if (declared.includes(owner.project)) judgement.inside.push(file);
    else judgement.outside.push(file);
  }
  return judgement;
}
