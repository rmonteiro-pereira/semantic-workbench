// Formats durable publication state without reading definition content or touching Git refs.
import type { PublishedStatus } from '../../shared/scm/published-status';
import type { Git } from './git';
import type { PublishedSnapshots } from './published-snapshot';
import type { Reader } from './reader';
import type { State } from './state';

function personalState(state: State, reader: Reader) {
  return reader.owner ? state.forOwner(reader.owner) : state;
}
function noticeVisible(state: State, slug: string, reader: Reader) {
  const value = personalState(state, reader).view(slug).files['@publication'];
  return Boolean(value && typeof value === 'object' && 'notice' in value && value.notice === true);
}

/** Adds the caller's distance and personal notice to the repository's immutable published identity. */
export async function scmPublishedStatus(
  deps: { git: Git; snapshots: PublishedSnapshots; state: State },
  repository: string,
  slug: string,
  directory: string,
  reader: Reader,
): Promise<PublishedStatus> {
  const snapshot = await deps.snapshots.status(repository);
  const notice = noticeVisible(deps.state, slug, reader);
  if (snapshot.state === 'none') return { ...snapshot, notice };
  const head = await deps.git.head(directory);
  const result = head ? await deps.git.run(directory, ['rev-list', '--left-right', '--count', `${snapshot.commit}...${head}`]) : null;
  const [behind, ahead] = result ? result.stdout.trim().split(/\s+/).map(Number) : [0, 0];
  const common = { branch: snapshot.branch, commit: snapshot.commit, ahead, behind, notice };
  if (snapshot.state === 'in-sync') return { ...common, state: 'in-sync' };
  return { ...common, state: 'pending', pending: { next: snapshot.next, commits: snapshot.commits, move: snapshot.move } };
}

/** Dismisses only this person's upgrade notice; publication state and Git history stay untouched. */
export function acknowledgePublication(state: State, slug: string, reader: Reader) {
  const personal = personalState(state, reader);
  const view = personal.view(slug);
  const previous = view.files['@publication'];
  const publication = previous && typeof previous === 'object' ? previous : {};
  personal.writeView(slug, { ...view.files, '@publication': { ...publication, notice: false } });
}
