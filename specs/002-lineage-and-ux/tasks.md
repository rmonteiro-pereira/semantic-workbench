---
description: "Task list for Column-Level Lineage, One Metric Vocabulary, Git Workflow and a Calmer UI (002)"
---

# Tasks: Column-Level Lineage, One Metric Vocabulary, Git Workflow and a Calmer UI (v0.3.0)

**Input**: Design documents from `specs/002-lineage-and-ux/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution 2.1.0 Principle VI mandates unit/API tests, an isolated browser
check per user-visible change, targeted mutants for new decision logic and geometry assertions
for layout work. Test tasks come first in each phase and must fail before the implementation
tasks that follow.

**Organization**: Setup and foundations, then one phase per user story. P1 stories come first,
with the save/commit flow (US3) ahead of lineage because later phases touch editing. Each phase
is shippable: it ends with every existing suite (`bun test`, `check`, `build`, `test:ui`,
`test:responsive`, `test:edges`, `test:grouping-validation`, `test:examples:ui`, `test:odcs`,
`test:graph`, `test:editor`, `test:scm`, `test:mutation`) green plus its own checks.

## Format: `[ID] [P?] [Story?] [CODEX?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[USn]**: user story from spec.md (US1 lineage, US2 metric vocabulary, US3 save/commit, US4
  SQL, US5 main screen, US6 Group by, US7 Git setup, US8 monorepo, US9 Mappings, US10 pierce,
  US11 concept-mapping graph). Task ids T101–T110 (US11) were added after the first numbering;
  T101–T109 sit in Phase 5 and T110 in Phase 6.
- **[CODEX]**: pure UI layout/polish task, implemented with the Codex CLI from a written brief;
  reviewed and gated like any other task
- Paths are repository-relative

---

## Phase 1: Setup

- [X] T001 Add `@codemirror/lang-sql` (pinned exact version) to package.json and bun.lock; record size and licence in specs/002-lineage-and-ux/research.md R11
- [X] T002 [P] Create SQL fixtures of contracts/sql-regions.md in tests/fixtures/sql/ (case-when, case-when-broken, escaped JSON, folded YAML, ODCS quality with placeholders and a DAX expression)
- [X] T003 [P] Create Git fixtures helper tests/helpers/git-fixtures.ts: bare repository with two project folders and a manifest, one without manifest, one with a symbolic link and an oversized file
- [X] T004 [P] Add script entries test:lineage, test:autosave, test:sql, test:git-setup, test:monorepo, test:dialogs, test:terminology, test:mappings-layout to package.json (pointing to scripts created in later phases)
- [X] T005 [P] Pin schemas/semantic-workbench-repository-v1.json from contracts/repository-manifest.schema.json and list it in schemas/README.md as an application schema

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T006 [P] Unit tests for foreign keys with column pairs (property-level, schema-level, composite, qualified ids, unequal arity, external) in tests/odcs-foreign-keys.test.ts
- [X] T007 Extend `odcsForeignKeys` with `fromColumns`/`toColumns` in src/odcs.ts without changing existing fields (research R2)
- [X] T008 [P] Shared edge styles map in src/graph/edge-styles.ts and shared legend component src/graph/LineageLegend.tsx moved from src/odcs/DatasetPage.tsx:115-128 and src/odcs/odcs.css:57-70, "KPI" kind renamed Metric (FR-025, FR-026)
- [X] T009 [P] Shared `PropertyBadges` component in src/PropertyBadges.tsx (PK, FK with target, Required, Unique, classification) used by the Properties table in src/odcs/DatasetPage.tsx (FR-027)
- [X] T010 [P] Unit tests for the walk step kind `expand` and v0.2.0 compatibility in tests/walk.test.ts; extend src/graph/walk.ts (data-model WalkStep)
- [X] T011 Generalise Git serialization key from project to repository: `repoDir(entry)` and `projectDir` resolved through the registry with defaults `folder = repo = slug` in server/projects/paths.ts, server/projects/git.ts, server/projects/scm.ts; tests in tests/paths-registry.test.ts prove v0.2.0 registries load unchanged (research R10)
- [X] T012 [P] Dialog conventions: extend src/projects/Modal.tsx with size variants and a footer slot; add tests/modal.test.tsx for Escape and focus return

**Checkpoint**: shared pieces in place; all existing suites green.

---

## Phase 3: User Story 3 - Save and commit that make sense (Priority: P1)

**Goal**: valid edits save themselves, Commit… is the primary action, imports are committed.

**Independent Test**: quickstart §2; `bun run test:autosave` and `test:editor` latency variant.

### Tests

- [X] T013 [P] [US3] Unit tests for the autosave state machine (pending → saving → saved/stale/failed/invalid, one save in flight, queued text uses returned hash, cancel on delete/move, wait during a Git operation) in tests/autosave.test.ts
- [X] T014 [P] [US3] Handler tests for `commitPaths` (`--only` commits only listed paths, untracked added, other staged work untouched, merge refusal, no identity → `{committed:false}`) in tests/git-commit-paths.test.ts
- [X] T015 [P] [US3] Handler tests: import into a new project, into an existing project and example load each commit exactly the written paths with "Import N files"/"Import <name>", and report the reason when Git, the identity or a clean merge state is missing (FR-049) in tests/import-commit.test.ts
- [X] T016 [P] [US3] Handler tests for `POST git/commit` with `paths` and `push`, and `POST git/revert` (journaled: trash entry + restore from HEAD, interrupted revert recovered on restart, stale base 409), and commit refusal with conflicts during a merge in tests/git-commit-api.test.ts
- [X] T017 [US3] Mutants in scripts/mutation-tests.ts: autosave writes invalid text; autosave ignores stale base; `--only` dropped; import commit includes unrelated paths; revert skips the trash copy

### Implementation

- [X] T018 [US3] `commitPaths(repoDir, paths, message)` in server/projects/git.ts; use it in createProjectFolder, importInto and loadExample in server/projects/workspace.ts; responses carry `commit` (contracts/http-api.md)
- [X] T019 [US3] Extend `scm.commit` with `paths` and `push`; add `revert` as one journaled operation (stage HEAD bytes, move current file into a trash entry, move staged bytes in) in server/projects/scm.ts, server/projects/trash.ts and server/routes/git.ts
- [X] T020 [US3] Autosave controller src/projects/autosave.ts (pure machine + `useAutosave` hook) using editor worker issues and `diffPatches` in idle time (research R7)
- [X] T021 [US3] Wire autosave in src/main.tsx: flush on file/view switch, drafts for invalid text without the "Discard unsaved changes?" prompt, pause on stale save with StaleSaveDialog, cancel on delete/move/trash; wait while a pull, branch switch or merge of the repository runs, then re-check the base hash; Pull/Sync/switch refusals offer Commit… (FR-040–FR-043, FR-048)
- [X] T022 [US3] Commit dialog src/scm/CommitDialog.tsx reusing Source Control status/diff views: ticked files, diff, pre-filled message, Commit, Commit & push, Revert to last commit (FR-045, FR-046)
- [X] T023 [US3] Header: replace Save changes with `Commit…` and the `Save state` status indicator (FR-044); item editors, add/delete and wizard buttons read "Save to file" (FR-047) in src/main.tsx, src/edit/*.tsx, src/metrics/KpiWizard.tsx
- [X] T024 [US3] Browser check scripts/autosave-browser-check.ts: autosave bytes (`git diff` one line), invalid text not written, stale diff, Commit dialog commits ticked files, import commit, refusal offers Commit…; add the autosave-on typing-latency case to scripts/editor-browser-check.ts (SC-005)

**Checkpoint**: US3 shippable.

---

## Phase 4: User Story 1 - Column-level lineage (Priority: P1)

**Goal**: the Graph tab of a contract shows cards with columns and column-to-column lines to metrics.

**Independent Test**: quickstart §1 steps 1, 2, 5; `bun run test:lineage`.

### Tests

- [X] T025 [P] [US1] Unit tests for `buildLineage` on commerce, mall and UBL: every expected edge (foreign-key direction parent → child, reads, aggregates, uses, transform), cards once, nested columns, ambiguous sources, external stubs, cycles; golden edge lists in tests/fixtures/lineage/ (SC-002)
- [X] T026 [P] [US1] Unit tests for `around(center, steps)` reach and `closure(ids, direction)` path highlighting in tests/lineage-query.test.ts
- [X] T027 [P] [US1] Unit tests for paging (10 rows, pinned path rows, "N more columns" port for off-page edges) in tests/lineage-paging.test.ts
- [X] T028 [US1] Mutants: foreign-key direction reversed; closure ignores direction; off-page edge dropped; dataset matched by similar name

### Implementation

- [X] T029 [US1] Column-level `buildLineage`, `around`, `closure` in src/odcs/lineage.ts (keeps `odcsLineage` property table data for the asset page until T036) (FR-001–FR-004, FR-008)
- [X] T030 [US1] ELK layered layout with ports in a worker src/odcs/lineage-layout.worker.ts (direction RIGHT, FIXED_ORDER ports)
- [X] T031 [US1] Card node src/odcs/LineageCard.tsx: header, column rows with handles, PropertyBadges, pager, "+N more" stubs, Walk here / Open asset page
- [X] T032 [US1] Canvas src/odcs/LineageCanvas.tsx: React Flow, shared legend and edge styles, path highlight and dim, Selected path summary, Find assets, Steps control, zoom/fit/full screen (F), walk trail with Back/Forward using src/graph/walk.ts (FR-005–FR-010)
- [X] T033 [US1] Graph tab shows LineageCanvas for ODCS in src/main.tsx; non-ODCS keeps FullGraph (FR-013); walking into a semantic file continues in Neighborhood (FR-009)
- [X] T034 [US1] Asset page tabs Lineage, Relationships, Data Quality, Properties, History in src/odcs/DatasetPage.tsx; Lineage tab hosts LineageCanvas centered on the asset; remove the SVG graph (FR-011)
- [X] T035 [US1] Contract overview rows: Open <name> in lineage / Open <name> in src/odcs/ContractOverview.tsx (FR-012)
- [X] T036 [US1] Property lineage table reads from `buildLineage`; delete `odcsLineage` in src/odcs/lineage.ts
- [X] T037 [US1] Browser check scripts/lineage-browser-check.ts on commerce, mall, UBL: edges vs golden lists, highlight ≤ 200 ms, first view ≤ 2 s on UBL, paging, walk, legend and badges, full screen (SC-001, SC-002)
- [X] T038 [US1] [CODEX] Card and canvas styling (card widths, row density, badges, dimming, 390 px layout) in src/odcs/odcs.css with geometry assertions added to scripts/responsive-ui-tests.ts; brief in specs/002-lineage-and-ux/codex/phase-04.md

**Checkpoint**: US1 shippable (MVP with US3).

---

## Phase 5: User Story 11 - A real concept-mapping graph (Priority: P1)

**Goal**: mapping documents show concepts, datasets, fields and metrics connected per binding.

**Independent Test**: open Flights (standalone and consolidated), mapped commerce, billing and the
shopping center mapping in Graph; `bun run test:mapping-graph`.

### Tests

- [X] T101 [P] [US11] Handler tests: `/api/agent/context` returns `bindings[].kind` and `metricBindings` (with findings) for standalone and embedded mappings, other fields unchanged, in tests/agent-context-kinds.test.ts
- [X] T102 [P] [US11] Unit tests for `buildMappingGraph` on Flights (both forms), mapped commerce, billing and mall: every binding becomes exactly one line of the right kind, link mappings pass through join fields, metric bindings `measures`/`of`, identifying and unmapped flags, findings attached to the right edge or card (SC-012) in tests/mapping-graph.test.ts
- [X] T103 [US11] Mutants: link mapping drawn without join fields; unmapped flag inverted; finding attached to the wrong binding; metric binding `of` drawn as `measures`

### Implementation

- [X] T104 [US11] Record binding kind and add `metricBindings` in server/agent/runtime.ts (additive) and document in docs/agent-runtime.md (FR-028)
- [X] T105 [US11] Pure builder src/mappings/mapping-graph.ts producing the lineage card model (FR-029, FR-030)
- [X] T106 [US11] Mapping canvas src/mappings/MappingCanvas.tsx on LineageCanvas/LineageCard with selection summary and Edit item, Unmapped filter and badges, warning markers, legend entries for mapping kinds, walk trail (FR-031, FR-032)
- [X] T107 [US11] Graph tab routing in src/main.tsx: mapping documents and consolidated files show the mapping canvas, consolidated files get the Ontology graph / Mapping graph switch; stop projecting concept mappings as unconnected entities in src/model.ts:92-94 while keeping catalog and Neighborhood working (FR-034)
- [X] T108 [US11] Browser check scripts/mapping-graph-browser-check.ts on the five examples: lines vs resolver bindings, selection dims the rest, unmapped filter, warning markers, no area box of unconnected nodes (SC-012); add `test:mapping-graph` to package.json
- [X] T109 [US11] [CODEX] Mapping card styling (concept vs dataset columns, identifying/unmapped badges, warning markers) in src/odcs/odcs.css with geometry assertions in scripts/responsive-ui-tests.ts

**Checkpoint**: lineage and mapping graphs shippable.

---

## Phase 6: User Story 10 - Pierce through relationships (Priority: P1)

**Goal**: expand in place, collapse, undo, Full pierce with budgets in Neighborhood and lineage.

**Independent Test**: quickstart §1 steps 3–4 and the Neighborhood paragraph.

### Tests

- [X] T039 [P] [US10] Unit tests for ExpansionState (expand adds only new nodes, collapse reference counting, center not collapsible, undo/forward exact restore) in tests/expansion.test.ts
- [X] T040 [P] [US10] Unit tests for incremental placement (placed nodes never move, column by direction, nearest free row, deterministic) in tests/incremental-layout.test.ts (SC-011)
- [X] T041 [P] [US10] Unit tests for bounded closure (direction, relationship filter, value types/technical/metrics switches, budget 150/500, frontier hidden counts, totals equal full closure, cycles, deterministic order) on UBL and shopping center ontologies and the 5,000-entity fixture in tests/pierce.test.ts (SC-010)
- [X] T042 [US10] Mutants: collapse removes shared nodes; placement moves a placed node; closure ignores budget; pierce follows the wrong direction

### Implementation

- [X] T043 [US10] src/graph/expansion.ts and src/graph/incremental-layout.ts (pure) (FR-018, FR-019)
- [X] T044 [US10] src/graph/pierce.ts and worker src/graph/pierce.worker.ts with Stop (FR-020–FR-022)
- [X] T045 [US10] Neighborhood: Expand/Collapse per node, relationship activation expands its far end, Full pierce toolbar (direction, Stop, Undo expansion), a Value types switch sharing Graph's per-model setting, banner with Expand further, trail steps "expanded X" in src/NeighborhoodGraph.tsx and src/layout.ts (FR-018–FR-024)
- [X] T046 [US10] Lineage: Expand/Collapse on cards, Full pierce on a column or card through to metrics, incremental placement for expansions, ELK for pierce in src/odcs/LineageCanvas.tsx (FR-023)
- [X] T110 [US10] [US11] Expand, Collapse and Full pierce on the mapping canvas (concept relationships and mappings) in src/mappings/MappingCanvas.tsx, with a pierce case added to scripts/mapping-graph-browser-check.ts (FR-033)
- [X] T047 [US10] Browser checks: Neighborhood scenarios on UBL (`Order` → `OrderLine` → `Item` → `Price`, Full pierce Both from `Invoice` with budget banner) and shopping center (`Lease`, Outgoing) in scripts/graph-browser-check.ts; lineage pierce on UBL `invoice_line.line_extension_amount` in scripts/lineage-browser-check.ts; input never blocked > 100 ms

**Checkpoint**: all P1 stories shippable.

---

## Phase 7: User Story 2 - One name: Metric (Priority: P1)

**Goal**: "Metric" everywhere; stored data unchanged; all metrics listed.

**Independent Test**: `bun run test:terminology`; v0.2.0 example files round-trip.

- [X] T048 [P] [US2] Terminology check scripts/terminology-check.ts: rendered text, accessible names, tooltips and status messages of every view plus README contain no "KPI" (allow-list: quoted user data, `kpi_bindings`) (SC-003)
- [X] T049 [P] [US2] Round-trip tests: every v0.2.0 example with metric extensions validates and saves byte-exact after a metric edit, `kpi_bindings` kept, in tests/metric-compat.test.ts (SC-004)
- [X] T050 [P] [US2] Handler tests: `GET metrics` lists all metrics with `governed`; `POST metrics` and `metrics/preview` equal the `kpis` aliases in tests/metrics-api.test.ts
- [X] T051 [US2] Rename UI strings and components (MetricWizard, MetricDetail, metric-save, metric-draft) in src/metrics/*, src/main.tsx, src/FullGraph.tsx, src/NeighborhoodGraph.tsx, src/odcs/*, src/edit/item-model.ts; keep type aliases where tests import old names (FR-014)
- [X] T052 [US2] Server: `metrics` create/preview routes, `kpis` aliases, `governed` flag and non-governed metrics in server/routes/metrics.ts, server/routes/kpis.ts, server/agent/explain.ts (FR-015–FR-017)
- [X] T053 [US2] Metrics tab: all metrics, `Governed only` filter, `Add attributes` opening the wizard prefilled for an existing metric in src/metrics/MetricsView.tsx and src/metrics/MetricWizard.tsx (FR-017)
- [X] T054 [US2] Update scripts/metrics-browser-check.ts and scripts/item-edit-browser-check.ts selectors to the new names

---

## Phase 8: User Story 4 - SQL coloring and lint inside definitions (Priority: P2)

**Goal**: SQL in YAML/JSON colored and linted with exact positions everywhere.

**Independent Test**: quickstart §3; `bun test tests/sql-*.test.ts`; `bun run test:sql`.

### Tests

- [X] T055 [P] [US4] Unit tests for region finding and offset maps (all locations of contracts/sql-regions.md, all scalar styles, escapes, flow and multi-document YAML) in tests/sql-regions.test.ts
- [X] T056 [P] [US4] Unit tests for lint: CASE WHEN fixture clean; broken fixture finding at the hand-computed line/column; JSON escape and folded cases; placeholders; non-SQL dialect skipped; warnings only; text unchanged (SC-006) in tests/sql-lint.test.ts
- [X] T057 [P] [US4] Handler test: the API's file findings include the same SQL warnings as the browser module and never block save in tests/sql-api.test.ts
- [X] T058 [US4] Mutants: offset map ignores escapes; lint severity error blocks save; dialect ignored; region finder misses embedded models

### Implementation

- [X] T059 [US4] src/sql/regions.ts (YAML/JSON CST via `yaml`, offset maps, dialect resolution) (FR-050, FR-051)
- [X] T060 [US4] src/sql/lint.ts with lazy per-dialect parser loading; call it from src/editor/lint.worker.ts and server/projects (indexBytes) (FR-052, FR-053, FR-055)
- [X] T061 [US4] SQL nesting in YAML and JSON languages with `parseMixed` in src/editor/languages.ts at the region key paths; dialect-specific note for non-SQL dialects
- [X] T062 [US4] `SqlField` (single-purpose CodeMirror with SQL language and lint) in src/editor/SqlField.tsx used by item editor expression fields (src/edit/ItemEditor.tsx), wizard inputs (src/metrics/MetricWizard.tsx) and read-only previews (src/metrics/Explanation.tsx, src/MappingExplorer.tsx) (FR-054)
- [X] T063 [US4] Browser check scripts/sql-browser-check.ts: colors on CASE WHEN, finding position on broken fixture within 500 ms, JSON escape case, item editor and wizard findings, preview coloring, export bytes equal; typing latency unchanged in scripts/editor-browser-check.ts

---

## Phase 9: User Story 5 - Calmer main screen with dialogs (Priority: P2)

**Goal**: the main screen holds navigation, the view and primary actions; Appendix B moves to dialogs.

**Independent Test**: `bun run test:dialogs`, `test:responsive`.

- [X] T064 [P] [US5] Dialog check scripts/dialogs-browser-check.ts: every dialog of spec Appendix B opens from its trigger, fits each of the six viewports, traps focus, closes with Escape, returns focus
- [X] T065 [P] [US5] Sidebar tests in scripts/responsive-ui-tests.ts: resize by pointer and keyboard (220–520, persisted), no clipped names (2-line wrap + title), Examples collapsed when projects exist, one sidebar toggle on desktop (FR-061, FR-062, SC-008)
- [X] T066 [US5] [CODEX] Resizable sidebar with separator, width variable and persistence, two-line names, collapsible Examples in src/main.tsx, src/projects/Sidebar.tsx, src/style.css; brief specs/002-lineage-and-ux/codex/phase-08.md
- [X] T067 [US5] [CODEX] Single sidebar toggle (panel icon) on desktop, drawer close only below 1100 px in src/main.tsx and src/style.css (FR-062)
- [X] T068 [US5] `New` menu with per-kind Add dialogs and reasons for disabled kinds; context adds stay in details panel in src/main.tsx, src/edit/AddItem.tsx, src/edit/RdfAddItem.tsx (FR-060)
- [X] T069 [US5] Grouping suggestions as a one-line count opening a dialog in src/projects/Suggestions.tsx
- [X] T070 [US5] Import dialog (new project or into a project, conflict choice, repair) in src/projects/ImportDialog.tsx replacing the inline flows in src/main.tsx
- [X] T071 [US5] Validation details dialog opened from the Save state indicator; View definition dialog; Export in More actions, in src/main.tsx and src/ValidationPanel.tsx
- [X] T072 [US5] [CODEX] Header layout (title, New, Commit…, status, More actions) and dialog styling across the viewport matrix in src/style.css

---

## Phase 10: User Story 6 - Group by that groups (Priority: P2)

**Goal**: meaningful groups for every document kind; honest disabled modes.

**Independent Test**: `bun run test:grouping-validation`; tests/grouping-modes.test.ts.

- [x] T073 [P] [US6] Unit tests: per shipped example and mode, group counts (≥ 2 for every enabled mode), disabled reasons, Auto choice and label, UBL areas without name check, contract-level domain alone not "declared" (SC-007) in tests/grouping-modes.test.ts
- [x] T074 [US6] Mutant: Auto picks a one-group mode; communities ignore foreign keys
- [x] T075 [US6] Kind-aware business entities and backbone edges in src/communities.ts; `groupingModes` and Auto order, contract domain rule, areas detection in src/overview.ts (FR-070–FR-072)
- [x] T076 [US6] Disabled modes with reasons and the correct Auto label in src/GroupingControls.tsx; Adjust grouping dialog src/AdjustGroupingDialog.tsx (FR-073, FR-074)
- [x] T077 [US6] Apply grouping as card tint in the lineage canvas and to Neighborhood node colour in src/odcs/LineageCanvas.tsx and src/NeighborhoodGraph.tsx (FR-074)
- [x] T078 [US6] Update scripts/grouping-validation-ui-tests.ts for contracts and semantic models

---

## Phase 11: User Story 7 - Remotes, clone, identity, credentials (Priority: P2)

**Goal**: Git setup entirely from the app (credential setup excepted).

**Independent Test**: quickstart §4 `bun run test:git-setup` against local bare repositories.

### Tests

- [ ] T079 [P] [US7] Handler tests: identity read per repository (local and global scope), `PUT identity` writes local config only, `allRepositories`, live (no restart) in tests/identity.test.ts
- [ ] T080 [P] [US7] Handler tests: clone validation (`transport::`, leading `-`, newlines), staging + journal, `core.autocrlf=false`, `core.symlinks=false`, no submodules, cancel, invalid files listed not rewritten, name collision proposes free name, interrupted clone rolled back on restart in tests/clone.test.ts
- [ ] T081 [US7] Mutants: identity written with `--global`; clone runs without explicit action; clone target outside data/projects/; symlinks enabled on clone

### Implementation

- [ ] T082 [US7] Per-repository live identity in server/projects/git.ts, server/projects/workspace.ts, server/routes/projects.ts (`/api/status` repositories) and routes `git/identity`, `git/credential-helper`, emitting the SSE `identity` event (FR-067)
- [ ] T083 [US7] Clone flow server/routes/clone.ts and workspace `cloneRepository` with SSE `clone` events (FR-064)
- [ ] T084 [US7] Dialogs: Set Git identity (banner, commit dialog and import failures link to it), Remote, Clone repository with progress and Cancel, Credential setup guide (static text per OS, helper check) in src/scm/*.tsx and src/projects/GitBanner.tsx (FR-065, FR-068)
- [ ] T085 [US7] Browser check scripts/git-setup-browser-check.ts: identity, remote, clone from bare repository, guide from a failed push, no network remote (SC-009)

---

## Phase 12: User Story 8 - Several projects in one repository (Priority: P3)

**Goal**: subfolder projects sharing a repository's Source Control.

**Independent Test**: quickstart §4 `bun run test:monorepo`.

### Tests

- [ ] T086 [P] [US8] Unit tests for manifest reading/validation (schema, `..`, `.git`, nesting) and detection (smallest folder set, depth ≤ 4, ignored paths) in tests/repositories.test.ts
- [ ] T087 [P] [US8] Handler tests: register subfolder projects, Source Control shared, Git event rescans every project of the repository, branch switch affects both, Remove from workspace deletes nothing, Delete folder trashes only the subfolder, restore without overwrite, Clear workspace moves the repository once in tests/subprojects.test.ts
- [ ] T088 [US8] Mutants: manifest path with `..` accepted; subproject delete touches a sibling project; Git event rescans only one project

### Implementation

- [ ] T089 [US8] server/projects/repositories.ts (manifest, detection, registration, optional "Save as manifest" through a hash-checked save) and routes server/routes/repos.ts (FR-064)
- [ ] T090 [US8] Registry `folder`/`repo` in server/projects/state.ts, scanner and watcher per repository root in server/projects/scanner.ts and server/projects/watcher.ts, Git paths prefixed by subfolder in server/projects/scm.ts (FR-069)
- [ ] T091 [US8] Trash `subproject` entries and the two delete modes in server/projects/trash.ts and server/routes/projects.ts (FR-066)
- [ ] T092 [US8] UI: repository grouping in the project tree, Projects in this repository dialog after clone and from the repository menu, delete dialog with Remove (default) and Delete folder, Source Control marks each file's project, in src/projects/*.tsx and src/scm/SourceControl.tsx
- [ ] T093 [US8] Browser check scripts/monorepo-browser-check.ts

---

## Phase 13: User Story 9 - Mappings that fit (Priority: P3)

**Goal**: bindings never overflow; composer in a dialog.

**Independent Test**: `bun run test:mappings-layout`.

- [ ] T094 [P] [US9] Geometry check scripts/mappings-layout-check.ts: all shipped mapping files plus a synthetic mapping with 80-character identifiers without separators and long dotted paths, six viewports, every group expanded; asserts no element past its card, no orphan arrow at line start/end, "1 binding" (FR-063, SC-008)
- [ ] T095 [US9] [CODEX] Binding chain layout: `<wbr>` after `.`/`_`, `overflow-wrap: break-word`, arrow as a pseudo-element of the following step, two-column layout (concepts, bindings) in src/MappingExplorer.tsx and src/style.css; brief specs/002-lineage-and-ux/codex/phase-12.md
- [ ] T096 [US9] Compose a query dialog and pluralisation helper in src/MappingExplorer.tsx

---

## Phase 14: Polish and cross-cutting

- [ ] T097 [P] README: lineage (reading of declared names, foreign-key direction), pierce budgets, Metric vocabulary and `kpi_bindings`, autosave and Commit, import commits, clone among network operations, repository-local identity, credential guide, manifest format, SQL lint coverage and warnings, Group by modes; counts from tests (constitution VII)
- [ ] T098 [P] Update docs/graph-design.md with the lineage canvas, ports, paging and incremental placement
- [ ] T099 Run every suite and record results in specs/002-lineage-and-ux/verification.md (commands, counts, durations, screenshots paths)
- [ ] T100 [CODEX] Final overlap sweep: every floating element in the lineage canvas, Neighborhood pierce banner and dialogs across the viewport matrix in scripts/responsive-ui-tests.ts

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. T011 (repository key) blocks US7/US8; T007–T009 block US1;
  T010 blocks US10.
- US3 (Phase 3) before every phase that edits files from the UI (US1 Properties edits, US2
  wizard, US4 item editor, US5 dialogs).
- US1 before US10 lineage tasks (T046) and before US11 (T105–T107 reuse LineageCard/Canvas);
  US11 pierce (T110, in Phase 6) after US10 core (T043–T044); US10 Neighborhood tasks (T045) only need Phase 2.
- US2 after US1 (lineage labels) and before US4 (wizard renamed before SqlField).
- US7 before US8 (clone feeds repository registration).
- US5 sidebar/header (T066–T067, T072) after US3 header change (T023).
- US6 T077 after US1 and US10.
- Phase 13 last.

### Parallel opportunities

- Phase 1: T002, T003, T004, T005 together.
- Phase 2: T006, T008, T009, T010, T012 together; T007 after T006; T011 alone (touches Git core).
- Each story: its [P] test tasks together; e.g. US1 T025–T027, US10 T039–T041, US4 T055–T057,
  US7 T079–T080, US8 T086–T087, US11 T101–T102.
- After US3 lands: US1 and US10-Neighborhood (T039–T045) in parallel; US6 and US9 in parallel
  with US7.

## Implementation Strategy

- **MVP**: Phases 1–4 (setup, foundations, save/commit, lineage). Demonstrable: edit → saved →
  Commit…; contract lineage to metrics.
- **P1 complete**: add Phases 5–7 (concept-mapping graph, pierce, Metric vocabulary). Tag a pre-release if useful.
- **Increment 2**: Phases 8–10 (SQL, dialogs, Group by).
- **Increment 3**: Phases 11–13 (Git setup, monorepo, Mappings).
- **Release v0.3.0** after Phase 14 with every suite green and the README updated.
