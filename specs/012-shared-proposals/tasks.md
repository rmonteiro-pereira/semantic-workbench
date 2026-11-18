# Tasks: Shared Proposals

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: none. Features 008 to 010 are on the base. Feature 006 is not needed.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours and may run in parallel. Every task that changes code ends
with the formatter applied and its named test green. No task edits a test only to make it pass.

**Process (owner, 2026-11-17).** While implementing, run only this feature's own tests,
`bun --bun run check` and `bun --bun run build`. The full unit suite, the mutation tests, every browser
suite, the UI regression comparison against the last release, and the architecture review run once, on
the integrated batch (T045). Heavy runs go to the dev server with `sw-midgard-run -- <command>`.
Screenshot and browser capture is handed to Codex with a brief (T041, T042).

## Phase 1: Record the base

**Purpose**: pin today's behaviour so the one deliberate change is visible. Committed before any change
under `src/`.

- [ ] T001 [US3] Add `tests/work-in-progress-push.test.ts` with cases recorded on the unchanged code: push of the default branch, of a feature branch, of `work/<handle>` and of `work/local` all reach a local bare remote; sync does the same. Use `tests/helpers/git-fixtures.ts` and `tests/helpers/scm.ts`. Proof: passes on the base commit, and the work-branch cases are marked as the cases FR-032 will change.
- [ ] T002 [P] [US4] Add `tests/proposals-publish-baseline.test.ts`: publishing from a copy moves the default branch and refreshes every project of a repository with three projects (`tests/helpers/publication-fixture.ts`); partial authority refuses. Proof: passes on the base commit.

## Phase 2: Foundation (blocks every story)

- [ ] T003 [P] Create `src/shared/proposals/proposal.ts`: types of the record and view (data-model.md), name and identifier validation (1 to 80 characters trimmed, no control characters; identifier `[a-z0-9-]` 1 to 40), identifier derivation with clash suffix, and `deriveStatus(record, refs)`. Tests in `tests/proposals-model.test.ts`. Proof: the cases of the status table in research R3 pass, including damaged and unregistered.
- [ ] T004 [P] Create `src/shared/proposals/contribution-branch.ts`: `contributionBranch(handle, id)`, `parseContributionBranch(name)` (split at the first dot), and `ownsContributionBranch(ownPersonalBranch, name)` with the workbench's case folding. Tests in `tests/proposals-branch-names.test.ts` including a handle that is a prefix of another. Proof: round trip for generated handles and identifiers; `work/alice.p1` is never read as the personal branch of a person named `alice.p1`.
- [ ] T005 Extend `branchShownTo` in `src/server/projects/worktrees.ts` so a person sees their own contribution branches, and nobody else's; keep `isPersonalBranch` unchanged. Add cases to `tests/auth/branch-access.test.ts` and `tests/auth/branch-case.test.ts`. Proof: another person's contribution branch is hidden in local and remote listings; the owner's is shown.
- [ ] T006 Create `src/server/projects/proposal-store.ts`: read and atomically write `state/proposals/<repository>.json` (format 1, unknown format refused as in `src/server/projects/state.ts`), add the `proposals` folder to `DataLayout` in `src/server/projects/paths.ts`. Tests in `tests/proposals-store.test.ts`. Proof: write, reload, unsupported format, interrupted write leaves the old file.
- [ ] T007 Create `src/server/projects/proposal-refs.ts`: `createRef`, `moveRef(id, expectedOld, next)` through `git update-ref` with the expected old value, `closeRef`, `restoreRef`, `removeRef`, `readTip`, and `changedPaths(old, next)` using `--no-renames`. All calls use the Git helper with argument lists and run inside the repository queue (`src/server/projects/git.ts`). Tests in `tests/proposals-refs.test.ts`. Proof: a stale old value fails the swap; renames list two paths; refs live under `refs/workbench/` and `git branch -a` does not show them.
- [ ] T008 Confirm and, if needed, add a read-only variant of `changesBetween` that runs on the repository base checkout, so a promoter without a working copy can be judged (`src/server/projects/scm-remote.ts` `incomingChanges`, `src/server/projects/scm.ts`). Tests in `tests/proposals-promotion-judge.test.ts`. Proof: the variant returns the same changes as the copy-based one for the same two commits and creates no copy.
- [ ] T009 Create `src/server/auth/proposal-access.ts` with the pure decisions of research R5 (which action and which projects each operation needs) and add `authorizeProposal` to `HANDLER_CHECKS` in `src/server/auth/operation-inventory.ts` and to the enum in `schemas/semantic-workbench-operations-v1.json`. Tests in `tests/auth/proposal-access.test.ts` over built-in and custom roles with a branch condition `proposal/*`. Proof: Editor creates and contributes, cannot promote; Steward promotes; a Steward limited to some projects cannot; a role limited to `proposal/*` contributes only there.

