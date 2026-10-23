// Decides where a request reads and writes a project. In server mode every change a person makes
// goes to their own copy of the repository (created on first use), and they read that copy while
// they may edit the project; everyone else, and local mode, uses the published state under
// projects/. Each person's copies have their own index rows, Source Control and, while in use,
// file watchers that are released when idle.
import type { Cache, CopyIndex } from './cache';
import type { EventTags } from './events';
import { copyLayout, type DataLayout } from './paths';
import type { Reader } from './reader';
import { createScanner, type Scanner } from './scanner';
import type { FollowRequest, FollowResult, Scm, ScmDeps } from './scm';
import type { State } from './state';
import { createWatcher } from './watcher';
import { personalBranch, type BranchHolder, type CopyOwner, type Worktrees } from './worktrees';
import type { Git } from './git';

/** Where a project's files are read and written for one request. */
export type Place = {
  /** The person's copy key, or null for the published state. */
  copy: string | null;
  layout: DataLayout;
  cache: CopyIndex;
  scanner: Scanner;
  scm: Scm;
  /** Adds the copy tag, so events about a copy reach only its owner's streams. */
  tags: (tags: EventTags) => EventTags;
};

/** The services a person's place is built from; the composition root supplies them. */
export type WorkingCopyDeps = {
  layout: DataLayout;
  cache: Cache;
  git: Git;
  gitAvailable: boolean;
  worktrees: Worktrees;
  state: State;
  published: Place;
  /** The repository folder of a registered project. */
  repoOf: (slug: string) => string;
  /** The registered projects of one repository folder. */
  projectsIn: (repo: string) => string[];
  /** Source Control over one place; the place's key names whose drafts block a switch. */
  scmFor: (place: Omit<Place, 'scm'>) => Scm;
  /** Rescans one project of a place and announces what changed. */
  rescan: (place: Place, slug: string) => Promise<unknown>;
  watch: boolean;
  debounceMs?: number;
  rescanMs?: number;
  now: () => number;
  idleMs?: number;
};

type Personal = {
  place: Place;
  watcher: ReturnType<typeof createWatcher> | null;
  ready: Promise<unknown>;
};

/**
 * The lock a file change takes: per project and per working copy, as copies never share files,
 * while every change to the published state of a project waits for the others.
 */
export const projectLockKey = (slug: string, copy: string | null) =>
  'project:' + slug + (copy ? '@' + copy : '');

/**
 * What Source Control does differently in a person's copy: a branch another copy holds is
 * refused, Pull on their own work branch takes the remote's default branch, a fetch lets the
 * published default branch follow the remote, merges from the default branch are theirs, and
 * commits are signed for them.
 */
export function copyScmHooks(
  own: string,
  deps: {
    worktrees: Worktrees;
    repoOf: (slug: string) => string;
    owners: () => CopyOwner[];
    followRemote: (
      slug: string,
      remote: string,
      follow: FollowRequest,
    ) => Promise<FollowResult | null>;
  },
): Partial<ScmDeps> {
  const { worktrees, repoOf } = deps;
  return {
    assertBranchFree: (slug, branch) => worktrees.assertFree(repoOf(slug), own, branch),
    untrackedPull: async (slug, branch) => {
      const handle = deps.owners().find(owner => owner.key === own)?.handle;
      if (!handle || branch !== personalBranch(handle)) return null;
      return worktrees.defaultBranch(repoOf(slug));
    },
    fetched: deps.followRemote,
    branchesMoved: slug => worktrees.branchesMoved(repoOf(slug)),
    mergeDefault: (slug, author, check) => worktrees.mergeDefault(repoOf(slug), own, author, check),
    signedCommits: true,
  };
}

/** How long a person's working copy stays watched without being used. */
export const IDLE_RELEASE_MS = 30 * 60_000;

/** The working copies last used longer ago than the idle period, which release their watchers. */
export function idleCopies(lastUsed: Map<string, number>, now: number, idleMs = IDLE_RELEASE_MS) {
  return [...lastUsed].filter(([, at]) => now - at > idleMs).map(([key]) => key);
}

