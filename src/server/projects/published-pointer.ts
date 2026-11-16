// Records the last authorized publication independently of mutable Git refs.
import { hasControlCharacters } from './git';
import { projectPath } from './paths';
import type { State } from './state';

/** Durable default branch, served commit and optional interrupted publication. */
export type PublishedPointer = { branch: string; commit?: string; intent?: string };
/** Versioned repository publication records. */
export type PublishedState = { formatVersion: 1; repositories: Record<string, PublishedPointer> };
/** The relationship between a mutable default ref and its durable publication record. */
export type PointerTransition = 'none' | 'in-sync' | 'fast-forward' | 'diverged' | 'intent-completed' | 'intent-dropped';
const fullId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Validates durable pointer data without attempting recovery from a checkout. */
export function parsePublishedState(value: unknown): PublishedState {
  if (!value || typeof value !== 'object') throw Error('Invalid state/published.json pointer state.');
  const state = value as PublishedState;
  if (state.formatVersion !== 1 || !state.repositories || typeof state.repositories !== 'object' || Array.isArray(state.repositories)) {
    throw Error('Invalid state/published.json pointer state.');
  }
  for (const [repository, pointer] of Object.entries(state.repositories)) {
    if (projectPath(repository) !== repository || !pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
      throw Error('Invalid state/published.json repository pointer.');
    }
    if (typeof pointer.branch !== 'string' || !pointer.branch || hasControlCharacters(pointer.branch) || /\s/.test(pointer.branch)) {
      throw Error('Invalid state/published.json branch.');
    }
    for (const revision of [pointer.commit, pointer.intent]) {
      if (revision !== undefined && (typeof revision !== 'string' || !fullId.test(revision))) {
        throw Error('Invalid state/published.json commit.');
      }
    }
  }
  return state;
}

/** Classifies outside moves and interrupted publications using only supplied values. */
export async function classify(ref: string | null, pointer: PublishedPointer | undefined, isAncestor: (ancestor: string, descendant: string) => Promise<boolean>): Promise<PointerTransition> {
  if (!pointer) return 'none';
  if (pointer.intent && ref === pointer.intent) return 'intent-completed';
  if (pointer.intent && ref === (pointer.commit ?? null)) return 'intent-dropped';
  if (ref === (pointer.commit ?? null)) return pointer.commit ? 'in-sync' : 'none';
  if (!ref || !pointer.commit) return 'diverged';
  return (await isAncestor(pointer.commit, ref)) ? 'fast-forward' : 'diverged';
}

/** Creates atomic pointer mutations backed by the existing durable state boundary. */
export function createPublishedPointers(state: Pick<State, 'published' | 'writePublished'>) {
  let current = parsePublishedState(state.published());
  function record(repository: string, pointer: PublishedPointer) {
    const next: PublishedState = {
      formatVersion: 1,
      repositories: { ...current.repositories, [repository]: { ...pointer } },
    };
    parsePublishedState(next);
    state.writePublished(next);
    current = next;
  }
  return {
    get: (repository: string) => {
      const pointer = current.repositories[repository];
      return pointer ? Object.freeze({ ...pointer }) : undefined;
    },
    entries: () => Object.entries(current.repositories).map(([repository, pointer]) => [repository, Object.freeze({ ...pointer })] as const),
    record,
    intent(repository: string, branch: string, next: string) {
      record(repository, { ...current.repositories[repository], branch, intent: next });
    },
    abandon(repository: string) {
      const pointer = current.repositories[repository];
      if (pointer) record(repository, { branch: pointer.branch, ...(pointer.commit ? { commit: pointer.commit } : {}) });
    },
    complete(repository: string, branch: string, commit: string) {
      record(repository, { branch, commit });
    },
    async reconcile(repository: string, ref: string | null, isAncestor: (ancestor: string, descendant: string) => Promise<boolean>) {
      const pointer = current.repositories[repository];
      const transition = await classify(ref, pointer, isAncestor);
      if (transition === 'intent-completed') record(repository, { branch: pointer.branch, commit: pointer.intent });
      if (transition === 'intent-dropped') record(repository, { branch: pointer.branch, ...(pointer.commit ? { commit: pointer.commit } : {}) });
      return transition;
    },
  };
}
/** Atomic publication records shared by the resolver and publication entry points. */
export type PublishedPointers = ReturnType<typeof createPublishedPointers>;
