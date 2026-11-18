// Publishes in server mode: moves the default branch to a person's working copy, or to what a
// fetch brought from the remote, and then refreshes the published state every reader sees.
import { BadRequestError, NothingToPublishError } from './errors';
import type { EventTags } from './events';
import { InputError } from '../../shared/validation/diagnostics';
import { WriteAccessError } from '../auth/write-access-error';
import type { Reader } from './reader';
import type { PublishedSnapshots } from './published-snapshot';
import { checkPublicationDependencies } from '../mesh/dependency-check';
import type { PublicationObserver } from './local-publication';
import type { FollowRequest, FollowResult } from './scm';
import type { Place, WorkingCopies } from './working-copies';
import type { Worktrees } from './worktrees';

/** What publishing needs from the workspace that composes it. */
export type PublishingDeps = {
  worktrees: Worktrees;
  snapshots: PublishedSnapshots;
  repositoryOf: (project: string) => string | null;
  copies: WorkingCopies;
  repoOf: (slug: string) => string;
  projectsIn: (repo: string) => string[];
  /** Rescans one project of the published state and announces what changed. */
  rescan: (slug: string) => Promise<unknown>;
  emit: (event: string, data: unknown, tags: EventTags) => void;
  /** Local authoring publication uses the same checks without checking out the default ref. */
  adopt: (slug: string, reader: Reader, observe?: PublicationObserver) => Promise<{ published: string; previous: string | null; commit: string }>;
  localPublish?: (slug: string, reader: Reader) => Promise<{ published: string; previous: string | null; commit: string }>;
};

/**
 * What moving the default branch brings to every reader is judged as the mover's own changes, so
 * an approval reaches the default branch only through someone allowed to make it, whether it
 * comes from a copy or from the remote.
 */
export function judgePublish(deps: Pick<PublishingDeps, 'snapshots' | 'projectsIn' | 'repositoryOf' | 'repoOf'>, place: Place, slug: string, reader: Reader) {
  return async (previous: string | null, next: string) => {
    if (reader.guard) {
      const changes = await place.scm.changesBetween(slug, previous, next);
      reader.guard(changes, { operation: 'publish' });
    }
    await checkPublicationDependencies(deps, { repo: deps.repoOf(slug), next }, reader);
  };
}

// Every reader's view of the repository's projects follows the new tip of the default branch.
async function announce(deps: PublishingDeps, slug: string, branch: string, commit: string) {
  const inRepo = deps.projectsIn(deps.repoOf(slug));
  for (const project of inRepo) await deps.rescan(project);
  deps.emit('published', { project: slug, branch, commit }, { projects: inRepo });
}

/**
 * Fast-forwards the default branch to the person's copy, refreshes the published state every
 * reader sees, and tells each of them. Someone without a copy has nothing to publish, and asking
 * does not create one.
 */
async function publish(deps: PublishingDeps, slug: string, reader: Reader) {
  const repo = deps.repoOf(slug);
  const key = reader.copy?.key;
  if (!key) {
    if (reader.view || !deps.localPublish) throw new BadRequestError('Publishing works on a personal working copy in server mode.');
    const result = await deps.localPublish(slug, reader);
    await announce(deps, slug, result.published, result.commit);
    return result;
  }
  if (!deps.worktrees.exists(key, repo)) throw new NothingToPublishError();
  const place = await deps.copies.writePlace(reader, slug);
  const result = await deps.worktrees.publish(repo, key, judgePublish(deps, place, slug, reader));
  await announce(deps, slug, result.published, result.commit);
  await place.scm.refresh(slug);
  return { published: result.published, previous: result.previous, commit: result.commit };
}

/**
 * After a fetch: when the remote's default branch is ahead of the local one, the local default
 * branch and the published state follow it through the publish path, but only for someone who
 * may publish and only when the guards accept what it brings. Otherwise both stay, and the
 * result says why; the fetch itself still succeeds.
 */
async function followRemote(deps: PublishingDeps, slug: string, remote: string, { reader, mayPublish, onPublished }: FollowRequest): Promise<FollowResult | null> {
  const repo = deps.repoOf(slug);
  const ahead = await deps.worktrees.remoteAhead(repo, remote);
  if (!ahead) return null;
  const stays = { branch: ahead.branch, remote, followed: false };
  if (!(await mayPublish())) return { ...stays, reason: 'publish' };
  const place = await deps.copies.writePlace(reader, slug);
  try {
    const check = judgePublish(deps, place, slug, reader);
    const moved = await deps.worktrees.followRemote(repo, remote, check);
    if (!moved) return stays;
    onPublished?.(moved);
    await announce(deps, slug, moved.published, moved.commit);
    return { ...stays, followed: true };
  } catch (error) {
    if (error instanceof WriteAccessError || error instanceof InputError) return { ...stays, reason: 'guard' };
    throw error;
  }
}

/** Creates the publishing operations of one workspace. */
export function createPublishing(deps: PublishingDeps) {
  return {
    async adopt(slug: string, reader: Reader, observe?: PublicationObserver) {
      const result = await deps.adopt(slug, reader, observe);
      await announce(deps, slug, result.published, result.commit);
      return result;
    },
    publish: (slug: string, reader: Reader) => publish(deps, slug, reader),
    followRemote: (slug: string, remote: string, follow: FollowRequest) => followRemote(deps, slug, remote, follow),
  };
}