**Checkpoint**: pure code, store, refs and decisions exist and are tested; no route, no behaviour change.

## Phase 3: User Story 1 and visibility (P1)

**Goal**: create, list, read; hidden equals missing.

**Independent Test**: `bun test tests/proposals-create.test.ts tests/proposals-visibility.test.ts`.

- [ ] T010 [US1] Create `src/server/projects/proposals.ts` with `create` and `view`/`list`: base is the published tip, refuses when there is no published commit or the open limit (50) is reached, writes the ref first and then the record, and derives each view for a reader (declared projects the reader may read, `changes`, `behindPublished`, `may`). Proof: `tests/proposals-create.test.ts` covers FR-001 to FR-004 and the crash-between-ref-and-record case leaves an unregistered ref that is never shown.
- [ ] T011 [US1] Create `src/server/routes/proposals.ts` with the read routes (list, read, diff) and `create`, register them in `src/server/handler.ts`, and add the rows to `src/server/auth/route-actions.ts` as one block. In local mode every proposal route answers 404 and the interface section is absent. Proof: `tests/proposals-routes.test.ts` answers 201, 400, 403, 409 as in contracts/proposal-routes.md and 404 in local mode; the route-action test lists the new rows.
- [ ] T012 [US7] Hidden equals missing: a person who may read no declared project gets the same status, headers, body and timing class as for a nonexistent proposal, in every operation. Proof: `tests/proposals-visibility.test.ts` compares both answers for each route (FR-005, SC-006).
- [ ] T013 [P] [US1] Emit the `proposal` event from the service through `src/server/projects/events.ts` tagged with the declared projects and filtered by the existing event access. Proof: `tests/proposals-events.test.ts`: a reader of one declared project receives it; a person who reads none does not.

## Phase 4: User Stories 1, 2 and 5 - work, synchronize, contribute (P1, P2)

**Goal**: private contribution branches, compare-and-swap contribution, scope, guards.

**Independent Test**: `bun test tests/proposals-contribution.test.ts tests/proposals-scope.test.ts tests/proposals-concurrency.test.ts`.

