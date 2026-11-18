# Tasks: Usage Counters

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: none. Feature 006 is not needed; MCP counting is proven with a twin caller built by
the test. Feature 015's origin `acp` is not needed.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours. Process (owner, 2026-11-17): while implementing, run only
this feature's tests, `bun --bun run check` and `bun --bun run build`. The full unit suite, mutation
tests, every browser suite, the UI regression comparison and the architecture review run once on the
integrated batch (T049). Heavy runs go to the dev server with `sw-midgard-run -- <command>`. Every task
that changes code ends with the formatter applied and `bun scripts/check-comments.ts` clean. No task
edits a test only to make it pass.

## Phase 1: Foundations (pure code and configuration)

- [x] T001 [US5] Add `src/server/usage/usage-settings.ts` and read `SW_USAGE_COUNTERS` and `SW_USAGE_RETENTION_DAYS` in `src/server/config.ts` through its problem list: `on` or absent; integer 1 to 365, default 30; anything else stops the start with a named problem (FR-001, FR-015). Proof: `bun test tests/usage/usage-settings.test.ts` covers absent, on, bad value, range edges, both modes.
- [x] T002 [P] Create `policies/usage-counted-operations.json` and `src/server/usage/usage-counted-operations.ts` (typed parser: operation, items rule, measure). Add the optional `usage` flag to the schema `schemas/semantic-workbench-operations-v1.json`, the entry type in `src/server/auth/operation-inventory.ts`, and `usage: true` to `agent.context.read`, `agent.plan` and `metrics.explain` in `policies/operation-inventory.json` (FR-004). Proof: `tests/usage/usage-counted-operations.test.ts` fails when the table and the flags differ or when `contracts/counted-operations.md` lists another operation.
- [x] T003 [P] [US1] Write `src/server/usage/usage-items.ts`: the three pure item rules (`context-items`, `plan-items`, `metric`) using `addressAtModelPath` and `absoluteItemAddress` from `src/shared/core/model-addresses.ts`; distinct, sorted, capped at 500; unaddressable items skipped (FR-005, FR-006, FR-008). Add fixtures under `tests/fixtures/usage/` from the billing example answers. Proof: `tests/usage/usage-items.test.ts` checks exact address lists, duplicates, the cap and the skip.
- [x] T004 [P] [US2] Write `src/server/usage/usage-migration.ts` (`rekey(file, records)`) using `migrateAddress` and `deletesAddress` from `src/shared/core/address-migration.ts`; sums counts that meet, drops deleted items, advances `migratedThrough` (FR-021, FR-022, FR-023). Proof: `tests/usage/usage-migration.test.ts` compares ten rename, move, delete and reuse-of-name scenarios with the hand-applied pure function and checks idempotence.
- [x] T005 [P] [US2] Write `src/server/usage/usage-retention.ts`: pure `expiredDays(days, today, retention)` and the UTC day function (FR-014, FR-015). Proof: `tests/usage/usage-retention.test.ts` covers retention changes, clock back, day change and leap days.
- [x] T006 Add a `usage` folder to `DataLayout` in `src/server/projects/paths.ts` (`state/usage`). Proof: `bun test tests/usage/usage-layout.test.ts` shows the folder is under `state` and is created only when counters are on.

## Phase 2: User Story 1 - Counting without identities (P1)

**Goal**: counted requests add identity-free counts after authorization; off means nothing.

**Independent Test**: `bun test tests/usage/`.

