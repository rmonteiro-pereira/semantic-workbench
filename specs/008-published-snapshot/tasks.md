# Tasks: Published Snapshot

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: none blocking. The constitution amendments named in the plan (Principle I agent
bullet, Principle IV state list) are drafted on `constitution-tessera`; the code does not wait for
them, and the docs tasks T039-T041 cite the principles by name.

Every task carries its proof: the test, mutant, browser check or capture that shows it works. Tests
live flat under `tests/` like the existing ones; authorization cases go in `tests/auth/`. Test names
are plain sentences. Comments in the code follow Principle VIII: plain English, no IDs.

## Format: `[ID] [P?] [Story] Description (proof)`

- **[P]**: can run in parallel with other [P] tasks of the same phase (different files).
- **[Story]**: the user story it serves. Foundation and polish tasks carry none.

## Phase 1: Git primitives and fixtures

- [x] T001 [P] Add `lsTree(cwd, rev, prefix)` returning path, blob id and size, `catFileBatch(cwd, ids)` returning bytes by id with the size limits applied before the read, `isAncestor(cwd, ancestor, descendant)`, `peelTag(cwd, name)` and `revParse(cwd, ref)` to `src/server/projects/git.ts`, all through the existing serialized queue with argument lists. (proof: `tests/git-objects.test.ts` against a real fixture repository: paths with spaces and non-ASCII, a blob above the limit, a missing object, an annotated and a lightweight tag, an unborn repository)
- [x] T002 [P] Add fixtures to `tests/helpers/git-fixtures.ts`: a repository with a published history, an authoring branch ahead, another person's personal branch with an unpublished commit, a repository with no commit on its default branch, a repository whose default branch moved with plain Git, and one whose default branch was reset to a non-descendant. (proof: used by every test below; the fixture's own test asserts each shape with `git rev-parse` and `merge-base --is-ancestor`)
- [x] T003 [P] Add `SnapshotUnavailableError` (reason `no-git`, `no-commit` or `unavailable`) and `SnapshotUnreadableError` to `src/server/projects/errors.ts` and map them in the request error handler: the first to 409 with the body of the HTTP contract, the second to 422. (proof: `tests/api-validation.test.ts` gains two cases that assert status and body)

## Phase 2: Foundation (blocks every story)

- [x] T004 Write `src/server/projects/published-pointer.ts`: the pointer types, `classify(ref, pointer, isAncestor)` as a pure function over the transitions in the data model, and the state-file edge that reads and writes `published.json` atomically with the existing state mechanism. Register the file in `src/server/projects/state.ts`. (proof: `tests/published-pointer.test.ts` covers every transition row including intent completed, intent dropped, diverged and a damaged file that is not rebuilt from a working tree; mutant: classify a diverged ref as a fast-forward)
- [x] T005 [P] Write `src/server/projects/publication-checks.ts` with `PublicationCheck`, `publicationChecks(deps)` and the three members in order: fast-forward, tree readable and bounded, content guards (reusing `judgePublish` for server mode). (proof: `tests/publication-checks.test.ts`: each check refuses alone, the order is asserted, a later added check runs after the three; mutants: skip the fast-forward check, skip the bounds check, reorder the guard before the bounds check)
- [x] T006 [P] Write `src/server/projects/snapshot-index.ts`: build one immutable index for (repository, commit, folder digest) with T001, `indexBytes` for validation, the three limits of FR-036, a refusal of case-variant paths, and one shared build per key. (proof: `tests/snapshot-index.test.ts`: byte-exact sources equal the blobs, ignored-but-tracked files appear, untracked and dirty files do not, each limit raises `SnapshotUnavailableError`, 20 concurrent callers cause one build; mutant: read the working file instead of the blob)
- [x] T007 Write `src/server/projects/published-snapshot.ts`: `createPublishedSnapshots(deps)` with `pin`, `withPin`, `documents`, `fileBytes`, `documentsAt`, `resolveRevision`, `isReadableRevision`, `status`, `retainedCount`, the retention rule and folder-digest keying, per the resolver contract. The document shape equals the editing view's. (proof: `tests/published-snapshot.test.ts`: a pin keeps its commit across a pointer move, retention never exceeds current plus previous plus pinned after 50 moves, a registry change gives a new index, `documentsAt` rebuilds or refuses; mutants: ignore the pin and read the current pointer, keep every snapshot, key without the folder digest)
- [x] T008 [P] Write `src/server/auth/request-surface.ts`: `requestSurface(request)` returns `browser` for a session cookie in server mode and for a local request with `Sec-Fetch-Site` of `same-origin` or `same-site` and an allowed `Origin` when present; `agent` for everything else. (proof: `tests/request-surface.test.ts` table of credentials and headers in both modes; mutant: treat a missing `Sec-Fetch-Site` as browser)
- [x] T009 Compose the resolver in `src/server/projects/workspace.ts` and expose `ws.published`. Initialize pointers at start: server mode records each repository's default-branch tip when the base is clean; local mode determines and records the default branch name by the three-step rule, records its tip and sets the first-run notice flag. (proof: `tests/published-initialization.test.ts`: server start on the fixture changes no reader's output; local start on the upgrade fixture records the tip and the flag; a second start records nothing new; a repository without commits records no pointer)
- [x] T010 Make `moveDefault` in `src/server/projects/worktrees.ts` write the intent, run `publicationChecks`, swap the ref, record the commit and clear the intent; call the resolver's supersede and keep `announce` in `publishing.ts` sending the `published` event. Reconcile intents at start next to `repairBase`. (proof: `tests/publishing.test.ts` extended: a stop injected after the intent, after the ref and after the pointer each recovers as the data model says; mutant: write the pointer before the intent check)