- [ ] T014 [US2] Add `work` to the service: create or reuse `work/<handle>.<id>` at the proposal tip and switch the person's copy under the existing switch guards with expected branch and HEAD (`src/server/projects/scm-branches.ts`, `src/server/projects/working-copies.ts`). Proof: a dirty copy is refused and nothing moves; the personal branch is unchanged (FR-007 to FR-009).
- [ ] T015 [US2] Add `synchronize`: merge the proposal tip into the contribution branch with the same guards as pulling the default branch (`mergeDefault` in `src/server/projects/worktrees.ts` is the model); a conflict leaves the merge on the branch and the proposal unchanged (FR-010). Proof: `tests/proposals-sync.test.ts` with a conflicting pair.
- [ ] T016 [US5] Add `contribute`: stale-tip check, descendant check, changed-path owner mapping with the longest-prefix rule, declared-set refusal, per-path `edit` authorization, content guard as the contributor, then the compare-and-swap (FR-012 to FR-017). Proof: `tests/proposals-contribution.test.ts` covers stale tip, non-descendant, authorization and guard refusals; `tests/proposals-scope.test.ts` covers declared, undeclared, project-less and rename-across-boundary paths and the unreadable-project refusal wording.
- [ ] T017 [US2] Add the `work`, `synchronize` and `contribute` routes and rows. Proof: `tests/proposals-routes.test.ts` extended; contribute from a personal branch other than the proposal's contribution branch is refused (FR-009).
- [ ] T018 [US2] Concurrency: 8 simultaneous contributions from one tip, 200 randomized runs (`tests/helpers/seeded-random.ts`), and a contribution racing a promotion. Proof: `tests/proposals-concurrency.test.ts` finds exactly one winner each time and no commit from a personal branch in the proposal (SC-002).
- [ ] T019 [P] [US2] A person with two proposals switches between their contribution branches; each proposal holds only its own work. Proof: `tests/proposals-two-proposals.test.ts`.

**Checkpoint**: proposals can be created and contributed to; nothing reaches the default branch yet.

## Phase 5: User Story 4 - promotion (P1)

**Goal**: atomic promotion with the safeguards of publication.

**Independent Test**: `bun test tests/proposals-promotion.test.ts tests/proposals-recovery.test.ts`.

- [ ] T020 [US4] Add `worktrees.promote(repository, tip, guard)` in `src/server/projects/worktrees.ts` and a `promote` entry in `src/server/projects/publishing.ts` that calls `moveDefault` and `announce`; no second writer of the default ref. Proof: `tests/proposals-promotion.test.ts` shows the publication tests' guards (ancestry, candidate readable, content guard) apply to a proposal tip.
- [ ] T021 [US4] Add `check` and `promote` to the service: authority over every project sharing the repository first, then stale-tip and descendant checks, then promotion; mark promoted, remove the proposal ref, rescan all projects, emit events (FR-018 to FR-025). Proof: partial authority never moves the ref; three projects move together (SC-003).
- [ ] T022 [US4] Guard and validation failures: a metric approval by an Editor, an invalid candidate and an over-limit tree each move nothing and name only readable files. Proof: cases in `tests/proposals-promotion.test.ts`.
- [ ] T023 [US4] Recovery: reconcile at start so a proposal whose tip is contained in the published history becomes promoted, and an interrupted promotion follows the existing intent recovery (FR-022, FR-036). Interrupt at each stage with the `stage` hook of `createPublication`. Proof: `tests/proposals-recovery.test.ts` (SC-005); damaged proposals are listed only to people who may promote.
- [ ] T024 [US4] Add the `check` and `promote` routes and rows. Proof: `tests/proposals-routes.test.ts`; two concurrent promotions, or a promotion racing a publication, produce one winner.

## Phase 6: User Story 6 and 3 - close, restore, and confinement (P2, P1)

- [ ] T025 [US6] Add `close` and `restore` to the service: move the ref between namespaces, keep the record with the outcome, refuse restore on name clash or limit, no operation erases history (FR-026 to FR-029). Proof: `tests/proposals-close.test.ts`; commits stay reachable with `git cat-file`.
- [ ] T026 [US6] Add the `close` and `restore` routes and rows. Proof: `tests/proposals-routes.test.ts`; an author without repository-wide publication authority cannot close.
- [ ] T027 [US3] Create `src/server/projects/work-in-progress-push.ts` and call it from `remoteAction` in `src/server/projects/scm-remote.ts` for push and sync. Update the cases of T001 so work branches are refused with the contract message and the other cases still pass. Proof: `tests/work-in-progress-push.test.ts` (FR-032).
- [ ] T028 [US3] Confinement test: with open and closed proposals containing a unique marker, run every operation in `policies/operation-inventory.json` that reads, plus export, agent context, plan and explain, the published snapshot read and each remote action; search results and the bare remote for the marker; record every push's arguments and assert none names `refs/workbench`, `--all`, `--mirror` or `--tags`. Proof: `tests/proposals-confinement.test.ts` (SC-001, FR-031, FR-033).
- [ ] T029 [P] [US3] Fetch and sync ignore a remote branch named `proposal/x` and create no `refs/workbench/` ref. Proof: case in `tests/proposals-confinement.test.ts`.

