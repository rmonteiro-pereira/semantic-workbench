# Contract: the published-snapshot resolver

The resolver is the one way code reads production definitions. It does not take a `Reader`, never
touches a working copy and never sees a caller's permissions. 006, the extended-format compiler and
the mesh consume exactly this surface.

```ts
// src/server/projects/published-snapshot.ts

/** One request's consistent choice of commits, one per repository that has a snapshot. */
export type PublishedPin = {
  readonly commits: ReadonlyMap<string, { branch: string; commit: string }>;
};

export type SnapshotStatus =
  | { state: 'none'; reason: 'no-git' | 'no-commit' | 'unavailable' }
  | { state: 'in-sync'; branch: string; commit: string }
  | { state: 'pending'; branch: string; commit: string; next: string; commits: number; move: 'fast-forward' | 'diverged' };

export type PublishedSnapshots = {
  /** Copies the pointer map synchronously. Takes no lock and does no I/O. */
  pin(): PublishedPin;

  /** Runs `use` with a pin that the resolver keeps in memory until `use` settles. */
  withPin<T>(use: (pin: PublishedPin) => Promise<T> | T): Promise<T>;

  /**
   * The documents of one project at the pin, in the shape of the editing view's documents: the
   * files the editing view would list as visible, and no caller's permissions applied. Throws SnapshotUnavailableError when the project has no snapshot at the pin.
   */
  documents(pin: PublishedPin, project: string): Promise<PublishedDocument[]>;

  /** The exact bytes of one file at the pin, or null when the snapshot has no such file. */
  fileBytes(pin: PublishedPin, project: string, path: string): Promise<Uint8Array | null>;

  /** Reads one project at a commit that a consumer remembered, if it is in published history. */
  documentsAt(commit: string, project: string): Promise<PublishedDocument[]>;

  /**
   * Accepts a full commit id in published history, or a tag that peels to one. Returns the full
   * commit id, or null for everything else, which a caller reports as an unknown revision.
   */
  resolveRevision(revision: string): Promise<string | null>;

  /** For people's history reads: published history, or reachable from `head`. */
  isReadableRevision(revision: string, head: string | null): Promise<boolean>;

  status(repository: string): Promise<SnapshotStatus>;

  /** The number of retained indexes, for tests of the retention bound. */
  retainedCount(): number;
};
```

## Behaviour that callers rely on

| Behaviour | Guarantee |
|---|---|
| Consistency | Every call that takes the same `pin` reads the same commit per repository, whatever is published meanwhile. |
| Filtering | No permissions. The route applies the caller's view with the predicate `documentsFor` uses (`visible` and `view.canRead`). Filtering after reading is what keeps the index shareable. |
| Unavailable | `SnapshotUnavailableError` carries `reason`. Routes raise it only after the caller's readable check. |
| Revision input | Full commit ids and tags only. A branch name, an abbreviated id, a non-commit object, a tag outside published history and an id that exists only on another branch return `null`, with no difference a caller can observe. |
| `documentsAt` | Rebuilds on demand within the limits, or throws `SnapshotUnavailableError('unavailable')` when objects are gone. It never answers from another commit. |
| Immutability | Returned documents are not shared mutable state; callers receive copies of the arrays and frozen entries. |
| Cost | `pin` is O(repositories). A cold `documents` costs one `ls-tree`, one `cat-file --batch` and parses of files with unseen content hashes. A warm call does no I/O. |
| Events | A pointer move supersedes the current index; the resolver emits nothing itself. The existing `published` event is sent by `publishing.ts`. |

## Publication checks

```ts
export type PublicationCandidate = { repo: string; branch: string; previous: string | null; next: string };
export type PublicationCheck = (candidate: PublicationCandidate) => Promise<void>;

/** In order: fast-forward, readable and bounded tree, content guards. */
export function publicationChecks(deps: PublicationCheckDeps): PublicationCheck[];
```

Adding a check means appending to this list; no entry point changes. A failing check throws a typed
error whose message names the reason and whose type decides the HTTP status already used by the
publish route (409 for not a fast-forward, 403 for guards, 422 for an unreadable tree).