/** The copy a person reads a project from while they may edit it; null means published. */
export function copyKeyFor(reader: Reader, slug: string): string | null {
  return reader.copy?.editable(slug) ? reader.copy.key : null;
}

/**
 * The copy a change goes to. Every change a person makes in server mode lands in their own copy,
 * once the route has authorized it, whichever role allowed it. Local mode changes the published
 * folders as before; agent clients carry no copy, and the baseline policy lets them only read.
 */
export function writeKeyFor(reader: Reader): string | null {
  return reader.copy?.key ?? null;
}

/** What one project listing learns once per repository: the default branch and who holds what. */
export type RepositoryFacts = Map<
  string,
  Promise<{ defaultBranch: string; holders: Map<string, BranchHolder> }>
>;

/** Everyone who may own a copy: recorded people, then people seen only in this process. */
function copyOwners(state: State, seen: Map<string, string>): CopyOwner[] {
  const recorded = state.users().users.map(user => ({
    key: user.key,
    handle: user.handle,
    name: user.name,
  }));
  const unrecorded = [...seen]
    .filter(([key]) => !recorded.some(user => user.key === key))
    .map(([key, name]) => ({ key, handle: key, name }));
  return [...recorded, ...unrecorded];
}

/** The repository folders one person has a copy of. */
function repositoriesOf(deps: WorkingCopyDeps, key: string) {
  const repos = new Set(deps.state.registry().projects.map(project => deps.repoOf(project.slug)));
  return [...repos].filter(repo => deps.worktrees.exists(key, repo));
}

/** Builds a person's place, rescans their copies and starts watching them. */
function activate(deps: WorkingCopyDeps, key: string): Personal {
  const layout = copyLayout(deps.layout, key);
  const cache = deps.cache.forCopy(key);
  const scanner = createScanner(layout, cache, deps.git, () => deps.gitAvailable);
  const tags = (input: EventTags) => ({ ...input, copy: key });
  const base = { copy: key, layout, cache, scanner, tags };
  const place: Place = { ...base, scm: deps.scmFor(base) };
  const projects = () => repositoriesOf(deps, key).flatMap(repo => deps.projectsIn(repo));
  const watcher = deps.watch
    ? createWatcher(layout, {
        debounceMs: deps.debounceMs,
        rescanMs: deps.rescanMs,
        onChange: async slug => {
          if (deps.worktrees.exists(key, deps.repoOf(slug))) await deps.rescan(place, slug);
        },
        all: projects,
        locate: slug => deps.layout.locate?.(slug) ?? { folder: slug, repo: slug },
      })
    : null;
  // A copy may have changed while nobody watched it, so its projects are rescanned first.
  const current = projects();
  const ready = Promise.all(current.map(slug => deps.rescan(place, slug)))
    .then(() => {
      for (const slug of current) watcher?.add(slug);
    })
    // A failed rescan leaves the index as it was; the next save or Git action rescans again.
    .catch(error => console.error(`[copies] ${key}: ${(error as Error).message}`));
  return { place, watcher, ready };
}

