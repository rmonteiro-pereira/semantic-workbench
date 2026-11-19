// Resolves production definitions from durable pointers and retains indexes for live request pins.
import { assertOperationStep } from '../auth/operation-execution';
import { SnapshotUnavailableError } from './errors';
import { GitError } from './git';
import { log } from '../observability/log';
import type { PublishedPointers } from './published-pointer';
import { classify } from './published-pointer';
import { locationOf } from './paths';
import { createSnapshotIndexes, folderDigest, type PublishedDocument, type SnapshotIndex, type SnapshotIndexDeps } from './snapshot-index';
import type { PublicationCandidate } from './publication-checks';
import type { Reader } from './reader';
import type { ProjectEntry } from './state';

/** One request's consistent commit choice for each repository with a published snapshot. */
export type PublishedPin = { readonly commits: ReadonlyMap<string, Readonly<{ branch: string; commit: string }>> };
/** The durable publication and any outside default-ref movement. */
export type SnapshotStatus =
  | { state: 'none'; reason: 'no-git' | 'no-commit' | 'unavailable' }
  | { state: 'in-sync'; branch: string; commit: string }
  | { state: 'pending'; branch: string; commit: string; next: string; commits: number; move: 'fast-forward' | 'diverged' };
/** Registry, durable publication state and object access owned by the workspace. */
export type PublishedSnapshotDeps = SnapshotIndexDeps & {
  pointers: PublishedPointers;
  projects: () => ProjectEntry[];
  gitAvailable: () => boolean;
};
const fullId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Creates the shared resolver without accepting an editing reader or caller permissions. */
export function createPublishedSnapshots(deps: PublishedSnapshotDeps) {
  const indexes = createSnapshotIndexes(deps);
  const statuses = new Map<string, { key: string; result: Promise<SnapshotStatus> }>();
  const retained = new Map<string, SnapshotIndex>();
  const recent = new Map<string, string[]>();
  const generations = new Map<string, { current?: string; previous?: string }>();
  for (const [repository, pointer] of deps.pointers.entries()) generations.set(repository, { current: pointer.commit });
  const held = new Map<PublishedPin, Set<string>>();
  const registries = new WeakMap<PublishedPin, readonly ProjectEntry[]>();
  const pending = new Map<string, Promise<SnapshotIndex>>();

  function supersede() {
    for (const [repository, pointer] of deps.pointers.entries()) {
      const known = generations.get(repository);
      if (known?.current !== pointer.commit) {
        generations.set(repository, { current: pointer.commit, previous: known?.current });
        statuses.delete(repository);
        for (const [key, index] of retained) {
          if (index.repository !== repository || index.commit !== pointer.commit) continue;
          const latest = recent.get(repository) ?? [];
          recent.set(repository, [key, ...latest.filter(previous => previous !== key)].slice(0, 2));
        }
      }
    }
    prune();
  }
  function pin(): PublishedPin {
    supersede();
    const commits = new Map<string, Readonly<{ branch: string; commit: string }>>();
    for (const [repository, pointer] of deps.pointers.entries()) {
      if (pointer.commit) commits.set(repository, Object.freeze({ branch: pointer.branch, commit: pointer.commit }));
    }
    const chosen = Object.freeze({ commits });
    registries.set(chosen, Object.freeze(deps.projects().map(project => Object.freeze({ ...project }))));
    return chosen;
  }
  function prune() {
    const keep = new Set(
      [...recent.values()].flat().filter(key => {
        const index = retained.get(key);
        if (!index) return false;
        const generation = generations.get(index.repository);
        return index.commit === generation?.current || index.commit === generation?.previous;
      }),
    );
    for (const keys of held.values()) for (const key of keys) keep.add(key);
    for (const key of retained.keys()) if (!keep.has(key)) retained.delete(key);
  }
  function projectRepository(project: string, requestPin: PublishedPin) {
    const entry = registries.get(requestPin)?.find(entry => entry.slug === project);
    if (!entry) throw new SnapshotUnavailableError('unavailable');
    return locationOf(entry).repo;
  }
  async function load(repository: string, commit: string, requestPin?: PublishedPin) {
    const registry = requestPin ? registries.get(requestPin) : deps.projects();
    if (!registry) throw new SnapshotUnavailableError('unavailable');
    const projects = registry.filter(entry => locationOf(entry).repo === repository);
    const key = JSON.stringify([repository, commit, folderDigest(projects)]);
    if (requestPin) held.get(requestPin)?.add(key);
    const cached = retained.get(key);
    if (cached) return cached;
    let building = pending.get(key);
    if (!building) {
      building = indexes.build(repository, commit, projects);
      pending.set(key, building);
    }
    try {
      const index = await building;
      retained.set(key, index);
      const latest = recent.get(repository) ?? [];
      if (deps.pointers.get(repository)?.commit === commit) {
        recent.set(repository, [key, ...latest.filter(previous => previous !== key)].slice(0, 2));
      }
      prune();
      return index;
    } finally {
      if (pending.get(key) === building) pending.delete(key);
    }
  }
  function absence(): SnapshotUnavailableError {
    return new SnapshotUnavailableError(deps.gitAvailable() ? 'no-commit' : 'no-git');
  }
  async function files(requestPin: PublishedPin, project: string) {
    assertOperationStep('snapshot.read');
    if (!deps.gitAvailable()) throw absence();
    const repository = projectRepository(project, requestPin);
    const chosen = requestPin.commits.get(repository);
    if (!chosen) throw absence();
    const index = await load(repository, chosen.commit, requestPin);
    const files = index.projects.get(project);
    if (!files) throw new SnapshotUnavailableError('unavailable');
    return files;
  }
  async function documents(requestPin: PublishedPin, project: string): Promise<PublishedDocument[]> {
    return (await files(requestPin, project)).filter(file => file.metadata.visible).map(file => file.document);
  }
  async function resolveRevision(revision: string, onlyRepository?: string): Promise<string | null> {
    if (!deps.gitAvailable()) return null;
    for (const [repository, pointer] of deps.pointers.entries()) {
      if (!pointer.commit || (onlyRepository && repository !== onlyRepository)) continue;
      const directory = deps.directory(repository);
      const commit = fullId.test(revision) ? await deps.git.revParse(directory, `${revision}^{commit}`) : await deps.git.peelTag(directory, revision);
      if (!commit || (fullId.test(revision) && commit !== revision)) continue;
      if (await deps.git.isAncestor(directory, commit, pointer.commit)) return commit;
    }
    return null;
  }
  async function isReadableRevision(revision: string, head: string | null, onlyRepository?: string): Promise<boolean> {
    if (await resolveRevision(revision, onlyRepository)) return true;
    if (!head || !fullId.test(revision)) return false;
    for (const repository of new Set(deps.projects().map(entry => locationOf(entry).repo))) {
      if (onlyRepository && repository !== onlyRepository) continue;
      const directory = deps.directory(repository);
      if ((await deps.git.revParse(directory, `${revision}^{commit}`)) !== revision) continue;
      if ((await deps.git.revParse(directory, `${head}^{commit}`)) !== head) continue;
      if (await deps.git.isAncestor(directory, revision, head)) return true;
    }
    return false;
  }
  async function status(repository: string): Promise<SnapshotStatus> {
    if (!deps.gitAvailable()) return { state: 'none', reason: 'no-git' };
    const pointer = deps.pointers.get(repository);
    if (!pointer?.commit) return { state: 'none', reason: 'no-commit' };
    try {
      const directory = deps.directory(repository);
      const ref = await deps.git.revParse(directory, `refs/heads/${pointer.branch}`);
      const key = JSON.stringify([pointer.branch, pointer.commit, ref]);
      const cached = statuses.get(repository);
      if (cached?.key === key) return await cached.result;
      const result = describeStatus(directory, { branch: pointer.branch, commit: pointer.commit }, ref);
      statuses.set(repository, { key, result });
      return await result;
    } catch (error) {
      statuses.delete(repository);
      if (!(error instanceof GitError) && !(error instanceof SnapshotUnavailableError)) throw error;
      log.warn('snapshot.status-unavailable', { repository, detail: error.message });
      return { state: 'none', reason: 'unavailable' };
    }
  }
  async function describeStatus(directory: string, pointer: { branch: string; commit: string }, ref: string | null): Promise<SnapshotStatus> {
    const transition = await classify(ref, pointer, (from, to) => deps.git.isAncestor(directory, from, to));
    if (transition === 'in-sync') return { state: 'in-sync', branch: pointer.branch, commit: pointer.commit };
    if (!ref) return { state: 'none', reason: 'unavailable' };
    const count = await deps.git.run(directory, ['rev-list', '--count', `${pointer.commit}..${ref}`]);
    return {
      state: 'pending',
      branch: pointer.branch,
      commit: pointer.commit,
      next: ref,
      commits: Number(count.stdout.trim()),
      move: transition === 'fast-forward' ? 'fast-forward' : 'diverged',
    };
  }
  return {
    pin,
    /** Returns the immutable commit that a request pin chose for a project. */
    commitOf(requestPin: PublishedPin, project: string) {
      const entry = registries.get(requestPin)?.find(entry => entry.slug === project);
      return entry ? requestPin.commits.get(locationOf(entry).repo)?.commit : undefined;
    },
    /** Invalidates cached ancestry and counts when the repository reports a Git change. */
    invalidateStatus(repository: string) {
      statuses.delete(repository);
    },
    async withPin<T>(use: (pin: PublishedPin) => Promise<T> | T): Promise<T> {
      const chosen = pin();
      held.set(chosen, new Set());
      try {
        return await use(chosen);
      } finally {
        held.delete(chosen);
        prune();
      }
    },
    documents,
    /** Validates a publication through the same deduplicated build cache used by pinned reads. */
    async validate(candidate: PublicationCandidate) {
      const validationPin = pin();
      held.set(validationPin, new Set());
      const release = () => {
        held.delete(validationPin);
        prune();
      };
      try {
        await load(candidate.repo, candidate.next, validationPin);
        return release;
      } catch (error) {
        release();
        throw error;
      }
    },
    /** Resolves identity and visibility from the pin's registry before exposing documents. */
    async readableDocuments(requestPin: PublishedPin, project: string, reader: Reader) {
      const repository = projectRepository(project, requestPin);
      const chosen = requestPin.commits.get(repository);
      if (!chosen) throw absence();
      const visible = await documents(requestPin, project);
      return { commit: chosen.commit, documents: visible.filter(document => !reader.view || reader.view.canRead(project, document.path)) };
    },
    /** Lists every committed file path, including tracked files outside the document view. */
    async filePaths(requestPin: PublishedPin, project: string) {
      return (await files(requestPin, project)).map(file => file.document.path);
    },
    async fileBytes(requestPin: PublishedPin, project: string, path: string) {
      const file = (await files(requestPin, project)).find(file => file.document.path === path);
      return file ? file.bytes.slice() : null;
    },
    async documentsAt(commit: string, project: string) {
      if (!deps.gitAvailable()) throw absence();
      const requestPin = pin();
      const repository = projectRepository(project, requestPin);
      if (!(await resolveRevision(commit, repository))) throw new SnapshotUnavailableError('unavailable');
      const pointer = deps.pointers.get(repository);
      if (!pointer?.commit || !(await deps.git.isAncestor(deps.directory(repository), commit, pointer.commit))) throw new SnapshotUnavailableError('unavailable');
      const historical = { commits: new Map([[repository, { branch: pointer.branch, commit }]]) };
      registries.set(historical, registries.get(requestPin)!);
      return documents(historical, project);
    },
    resolveRevision,
    isReadableRevision,
    status,
    retainedCount: () => retained.size,
    supersede,
  };
}
/** Shared immutable definition reads and historical provenance. */
export type PublishedSnapshots = ReturnType<typeof createPublishedSnapshots>;
