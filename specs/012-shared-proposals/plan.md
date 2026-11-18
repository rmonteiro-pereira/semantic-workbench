# Implementation Plan: Shared Proposals

**Branch**: `012-shared-proposals` (to be created at implementation) | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-shared-proposals/spec.md`

## Summary

A **proposal service** keeps one durable record per repository and one Git ref per open proposal under
`refs/workbench/`. A person works on a proposal from a private **contribution branch**
(`work/<handle>.<id>`) that lives in their own working copy. Contributing moves the proposal ref with a
compare-and-swap, inside the repository's existing serialized queue, after the declared-project rule, the
contributor's authorization and the content guards pass on the changed paths. Promotion calls the existing
publication path (`moveDefault`, `createPublication`) with the proposal tip as the candidate, so the
atomic default-ref move, the durable intent, recovery and the refresh of every project in the repository
are reused, not copied. The workbench also refuses to push any `work/` or `proposal/` branch. Eleven
routes, a "Proposals" section in Source Control and a two-editor browser journey complete the feature.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server); React 19 (interface).

**Primary Dependencies**: none new. The Git helper (`src/server/projects/git.ts`), the publication
writer, the Cedar decisions, `bun:test`, Playwright for the browser checks.

**Storage**: one JSON file per repository under `data/state/proposals/`, written atomically; proposal
tips are Git refs in the repository's own folder. No database column, no cache entry.

**Testing**: `bun test` on new files under `tests/` and `tests/auth/`; mutants in the existing harness
(`scripts/mutation-tests.ts`); one browser check for the views (`scripts/proposals-browser-check.ts`) and
an extension of `scripts/two-editors-check.ts`. Targeted runs only during implementation; the full gate
runs once on the integrated batch.

**Target Platform**: server mode on one container, unchanged. Local mode gains only the push rule.

**Project Type**: web service plus single-page app.

**Performance Goals** (chosen here, to be measured and recorded; not derived from a measurement): list
proposals of a repository with 50 open proposals in under 200 ms on the test fixture; a contribution on
a repository of 2,000 files completes within the time of an ordinary commit plus 20%; the promotion check
within the time of a publication of the same candidate.

**Constraints**: no new permission; no second writer of the default ref; proposal content is read only
through the proposal service; all Git runs through the existing helper with argument lists; the
repository queue serializes every proposal operation; files of about 400 lines at most, functions of
about 40; text never clipped in any view.

**Scale/Scope**: tens of people, up to 50 open proposals per repository, repositories of up to 2,000
files (the snapshot limit already enforced).

## Constitution Check

Checked against constitution 4.0.1 in this worktree.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Proposals exist in server mode only. Published stays the immutable default-branch snapshot; proposal refs are unpublished and never pushed (the amendment's text on proposal branches is implemented by FR-031 to FR-034). Hidden equals missing for proposals (FR-005). No new outbound call. The push refusal also applies in local mode. |
| II. Byte-Exact Source Preservation | Contributions are Git commits made by the existing commit path; no file is rewritten by the proposal service. |
| III. One Validation Rule Set | Promotion validates the complete candidate through the publication path. Contributions run the content guards. No new validation rule exists. |
| IV. Atomic, Hash-Checked File Persistence | The record is an atomic state file. The default-ref move is the existing compare-and-swap with durable intent. The proposal ref moves by `update-ref` with an expected old value inside the repository queue. Operations carry expected branch, HEAD and tip (the amendment's precondition rule). Delete never rewrites history. |
| V. Pinned Official Standards | No schema or standard is touched. |
| VI. Verification Gate | Targeted mutants, a parity case for each route, matrix rows, browser checks. **No amendment needed.** |
| VII. Honest Claims | Docs state the guarantee is the application's, not the operating system's (FR-034), and list the push change. |
| VIII. Readable Code | New modules named for domain concepts; no IDs in comments. |
| Technical Constraints | Every operation goes through the operation boundary with an inventory entry and parity case (4.0.1). The single-instance rule is unchanged. |

Complexity Tracking is empty.

## Design

### New modules

| Module | Concept | Holds |
|---|---|---|
| `src/shared/proposals/proposal.ts` | What a proposal is | types, name and identifier validation, status derivation (pure) |
| `src/shared/proposals/contribution-branch.ts` | Branch naming | `contributionBranch(handle, id)`, `parseContributionBranch`, owner visibility rule (pure) |
| `src/server/projects/proposal-store.ts` | The durable record | read and atomic write of `state/proposals/<repository>.json`, reconciliation of record against refs |
| `src/server/projects/proposal-refs.ts` | The refs | create, move with expected old value, close, restore, remove; changed paths between two commits |
| `src/server/projects/proposals.ts` | The service | create, view, list, work, synchronize, contribute, check, promote, close, restore; composes the three above with the repository queue, publication and the guard |
| `src/server/auth/proposal-access.ts` | The authority rules | `authorizeProposal`: which action and which projects each operation needs (pure decisions, no I/O) |
| `src/server/routes/proposals.ts` | The HTTP adapter | eleven routes, request parsing, hidden-equals-missing |
| `src/server/projects/work-in-progress-push.ts` | The push rule | `refuseWorkInProgressPush(branch)` used by `push` and `sync` |
| `src/app/proposals/` | The interface | `ProposalsSection.tsx`, `ProposalList.tsx`, `ProposalDetail.tsx`, `CreateProposalDialog.tsx`, `PromotionCheck.tsx`, `proposals.css`, `api.ts` |

### Flow of one contribution

1. The browser sends `expectedTip` and the contribution branch head.
2. The route resolves the reader, the proposal and its declared projects; a proposal the reader may not
   see answers 404.
3. `authorizeProposal` decides `commit` with branch `proposal/<id>` on every declared project.
4. Inside the repository queue the service reads the proposal ref. A different value answers `stale-tip`.
5. It checks that the branch head descends from the tip, lists the changed paths with `--no-renames`, maps
   each to its owning project and refuses any path outside the declared set.
6. It authorizes `edit` on each changed path and runs the content guard over the changes as the contributor.
7. It runs `update-ref refs/workbench/proposals/<id> <new> <expectedTip>`. A failed swap answers stale.
8. It records the contributor in the record, emits the `proposal` event and writes one audit record.

### Flow of promotion

1. `authorizeProposal` requires `publish` on the default branch for every project in the repository.
2. Inside the queue the service compares the tip with `expectedTip`, then calls the new
   `worktrees.promote(repository, tip, guard)`, which calls `moveDefault` with `next` = tip.
3. `createPublication.advance` runs ancestry, readable-candidate and guard checks, records intent,
   swaps the default ref, completes the pointer and supersedes snapshots, exactly as publishing does.
4. After success the service marks the record promoted, removes the proposal ref, rescans every project
   of the repository and emits `published` and `proposal` events.
5. On start, `proposal-store` reconciliation marks any proposal whose tip is inside the published history
   as promoted (covers a crash after step 3).

### Patterns used

- **Derived state**: status is computed from refs and the record; the record never copies the tip.
  Problem: a stored tip would drift from the ref after a crash.
- **Adapter**: `routes/proposals.ts` adapts requests to the service, as the other route groups do.

No other pattern is introduced.

### Interface

A "Proposals" section in the Source Control view, absent in local mode. The list shows name, status,
declared projects, contributors and last movement. The detail view shows changed files per project, the
existing `DiffView` for a file, the promotion check and the actions the reader's authority allows. It
uses the existing theme tokens, modal and button styles, with wrapped text everywhere (no clipping, no
ellipsis), empty, loading, error and long-text states, phone width, light and dark. The create dialog
checks the project boxes against what the person may edit.

## Defaults and where they come from

None of these came from a measurement. "Existing" means the value equals a constant in the repository;
"assumed" means chosen here and changeable without changing a requirement.

| Name | Default | Source |
|------|---------|--------|
| Open proposals per repository | 50 | assumed; a repository has tens of people |
| Name length | 80 characters | assumed; fits a list row on a phone when wrapped |
| Identifier length | 40 characters | assumed; keeps `work/<handle>.<id>` well under Git's path limits |
| Request body limit | GIT_REQUEST_LIMIT | existing (`src/server/request.ts`) |
| Candidate tree limits | the publication limits | existing (`src/server/projects/publication-checks.ts`) |
| Diff size shown | the source-control diff limits | existing (`src/server/projects/scm.ts`) |
| Randomized race runs | 200 | assumed; same as feature 006 |
| Concurrent contributions in the race test | 8 | assumed |
| Listing time on 50 proposals | 200 ms | assumed |

## Files this feature owns

New files only unless listed under "Shared files".

```text
src/shared/proposals/proposal.ts
src/shared/proposals/contribution-branch.ts
src/server/projects/proposal-store.ts
src/server/projects/proposal-refs.ts
src/server/projects/proposals.ts
src/server/projects/work-in-progress-push.ts
src/server/auth/proposal-access.ts
src/server/routes/proposals.ts
src/app/proposals/{ProposalsSection,ProposalList,ProposalDetail,CreateProposalDialog,PromotionCheck}.tsx
src/app/proposals/{api.ts,proposals.css}
scripts/proposals-browser-check.ts
scripts/proposals-mutants.ts
scripts/proposals-mutation-cases.ts
tests/proposals-*.test.ts, tests/work-in-progress-push.test.ts, tests/auth/proposal-parity.test.ts
tests/helpers/proposal-fixture.ts
```

## Shared files it touches

| File | Change | Also touched by |
|---|---|---|
| `src/server/projects/worktrees.ts` | `branchShownTo` clause for contribution branches; `promote` beside `publish` | none; read by 006 |
| `src/server/projects/publishing.ts` | a `promote` entry that reuses `judgePublish` and `announce` | none |
| `src/server/projects/scm-remote.ts` | call `refuseWorkInProgressPush` in `remoteAction` | 006 (git routes and `scm.ts` edits) |
| `src/server/projects/workspace.ts` | compose the proposal service | 006 (edits it), 014 (counter service) |
| `src/server/projects/paths.ts` | `proposals` state folder in `DataLayout` | 013, 014 (their own folders) |
| `src/server/projects/events.ts` | `proposal` event name | none |
| `src/server/auth/git-access.ts` | no change; `proposal-access.ts` composes it | 006 (adds effect checks) |
| `src/server/auth/route-actions.ts` | eleven rows in one block | 013, 014, 015 |
| `src/server/auth/operation-inventory.ts` | handler check `authorizeProposal` added to `HANDLER_CHECKS` | 013, 015 (vocabulary additions) |
| `schemas/semantic-workbench-operations-v1.json` | enum entry for the new handler check | 013, 015 |
| `policies/operation-inventory.json`, `policies/matrix-cases.json` | eleven entries and matrix cases | 013, 014, 015 |
| `docs/operations.md` | regenerated, never hand merged | all |
| `src/server/handler.ts` | register `proposalRoutes` | 013, 014, 015 |
| `src/app/scm/SourceControl.tsx` | mount `ProposalsSection` | none |
| `src/app/projects/api.ts` | export the proposals client types if reused | none |
| `scripts/two-editors-check.ts` | add the proposal journey | none |
| `scripts/gate-suites.ts`, `package.json`, `scripts/mutation-tests.ts`, `scripts/ci-validate.ts` | one suite, one script, wiring | all |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/server-mode.md`, `docs/user-guide.md`, `docs/configuration.md` (none needed), `docs/development.md` | one section each | all |