- [x] T007 [US1] Write `src/server/usage/usage-store.ts`: read, merge and atomic write of day files with `atomicWrite` from `src/server/projects/atomic.ts`; damaged files are reported, not repaired; entry cap with `other` (FR-010, FR-013, FR-018). Proof: `tests/usage/usage-store.test.ts` covers merge, damaged file, size cap, atomic replace under a simulated interruption, and that only the listed fields are written.
- [x] T008 [US1] Write `src/server/usage/usage-recorder.ts` with the real recorder (memory map, flush timer, `close()`) and the no-op recorder; counting rules of FR-002, FR-003, FR-007, FR-009 (surface, status, classifier outcome, published snapshot header, parse bound of 4,000,000 bytes). Proof: `tests/usage/usage-recorder.test.ts` covers 2xx, 403, 404, 500, browser surface, unpublished, duplicates in one answer, concurrency (1,000 parallel records equal 1,000 counts), clock changes and a failing disk (FR-019).
- [x] T009 [US1] Add the optional recorder dependency to `createOperationBoundary` in `src/server/auth/operation-boundary.ts` and call it once after the response in `operate`, passing operation id, origin, surface, project and the response; never awaiting disk and never altering the response. Proof: `tests/usage/usage-boundary.test.ts` runs a twin caller with origin `mcp` and an application client over HTTP through the real boundary and reads the counts; a recorder that throws does not change the answer.
- [x] T010 [US1] Create the recorder in `src/server/handler.ts` from the settings and the layout, pass it to the boundary, and close it with the workspace so shutdown flushes (FR-017). Proof: `tests/usage/usage-restart.test.ts` stops cleanly and restarts and finds the counts; an unclean stop loses at most one interval.
- [x] T011 [P] [US1] Write `tests/usage/usage-privacy.test.ts`: five principals, two clients and one connection make counted requests; every stored file is scanned for their identifiers, source addresses, request ids and document text; the record's field list equals the documented one; a scan test fails when a `src/server/usage/` module imports `src/server/auth/audit` or telemetry, or the reverse (FR-010, FR-011, FR-012). Proof: passes; a deliberately added field fails it.
- [x] T012 [P] [US1] Write `tests/usage/usage-off.test.ts`: with counters off no folder is created, no timer starts and the recorder is the no-op; answers equal the answers with counters on for every counted operation, status, headers and body (FR-001, FR-044). Proof: passes.
- [x] T013 [US1] Document in `tests/usage/usage-store.test.ts` the loss window: a stop without `close()` after 29 seconds loses the unflushed increments and none older (FR-017). Proof: passes with a fake clock.

**Checkpoint**: counting works through the boundary for HTTP clients and twin callers.

## Phase 3: User Story 2 - Counts follow items and expire (P1)

**Goal**: renames, deletions and retention work; trash keeps counts.

**Independent Test**: `bun test tests/usage/usage-migration.test.ts tests/usage/usage-retention.test.ts`.

- [x] T014 [US2] In the flush of `src/server/usage/usage-store.ts` apply `rekey` with `readAddressMigrations` from `src/server/projects/address-migrations.ts` and write the new `migratedThrough` (FR-021, FR-022). Proof: `tests/usage/usage-flush-migration.test.ts` renames after counting and flushes; the file holds the new address and marker.
- [x] T015 [US2] Add the daily compaction and start-up expiry in `src/server/usage/usage-retention.ts` driven by the recorder's timer; a lower retention removes more at the next start (FR-015). Proof: `tests/usage/usage-retention.test.ts` advances the clock past retention plus one day and finds no older file.
- [x] T016 [US2] Move `state/usage/<slug>/` with a trashed project and back on restore, remove it on purge, following how `archiveAddressMigrations` is used in `src/server/projects/trash.ts` and `restoreAddressMigrations` in `src/server/projects/trash-restore.ts` (FR-020). Proof: `tests/usage/usage-trash.test.ts` covers trash, restore and purge, that a workbench export contains no counts, and that deleting the whole `state/usage/` folder leaves every other feature working (FR-016).
- [x] T017 [P] [US2] Register the store in the persisted-key inventory: `src/server/projects/address-key-stores.ts` comment-level entry, `docs/item-addresses.md` table row ("converted by replay; counts only"), and the shape check in `tests/address-key-inventory.test.ts` (FR-024). Proof: `bun test tests/address-key-inventory.test.ts` fails when `CounterDayFile` gains a field without a decision.
- [x] T018 [US2] Cover the ambiguous external change: a remove-and-add pair keeps counts with the removed item and none on the added one; a damaged migration store leaves counts unchanged on disk and marks the project's answer unavailable (FR-023). Proof: `tests/usage/usage-migration.test.ts` cases pass.

