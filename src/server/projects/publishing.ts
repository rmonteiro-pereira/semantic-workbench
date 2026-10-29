// Publishes in server mode: moves the default branch to a person's working copy, or to what a
// fetch brought from the remote, and then refreshes the published state every reader sees.
import { BadRequestError, NothingToPublishError } from './errors';
import type { EventTags } from './events';
import type { ContentGuard } from '../auth/guards';
import { WriteAccessError } from '../auth/write-access-error';
import type { Reader } from './reader';
import type { FollowRequest, FollowResult } from './scm';
import type { Place, WorkingCopies } from './working-copies';
import type { Worktrees } from './worktrees';

/** What publishing needs from the workspace that composes it. */
export type PublishingDeps = {
  worktrees: Worktrees;
  copies: WorkingCopies;
  repoOf: (slug: string) => string;
  projectsIn: (repo: string) => string[];
  /** Rescans one project of the published state and announces what changed. */
  rescan: (slug: string) => Promise<unknown>;
  emit: (event: string, data: unknown, tags: EventTags) => void;
};

/**
 * What moving the default branch brings to every reader is judged as the mover's own changes, so
 * an approval reaches the default branch only through someone allowed to make it, whether it
 * comes from a copy or from the remote.
 */
export function judgePublish(place: Place, slug: string, guard: ContentGuard | undefined) {
  return async (previous: string | null, next: string) => {
    if (!guard) return;
    const changes = await place.scm.changesBetween(slug, previous, next);
    guard(changes, { operation: 'publish' });
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
  if (!key) throw new BadRequestError('Publishing works on a personal working copy in server mode.');
  if (!deps.worktrees.exists(key, repo)) throw new NothingToPublishError();
  const place = await deps.copies.writePlace(reader, slug);
  const result = await deps.worktrees.publish(repo, key, judgePublish(place, slug, reader.guard));
  await announce(deps, slug, result.published, result.commit);
  await place.scm.refresh(slug);
  return { published: result.published, commit: result.commit };
}

/**
 * After a fetch: when the remote's default branch is ahead of the local one, the local default
 * branch and the published state follow it through the publish path, but only for someone who
 * may publish and only when the guards accept what it brings. Otherwise both stay, and the
 * result says why; the fetch itself still succeeds.
 */
async function followRemote(deps: PublishingDeps, slug: string, remote: string, { reader, mayPublish }: FollowRequest): Promise<FollowResult | null> {
  const repo = deps.repoOf(slug);
  const ahead = await deps.worktrees.remoteAhead(repo, remote);
  if (!ahead) return null;
  const stays = { branch: ahead.branch, remote, followed: false };
  if (!(await mayPublish())) return { ...stays, reason: 'publish' };
  const place = await deps.copies.writePlace(reader, slug);
  try {
    const check = judgePublish(place, slug, reader.guard);
    const moved = await deps.worktrees.followRemote(repo, remote, check);
    if (!moved) return stays;
    await announce(deps, slug, moved.published, moved.commit);
    return { ...stays, followed: true };
  } catch (error) {
    if (error instanceof WriteAccessError) return { ...stays, reason: 'guard' };
    throw error;
  }
}

/** Creates the publishing operations of one workspace. */
export function createPublishing(deps: PublishingDeps) {
  return {
    publish: (slug: string, reader: Reader) => publish(deps, slug, reader),
    followRemote: (slug: string, remote: string, follow: FollowRequest) => followRemote(deps, slug, remote, follow),
  };
}
