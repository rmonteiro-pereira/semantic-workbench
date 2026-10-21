---
description: "Task list for Workbench Improvements (001)"
---

# Tasks: Workbench Improvements (metrics layer, projects, editing, graph navigation, source control)

**Input**: Design documents from `specs/001-workbench-improvements/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution 2.0.0 Principle VI mandates unit/API tests, an isolated browser
check per user-visible change, and targeted mutants for new decision logic. Test tasks come first
in each phase and must fail before the implementation tasks that follow.

**Organization**: Phases follow the 12 delivery phases of [plan.md](./plan.md#delivery-phases),
preceded by Phase 0 (setup). Each phase is independently shippable: it ends with every existing
suite (`bun test`, `check`, `build`, `test:ui`, `test:responsive`, `test:edges`,
`test:grouping-validation`, `test:examples:ui`, `test:mutation`) green plus its own checks.

## Format: `[ID] [P?] [Story?] [CODEX?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[USn]**: user story from spec.md (US1 metrics … US12 polish)
- **[CODEX]**: UI layout/polish task intended to be implemented with the Codex CLI from a written
  brief; reviewed and gated like any other task
- Paths are repository-relative (web app: `src/` frontend, `server/` API, `tests/`, `scripts/`)

---

## Phase 0: Setup (shared infrastructure)

**Purpose**: protect the owner's data and prepare isolation, dependencies and scripts.

- [X] T001 Back up the owner's real workspace before any migration code runs against it: stop the app, copy `data/` to a dated folder outside the repository (for example `../semantic-workbench-data-backup-YYYYMMDD/`), record `sha256sum data/workbench.sqlite` in a `BACKUP.txt` beside the copy, and confirm with `cmp` that the copied database is identical
- [X] T002 [P] Add pinned CodeMirror 6 dependencies (`@codemirror/state`, `view@6.43.15`, `commands`, `search`, `language`, `lint`, `lang-yaml@6.1.3`, `lang-json`, `lang-xml`, `legacy-modes@6.5.5`, `merge@6.12.3`) to package.json and bun.lock
- [X] T003 [P] Create server/projects/paths.ts with `DATA_DIR` (env, default `data/`) and the layout of data-model.md (`projects/`, `state/`, `trash/`, `backup/`, `cache.sqlite`); read it in server/index.ts
- [X] T004 [P] Create tests/helpers/temp-data-dir.ts that creates an isolated `DATA_DIR` with Git `user.name`/`user.email` set for the test process
- [X] T005 [P] Create scripts/helpers/isolated-api.ts that starts the API on a temporary `DATA_DIR` for browser checks (never the user's `data/`)
- [X] T006 Add package.json scripts `test:projects`, `test:trash`, `test:metrics`, `test:editor`, `test:item-edit`, `test:rdf-edit`, `test:scm`, `test:odcs` pointing to the browser checks created in later phases
- [X] T007 [P] Document prerequisites (Git ≥ 2.40, configured identity, `DATA_DIR`) in README.md

**Checkpoint**: backup verified; isolation helpers available.

---

## Phase 1: Foundational: folder storage, migration, live refresh (plan phase 1) — blocks all later phases

**Goal**: projects are folders under `data/projects/<slug>/` (Git working trees), SQLite is a cache,
state is durable, the UI refreshes live, v0.1.0 workspaces migrate.

**Independent Test**: quickstart.md "Phase 1" (migration hashes, live external edit ≤ 2 s, cache
deletion loses nothing, two-tab stale save).

### Tests (write first)

- [X] T008 [P] Unit tests for atomic write (temp → fsync → rename → fsync dir, simulated crash keeps the original) and SHA-256 hashing in tests/atomic.test.ts
- [X] T009 [P] Path validation tests in tests/paths.test.ts: reject `..`, absolute paths and anything under `.git/`; slug must match `^[a-z0-9][a-z0-9-]{0,62}$`; project name 1–200 chars, unique case-insensitively
- [X] T010 [P] State file tests (each file carries `formatVersion`; atomic replace; projects.json, views/<slug>.json, drafts, legacy-ids.json) in tests/state.test.ts
- [X] T011 [P] Journal tests in tests/journal.test.ts: unfinished journal rolled forward when every source exists and every destination is free, otherwise rolled back; outcome reported
- [X] T012 [P] Scanner tests in tests/scanner.test.ts: listing via `git ls-files -co --exclude-standard -z` honours `.gitignore`; unsupported types hidden; supported files with syntax errors shown invalid (FR-079, FR-092)
- [X] T013 [P] Cache tests in tests/cache.test.ts: delete `cache.sqlite` → rebuild yields identical files/entities/findings; `PRAGMA user_version` mismatch triggers rebuild (SC-015)
- [X] T014 [P] SSE tests in tests/events.test.ts: increasing ids, `Last-Event-ID` replay from a 1,000-event ring, `resync` when older, 15 s heartbeat, origin check on `/api/events`
- [X] T015 [P] Migration tests in tests/migration.test.ts with a v0.1.0 SQLite fixture: backup created; every source exported byte-for-byte and SHA-256 verified; duplicate filenames become `name (2).ext`; example sets grouped, others in "Ungrouped"; `git init -b main` + initial commit per project; legacy ids mapped; `document_views` carried to views/<slug>.json; a failed verification aborts and leaves the database untouched (FR-089, SC-016)
- [X] T016 [P] File API tests in tests/files-api.test.ts: `PUT` with `baseHash` returns `409 {error:'stale', currentHash, currentSource}` on mismatch; patches apply to base bytes; invalid source → 400 with issues and no write; legacy `/api/documents` facade keeps its shapes (R9)
- [X] T017 [P] Git plumbing tests in tests/git.test.ts: argument arrays only, explicit `cwd` inside `DATA_DIR/projects/`, per-repository serialization, 30 s local timeout, `core.autocrlf=false` in managed repos, `GIT_TERMINAL_PROMPT=0` set, missing Git / missing identity detected (FR-084, FR-085, FR-090)

### Implementation

- [X] T018 Implement path helpers and validation in server/projects/paths.ts
- [X] T019 [P] Implement atomic write and hashing in server/projects/atomic.ts
- [X] T020 [P] Implement state files (registry, views, drafts with base hash, legacy ids) in server/projects/state.ts
- [X] T021 Implement operation journal and start-up recovery in server/projects/journal.ts (depends on T019, T020)
- [X] T022 Implement the Git wrapper (Bun.spawn, inherited environment plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, per-repo queue, timeouts; init, config, add, commit, ls-files, minimal status) in server/projects/git.ts
- [X] T023 [P] Implement the SQLite cache (`files`, `entities`, `findings`, `suggestions` tables of data-model.md) in server/projects/cache.ts
- [X] T024 Implement the scanner (list, hash, serialization sniffing, shared validation from src/input.ts, index into cache) in server/projects/scanner.ts (depends on T022, T023)
- [X] T025 Implement the watcher (recursive `fs.watch`, 150 ms debounce per project, reconcile after Git operations, 60 s safety rescan) in server/projects/watcher.ts
- [X] T026 Implement the SSE hub and `GET /api/events` per contracts/sse-events.md in server/projects/events.ts and server/routes/events.ts
- [X] T027 Implement project routes (`GET/POST/PATCH /api/projects`, `POST /api/import` one project per batch, `POST /api/examples/:id`) in server/routes/projects.ts
- [X] T028 Implement file and draft routes (`GET/PUT` files with `baseHash`/patches, drafts) in server/routes/files.ts and server/routes/drafts.ts
- [X] T029 Implement migration (research R8) in server/projects/migration.ts and run it, then journal recovery, on start in server/index.ts
- [X] T030 Rework server/handler.ts into a router over server/routes/*, keep the legacy facade (`/api/documents`, grouping, `/api/agent/*` with ids from legacy-ids.json or `<project>/<path>`), adapt server/agent/runtime.ts to read the folder store, and retire server/store.ts
- [X] T031 [P] [US2] Implement the API client and EventSource subscription with resync in src/projects/api.ts and src/projects/useEvents.ts
- [X] T032 [US2] Implement the project tree sidebar (tree "Projects", per-file type and validity) in src/projects/Sidebar.tsx and replace the flat list and example loaders in src/main.tsx
- [X] T033 [US2] Handle stale saves (409) with a basic before/after view and add the Git/identity banner in src/main.tsx and src/projects/GitBanner.tsx
- [X] T034 Move every existing suite onto isolated data (tests/api-validation.test.ts, tests/store.test.ts → cache/facade, scripts/ui-tests.ts, scripts/examples-ui-tests.ts, scripts/grouping-validation-ui-tests.ts, scripts/responsive-ui-tests.ts, scripts/edge-attachment-ui-tests.ts) via T004/T005
- [X] T035 Browser check scripts/projects-browser-check.ts: tree, live update after an external edit within 2 s, two-tab stale save, cache deletion and restart (SC-015, SC-017)
- [X] T036 Add mutants in scripts/mutation-tests.ts: drop the base-hash check; write in place instead of temp+rename; skip migration hash verification; accept `..` paths; omit the origin check on `/api/events`; journal always rolls forward
- [X] T037 Update README.md: folder layout under `data/`, migration and backup, live refresh

**Checkpoint**: storage foundation shippable; all suites green.

---

## Phase 2: User Story 2 — delete, undo, trash, Clear, grouping suggestions (plan phase 2, P1)

**Goal**: every cleanup from the UI, no script or reload; suggestions for separately imported files.

**Independent Test**: quickstart.md "Phase 2"; SC-005, SC-006.

### Tests

- [X] T038 [P] [US2] Trash tests in tests/trash.test.ts: undo allowed until `undoUntil = deletedAt + 10 s`, 410 after; restore never overwrites (409 `occupied`); purge; Clear creates one entry per project with a shared `batchId`; all journaled; project delete moves the folder including `.git`
- [X] T039 [P] [US2] Delete-impact tests in tests/delete-impact.test.ts: removed items, unsaved drafts and broken references listed
- [X] T040 [P] [US2] Suggestion tests in tests/suggestions.test.ts: evidence only of kinds `ossie-ref-name`, `shared-iri`, `odcs-physical-name` (never name similarity); rejected suggestions persist by file hash + target
- [X] T041 [P] [US2] Rename/move and re-import conflict tests (`409 {conflicts}` without `onConflict`; `replace` or `keep-both`) in tests/projects-api.test.ts

### Implementation

- [X] T042 [US2] Implement delete/undo/restore/purge/clear with trash entries (`entryId` ULID, `kind`, original location, `deletedAt`, `hash`, `undoUntil`, `batchId`) in server/projects/trash.ts
- [X] T043 [US2] Implement trash and delete routes including `GET …/delete-impact` per contracts/http-api.md in server/routes/trash.ts
- [X] T044 [P] [US2] Implement suggestion inference and accept/reject in server/projects/suggestions.ts and server/routes/suggestions.ts
- [X] T045 [US2] Implement rename, move (journaled) and re-import conflict handling in server/routes/projects.ts
- [X] T046 [P] [US2] Delete confirmation dialog in src/projects/DeleteDialog.tsx
- [X] T047 [P] [US2] Undo toast (10 s) in src/projects/UndoToast.tsx
- [X] T048 [P] [US2] Trash dialog (restore, delete permanently, empty with confirmation) in src/projects/Trash.tsx
- [X] T049 [P] [US2] Grouping suggestions region in src/projects/Suggestions.tsx
- [X] T050 [US2] Wire Rename/Move/Delete/Clear/Trash into src/projects/Sidebar.tsx
- [X] T051 [US2] Browser check scripts/trash-browser-check.ts: confirm → undo → trash → restore → purge; Clear; suggestion accept/reject; no reload
- [X] T052 [US2] Add mutants in scripts/mutation-tests.ts: undo after expiry allowed; restore overwrites; suggestion from similar names; delete without the confirm flag
- [X] T053 [US2] Remove scripts/clear-db.ts and update README.md (deletion, trash, suggestions)

**Checkpoint**: Story 2 complete.

---

## Phase 3: User Stories 3 and 1 (read side) — Ossie layouts, metrics view and explanation (plan phase 3, P1)

**Goal**: both official Ossie layouts in every view; KPIs listed, explained (never executed), linked
to concepts and ODCS.

**Independent Test**: quickstart.md "Phase 3"; SC-001, SC-003, SC-004, SC-007.

### Tests

- [ ] T054 [P] [US3] Layout tests in tests/ossie-layouts.test.ts: Flights split set and `flights.yaml` give identical concept, dataset, join, metric and 60 binding counts; embedded layout labelled deprecated; other single-file layouts rejected
- [ ] T055 [P] [US1] Metric extension tests in tests/metric-extension.test.ts on generated copies of the 34 shipped metrics: parse, validate against schemas/semantic-workbench-metric-v1.json, locate errors to line/column; rules: "ratio requires numerator and denominator", "semi_additive requires non_additive_over and period_aggregation", "deprecated requires replaced_by or deprecation_reason"; workspace findings of FR-004 (inputs exist, no dependency cycles, grains allowed by the time dimension and ≥ `min_grain`, filters and dimensions refer to existing fields, declared type agrees with the expression)
- [ ] T056 [P] [US1] KPI binding tests in tests/kpi-bindings.test.ts: mapping root extension; `metric` unique and present in the referenced semantic model; `measures` required and resolvable; `of` optional; consolidated file reads the embedded semantic_model root
- [ ] T057 [P] [US1] Explanation tests in tests/explain.test.ts: composition trees for simple/ratio/derived; inputs down to ODCS properties; additivity refusal of sum-of-ratio and sum over time for semi-additive; division-by-zero detection; no execution path is invoked
- [ ] T058 [P] [US1] Dependency tests in tests/metric-deps.test.ts: metric edges from the syntax-tree analysis (fixes baseline defect 20; `order.` must not match `suborder.x`)

### Implementation

- [ ] T059 [P] [US1] Pin schemas/semantic-workbench-metric-v1.json and schemas/semantic-workbench-mapping-v1.json from contracts/, labelled as application schemas in schemas/README.md
- [ ] T060 [US3] Include the embedded semantic model's datasets, joins and metrics and the layout label in src/model.ts (baseline defect 19)
- [ ] T061 [US3] Resolve cross-file references project-first and report ambiguity with all candidates in server/agent/runtime.ts
- [ ] T062 [P] [US1] Shared extension parse/validate/locate in src/metrics/extension.ts, called from src/validation.ts
- [ ] T063 [P] [US1] Shared KPI binding parse/validate in src/metrics/bindings.ts
- [ ] T064 [US1] Move metric dependency extraction into src/metrics/deps.ts, use it from server/agent/runtime.ts and src/model.ts (replacing the text match)
- [ ] T065 [US1] KPI explanation and SQL preview (planner, refusal on additivity) in server/agent/explain.ts and `GET …/explain/:metric` in server/routes/explain.ts
- [ ] T066 [US1] Metrics view (table Label, Type, Unit, Status, Owner, Concept; group and filter) in src/metrics/MetricsView.tsx and a "Metrics" tab in src/main.tsx
- [ ] T067 [P] [US1] KPI detail and "How it is calculated" region (tree, inputs, rules, concepts, SQL "Preview · not executed") in src/metrics/KpiDetail.tsx and src/metrics/Explanation.tsx
- [ ] T068 [P] [US1] Lineage to ODCS objects/properties with declared quality/SLA trust indicators in src/metrics/Lineage.tsx
- [ ] T069 [US1] KPI node type with show/hide and concept KPI badges in src/FullGraph.tsx, src/NeighborhoodGraph.tsx and the catalog in src/main.tsx
- [ ] T070 [US1] Browser check scripts/metrics-browser-check.ts: Metrics list, KPI detail, explanation, refused rollup, Flights in both layouts
- [ ] T071 [US1] Add mutants: accept a ratio rollup; drop the extension schema check; lineage from text match; treat the embedded layout as ontology-only
- [ ] T072 [US1] Update README.md and docs/agent-runtime.md ("explains, never executes"; layouts; extension storage)

**Checkpoint**: Stories 3 and 1 (read side) complete.

---

## Phase 4: User Story 4 — neighborhood walk (plan phase 4, P1)

**Goal**: working neighborhood (baseline defects 1–9) and walking across relationships.

**Independent Test**: quickstart.md "Phase 4"; SC-008.

### Tests

- [ ] T073 [P] [US4] Rewrite tests/graph-view.test.ts: projection independent of focus (replace the test codifying the bypass), lateral-link toggle, shown/hidden counts, deterministic neighbor ranking, exact-match-first search
- [ ] T074 [P] [US4] Walk reducer tests (push, back, forward, truncation) in tests/walk.test.ts
- [ ] T075 [P] [US4] Layout tests in tests/neighborhood-layout.test.ts: center in a middle column (incoming left, outgoing right); unique edge offsets so no two edges share a path

### Implementation

- [ ] T076 [US4] Rewrite the neighborhood projection in src/graph-view.ts
- [ ] T077 [P] [US4] Walk state in src/graph/walk.ts
- [ ] T078 [US4] Centered neighborhood layout in src/layout.ts
- [ ] T079 [US4] Per-edge offsets and correct backward routing in src/RelationshipEdge.tsx
- [ ] T080 [US4] Neighborhood UI in src/NeighborhoodGraph.tsx: searchable center picker, breadcrumb "Walk" with Back/Forward, "N more neighbors", lateral toggle, center styling, no empty-state flash, fit after measurement, KPI indicator; continue the walk into another file of the same project when the target is defined there by shared IRI or mapping reference (FR-037, SHOULD)
- [ ] T081 [US4] Extend scripts/graph-browser-check.ts (five-hop UBL walk, counts, no flash) and overlap assertions for neighborhood edges in scripts/responsive-ui-tests.ts
- [ ] T082 [US4] Add mutants: star-only filter restored; neighbor cap without count; shared route line
- [ ] T083 [US4] Update README.md graph section

**Checkpoint**: Story 4 complete.

---

## Phase 5: User Story 5 — CodeMirror source editor (plan phase 5, P2)

**Goal**: VS Code-like highlighting and inline lint; byte-exact patch-based saves.

**Independent Test**: quickstart.md "Phase 5"; SC-009, SC-010 (Source part).

### Tests

- [ ] T084 [P] [US5] Patch mapping tests in tests/patch.test.ts: CRLF, mixed endings, tabs, trailing newline; inserted breaks use the dominant style
- [ ] T085 [P] [US5] Lint range mapping and document-level fallback tests in tests/lint-ranges.test.ts

### Implementation

- [ ] T086 [US5] Editor change set → source-range patches in src/editor/patch.ts
- [ ] T087 [P] [US5] Languages (YAML, JSON, XML for RDF/XML, Turtle also for N3, N-Triples, `.gitignore`; nested JSON inside the `SEMANTIC_WORKBENCH` block scalar) in src/editor/languages.ts
- [ ] T088 [P] [US5] Validation worker with 300 ms debounce in src/editor/lint.worker.ts and src/editor/lint.ts
- [ ] T089 [US5] CodeEditor component (line numbers, search, undo/redo, Go to line, accessible name "Definition source") in src/editor/CodeEditor.tsx
- [ ] T090 [US5] Replace the textarea editor in src/main.tsx and the import-repair editor in src/ValidationPanel.tsx; retire src/SourceEditor.tsx and adapt tests/source-editor.test.ts
- [ ] T091 [US5] Save through `PUT` with patches in src/main.tsx
- [ ] T092 [US5] Browser check scripts/editor-browser-check.ts: colors per serialization, inline markers ≤ 500 ms, Go to line, repair dialog, CRLF byte check
- [ ] T093 [US5] Add mutants: patch inserts LF in a CRLF file; lint drops ranges; save sends full text
- [ ] T094 [US5] Update README.md (editor, lint)

**Checkpoint**: Story 5 complete.

---

## Phase 6: User Stories 6, 7 (YAML/JSON) and 1 (authoring) — item editing, add/delete, KPI wizard (plan phase 6, P2)

**Independent Test**: quickstart.md "Phase 6"; SC-002, SC-010 (YAML/JSON).

### Tests

- [ ] T095 [P] [US6] YAML node patch tests (comments, anchors, key order, quoting kept) in tests/yaml-patch.test.ts
- [ ] T096 [P] [US6] JSON value patch tests (indentation kept; no whole-file re-serialization, baseline defect 22) in tests/json-patch.test.ts
- [ ] T097 [P] [US7] Insert-in-document-style and dependents-on-delete tests in tests/item-add-delete.test.ts
- [ ] T098 [P] [US1] KPI save tests in tests/kpi-save.test.ts: metric + extension written; exactly one sorted binding line added to the mapping extension; minimal mapping created with `concept_mappings: []` when none exists; consolidated file uses the embedded semantic_model root; journaled; 409 on any stale base hash; editing an approved KPI sets `status` to `proposed`, deprecation requires `replaced_by` or `deprecation_reason`, and dependents are listed before saving (FR-015)

### Implementation

- [ ] T099 [US6] YAML range patching in src/edit/yaml-patch.ts
- [ ] T100 [P] [US6] JSON range patching in src/edit/json-patch.ts
- [ ] T101 [US6] Item ranges per document type (concept, relationship, dataset, join, metric, ODCS object/property/foreign key, mapping) in src/edit/item-model.ts
- [ ] T102 [US6] Item editor (fields per type, inline lint, Save disabled while invalid) in src/edit/ItemEditor.tsx, opened from graph, neighborhood, overview and catalog clicks in src/main.tsx
- [ ] T103 [US7] Add/delete forms and dependents confirmation in src/edit/AddItem.tsx and src/edit/DeleteItem.tsx
- [ ] T104 [US6] Rename reference report (no silent rewrite) in src/edit/references.ts
- [ ] T105 [US1] `POST /api/projects/:slug/kpis` journaled multi-file save in server/routes/kpis.ts
- [ ] T106 [US1] KPI wizard (concept → data → type and inputs → time and breakdowns → targets → governance → explanation and SQL preview → save) in src/metrics/KpiWizard.tsx, with the FR-015 status rules also enforced when a KPI is edited in src/edit/ItemEditor.tsx
- [ ] T107 [US6] Browser check scripts/item-edit-browser-check.ts: edit/add/delete per YAML/JSON type, wizard, `git diff` limited to the item
- [ ] T108 [US6] Add mutants: JSON re-serialization; delete without dependents; wizard duplicates a formula into the extension
- [ ] T109 [US6] Update README.md (item editing, KPI wizard)

**Checkpoint**: Stories 6/7 (YAML/JSON) and Story 1 authoring complete.

---

## Phase 7: User Stories 6 and 7 (RDF) — RDF item editing (plan phase 7, P2)

**Independent Test**: quickstart.md "Phase 7"; SC-010 (all serializations).

### Tests

- [ ] T110 [P] [US6] Isomorphism gate tests (parsed graph = original − removed + added) in tests/rdf-isomorphism.test.ts
- [ ] T111 [P] [US6] N-Triples line-edit tests in tests/rdf-patch-ntriples.test.ts
- [ ] T112 [P] [US6] Turtle/N3 block-rewrite tests (multiple blocks, new prefixes, comment warnings, N3 formulae refused) in tests/rdf-patch-turtle.test.ts
- [ ] T113 [P] [US6] RDF/XML element-edit tests (refusal of parse-type collections and reification) in tests/rdf-patch-rdfxml.test.ts

### Implementation

- [ ] T114 [US6] Isomorphism check in src/edit/rdf-patch/isomorphism.ts
- [ ] T115 [P] [US6] N-Triples patcher in src/edit/rdf-patch/ntriples.ts
- [ ] T116 [P] [US6] Turtle and N3 patcher in src/edit/rdf-patch/turtle.ts
- [ ] T117 [P] [US6] RDF/XML patcher in src/edit/rdf-patch/rdfxml.ts
- [ ] T118 [US7] RDF item forms and add/delete (OWL class/property, SHACL shape, RDF resource) in src/edit/ItemEditor.tsx and src/edit/AddItem.tsx
- [ ] T119 [US6] Browser check scripts/rdf-edit-browser-check.ts
- [ ] T120 [US6] Add mutants: skip isomorphism check; rewrite the whole document
- [ ] T121 [US6] Update README.md with per-serialization edit guarantees

**Checkpoint**: all formats editable per item.

---

## Phase 8: User Story 9 — Source Control (plan phase 8, P2)

**Independent Test**: quickstart.md "Phase 8"; SC-012.

### Tests

- [ ] T122 [P] [US9] Status parsing tests (porcelain v2 `-z`, renames, conflicts, hidden-file labels) in tests/git-status.test.ts
- [ ] T123 [P] [US9] Remote tests against a local bare remote in tests/git-remote.test.ts: push, pull `--no-rebase --no-edit`, conflicts surfaced, 10-minute remote timeout and cancel, `GIT_TERMINAL_PROMPT=0` set and `GCM_INTERACTIVE`/`GCM_GUI_PROMPT` not overridden
- [ ] T124 [P] [US9] Blocking tests (pull/switch with drafts or a dirty tree → 409; no auto-stash) in tests/git-blocking.test.ts
- [ ] T125 [P] [US9] `.gitignore` tests (Add to .gitignore pattern derivation, rescan, tracked-file explanation) in tests/gitignore.test.ts
- [ ] T126 [P] [US9] Altered-bytes report tests with a hook and a `.gitattributes` filter in tests/altered-bytes.test.ts

### Implementation

- [ ] T127 [US9] Extend server/projects/git.ts: status, diff texts, stage/unstage, `commit -F -`, branches, switch/create, remote, fetch/pull/push/sync, log, show, cancel, post-operation hash check
- [ ] T128 [US9] Source Control routes per contracts/http-api.md including `POST …/gitignore` in server/routes/git.ts
- [ ] T129 [P] [US9] Diff view on `@codemirror/merge` in src/scm/DiffView.tsx
- [ ] T130 [P] [US9] Branch picker and create in src/scm/BranchPicker.tsx
- [ ] T131 [US9] Source Control panel (changes, hidden-file labels, stage/unstage, commit, remote actions, "Waiting for Git (credentials may be requested in a separate window)" with Cancel, Add to .gitignore) in src/scm/SourceControl.tsx
- [ ] T132 [US9] Use DiffView for stale saves and file history in src/main.tsx; list and edit `.gitignore` in src/projects/Sidebar.tsx
- [ ] T133 [US9] Browser check scripts/scm-browser-check.ts: commit, branch, switch, push, pull, conflict repair, Add to .gitignore, missing-git banner
- [ ] T134 [US9] Add mutants: allow pull with drafts; shell-string invocation; remote call outside an explicit endpoint; commit without message
- [ ] T135 [US9] Update README.md (Git network use, credential helper window, no stored credentials)

**Checkpoint**: Story 9 complete.

---

## Phase 9: User Story 8 — ODCS dataset pages (plan phase 9, P2)

**Independent Test**: quickstart.md "Phase 9"; SC-011.

### Tests

- [ ] T136 [P] [US8] Property-level diff between commits in tests/odcs-diff.test.ts
- [ ] T137 [P] [US8] ODCS lineage (foreign keys, downstream datasets, metrics, KPIs; depth) in tests/odcs-lineage.test.ts

### Implementation

- [ ] T138 [P] [US8] Property diff in src/odcs/odcs-diff.ts
- [ ] T139 [P] [US8] Lineage builder in src/odcs/lineage.ts
- [ ] T140 [US8] Write the Codex brief for phase 9 layout (FR-056–058, ui-contracts, Marquez concepts, suites to pass) in specs/001-workbench-improvements/codex/phase-09.md
- [ ] T141 [US8] [CODEX] Contract overview page in src/odcs/ContractOverview.tsx
- [ ] T142 [US8] [CODEX] Dataset page with header and tabs Schema/Lineage/History/Quality in src/odcs/DatasetPage.tsx
- [ ] T143 [US8] In-place property edits from the schema table via src/edit/yaml-patch.ts and src/edit/json-patch.ts in src/odcs/DatasetPage.tsx
- [ ] T144 [US8] Browser check scripts/odcs-browser-check.ts
- [ ] T145 [US8] Add mutant: property diff ignores type changes
- [ ] T146 [US8] Update README.md ODCS section

---

## Phase 10: User Story 10 — full screen and adaptive layout (plan phase 10, P3) — Codex

**Independent Test**: quickstart.md "Phases 10–12"; SC-013.

- [ ] T147 [US10] Write the Codex brief (FR-066–067, viewport matrix, defects list, suites) in specs/001-workbench-improvements/codex/phase-10.md
- [ ] T148 [US10] Extend scripts/responsive-ui-tests.ts with a resize sweep and full-screen enter/exit state-restore checks (written before the Codex work)
- [ ] T149 [US10] [CODEX] Full-screen control, Escape exit and window-filling fallback in src/graph/fullscreen.ts, src/FullGraph.tsx and src/NeighborhoodGraph.tsx
- [ ] T150 [US10] [CODEX] Adaptive reflow for sidebar, toolbars, inspector, Metrics, ODCS, Source Control and editors in src/style.css
- [ ] T151 [US10] Add mutant: full-screen exit does not restore the view

---

## Phase 11: User Story 11 — Mappings layout (plan phase 11, P3) — Codex

- [ ] T152 [US11] Write the Codex brief (FR-068–070, baseline defect 21) in specs/001-workbench-improvements/codex/phase-11.md
- [ ] T153 [US11] Add mapping chain assertions to scripts/examples-ui-tests.ts (written before the Codex work)
- [ ] T154 [US11] [CODEX] Binding chains, grouping by dataset, separated fields/sources/metrics, side-by-side composer in src/MappingExplorer.tsx
- [ ] T155 [US11] [CODEX] Findings linking to the item editor in src/MappingExplorer.tsx

---

## Phase 12: User Story 12 — UI polish and overlaps (plan phase 12, P3) — Codex

- [ ] T156 [US12] Write the Codex brief (FR-071–074, baseline defects 10–16) in specs/001-workbench-improvements/codex/phase-12.md
- [ ] T157 [US12] Add pairwise overlap assertions for every overlay in every view to scripts/responsive-ui-tests.ts (written before the Codex work)
- [ ] T158 [US12] [CODEX] Fix overlaps of bundle selector, status line, mini-map, controls, popovers and area titles in src/style.css and src/FullGraph.tsx
- [ ] T159 [US12] [CODEX] Auto-dismiss status messages (≤ 6 s or next action) in src/main.tsx
- [ ] T160 [US12] [CODEX] Correct sidebar and tab active state; separate Neighborhood and Overview view state in src/main.tsx
- [ ] T161 [US12] Add mutants: remove an overlap assertion; status never dismisses

---

## Final Phase: Polish and cross-cutting

- [ ] T162 [P] Final README.md pass: every count produced by tests, limits stated (constitution VII)
- [ ] T163 [P] Update docs/graph-design.md and docs/agent-runtime.md for the folder store and ids
- [ ] T164 Security review of all new routes (path traversal, origin check, argument arrays, no background remote calls)
- [ ] T165 Remove the legacy facade if no suite or documented client uses it, else document it (research R9) in server/handler.ts
- [ ] T166 Run the full quickstart.md and every suite including `bun run test:mutation`

---

## Dependencies and Execution Order

- Phase 0 → Phase 1 (foundational, blocks everything).
- Phase 2 (US2) and Phase 3 (US3/US1 read) and Phase 4 (US4) depend only on Phase 1 and may run in
  parallel.
- Phase 5 (editor) depends on Phase 1; Phase 6 depends on Phases 3 and 5; Phase 7 on Phase 6.
- Phase 8 (Source Control) depends on Phase 1 (Git plumbing) and Phase 5 (merge view).
- Phase 9 depends on Phases 3 (lineage to metrics), 6 (property edits) and 8 (history).
- Phases 10–12 depend on the views they restyle (10: Phases 3, 4, 8, 9; 11: Phase 6 for the item
  editor link; 12: all UI phases) and should run last.
- Within a phase: tests → server modules → routes → UI → browser check → mutants → README.

## Parallel Examples

```text
Phase 1 tests:   T008 T009 T010 T011 T012 T013 T014 T015 T016 T017
Phase 1 modules: T019 T020 T023 (then T021, T024)
Phase 2 UI:      T046 T047 T048 T049
Phase 3 tests:   T054 T055 T056 T057 T058
Phase 7 patchers: T115 T116 T117
```

## Implementation Strategy

1. **MVP**: Phase 0 → Phase 1 → Phase 2 → Phase 3 (storage, cleanup, Ossie layouts, metrics
   explained). Validate with quickstart Phases 1–3, then stop and demo.
2. **Incremental**: Phase 4 → 5 → 6 → 7 → 8 → 9, each shipped after its checks.
3. **Codex**: Phases 10–12 (and the ODCS page layout in 9) from written briefs, with tests added
   before the Codex work so the gate is fixed in advance.

## Notes

- Never run migration or browser checks against the real `data/` before T001's backup exists.
- Commit after each task or logical group; every phase ends green.