## Phase 7: User Story 7 - interface (P2)

**Goal**: list, detail, check and actions in the existing visual design, in every state.

**Independent Test**: `bun run test:proposals`.

- [ ] T030 [US7] Create `src/app/proposals/api.ts` (typed client for contracts/proposal-routes.md) and `ProposalsSection.tsx`, mounted from `src/app/scm/SourceControl.tsx` in server mode only. Proof: component test `tests/proposals-section.test.tsx` renders nothing in local mode.
- [ ] T031 [P] [US7] `ProposalList.tsx` and `CreateProposalDialog.tsx` using `src/app/projects/Modal`; project check boxes limited to what the person may edit; empty, loading, error states. Proof: `tests/proposals-list.test.tsx` for each state.
- [ ] T032 [P] [US7] `ProposalDetail.tsx` and `PromotionCheck.tsx`: changed files per project, the existing `src/app/scm/DiffView.tsx` for one file, check result reasons in plain words, actions shown only when allowed, stale-state refresh. Proof: `tests/proposals-detail.test.tsx`.
- [ ] T033 [US7] `src/app/proposals/proposals.css` using only theme tokens from `src/shared/theme/theme.css`; wrap long names, paths and reasons with no clipping and no ellipsis; phone width with no horizontal scroll. Proof: `bun run check:theme`, `bun test tests/clipped-text.test.ts`-style geometry assertions in `tests/proposals-geometry.test.tsx`.
- [ ] T034 [US7] Live updates: refresh the list and detail on the `proposal` event. Proof: `tests/proposals-section.test.tsx` event case.
- [ ] T035 [US7] Write `scripts/proposals-browser-check.ts` against a mocked API and add `test:proposals` to `package.json`: every state of list, create, detail, check, promote, close, restore at 1280, 768 and 390 pixel widths in light and dark; geometry assertions; screenshots to a printed folder. Proof: the script exits 0 on the dev server (`sw-midgard-run -- bun run test:proposals`).
- [ ] T036 [US1] Extend `scripts/two-editors-check.ts` with the journey: Editor A creates a proposal and contributes, Editor B synchronizes and contributes, a Steward checks and promotes, a Viewer of a sibling project sees the published change only after promotion. Proof: passes on the dev server.

## Phase 8: Gate, inventory and documentation

