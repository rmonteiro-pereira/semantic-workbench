// Formats durable publication state without reading definition content or touching Git refs.
import type { PublishedStatus } from '../../shared/scm/published-status';
import type { Git } from './git';
import type { PublishedSnapshots } from './published-snapshot';
import type { Reader } from './reader';
import type { State } from './state';

function personalState(state: State, reader: Reader) {
  return reader.owner ? state.forOwner(reader.owner) : state;
}
/** Reads the typed notice. Old data is migrated once at startup, so a status read never writes. */
export function publicationNotice(state: State, slug: string, reader: Reader): boolean {
  return personalState(state, reader).view(slug).publicationNotice ?? false;
}

/** Moves the old synthetic file entry into the typed notice, in the shared state and in every person's state. */
export function migrateLegacyPublicationNotices(state: State) {
  const holders = [state, ...state.personalStates().map(personal => personal.state)];
  for (const project of state.registry().projects) {
    for (const holder of holders) {
      const view = holder.view(project.slug);
      const legacy = view.files['@publication'];
      if (view.publicationNotice !== undefined || !legacy || typeof legacy !== 'object' || !('notice' in legacy)) continue;
      holder.writePublicationNotice(project.slug, legacy.notice === true);
    }
  }
}

/** Stores only the person's publication notice, separate from per-file settings. */
export function setPublicationNotice(state: State, slug: string, visible: boolean, reader: Reader) {
  personalState(state, reader).writePublicationNotice(slug, visible);
}

async function remoteDefault(git: Git, directory: string, branch: string, commit: string) {
  const remotes = await git.remotes(directory);
  const remote = remotes.has('origin') ? 'origin' : remotes.keys().next().value;
  if (!remote) return {};
  const ref = `refs/remotes/${remote}/${branch}`;
  const tip = await git.revParse(directory, ref);
  if (!tip) return {};
  const count = await git.run(directory, ['rev-list', '--count', `${commit}..${tip}`]);
  return { remote: { branch: `${remote}/${branch}`, ahead: Number(count.stdout.trim()) } };
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
  const notice = publicationNotice(deps.state, slug, reader);
  if (snapshot.state === 'none') return { ...snapshot, notice };
  const head = await deps.git.head(directory);
  const result = head ? await deps.git.run(directory, ['rev-list', '--left-right', '--count', `${snapshot.commit}...${head}`]) : null;
  const [behind, ahead] = result ? result.stdout.trim().split(/\s+/).map(Number) : [0, 0];
  const common = { branch: snapshot.branch, commit: snapshot.commit, ahead, behind, notice, ...(await remoteDefault(deps.git, directory, snapshot.branch, snapshot.commit)) };
  if (snapshot.state === 'in-sync') return { ...common, state: 'in-sync' };
  return { ...common, state: 'pending', pending: { next: snapshot.next, commits: snapshot.commits, move: snapshot.move } };
}

/** Dismisses only this person's upgrade notice; publication state and Git history stay untouched. */
export function acknowledgePublication(state: State, slug: string, reader: Reader) {
  setPublicationNotice(state, slug, false, reader);
}
