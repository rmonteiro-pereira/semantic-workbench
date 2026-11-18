# Tasks: Compile Everywhere

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/](./contracts/)

**Prerequisites**: feature 011 on the base (it is). Feature 006 on the main branch for Phase 6. Feature
016 for the status counts and the metric conversion (optional and Phase 7). Ossie 0.3.0 released for
Phase 7.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours. Every code task ends with its own targeted test green and
the formatter applied. No task edits an existing test only to make it pass.

**Process (owner-approved 2026-11-17)**: run only the feature's own tests, `bun --bun run check` and
`bun --bun run build`. The full unit suite, mutation tests, every browser suite, the UI regression
comparison and the architecture review run once on the integrated batch (T040). Heavy runs use
`sw-midgard-run -- <command>`. Tasks marked [CODEX] are screenshot or browser-driving work handed to
Codex from a fresh worktree of the current main, with a temporary data folder and a spare port.

## Phase 1: Fixtures

- [x] T001 [P] [US1] Build `tests/fixtures/compile/` and a helper `tests/helpers/compile-workspace.ts`: a workspace with a published project holding a Tessera ontology with notes at several places, a standard semantic model with a `SEMANTIC_WORKBENCH` entry, a mapping and an ODCS file; a second project with no snapshot; a role set (viewer, editor, steward) and one hidden file case. Proof: `bun test tests/compile/fixture.test.ts` shows the published commit holds exactly the committed bytes and the working copy differs.
- [x] T002 [P] [US1] Record the command line's bundle for the fixture commit as golden files in `tests/fixtures/compile/golden/` using `bun run tessera compile`. Proof: `bun test tests/compile/golden.test.ts` regenerates and compares.

## Phase 2: Pure decisions

- [x] T003 [P] [US1] Create `src/server/tessera/accept-loss.ts`: given a loss report, an acceptance (digest or inline policy) and the failure list, return `accepted`, `needs-acceptance` or `refused`; reuse the policy parser of `src/shared/tessera/loss-report.ts`; failures are never acceptable (FR-009, FR-010). Proof: `bun test tests/compile/accept-loss.test.ts` covers a matching digest, a stale digest, a policy that allows all losses, one that misses one, a schema failure with a valid digest, and the empty report.
- [x] T004 [P] [US4] Create `src/server/tessera/output-part.ts`: return a bounded part of a compiled file for `{ commit, path, offset }` with the file's version and the next offset, splitting only at character boundaries, 32,768-byte limit (FR-014, FR-015); `commit` is required. Proof: `bun test tests/compile/output-part.test.ts` covers an exact multiple, a multi-byte character at a boundary, an offset past the end, a commit mismatch and no truncation across a full walk.

## Phase 3: Check and compile service and routes (User Stories 1 and 2)