**Checkpoint**: the resolver reads published commits in both modes and no route uses it yet.

## Phase 3: User Story 1 - Agents plan only from published definitions (P1) - MVP

**Goal**: FR-018, FR-021-FR-026, FR-031. **Independent test**: server mode with an unpublished edit
and local mode with uncommitted work; agent routes answer from the snapshot.

- [x] T011 [US1] Add `readSource` to the route inventory type in `src/server/auth/route-actions.ts`, declare it on the three agent rows (`published`), the metrics rows (`by-surface`) and every row that returns context, plan, explanation or document content, and fail the inventory test when a row of that kind has none. (proof: `tests/auth/route-actions.test.ts` gains the completeness case; mutant: drop one declaration)
- [x] T012 [US1] Extract the agent route group from `src/server/handler.ts` into `src/server/routes/agent.ts` without changing behaviour, behind one function that takes the document source. (proof: the existing `tests/agent-api.test.ts`, `tests/agent-context-kinds.test.ts`, `tests/agent-paths.test.ts` pass unchanged; `handler.ts` loses the agent code)
- [x] T013 [US1] Make the agent routes read `ws.published` under `withPin`: documents come from the snapshot, then the caller's view filters them; a mapping absent from the snapshot answers as an unknown mapping; add the `X-Workbench-Snapshot` header; raise `SnapshotUnavailableError` only after the readable check. (proof: `tests/agent-sources.test.ts`: person with an unpublished edit equals the application byte for byte on catalog, context and plan, in server mode and local mode; the WIP-only mapping is unknown; header equals the pin; mutant: use `documentsFor` in the agent group)
- [x] T014 [P] [US1] Equivalence cases in `tests/auth/matrix.test.ts`: unknown project, unreadable project and unreadable project without a snapshot answer identically for every role; a readable project without a snapshot answers 409 with the contract body. (proof: the matrix test; mutant: raise the unavailable error before the readable check)
- [x] T015 [P] [US1] Make `by-surface` rows in `src/server/routes/metrics.ts` choose the editing view for `browser` and the snapshot otherwise, through one small function in the routes layer. (proof: `tests/metrics-surface.test.ts`: a browser request shows an unpublished metric, an agent-surface request does not; mutant: always editing)
- [x] T016 [P] [US1] Log the snapshot commit on agent reads in the structured request log (`src/server/observability/http-request.ts` receives it from the route) without adding content, paths or project names. (proof: `tests/observability/request-log.test.ts` asserts the field and the redaction test still passes)
- [x] T017 [US1] Keep application grants exactly as they are: an application with `agentRead` reaches the same routes and leaves the same audit records as before, and gains no route. (proof: `tests/auth/matrix.test.ts` compares the application's allowed set with a fixed list; `tests/audit.test.ts` asserts the unchanged record shape)

**Checkpoint**: US1 delivers E5 for both modes whenever a pointer exists.

## Phase 4: User Story 2 - Local mode has a snapshot and a Publish step (P1)

**Goal**: FR-009-FR-014, FR-042. **Independent test**: the upgrade fixture of quickstart.

- [x] T018 [US2] Write `src/server/projects/local-publication.ts`: `moveToAuthoringBranch` (switch -c `work/local`, carrying staged and unstaged changes; reuse an existing `work/local` that contains HEAD; ask for a branch on a detached HEAD or when `work/local` has diverged), `publishLocal` (fast-forward, non-empty, checks, compare-and-swap, working tree untouched), first publication from an unborn default branch. (proof: `tests/local-publication.test.ts`: carried changes and the index survive the switch, the default ref moves and the files do not, refusals name the fix, unborn default is created, two concurrent publishes let one win; mutants: skip compare-and-swap, drop carried changes)
- [x] T019 [US2] Wire the local commit path: in local mode a commit with the default branch checked out calls `moveToAuthoringBranch` first, and the commit response reports the branch. In `src/server/routes/git.ts` and `src/server/projects/scm.ts`. (proof: `tests/commit-availability.test.ts` and a new `tests/local-commit-branch.test.ts`: a commit on another branch is unchanged; mutant: commit on the default branch)
- [x] T020 [US2] Let `ws.publish` and the `git/publish` route serve local mode through `publishLocal` with the same authorization call, send the `published` event in local mode, and make every publication's audit record carry the previous and new commit, server mode included. (proof: `tests/audit.test.ts` asserts both commits on a server and a local publication; `tests/publishing.test.ts` local cases; `tests/auth/matrix-write.test.ts` shows the local principal allowed and a refused role unchanged)
- [x] T021 [US2] Add the `published` block to `git/status` in `src/server/projects/scm.ts` and the first-run notice flag to the status the browser reads (shown once, cleared by an explicit acknowledgement that writes to the person's view state, not to Git). (proof: `tests/scm-published-status.test.ts`: in sync, ahead, pending, none with each reason, the notice shown once)
- [x] T022 [P] [US2] Source Control UI: show `Published: <branch> @ <short commit>`, the ahead and behind of the person's branch, the pending move, the Publish action in local mode (label "Adopt" for an outside move) and the one-time notice, in `src/app/scm/`. Keep the existing components' layout; add one row and one action. (proof: `scripts/published-snapshot-browser-check.ts` against a mocked API for local and server mode; geometry assertions across the responsive viewport matrix; capture and comparison through T046)
- [x] T023 [US2] Remote-ahead handling in local mode: Source Control reports a remote default branch that is ahead, and nothing fetches in the background. (proof: `tests/local-publication.test.ts` case with a bare remote; the existing "no background network" listener test still passes)

## Phase 5: User Story 3 - A consumer is never changed underneath its request (P1)

**Goal**: FR-019, FR-020, FR-032, FR-034-FR-038.

- [x] T024 [US3] Interleaving stress test: at least 200 agent calls against at least 20 publications in one process; every response's documents all come from the commit in its header. (proof: `tests/published-snapshot-stress.test.ts`; mutant: take the pin per read instead of per request)
- [x] T025 [P] [US3] Revision provenance tests through `resolveRevision` and `documentsAt`: full id in history accepted; abbreviated id, branch name, a commit only on a personal branch, one only on a proposal-style branch, a blob id and a tag outside history refused identically; a tag inside history accepted; sha-256 length ids accepted. (proof: `tests/snapshot-provenance.test.ts`; mutants: accept any reachable-from-any-ref commit, accept branch names)
- [x] T026 [P] [US3] Registry-change and eviction tests: add, remove and move a project between two pins; objects removed after eviction give `unavailable`; a registry change needs no restart. (proof: `tests/published-snapshot.test.ts` additions)
- [x] T027 [P] [US3] Build limits and failure modes: each limit, a missing blob (partial clone), a case-variant pair and a Git timeout give `unavailable` and never a partial answer. (proof: `tests/snapshot-index.test.ts` additions)

## Phase 6: User Story 4 - The author's preview stays in the workbench (P2)

**Goal**: FR-027-FR-030.

- [x] T028 [US4] Add `/api/preview/catalog`, `/api/preview/context` and `/api/preview/plan` to `src/server/routes/agent.ts` with the editing source and a surface guard that answers an `agent` surface as an unknown route; add the rows to the inventory (`readSource: 'editing'`), the audit exemptions that mirror the agent rows, and the authorization matrix. (proof: `tests/auth/matrix.test.ts` with application, session and local-without-origin; mutant: remove the surface guard)
- [x] T029 [P] [US4] Frontend: change `src/app/mappings/agent-paths.ts` and `src/app/projects/api.ts` to the preview paths, and show the preview label with the published commit in `src/app/mappings/MappingExplorer.tsx`, reading the commit from the status block. (proof: `tests/agent-paths.test.ts` updated; browser check asserts the label text and that the plan includes an unpublished edit; capture comparison through T046)
- [x] T030 [P] [US4] Local guardrail test and note: a local request without `Sec-Fetch-Site` is refused by the preview routes; one with it is served; the dev server on a different port still works. (proof: `tests/request-surface.test.ts` and the browser check run against the Vite dev origin)

## Phase 7: User Story 5 - Outside Git changes need adoption (P2)

**Goal**: FR-015-FR-017, FR-041. Includes interrupted publication.

- [x] T031 [US5] Pending-move detection: compare the default ref with the pointer on Git change events and on status requests, cache until the next event, and report fast-forward or diverged with the commit count. (proof: `tests/published-pointer.test.ts` and `tests/scm-published-status.test.ts`; mutant: serve the new ref while pending)
- [x] T032 [US5] Add `POST /api/projects/:slug/git/adopt` in `src/server/routes/git.ts` with the publish authorization, the check list, the audit record and the `published` event; local mode by explicit action; diverged and empty refusals as the contract. Add it to the inventory and the matrix. (proof: `tests/adopt-published.test.ts` and matrix rows: fast-forward adopted, diverged refused, no right refused as publish is, nothing pending refused, audit record has both commits; mutants: skip the guard check, adopt a diverged move)
- [x] T033 [P] [US5] Record refused adoptions in the audit log with the reason. (proof: `tests/audit.test.ts` addition; the audit chain verification still passes)
- [x] T034 [US5] Start-up reconciliation for outside moves and intents, with an interrupted-publication matrix (stop after intent, after ref, after pointer, plus an outside move during the stop). (proof: `tests/publishing.test.ts` additions; SC-006 numbers recorded in `verification.md` at the end)

## Phase 8: User Story 6 - History reads cannot reach unpublished commits (P2)

**Goal**: FR-033.

- [x] T035 [US6] Make `show` and `versions` in `src/server/projects/scm.ts` accept a commit only when `isReadableRevision(revision, head)` passes, answering as a missing commit otherwise; `log` and `diff` unchanged. (proof: `tests/snapshot-history.test.ts`: two editors, A cannot read B's unpublished commit by id; published commits and own commits still read; mutant: skip the check; the existing history tests pass)
- [x] T036 [P] [US6] Matrix row for `git/show` and `git/versions` with a foreign personal commit id. (proof: `tests/auth/matrix.test.ts`)

## Phase 9: User Story 7 - Download exactly what is published (P3)

**Goal**: FR-039.

- [x] T037 [US7] Add `source` to `ws.exportProject` and the export route; feed the zip planner the snapshot's paths and bytes for `published`; refuse `history=1` with it; keep the default. (proof: `tests/snapshot-export.test.ts`: published zip equals the blobs and has no draft, default zip unchanged byte for byte, history refused; the existing export tests pass; mutant: export working files for `published`)
- [ ] T038 [P] [US7] Export dialog option in the UI: "Published" next to the default, only when a snapshot exists. (proof: browser check; capture through T046)

## Phase 10: Documentation, measurement and gates

- [ ] T039 [P] Update `README.md`: the definition of published, both modes, the local Publish step and `work/local`, the guardrail limit, the migration list and what is not covered. Counts come from tests. (proof: docs-sync check passes; `documentation-reviewer` pass before the pull request)
- [ ] T040 [P] Update `ARCHITECTURE.md`: replace "Reads use the published checkout" with the snapshot rule, add the resolver, pointer and checks to the module map, and the publication flow. (proof: docs-sync check)
- [ ] T041 [P] Update `docs/server-mode.md` ("Personal working copies and publishing": snapshot, adoption, outside moves, non-fast-forward limit), `docs/agent-runtime.md` (published-only context, the header, the 409, the preview routes are not for agents), `docs/user-guide.md` (Publish in local mode, preview label, notice) and `docs/configuration.md` (the new state file). (proof: docs-sync check; every changed doc cites no task or requirement IDs)
- [ ] T042 [P] Add the migration table and the user-visible changes to `CHANGELOG.md` under the next version. (proof: docs-sync check)
- [ ] T043 Targeted mutants: add the cases named in T004-T037 to `scripts/snapshot-mutation-cases.ts` and `scripts/snapshot-mutants.ts`, and register them in `scripts/mutation-tests.ts`. (proof: `bun run test:mutation` passes the baseline and detects every mutant)
- [ ] T044 Performance measurement: warm and cold agent catalog, context and plan on `examples/` workspaces, before and after, with the command and fixture recorded; compare against the 10% budget. (proof: numbers written to `verification.md`; docs quote only those numbers)
- [ ] T045 Browser check `scripts/published-snapshot-browser-check.ts` against a mocked API: the Mappings preview label, Source Control published block, Publish and Adopt in local mode, the notice, the export option; add it to the pipeline matrix and `package.json`. (proof: the script passes; geometry assertions pass)
- [ ] T046 UI regression gate: capture the whole app journey on the last release and on this branch in both modes, every graph state included, through Codex per the capture workflow; classify every difference; fix or revert each unrequested one. (proof: the comparison index and findings file are attached to `verification.md`)
- [ ] T047 Full gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:mutation`, affected browser suites and `test:auth`. (proof: green runs recorded in `verification.md`)
- [ ] T048 Architecture review once before the pull request, then record it with the skill's marker. (proof: the reviewer's verdict; ranked fixes applied)

## Dependencies and order

- Phase 1 then Phase 2. T004 blocks T009 and T010; T006 blocks T007; T007 blocks T009 and every story.
- US1 (Phase 3) is the MVP and needs only Phase 2. US2 needs T009 and T018. US3 tests need T007.
  US4 needs T012 and T013. US5 needs T010 and T032. US6 needs T007. US7 needs T007.
- Within a phase, [P] tasks touch different files and can run together.
- Docs tasks (T039-T042) follow the behaviour they describe.

## Traceability

| Decision or finding | Requirement | Task |
|---|---|---|
| E4 snapshot in both modes | FR-001-FR-008 | T004, T006, T007, T009 |
| E4 separate authoring branch, explicit publication step | FR-009-FR-014 | T018-T022 |
| E4 publication needs authorization and validation | FR-005, FR-007, FR-017 | T005, T010, T020 |
| E4 external changes validated before serving | FR-015, FR-016 | T031, T032, T034 |
| E4 no fallback without a commit or Git | FR-006 | T003, T013, T014, T027 |
| E5 agents plan from the snapshot, own agent included | FR-025, FR-026, FR-031 | T011, T013, T015 |
| E5 browser previews remain | FR-027-FR-030 | T008, T028-T030 |
| E11 not changed underneath; fail closed | FR-019, FR-020, FR-034-FR-038 | T006, T007, T024, T026, T027 |
| E11 pins only to published history | FR-032 | T025, T007 |
| Fable B1 / Astra B3 | FR-018, FR-025, FR-032, FR-033 | T012, T013, T025, T035 |
| M7 grants keep meaning, history separate | FR-021, FR-025 | T013, T014 |
| M16 snapshot version in identity | FR-001, FR-020, FR-021 | T007, T013 |
| M17 unavailable result defined | FR-006, FR-023 | T003, T014 |
| M18 published context and plans in first MCP release | FR-018, FR-026 | T011, T013 |
| E10 cache by snapshot, filter by caller | FR-022-FR-024, FR-034 | T006, T007, T014 |
| E16 never branch-only WIP in exports | FR-039 | T037 |
| Observability and audit | FR-040-FR-042 | T016, T020, T032, T033 |
| Principle VII honest claims | FR-030, FR-043 | T039-T042, T044 |
| Spec success criteria | SC-001-SC-012 | SC-001 T013; SC-002 T043; SC-003 T024; SC-004 T009, T013; SC-005 T014; SC-006 T034; SC-007 T025, T035; SC-008 T044; SC-009 T007; SC-010 T045, T046; SC-011 T039-T042; SC-012 T014, T027 |