## Phase 4: User Story 3 - Reading within permissions (P1)

**Goal**: one read operation, authorized and filtered like other project reads.

**Independent Test**: `bun test tests/auth/usage-read-parity.test.ts tests/usage/usage-read.test.ts`.

- [x] T019 [US3] Add the row `GET /api/projects/:slug/usage` (action `read`, project target) in `src/server/auth/route-actions.ts` as one contiguous block, and the entry `usage.read` in `policies/operation-inventory.json` (effects `read`, exposure `never` with the reason of `contracts/usage-read-api.md`) (FR-026). Proof: `bun test tests/auth/operation-inventory.test.ts tests/auth/route-actions.test.ts` pass.
- [x] T020 [US3] Write `src/server/usage/usage-read.ts`: merge files and memory, rekey, filter by `requestReader`, totals, `unavailableDays`, drop `other` when any file is unreadable (FR-025, FR-027, FR-028, FR-029). Proof: `tests/usage/usage-read.test.ts` covers readable, unreadable, guarded, partially readable, off, damaged day, period bounds and ordering.
- [x] T021 [US3] Write `src/server/routes/usage.ts` and register it in `src/server/handler.ts` after the project routes; validate `days`; set `Cache-Control: no-store` (FR-026). Proof: `tests/usage/usage-route.test.ts` covers 200, 400, 403, 404.
- [x] T022 [P] [US3] Add matrix cases for the row in `policies/matrix-cases.json` and an example request in `tests/auth/route-actions.ts`. Proof: `bun test tests/auth/access-boundary.test.ts tests/auth/route-actions.test.ts` pass with every test role.
- [x] T023 [US3] Write `tests/auth/usage-read-parity.test.ts`: HTTP and twin answers equal; a hidden project equals a missing project; an unreadable file with counts, without counts and missing give the same answer (FR-027, FR-030). Proof: passes.
- [x] T024 [P] [US3] Regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts`. Proof: `bun test tests/auth/operation-inventory.test.ts` finds the table byte equal.

**Checkpoint**: counts can be read within permissions.

## Phase 5: User Story 4 and 5 - Traffic in the interface and the operator view (P2)

**Goal**: Traffic option, shading, details, lists, legend, Admin status; off changes nothing.

**Independent Test**: `bun run test:usage-traffic`.

- [x] T025 [US4] Add `fetchUsage` to `src/app/projects/api.ts` and `src/app/usage/use-usage.ts` with the states off, loading, error, empty, partial and ready; the first request happens only when Traffic is switched on; refresh at most once per minute; retry on error. Proof: `tests/usage-client.test.ts` covers each state with a mocked fetch and shows no request while the option is off.
- [x] T026 [P] [US4] Write `src/app/usage/usage-intensity.ts` (five levels, relative to the largest count shown, zero is no mark). Proof: `tests/usage-intensity.test.ts`.
- [x] T027 [US4] Write `src/app/usage/TrafficBadge.tsx` and `usage.css`: count, measure label "requests through this workbench", period; wraps, never clips; tokens only. Proof: `tests/usage-badge.test.tsx` renders long names, large counts, zero and the off state, asserts no `text-overflow`, `line-clamp` or `overflow: hidden` on text.
- [ ] T028 [US4] Add `src/app/usage/TrafficToggle.tsx` to `src/app/graph/GraphOptions.tsx` consumers (`FullGraph.tsx`, `NeighborhoodToolbar.tsx`) and to `CompactControls.tsx`; remember per model in the browser as `workbench:traffic:<model>` using the `readFlag` and `writeFlag` helpers in `src/app/graph/hidden-kinds.ts`; show the off-state explanation (Admin: names `SW_USAGE_COUNTERS`; others: "Not collected") (FR-031, FR-036). Proof: `tests/usage-toggle.test.tsx` covers default off, remembered state, blocked storage, off-state wording for Admin and non-Admin.
- [x] T029 [US4] Apply intensity to entity cards and relationship edges in `src/app/graph/FullGraphNodes.tsx`, `RelationshipEdge.tsx` and the neighbourhood nodes in `useNeighborhoodNodes.ts` as a class and a thin bar from tokens, with no size change and the count as accessible text; nothing is added when the option is off (FR-032, FR-033, FR-039). Proof: `tests/usage-graph-structure.test.tsx` compares the rendered structure with the option off to a stored baseline, and asserts card dimensions are equal with it on.
- [ ] T030 [P] [US4] Write `src/app/usage/TrafficLegend.tsx` and place it beside the existing legend pattern of `src/app/graph/LineageLegend.tsx` (`legend.css`); names measure, operations and period (FR-033, FR-037). Proof: `tests/usage-legend.test.tsx`.
- [x] T031 [US4] Show `TrafficBadge` with the split by operation in `src/app/workspace/EntityDetails.tsx` and `RelationshipDetails.tsx`, and on dataset field rows through the same component, written so the attribute rows of a later feature reuse it (FR-034). Proof: `tests/usage-details.test.tsx` covers entity, relationship and field rows in each state.
- [ ] T032 [US4] Add sort by traffic, ties in existing order, to the entity and metric lists in `src/app/workspace/CatalogView.tsx` and `src/app/workspace/MetricsPanel.tsx`, only while Traffic is on (FR-035). Proof: `tests/usage-sort.test.ts`.
- [ ] T033 [US5] Show counter status and retention read-only in `src/app/admin/SettingsSection.tsx`, from the read answer's `counters` object (FR-040). Proof: `tests/admin-settings-usage.test.tsx` covers on, off and a non-default retention.
- [ ] T034 [US4] Write `scripts/usage-traffic-browser-check.ts` against a mocked API: Traffic off equals the recorded DOM baseline for the full graph, the neighbourhood and the details panels; on, empty, off-state (Admin and non-Admin), loading, error, partial, long names, 1,200,000-request counts; widths 360, 768 and 1280; light and dark; geometry assertions (no overlap, contained panels) and the clipped-text check as in `scripts/clipping-browser-check.ts`. Add `test:usage-traffic` to `package.json` and `scripts/gate-suites.ts` (FR-032, FR-038). Proof: `bun run test:usage-traffic` passes on the dev server via `sw-midgard-run`.
- [ ] T035 [US4] Hand screenshot capture to Codex: write the brief (fresh worktree of current `main`, temporary `DATA_DIR`, spare port, forbidden: real `data/`, running dev ports, application code, commits, pushes; deliverables: screenshots of every state of T034 in both themes at three widths, a manifest and a findings file) and run it with `codex exec` as the owner's rule says. Then judge the screenshots here and fix what is wrong. Proof: the findings file lists no clipped text and no overlap; every screenshot named in the manifest exists.

## Phase 6: Polish, documentation and hand-off

- [ ] T036 [P] Write `docs/usage-counters.md`: what is stored (the exact field list), what is counted and not, retention, the loss window, how to enable, the migration behaviour, the labels, the privacy limit for small teams, and the extension point for imported query counts. Add `tests/usage/usage-docs.test.ts` that compares the documented fields with the stored fields (FR-041, SC-010). Proof: the test passes and fails when a field is added.
- [ ] T037 [P] Update `README.md` (what counters collect, default off, retention, not queries, not anonymous in a small team, outbound list unchanged), `docs/configuration.md` (two variables), `docs/server-mode.md` and `docs/user-guide.md` (Traffic option, Admin status) (FR-041). Proof: `bun test tests/readme*.test.ts` or the repository's documentation check passes; claims match the tests.
- [ ] T038 [P] Update `ARCHITECTURE.md` (the `src/server/usage/` module, the boundary hook, the new durable store and its isolation from audit) and `CHANGELOG.md`; update the "Where to change a behavior" table. Proof: the repository's docs check passes.
- [ ] T039 [P] Update `docs/development.md` with the new test folder `tests/usage/` and the script `test:usage-traffic`, and `docs/operations.md` is already regenerated by T024. Proof: the repository's documentation check passes.
- [ ] T040 Measure the cost of counting on the in-process benchmark of `scripts/boundary-benchmark.ts` with counters off and on, 5,000 counted requests, and record median and 95th percentile in `specs/014-usage-counters/checklists/analysis.md`; if the median grows more than 5 percent, optimize before continuing (SC-011). Proof: the recorded numbers and the check.
- [ ] T041 Write the mutants `scripts/usage-mutants.ts` and `scripts/usage-mutation-cases.ts` for FR-043 (count a refused request, a browser request, an unpublished item, count when off, store an identity field, skip the reader filter, skip migration, keep expired days, double count in one request), wire them in `scripts/mutation-tests.ts`. Proof: `bun scripts/mutation-tests.ts --only usage` (or the harness's filter) reports every mutant detected and the baseline passing; run through `sw-midgard-run`.
- [ ] T042 Note for feature 006 (documentation only, after both merge): list `get_mapping_context`, `plan_query` and `explain_metric` as counted tools in `docs/mcp-contract.md`, and add one parity case that an MCP call is counted. Proof: the case in `tests/usage/usage-boundary.test.ts` is switched from the twin caller to the live tool, or the note is recorded as pending in `checklists/analysis.md` if 006 is absent.
- [ ] T043 Run this feature's own checks: `bun test tests/usage tests/auth/usage-read-parity.test.ts tests/address-key-inventory.test.ts`, `bun --bun run check`, `bun --bun run build`, `bun scripts/check-comments.ts`, the readable-code checker on every changed file. Proof: all pass; output pasted in the pull request description.
- [ ] T044 Hand off to the integrated batch gate: list for the batch owner the suites this feature adds (`test:usage-traffic`, `tests/usage/`), the mutant group, the UI regression journey screens affected (graph, neighbourhood, details, Admin Settings), and the architecture review request. The batch runs the full unit suite, `bun run test:mutation`, every browser suite, the UI regression comparison against the last release and `architecture-reviewer`, once. Proof: the hand-off note is in the pull request description.

## Dependencies and order

- Phase 1 first; T001 to T006 are independent except T006 before T007.
- Phase 2 follows Phase 1 (T003 before T008, T002 before T009). T011 to T013 after T010.
- Phase 3 follows T007 and T004. T016 and T017 can run beside T014.
- Phase 4 follows T007 and T004; T019 before T020 to T023.
- Phase 5 follows T020 and T021 for real data; T025 to T032 can start earlier against the mocked contract.
- Phase 6: T036 to T039 after Phase 4; T040 and T041 after Phase 2; T042 last among code tasks; T043 then T044.

## Implementation strategy

MVP is Phases 1 to 4 (counting, migration, retention, authorized reading) with no interface; counters
are on or off and the data can be read through the API. Phase 5 adds the interface and can follow in the
same batch. Nothing in Phase 5 changes a default screen.

## Traceability

| Decision or finding | Requirements | Tasks |
| --- | --- | --- |
| E20 counted requests, off by default, identity-free, own store | FR-001 to FR-013 | T001 to T013 |
| E20 retention 30 days, configurable | FR-015, FR-017 | T001, T005, T015 |
| E20 never derived from audit; Principle IV | FR-012 | T011 |
| E20 browser views excluded | FR-007 | T008, T012 |
| E6 address migrations for counters | FR-021 to FR-024 | T004, T014, T017, T018 |
| E19 no dependent usage counts; Principle I read permissions | FR-009, FR-026, FR-027, FR-030 | T019 to T023 |
| E20 label as workbench requests; Principle VII | FR-037, FR-041, FR-042 | T027, T030, T036, T037 |
| E21 imported counts later, extension point | `measure` field, Out of Scope | T002, T020, T036 |
| Evaluation "Idea 2" display and states | FR-031 to FR-040 | T025 to T035 |
| R2 tests and mutation gates | FR-043, FR-044, SC-009, SC-011 | T012, T040, T041, T043, T044 |
| M17 inventory of every operation | FR-026 | T019, T022, T024 |