- [ ] T037 Add the eleven entries to `policies/operation-inventory.json` (handler checks, limits, effects, exposure `workspace-scm`), matrix cases to `policies/matrix-cases.json`, example requests to `tests/auth/route-actions.ts`, and regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts`. Proof: `tests/auth/operation-inventory.test.ts` and `tests/auth/route-actions.test.ts` pass.
- [ ] T038 Add `tests/auth/proposal-parity.test.ts`: each route through HTTP and through the boundary with a twin, for allowed, denied action, denied target, hidden and missing, comparing status, normalized body and audit record. Proof: the table passes.
- [ ] T039 Add `scripts/proposals-mutants.ts` and `scripts/proposals-mutation-cases.ts` and wire them into `scripts/mutation-tests.ts`: skip the stale-tip check, skip the declared-set check, skip the per-path authorization, skip the content guard, authority over only the declared projects, promotion without ancestry, a second writer of the default ref, push rule off, proposal ref pushed. Proof: the baseline passes and every new mutant is detected by `bun run test:mutation` (run on the dev server).
- [ ] T040 [P] Documentation: README (proposals, the push change, limits), `ARCHITECTURE.md` (code map rows, proposal flow), `docs/server-mode.md` (a "Shared proposals" section beside publishing), `docs/user-guide.md`, `docs/development.md` (new suites), `CHANGELOG.md` (the push change is called out). Statement that the guarantee is the application's. Proof: `bun --bun run check` and `bun scripts/check-comments.ts` clean; a docs check lists every limit of the spec.
- [ ] T041 Hand to Codex, with a brief and a fresh worktree of the integrated build: capture the proposal views (list, create, detail, check, promote, close, restore, empty, loading, error, long text) at desktop and phone width in light and dark. Proof: the screenshots and a manifest are returned and reviewed.
- [ ] T042 Hand to Codex the UI regression comparison of the whole app journey against the last release for the batch (the proposals section is the only intended difference). Proof: the comparison index lists the section and no unrequested change.
- [ ] T043 Run this feature's own proofs and fix: `bun test tests/proposals-*.test.ts tests/work-in-progress-push.test.ts tests/auth/proposal-*.test.ts`, `bun --bun run check`, `bun --bun run build`. Proof: all pass on the dev server.
- [ ] T044 Final task: hand off to the batch gate (T045). Record in the pull request: the files of "Shared files it touches" that conflicted at integration and how they were resolved.

## Phase 9: Batch gate (run once on the integrated batch of 012 to 015)

- [ ] T045 Run the full unit suite, `bun --bun run check`, `bun --bun run build`, `bun run test:mutation`, `bun run test:auth`, `bun run test:admin`, `bun run test:two-editors`, `bun run test:proposals` and every browser suite in `scripts/gate-suites.ts`, the UI regression comparison against the last release, then the `architecture-reviewer` on the branch diff and record the review with the skill's marker. Proof: all pass; output in the pull request description.

## Dependencies and order

- Phase 1 first, committed before any `src/` change.
- Phase 2: T003 and T004 are parallel; T005 follows T004; T006, T007 and T008 are independent of each other; T009 follows T003.
- Phase 3 follows Phase 2. Phase 4 follows T010 and T011. Phase 5 follows T016 (needs contributions to promote) and T008.
- Phase 6: T025 and T026 follow T010; T027 to T029 are independent of the service and can start after Phase 1.
- Phase 7 follows T011 (routes exist); T031 and T032 are parallel; T035 follows T030 to T034.
- Phase 8 last; T037 can start after the last route is added (T026).

## Parallel opportunities

Within the feature: T003 with T004; T006 with T007 with T008; T027 to T029 beside Phases 3 to 5; T031 with T032.
Across features: this feature owns different source files from 013, 014 and 015, so all four can proceed
at once; only the shared vocabulary files in the overlap table need a merge at integration.

## Implementation strategy

MVP is Phases 1 to 4 (create and contribute) with the push rule (T027), which is independently useful and
safe. Promotion (Phase 5) completes the feature. The interface (Phase 7) can start as soon as the routes
of Phase 3 exist, using the mocked API.

## Traceability

| Requirement group | Tasks |
| --- | --- |
| FR-001 to FR-006 proposals, scope, visibility | T003, T010 to T013 |
| FR-007 to FR-011 contribution branches | T004, T005, T014, T015, T019 |
| FR-012 to FR-017 contribution | T007, T016 to T018 |
| FR-018 to FR-025 promotion | T008, T020 to T024 |
| FR-026 to FR-030 close, restore, audit | T025, T026 |
| FR-031 to FR-034 confinement and push rule | T001, T027 to T029, T040 |
| FR-035 to FR-038 recovery and concurrency | T006, T018, T023 |
| FR-039 to FR-041 interface | T030 to T036, T041 |
| FR-042 to FR-046 inventory, mutants, docs | T009, T037 to T040 |
