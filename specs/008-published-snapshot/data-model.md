# Data Model: Published Snapshot

## Stored state

### Published pointer file

`data/state/published.json`, written atomically with the other state files.

```json
{
  "formatVersion": 1,
  "repositories": {
    "<repo>": {
      "branch": "main",
      "commit": "<full commit id>",
      "intent": "<full commit id>"
    }
  }
}
```

| Field | Rules |
|---|---|
| `repositories` key | A repository folder name under `data/projects/`, the value `repoOf(slug)` returns. |
| `branch` | The default branch name, from the recorded `workbench.defaultBranch`. Changes only through an adoption that passes the checks. |
| `commit` | A full commit id (40 or 64 hex characters). Always in the history of `refs/heads/<branch>`. Absent while a repository has no first publication. |
| `intent` | Present only while a publication is running: the commit the ref is about to move to. |

Transitions (all through `published-pointer.ts`):

```text
none --first publish or first-start record--> { branch, commit }
{ commit } --publish/follow/adopt: write intent--> { commit, intent }
{ commit, intent } --ref moved, record--> { commit: intent }
{ commit, intent } --start: ref == intent--> { commit: intent }        (completed)
{ commit, intent } --start: ref == commit--> { commit }                (dropped)
{ commit } --ref != commit, descends--> pending fast-forward move      (not served)
{ commit } --ref != commit, does not descend--> pending diverged move  (not served)
```

A missing or unreadable file is not rebuilt from any working tree. The first-start rule applies:
server mode records the default branch tip of a clean base; local mode records the default-branch tip
and raises the notice flag.

### Local identity

Local mode's authoring branch is `work/local`. No state is stored for it: the branch itself is the
record.

## In-memory entities

### PublishedPin

```text
PublishedPin = {
  commits: ReadonlyMap<repository, { branch, commit }>   // one entry per repository with a snapshot
  takenAt: number                                        // for diagnostics only
}
```

Taken synchronously from the pointer map, so it is consistent as of one instant. Frozen.

### SnapshotIndex

```text
SnapshotIndex = {
  repository, branch, commit,
  folderDigest: string,                  // digest of the project folders the index was built with
  projects: Map<slug, SnapshotProject>
}
SnapshotProject = { files: SnapshotFile[], bytes: number }
SnapshotFile = { path, source, hash, revision, docType, valid, visible, serialization, ... }
```

`SnapshotFile` carries the fields of `CachedFile` plus the decoded `source`, so it converts to the
editing view's document shape without a second read. Immutable after build.

Limits: 2,000,000 bytes per document, 64,000,000 per snapshot, 10,000 files per project. Exceeding any
raises `SnapshotUnavailableError`.

### Retention

`current` and `previous` per repository, plus `held: Map<key, count>` for live pins. The resolver
exposes `retainedCount()` for tests (SC-009).

### SnapshotStatus (per repository)

```text
SnapshotStatus =
  | { state: 'none', reason: 'no-git' | 'no-commit' | 'unavailable' }
  | { state: 'in-sync', branch, commit }
  | { state: 'pending', branch, commit, next, commits: number, move: 'fast-forward' | 'diverged' }
```

Reported through the existing `git/status` response as an additional `published` block.

### PublicationCheck

```text
PublicationCheck = (candidate: { repo, branch, previous: string | null, next: string }) => Promise<void>
```

Refusal types extend the existing publication errors: `NotFastForwardError` (exists),
`SnapshotUnreadableError`, and the existing `WriteAccessError` from the content guards. The ordered
list is exported as `publicationChecks(deps)`.

## Relationships

- A repository has zero or one pointer; a pointer names one commit; a commit yields one `SnapshotIndex`
  per distinct folder digest.
- A project belongs to one repository and has a folder inside it; its files are the entries of its
  `SnapshotProject`.
- A request holds one `PublishedPin`; a pin names at most one commit per repository.
- A caller's view is applied to a snapshot's documents at read time and is never stored with it.

## Validation rules

- A pointer commit MUST be an ancestor of, or equal to, the ref when it is recorded.
- A revision is accepted as published history only after the ancestor query passes.
- A folder digest is computed from the sorted list of `(slug, folder)` pairs of the repository.
- A path in a snapshot MUST have no case-variant sibling; otherwise the project is unavailable at that
  commit.