- [x] T005 [US2] Create `src/server/tessera/unit-source.ts` with `published` (pinned snapshot via `snapshots.withPin`, project folder, limits checked before blobs) and `working` (the caller's saved working copy through `copies.readPlace`, labelled unpublished); every file of the unit must be readable by the reader or the read fails with the missing-file answer (FR-001, FR-003, FR-005, FR-007, FR-012). Expose what it needs in `src/server/projects/workspace.ts`. Proof: `bun test tests/compile/unit-source.test.ts` covers unpublished edits and a personal branch (absent from `published`), a hidden file (same answer as missing, no name leaked), no snapshot, an over-limit file refused before reading, and that `working` is labelled unpublished.
- [x] T006 [US1] Create `src/server/tessera/compile-service.ts` with `check`, `run` and `bundle`: call `compileUnit`, `accept-loss` and `output-part`; `run` finishes on the commit it pinned; `commit` argument mismatch gives snapshot-changed; `check` returns no compiled bytes (FR-002, FR-008, FR-011, FR-013, FR-014). Proof: `bun test tests/compile/compile-service.test.ts` compares each result with the golden bundle of T002 and checks that `check` returns no `part` or bytes and that the files on disk are unchanged after it (byte comparison of the project, the working copy and the data folder).
- [x] T007 [US1] Create `src/server/routes/compile.ts` with the four routes of `contracts/http-operations.md`, register it in `src/server/handler.ts`, add the four rows to `src/server/auth/route-actions.ts` (`read`, `export` audited, `export` audited, `edit`), add four entries to `policies/operation-inventory.json` (limits, effects, `authorizeWrite` for convert, exposure as in the contract), and regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts` (FR-004, FR-006, FR-011, FR-012). Proof: `bun test tests/auth/operation-inventory.test.ts tests/auth/route-actions.test.ts tests/compile/routes.test.ts` pass; the route test checks status mapping, the zip headers, the pre-stream refusals and the export size limit.
- [x] T008 [P] [US2] Add matrix and parity cases in `policies/matrix-cases.json` and `tests/auth/compile-parity.test.ts`: viewer, editor, steward, admin, an application identity and a hidden file, over HTTP and through `operate` with a twin, comparing status, normalized body and audit record; hidden and missing identical (FR-004, FR-006, FR-007). Proof: `bun test tests/auth/compile-parity.test.ts tests/auth/matrix.test.ts` pass; removing the unit-completeness check makes the hidden case fail.
- [x] T009 [US1] Write the determinism and equality test `tests/compile/browser-and-cli.test.ts`: the zip from `compile.bundle` and the bundle from `bun run tessera compile` have equal hashes for every file; two concurrent compiles give equal bytes; a publish during a compile does not change the manifest's commit (FR-011, FR-013; SC-001). Proof: the test passes.
- [x] T010 [P] [US1] Write the scale test `tests/compile/compile-scale.test.ts` (200 documents, 20 MB) and run it with `sw-midgard-run -- bun test tests/compile/compile-scale.test.ts`; record the measured time in `docs/development.md` (SC-007). Proof: the test passes and the documentation names the measured numbers.

**Checkpoint**: check and compile work over HTTP. MVP.

## Phase 4: Browser dialog (User Stories 1 and 2)

- [x] T011 [US1] Create `src/app/compile/api.ts` and `src/app/compile/use-compile.ts`: calls the routes and exposes the states unavailable, loading, nothing-to-do, refused, loss-needs-acceptance, released and error with retry; the accept action sends the digest of the displayed report (FR-026, FR-028). Proof: `bun test tests/compile/use-compile.test.tsx` covers each state and that a digest change after acceptance is refused and re-shown.
- [x] T012 [US1] Create `src/app/compile/LossPreview.tsx` and `compile.css`: losses grouped by property with counts first, each group opens a list of document and item address, digest in a wrapping block, status counts when the report has them, no lost values (FR-027, FR-029). Proof: `bun test tests/compile/loss-preview.test.tsx` checks groups, counts, wrapping classes (no `text-overflow`, no `line-clamp`, no `overflow: hidden` on text), status text without colour, and long names.
- [x] T013 [US1] Create `src/app/compile/CompileDialog.tsx` using `Modal`; add the "Standard Ossie" option in `src/app/projects/ExportDialog.tsx` and the "Check as standard Ossie" button in `src/app/validation/ValidationPanel.tsx` for Tessera documents; the source choice (published, working copy) is shown with the unpublished label (FR-003, FR-025, FR-026, FR-030). Proof: `bun test tests/compile/compile-dialog.test.tsx tests/tessera/validation-panel.test.tsx` pass; the panel shows no new button for a standard document; the dialog names the base label and says accepting is not approval (FR-016); every action is reachable and operable by keyboard with an accessible name (FR-029).
- [x] T014 [US1] Write `scripts/compile-browser-check.ts` and add `test:compile` to `package.json` and `scripts/gate-suites.ts`: with the isolated API helper, open the dialog on the fixture, review, accept, download, validate the zip, check no horizontal scroll at phone width, and that the project files did not change. Must not touch the real workspace. Proof: `sw-midgard-run -- bun run test:compile` passes.
- [ ] T015 [CODEX] [US1] Capture the dialog in every state (unavailable, loading, nothing to do, refused, loss needs acceptance with 1 and with 200 losses, released, error) and the export dialog and validation panel entry points, in light and dark themes at phone and desktop width, from a fresh worktree of main with a temporary data folder and a spare port; compare every existing screen against the last release. Deliverables: screenshots, a manifest and a findings file in the output folder named in the brief. Proof: the findings file lists no clipped text, no contrast failure and no difference on existing screens; the judgement of the screenshots stays with the orchestrator.

## Phase 5: Convert to standard (User Story 3)

- [x] T016 [US3] Create `src/server/tessera/convert-service.ts`: preconditions (Tessera ontology, file clean against the branch commit, history present), recompute the unit's input hashes and loss digest in the working copy, verify the unit still validates and compiles with this file standard, then save the compiled bytes through `documentSave` with the request's `baseHash`; no commit, push or publish (FR-017 to FR-022). Proof: `bun test tests/compile/convert-service.test.ts` covers success, a dirty file, a stale base hash, a changed sibling file, a digest mismatch, a project with no history, a unit that would fail after conversion, a content guard refusal, and that exactly one file changed and equals the bundle's file.
- [ ] T017 [US3] Wire `compile.convert` into `src/server/routes/compile.ts`; add parity cases for editor allowed and viewer refused to `tests/auth/compile-parity.test.ts`; check the audit log holds one save record. Proof: `bun test tests/auth/compile-parity.test.ts tests/compile/routes.test.ts` pass.
- [ ] T018 [US3] Create `src/app/compile/ConvertDialog.tsx` and the "Convert to standard" button in `ValidationPanel.tsx` (offered only with edit rights): loss preview, before-and-after through the existing `src/app/scm/DiffView.tsx`, the plain warning, an explicit confirm (FR-018, FR-023, FR-025). Proof: `bun test tests/compile/convert-dialog.test.tsx` covers the states, the warning text, the absence of the button for a reader, and long paths wrapping.
- [ ] T019 [US3] Extend `scripts/compile-browser-check.ts` with the conversion journey and add `scripts/compile-mutants.ts` and `scripts/compile-mutation-cases.ts`: mutants for acceptance matching, published-only selection, unit completeness, conversion preconditions and part paging; wire into `scripts/mutation-tests.ts` (SC-009). Proof: `sw-midgard-run -- bun scripts/compile-mutants.ts` kills every mutant (full mutation run is the batch gate).
- [ ] T020 [CODEX] [US3] Capture the convert dialog states and the converted file's editor view in both themes at phone and desktop width, as in T015. Proof: findings file as in T015.

## Phase 6: MCP tools (User Story 4)

Needs feature 006 on the main branch.

- [ ] T021 [US4] Create `src/server/mcp/tools/standard-output.ts` with `check_standard` and `compile_standard` as in `contracts/mcp-tools.md`; add them to `src/server/mcp/tool-registry.ts`; reuse `src/server/mcp/tool-results.ts` helpers, `findingsOf`, and paging by `nextOffset` (FR-031 to FR-034, FR-037). Proof: `bun test tests/mcp/standard-output.test.ts` calls both through the MCP test client against the fixture and compares each answer with the twin HTTP operation.
- [ ] T022 [US4] Add the two tool rows and the disposition rows to `docs/mcp-contract.md`, update the tool count and the table in `docs/mcp.md`, and run the 006 contract test. Proof: `bun test tests/mcp/` (the contract and registry tests only) passes; a deliberate missing row makes it fail.
- [ ] T023 [US4] Extend `tests/mcp/standard-output.test.ts` with: compile without a digest returns report and digest and no content; with the digest a file is read in parts; a publish between pages answers `version_changed`; an unpublished project answers `not_published`; a hidden file answers `not_found`; check of a working copy is labelled unpublished and holds no bytes; no convert tool exists; hints are read-only; neither tool ever supplies a digest itself; a part read without `commit` is refused; with the endpoint not mounted (server mode) neither tool is reachable (FR-032, FR-034 to FR-036). Proof: the test passes.

## Phase 7: Adopt Ossie 0.3.0 (User Story 5) - conditional

Do not start until T024 reports a release.

- [ ] T024 [US5] Check whether Ossie 0.3.0 is released: `gh api repos/apache/ossie/releases`, `gh api repos/apache/ossie/tags` and the upstream core schema's `version`. On 2026-11-17 neither list holds 0.3.0 (the only tag is `osi-0.1.1-rc1`). Record the date, the command output and the result at the top of `docs/ossie-0.3-inventory.md`. If not released, stop here: leave T025 to T033 open and keep every claim about 0.3.0 out of the documents. Proof: the file records the check.
- [ ] T025 [US5] Write `docs/ossie-0.3-inventory.md`: what the release changed that the workbench reads (document schemas, expression forms, dataset-scoped metrics, mapping rules, extension slots), and for each change the test that will cover it (FR-042). Proof: every row names a test file; reviewed before T026.
- [ ] T026 [US5] Store the released schemas unmodified in `schemas/` with provenance (source address, release identifier, retrieval date, SHA-256) in `schemas/README.md`, and add a hash test `tests/tessera/pinned-schema-hashes.test.ts` (FR-038). Proof: the test passes and fails when a schema byte changes.
- [ ] T027 [US5] Add the base-table entry in `src/shared/tessera/bases.ts` (label without "draft", draft false), run the collision check, regenerate `schemas/tessera-ontology-<revision>-ossie-0.3.0.json` for each supported revision with `bun scripts/derive-tessera-schema.ts`, wire it in `scripts/compile-schemas.ts`, and run `bun run schemas:compile` (FR-039, FR-040). Proof: `bun test tests/tessera/bases.test.ts tests/tessera/schema-derivation.test.ts` pass, including a collision failure for the synthetic colliding fixture.
- [ ] T028 [US5] Validation of 0.3.0 documents: schema selection by declared version, the structural expression rules at the lines named in the inventory (`src/shared/validation/validation.ts`), mapping and semantic-model validators, with fixtures in `tests/fixtures/ossie-0.3/` (FR-041, FR-045). Proof: `bun test tests/validation*.test.ts tests/tessera/` for the new fixtures; no "not validated" notice; the 0.2 fixtures are unchanged (`tests/tessera/standard-unchanged.test.ts`).
- [ ] T029 [US5] Expression and planner support for the changes the inventory lists, in `src/server/agent/query-plan.ts` and the shared SQL modules, each change with a deterministic planner fixture. Proof: `bun test tests/agent-*.test.ts` for the new cases; every inventory row has a passing test.
- [ ] T030 [US5] Compile with the new base (no compiler logic changes; the base table drives the label and schema): the compiler keeps the declared version and labels output with the new base; add a compile fixture for a 0.3.0 Tessera ontology and a standard 0.3.0 model, with golden files. Proof: `bun test tests/tessera/compile.test.ts tests/compile/golden.test.ts` pass for both bases.
- [ ] T031 [US5] Explicit conversion 0.2 to 0.3: a preview of every change, base hashes, a clean committed file as backup, nothing applied without confirmation, built on the conversion pipeline of Phase 5 and the dialog of T018 (FR-043). Proof: `bun test tests/compile/base-conversion.test.ts` covers preview, confirm, stale hash and dirty file.
- [ ] T032 [US5] Reviewed conversion of metric payloads (waits for feature 016's adapter): convert `SEMANTIC_WORKBENCH` payloads to the form the inventory names, preserve unrelated vendor entries and mapping bindings, map legacy `draft` to `proposed` and never to `approved`, with a preview, base hashes and rollback through Git (FR-044). Proof: `bun test tests/compile/metric-conversion.test.ts` covers the mapping of every status, a mapping binding, two vendors in one file, and a refusal when it would approve.
- [ ] T033 [CODEX] [US5] Capture the interface labels for 0.3.0 documents and the conversion preview in both themes at phone and desktop width. Proof: findings file as in T015.

## Phase 8: Documentation and handoff

- [ ] T034 [P] Write `docs/compile.md` (the four operations, acceptance, conversion, the MCP tools, limits, "accepting a loss report is not approval", the command line is the operator's tool and these entry points are authorized) and update `README.md`, `ARCHITECTURE.md`, `docs/user-guide.md`, `docs/development.md` (FR-016, FR-046). Proof: `bun test tests/compile/docs-paths.test.ts` checks that every path and command named in the documents exists.
- [ ] T035 [P] Add `CHANGELOG.md` entries under Unreleased. Proof: each entry names behaviour a test covers.
- [ ] T036 Check the operation inventory and the MCP contract: `bun test tests/auth/operation-inventory.test.ts tests/mcp/` (contract and registry tests) and `bun scripts/operation-inventory-table.ts && git diff --exit-code docs/operations.md`. Proof: exit 0.
- [ ] T037 Run the feature's own proofs: `bun test tests/compile/`, `bun --bun run check`, `sw-midgard-run -- bun --bun run build`; run `scripts/check-comments.ts` and the readable-code checker on changed files. Proof: all exit 0.
- [ ] T038 Verify the unchanged-screen claim for the new entry points: `bun test tests/compile/compile-dialog.test.tsx` shows no control added when the option is not used (FR-030). Proof: the test passes; the full comparison is T040.
- [ ] T039 Record the 0.3.0 status in `docs/compile.md` and the changelog: released and adopted, or "not released on <date>; not supported". Proof: the text matches T024's record.
- [ ] T040 Hand off to the batch gate: record in the pull request description that the full unit suite (`bun test`), `bun run test:mutation`, `bun run test:compile`, `test:validation`, `test:auth`, the remaining browser suites, the UI regression comparison against the last release and the `architecture-reviewer` run once on the integrated batch; list T021 to T023 as open if 006 is not on the main branch, and Phase 7 as open if Ossie 0.3.0 is not released. Proof: the description names each gate item and who runs it; none is run here.

## Dependencies and order

- T001 and T002 first (they can run together). T003 and T004 are independent and can start now.
- T005 needs T001. T006 needs T003, T004, T005. T007 needs T006. T008 needs T007. T009 needs T006 and T002.
  T010 needs T006.
- Phase 4: T011 needs T007. T012 and T013 follow T011 (T012 first, T013 uses it). T014 needs T013. T015
  needs T014.
- Phase 5: T016 needs T006. T017 needs T016 and T007. T018 needs T013 and T016. T019 needs T016, T003, T004,
  T005. T020 needs T018.
- Phase 6 needs 006 on the main branch and T006, T007: T021, then T022 and T023.
- Phase 7: T024 first; all later tasks need a release. T025 needs T024; T026 to T028 need T025; T029 needs
  T028; T030 needs T027; T031 needs T018 and T028; T032 needs T031 and feature 016; T033 last.
- Phase 8: T034 and T035 after the commands and codes are stable (after T018). T036 to T039 last.

## Parallel execution examples

- At the start: T001, T002, T003, T004 together.
- After T006: T007, T009, T010, T016 together (different files).
- After T013: T014 and T018 together.

## Implementation strategy

1. **MVP**: Phases 1 to 3. Check and compile work over HTTP with acceptance and zip download.
2. Add Phase 4 (browser) so people can use it.
3. Add Phase 5 (convert) and Phase 6 (MCP) in parallel when their prerequisites hold.
4. Phase 7 runs only after the release. The rest ships without it.

## Traceability

| Decision or requirement | Requirements | Tasks |
|---|---|---|
| E14: HTTP, browser and MCP entries, bundle outside the source tree | FR-001 to FR-006, FR-011, FR-024 | T005 to T010 |
| E15: exact acceptance, loss preview | FR-008 to FR-010, FR-027, FR-028 | T003, T011, T012 |
| E4, E5: published-only compile, check may read work in progress | FR-003, FR-005, FR-033 | T005, T006, T021 |
| E10: complete unit, hidden equals missing | FR-007 | T005, T008 |
| E14: convert to standard with backup and conflict checks | FR-017 to FR-024 | T016 to T020 |
| M1, M17: twin tools and dispositions | FR-031 to FR-037 | T021 to T023 |
| E22, R1: adopt Ossie 0.3.0 at release | FR-038 to FR-045 | T024 to T033 |
| E17: reviewed metric conversion, draft to proposed | FR-044 | T032 |
| UI rules | FR-025 to FR-030 | T011 to T015, T018, T020, T038 |
| Documentation and honest claims | FR-016, FR-046 | T034, T035, T039 |
| Gate and process | SC-001 to SC-010 | T009, T010, T019, T036 to T040 |
