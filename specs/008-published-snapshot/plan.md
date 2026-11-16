# Implementation Plan: Published Snapshot

**Branch**: `008-published-snapshot` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-published-snapshot/spec.md`

## Summary

Define "published" as the commit a durable per-repository **published pointer** names, read from Git
objects by one **published-snapshot resolver** that does not use the editing Reader. Agent routes
read the resolver in both modes. The editing view stays for the person's own editor, and the
browser's Mappings preview moves to dedicated preview routes. Local mode gets an authoring branch
(`work/local`) and a Publish step. The pointer moves only through publication, remote follow or an
explicit adoption of an outside fast-forward, each running one ordered list of publication checks.
Historical inputs are accepted only from published history. Snapshots are immutable in-memory
indexes keyed by repository and commit, bounded and shared by every caller, with access filtering
applied per request on top.

Design decisions and rejected alternatives are in [research.md](./research.md). Entities are in
[data-model.md](./data-model.md). The resolver's TypeScript contract and the HTTP changes are in
[contracts/](./contracts/). A manual walk-through is in [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server) and React 19 (browser), as before.

**Primary Dependencies**: none new. The Git binary through the existing `spawnGit` queue; the state
file mechanism in `src/server/projects/state.ts`; the content-hash parse cache in
`src/server/projects/cache.ts`.

**Storage**: one new durable state file, `data/state/published.json`. The SQLite cache is unchanged.
Snapshot indexes are in memory and rebuildable from Git.

**Testing**: `bun test` (new files under `tests/server/`), targeted mutants in
`scripts/mutation-tests.ts`, the authorization matrix and route inventory tests, a browser check for
the Mappings preview label and Source Control publish state (`scripts/`), and the examples
verification for the performance measure.

**Target Platform**: the existing container and local mode on a developer machine.

**Project Type**: web service plus single-page app, unchanged.

**Performance Goals**: warm agent requests no more than 10% slower at the 95th percentile than the
current path on the example workspaces (SC-008); expected faster, because sources are held in memory.

**Constraints**: no new network call; snapshot reads use the serialized per-repository Git queue; a
snapshot build is bounded by 2,000,000 bytes per document, 64,000,000 bytes per snapshot, 10,000
files per project and the 30-second Git timeout; memory is bounded by two retained snapshots per
repository plus live pins.

**Scale/Scope**: one instance per data root; tens of people; tens of repositories; example
workspaces of hundreds of files.

## Constitution Check

Checked against the constitution as it stands on this branch (3.2.0), with the amendments below
named by principle because they are being drafted on `constitution-tessera`.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | No new outbound call and no credential change. Local mode keeps its implicit Admin principal; Publish is authorized through the same boundary, which allows the local principal. The browser marker in local mode is a guardrail, and the docs say so. **Amendment named**: the "Both modes" bullet on agent-facing endpoints should read "supply deterministic context and planning from the published snapshot only". |
| II. Byte-Exact Source Preservation | Snapshot files are the exact blob bytes, served whole or not at all. The default zip export is unchanged and still includes drafts; `source=published` returns blob bytes. The resolver never rewrites a file. |
| III. One Validation Rule Set | The snapshot uses `indexBytes`, the same validation the scanner and the save path use. The planner, context builder and explainers are unchanged, and the preview routes share their handlers with the agent routes. Invalid published documents stay visible as invalid. |
| IV. Atomic, Hash-Checked File Persistence | The pointer is a durable state file written atomically; an intent entry makes publication restartable. Local publish uses compare-and-swap on the ref. No file is written outside the data root. Git runs through the existing queue with argument lists. Principle's list of durable state files gains the pointer (**amendment named**: add "the published pointer"). Served-only-to-that-person state (drafts, view state) is untouched; people's history reads gain a provenance rule that strengthens "no operation of one person may reach another person's files". |
| V. Pinned Official Standards | Untouched. |
| VI. Verification Gate | Tests per task below; targeted mutants for the resolver source, the pin, each publication check, the history provenance check and the surface rule; every new route is in the route inventory and the authorization matrix; a browser check covers the two visible changes; the full UI regression gate compares the whole journey in both modes before merge. |
| VII. Honest Claims | The README and docs state the definition, the migration, the guardrail limit in local mode, the commands and fixtures behind any performance statement, and what is not covered. Counts quoted come from tests. |
| VIII. Readable Code | One module per concept named after the domain (`published-pointer`, `published-snapshot`, `snapshot-index`, `publication-checks`, `local-publication`, `request-surface`); functions near 40 lines; no IDs in comments; the agent route group moves out of `handler.ts` into `routes/agent.ts` so no file grows past the limit. |
| Technical Constraints | No dependency added. Input limits unchanged. |
| Development Workflow | Gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:mutation`, the affected browser suites, `test:auth`. |