/** Creates the per-person places of one workspace. */
export function createWorkingCopies(deps: WorkingCopyDeps) {
  const personal = new Map<string, Personal>();
  const lastUsed = new Map<string, number>();
  // Display names of people who used a copy in this process, for those not yet recorded.
  const seen = new Map<string, string>();
  const owners = () => copyOwners(deps.state, seen);

  function use(key: string): Personal {
    lastUsed.set(key, deps.now());
    const known = personal.get(key);
    if (known) return known;
    const entry = activate(deps, key);
    personal.set(key, entry);
    return entry;
  }

  // Two requests of one person may both find the copy missing; only the first creates it.
  const creating = new Map<string, Promise<boolean>>();
  function ensureOnce(key: string, repo: string) {
    const id = key + '/' + repo;
    const pending = creating.get(id);
    if (pending) return pending.then(() => false);
    const owner = owners().find(person => person.key === key)!;
    const created = deps.worktrees
      .ensure(repo, owner)
      .then(result => result.created)
      .finally(() => creating.delete(id));
    creating.set(id, created);
    return created;
  }

  /**
   * The index and folders a reader sees for a project, without counting as use of the copy, so
   * background work such as suggestion counts never keeps an idle copy watched.
   */
  function filesFor(reader: Reader, slug: string): Pick<Place, 'cache' | 'layout'> {
    const key = copyKeyFor(reader, slug);
    if (!key || !deps.worktrees.exists(key, deps.repoOf(slug))) return deps.published;
    return { cache: deps.cache.forCopy(key), layout: copyLayout(deps.layout, key) };
  }

  /** The place a request reads from; reading never creates a copy. */
  function readPlace(reader: Reader, slug: string): Place {
    const key = copyKeyFor(reader, slug);
    if (!key || !deps.worktrees.exists(key, deps.repoOf(slug))) return deps.published;
    return use(key).place;
  }

  /**
   * The place a request writes to, creating the person's copy of the repository on first use.
   * A new copy starts as the published state, so `precheck` judges the write there first: a
   * refused write leaves no copy behind.
   */
  async function writePlace(
    reader: Reader,
    slug: string,
    precheck?: (published: Place) => unknown,
  ): Promise<Place> {
    const key = writeKeyFor(reader);
    if (!key || !reader.copy) return deps.published;
    const repo = deps.repoOf(slug);
    if (precheck && !deps.worktrees.exists(key, repo)) await precheck(deps.published);
    seen.set(key, reader.copy.author.name);
    const created = await ensureOnce(key, repo);
    const entry = use(key);
    await entry.ready;
    if (created) {
      for (const project of deps.projectsIn(repo)) {
        await deps.rescan(entry.place, project);
        entry.watcher?.add(project);
      }
    }
    return entry.place;
  }

  async function repositoryFacts(repo: string) {
    const defaultBranch = await deps.worktrees.defaultBranch(repo);
    return { defaultBranch, holders: await deps.worktrees.holders(repo, defaultBranch) };
  }

  /**
   * The person's copy of a project's repository for the project listing: its branch (the
   * personal branch it will start on, before first use), the default branch and the branches
   * others hold. Null for people who read the published state. `branch` is the copy's current
   * branch, which the listing already read; `facts` is shared by the listing's projects.
   */
  async function copyInfo(reader: Reader, slug: string, branch: string, facts: RepositoryFacts) {
    const key = copyKeyFor(reader, slug);
    if (!key || !deps.gitAvailable) return null;
    const repo = deps.repoOf(slug);
    if (!facts.has(repo)) facts.set(repo, repositoryFacts(repo));
    const { defaultBranch, holders } = await facts.get(repo)!;
    const inUseBranches = [...holders]
      .filter(([, holder]) => holder.key !== key)
      .map(([held, holder]) => ({ branch: held, inUseBy: holder.name }));
    if (deps.worktrees.exists(key, repo)) return { branch, defaultBranch, inUseBranches };
    const owner = owners().find(person => person.key === key);
    return { branch: personalBranch(owner?.handle ?? key), defaultBranch, inUseBranches };
  }

  /** Stops watching a person's copies; their files, index rows and drafts stay. */
  function release(key: string) {
    personal.get(key)?.watcher?.close();
    personal.delete(key);
    lastUsed.delete(key);
  }

  /** Releases the copies idle for longer than the idle period. */
  function releaseIdle(): string[] {
    const released = idleCopies(lastUsed, deps.now(), deps.idleMs ?? IDLE_RELEASE_MS);
    for (const key of released) release(key);
    return released;
  }

  const interval = setInterval(releaseIdle, 60_000);
  interval.unref?.();

  return {
    owners,
    copyInfo,
    readPlace,
    writePlace,
    filesFor,
    /** A person's place by key, for work that follows a trash entry back into its copy. */
    placeOf: (key: string) => use(key).place,
    releaseIdle,
    release,
    /** The keys of the copies in use now, each with its watched repository folders. */
    active: () =>
      [...personal].map(([key, entry]) => ({ key, watching: entry.watcher?.watching() ?? [] })),
    close() {
      clearInterval(interval);
      for (const entry of personal.values()) entry.watcher?.close();
      personal.clear();
    },
  };
}

/** The per-person places of one workspace. */
export type WorkingCopies = ReturnType<typeof createWorkingCopies>;