## Overlaps with the other features

- **006 (MCP server)** edits `src/server/routes/git.ts`, `src/server/projects/scm.ts`,
  `src/server/projects/scm-context.ts` and `workspace.ts`. This feature edits `scm-remote.ts` and
  `worktrees.ts` and adds a separate route file, so a textual conflict is unlikely; the semantic overlap
  is the commit and push paths. After 006 merges, re-run `tests/git-remote.test.ts` and the commit
  tests. Proposal operations are not tools (FR-043).
- **013 and 015** add rows, inventory entries and vocabulary values in the same files. Rows are appended
  as one block per feature; the generated operations table is regenerated last.
- **014 (usage counters)**: the boundary hook counts only operations marked as counted; proposal
  operations are not marked, so there is no functional overlap.
- **015 (agent panel)**: an agent edits the person's current branch; if it is a contribution branch the
  agent's commits land there. The panel must not offer contribute or promote.
- **Batch order**: because 012 touches `worktrees.ts` and `scm-remote.ts` and the others do not,
  it can integrate first or last without conflict; integrate shared-vocabulary files (inventory,
  schema, route actions) with a three-way merge and regenerate `docs/operations.md`.

## Project Structure

### Documentation (this feature)

```text
specs/012-shared-proposals/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── proposal-routes.md
│   └── proposal-refs-and-branches.md
├── checklists/requirements.md
└── tasks.md
```

## Delivery phases (tasks.md splits them into eight)

1. **Record the base**: tests that pin today's push and publish behaviour so the one deliberate change
   (the push rule) is visible.
2. **Foundation**: pure types and branch names, the record store, the refs, the changed-path rule.
3. **Create, read and visibility**: the service, routes for list, read, create, hidden equals missing.
4. **Contribute**: work, synchronize, contribute, scope and guards, concurrency.
5. **Promote**: the check, promotion through publication, recovery.
6. **Close and restore**, and the push rule.
7. **Interface**: components, browser check, two-editor journey.
8. **Gate and documentation**: inventory and matrix, mutants, docs, hand-off to the batch gate.

## Complexity Tracking

No violations.