No exception is needed, so Complexity Tracking is empty. The architecture review runs once, before the
pull request.

## Design

### Modules

All under `src/server/projects/` unless stated, following the repository's layout for
repository-level concepts (`publishing.ts`, `worktrees.ts`, `working-copies.ts`).

| Module | Responsibility | Kind |
|---|---|---|
| `published-pointer.ts` | The pointer type, reading and writing `published.json`, and the pure function that classifies a ref against a pointer (`in-sync`, `fast-forward`, `diverged`, `intent-completed`, `intent-dropped`). | Pure core plus a small state edge |
| `snapshot-index.ts` | Builds one immutable index for (repository, commit, project folders) from `ls-tree` and `cat-file --batch`; enforces the limits; shares concurrent builds. | I/O edge |
| `published-snapshot.ts` | The resolver: `pin`, `withPin`, `documents`, `fileBytes`, `status`, `resolveRevision`, `isPublishedRevision`, retention. Created by `createPublishedSnapshots(deps)` with Git, state and registry passed in. | Composition |
| `publication-checks.ts` | The ordered check list and typed refusals. | Pure plus Git edge |
| `local-publication.ts` | Moving to the authoring branch, local Publish, first publication, adoption in local mode. | I/O edge |
| `publishing.ts` (changed) | Server publish, remote follow and adoption call the pointer and checks; `announce` also refreshes the resolver. | Existing |
| `worktrees.ts` (changed) | `moveDefault` writes the intent and the pointer around the ref swap, and runs the check list. | Existing |
| `scm.ts` (changed) | `show` and `versions` ask `resolver.isReadableRevision`; `status` gains the published block. | Existing |
| `src/server/auth/request-surface.ts` | `requestSurface(request)`: `browser` or `agent`. | Pure |
| `src/server/auth/route-actions.ts` (changed) | The `readSource` field and its validation. | Existing |
| `src/server/routes/agent.ts` (new, extracted) | The agent routes and the preview routes, built from one handler with a document source argument. | Routes |
| `src/server/routes/metrics.ts` (changed) | Chooses documents by surface. | Existing |
| `src/server/routes/export.ts` (changed) | The `source` parameter. | Existing |
| `src/app/...` (changed) | Preview paths, preview label, Source Control published block, Publish in local mode, first-run notice. | UI |

### Request flow for an agent call

1. The access middleware resolves the principal and authorizes `agentRead` or `read` as today.
2. The agent route takes a pin: `published.withPin(pin => ...)`.
3. It checks the project is in `agentProjects` (readable), then asks the resolver for the project's
   documents under that pin, filtered by the caller's view.
4. A project without a snapshot raises `SnapshotUnavailableError` here, after the readable check.
5. The unchanged context builder or planner runs on those documents.
6. The response carries `X-Workbench-Snapshot: <commit>`.

### Publication flow

1. A publish, a remote follow or an adoption builds a candidate (previous, next).
2. The check list runs: fast-forward, tree readable and bounded, content guards (server mode only).
3. The pointer file records `intent: next`.
4. The ref moves with compare-and-swap.
5. The pointer records `commit: next` and clears the intent; the resolver supersedes the snapshot; the
   `published` event fires; the audit records the move.
6. At start, `published-pointer` reconciles an intent against the ref (research D10).

### Local mode

- First start: determine and record the default branch; record its tip as the first snapshot; raise
  the one-time notice flag in the status that the browser shows once.
- Commit on the default branch: `local-publication.moveToAuthoringBranch` runs `switch -c work/local`
  (or switches to it when it exists and descends from HEAD, otherwise asks the person to resolve) and
  the commit proceeds on it.
- Publish: check fast-forward and non-empty, run the checks, CAS the default ref to the authoring head.
- A default branch that is checked out and ahead of the pointer is a pending move, adopted by the
  same action, labelled "Publish" when authoring work is ahead and "Adopt" when the move was made
  elsewhere.

### Surfaces and previews

- `requestSurface` per research D7. The agent and preview route group is one function that takes the
  document source (`snapshot` or `editing`) and a guard that the surface is acceptable.
- Route inventory rows declare `readSource`. `agentRead` rows are `published`. Preview rows are
  `editing`. Metrics list and explain are `by-surface`. A test walks the inventory and fails on a
  missing declaration.

### Access filtering

The resolver returns documents for a pin without a view. The route applies the view after, with the
same predicate `documentsFor` uses (`visible` and `view.canRead`). The index never sees a caller.
The hidden-equals-unknown rule is tested at the route level in the authorization matrix.

