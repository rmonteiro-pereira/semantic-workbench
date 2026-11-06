// Reads and writes the Git identity (user.name and user.email) of project repositories.
import { repoDir, locationOf, type DataLayout } from '../paths';
import type { Events } from '../events';
import { hasControlCharacters, type Git } from '../git';
import type { ProjectEntry } from '../state';
import { BadRequestError } from '../errors';

/** The workspace services identity handling runs on; the composition root supplies them. */
export type GitIdentityContext = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  events: Events;
  projects: () => ProjectEntry[];
  entry: (slug: string) => ProjectEntry;
  /** Each repository folder with the projects it holds. */
  repositories: () => Map<string, { dir: string; projects: string[] }>;
};

function checkIdentityText(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || hasControlCharacters(value))
    throw new BadRequestError(`${label} must be ${min}–${max} characters without control characters.`);
  return value.trim();
}

/** Git identity use cases and the configured credential helper. */
export function createGitIdentity(ctx: GitIdentityContext) {
  const { layout, git, gitAvailable, events, projects, entry, repositories } = ctx;
  /** The identity a commit in this project's repository would use. */
  async function identity(slug: string) {
    entry(slug);
    if (!gitAvailable) throw new BadRequestError('Git is not available on this machine.');
    return git.identityOf(repoDir(layout, slug));
  }
  /** Writes user.name and user.email into this project's repository, or into every repository. */
  async function setIdentity(slug: string, name: unknown, email: unknown, allRepositories = false) {
    entry(slug);
    if (!gitAvailable) throw new BadRequestError('Git is not available on this machine.');
    const userName = checkIdentityText(name, 'The name', 1, 200);
    const userEmail = checkIdentityText(email, 'The email', 3, 320);
    const own = locationOf(entry(slug)).repo;
    // "Every repository" fills in the ones without an identity; it never replaces another
    // author that a repository has on purpose.
    const targets = [];
    for (const [repo, known] of repositories()) if (repo === own || (allRepositories && !(await git.identity(known.dir)))) targets.push([repo, known] as const);
    for (const [repo, known] of targets) {
      await git.setIdentity(known.dir, userName, userEmail);
      events.emit(
        'identity',
        { repo },
        {
          projects: projects()
            .filter(project => locationOf(project).repo === repo)
            .map(project => project.slug),
        },
      );
    }
    return { repositories: targets.map(([repo]) => repo) };
  }
  /** The configured credential helper's name; credentials themselves are never read. */
  async function credentialHelper() {
    if (!gitAvailable) return { helper: null };
    return { helper: await git.configValue(layout.projects, 'credential.helper') };
  }
  return { identity, setIdentity, credentialHelper };
}