### Caching and invalidation

- Key: repository, commit and a digest of the project folders the index was built with.
- Superseded by a pointer move; never mutated; retention is current plus previous plus pinned.
- A registry change changes the digest, so the next pin builds a new index and the old one ages out.
- Concurrent builds are shared through a map of promises keyed like the index and cleared on settle.
- Parse results share the existing content-hash cache; `CACHE_VERSION` bumps drop it, and snapshots
  rebuild on demand.

## User-visible changes and migration

| Change | Who | Before | After | Upgrade handling |
|---|---|---|---|---|
| Agent routes read the snapshot | Signed-in editor's agent (server) | Own working copy | Published commit | None needed; documented. The editor sees their edit only in the Mappings preview. |
| Agent routes read the snapshot | Local-mode agent | Working tree, uncommitted and untracked included | Last published commit | First snapshot is the existing default-branch tip, so committed content is unchanged; uncommitted work is absent until committed and published. |
| Application agents | Bearer applications (server) | The published checkout | The same commit, plus an `X-Workbench-Snapshot` header | Byte-identical bodies. A project with no Git or no commit now answers 409 "no published snapshot". |
| Local commits | Local person | Commit on the checked-out branch, default included | Commit on `work/local` when the default branch is checked out | One-time notice; the carried changes and index are preserved; other branches unchanged. |
| Publish in local mode | Local person | Refused ("server mode") | Fast-forwards the default branch | New action in Source Control. |
| Pending outside move | Both modes | Silently visible to readers | Reported and not served until adopted | Local fast-forward by terminal commit shows "Adopt". |
| Preview routes | Browser | Mappings used the agent routes | Mappings uses `/api/preview/*` and shows a preview label | Frontend changes in the same release; old browsers reload. |
| Metric routes by surface | Non-browser credentials | Not reachable (bearer) | Snapshot if ever reached | Browser unchanged. |
| History by commit id | People | Any known commit id | Own head or published history | Commits only reachable from other branches answer as missing. |
| Zip export source | People | Working files | Unchanged by default; `source=published` added | None. |

## Project Structure

### Documentation (this feature)

```text
specs/008-published-snapshot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/
    ├── resolver.md
    └── http.md
```

### Source Code (repository root)

```text
src/server/projects/
├── published-pointer.ts       # pointer type, classification, state file edge
├── snapshot-index.ts          # build one immutable index from Git objects
├── published-snapshot.ts      # resolver: pin, documents, provenance, retention
├── publication-checks.ts      # ordered publication checks
├── local-publication.ts       # authoring branch, local publish, adoption
├── publishing.ts              # (changed) server publish, remote follow, adoption
├── worktrees.ts               # (changed) moveDefault writes intent and pointer
├── scm.ts                     # (changed) history provenance, published status block
├── git.ts                     # (changed) lsTree, catFileBatch, isAncestor, peelTag
└── workspace.ts               # (changed) composes the resolver, exposes ws.published
src/server/auth/
├── request-surface.ts         # browser or agent
└── route-actions.ts           # (changed) readSource on rows
src/server/routes/
├── agent.ts                   # (new) agent and preview routes, extracted from handler.ts
├── metrics.ts, export.ts, git.ts, handler.ts  # (changed)
src/app/
├── mappings/agent-paths.ts, projects/api.ts   # (changed) preview paths
├── mappings/MappingExplorer.tsx               # (changed) preview label
└── scm/ ...                                   # (changed) published block, Publish in local mode, notice
tests/server/   published-pointer, snapshot-index, published-snapshot, publication-checks,
                local-publication, request-surface, agent-sources, snapshot-history, snapshot-export
scripts/        published-snapshot-browser-check.ts, snapshot-mutants.ts, snapshot-mutation-cases.ts
```

**Structure Decision**: the repository's existing layout. Repository-level concepts live beside
`publishing.ts` and `worktrees.ts`; the route group extracted from `handler.ts` follows the other
files in `routes/`; the surface rule lives with authentication state in `auth/`.

## Documentation plan

README ("Local and shared-server modes", "Data, recovery and Git", "From definitions to a metric
explanation"), ARCHITECTURE.md (reads use the published checkout is replaced by the snapshot rule;
the "Shared-server writes and publication" list), `docs/server-mode.md` ("Personal working copies and
publishing"), `docs/agent-runtime.md` (published-only context, the header, the 409), `docs/user-guide.md`
(Publish in local mode, the preview label, the notice), `docs/configuration.md` (state file listing),
CHANGELOG (the table above). No environment variable is added, so no configuration example changes.

## Complexity Tracking

None.
