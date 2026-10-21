# Implementation Plan: Workbench Improvements (metrics layer, projects, editing, graph navigation, source control)

**Branch**: `001-workbench-improvements` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-workbench-improvements/spec.md`

## Summary

Turn the workbench from a flat SQLite document list into a set of **folder projects** (each a Git
working tree under `data/projects/`) with live refresh, safe deletion (confirm → 10 s undo →
trash), grouping suggestions and VS Code-like Source Control; make **metrics** the center by
storing KPI attributes in Ossie `custom_extensions` (verdict in [research.md](./research.md#r1))
and explaining every KPI without executing it; fix and extend graph navigation; replace the
textarea with a CodeMirror 6 editor whose saves are source-range patches (byte-exact, CRLF-safe);
add item editing for all formats; redesign the ODCS view after Marquez; then layout, Mappings and
polish work (Codex). Delivery is incremental in 12 phases; every phase keeps all existing suites
green.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Bun 1.4 (API and tests), Vite+ 1.2 (frontend build)

**Primary Dependencies**: existing (`@xyflow/react`, `elkjs`, `cytoscape`/`fcose`, `yaml`, `ajv`,
`n3`, `rdflib`, `@xmldom/xmldom`, `node-sql-parser`); new: CodeMirror 6 packages (`@codemirror/state`,
`view`, `commands`, `search`, `language`, `lint`, `lang-yaml`, `lang-json`, `lang-xml`,
`legacy-modes`, `merge`). Machine-installed Git ≥ 2.40 (invoked via `Bun.spawn`).

**Storage**: project folders `data/projects/<slug>/` (Git working trees, source of truth); JSON
state files in `data/state/`; trash in `data/trash/`; SQLite `data/cache.sqlite` as rebuildable
cache. `DATA_DIR` overrides `data/` for isolated tests.

**Testing**: `bun test` (unit + HTTP handler against temp `DATA_DIR`), Playwright browser checks in
`scripts/` with isolated `DATA_DIR`, targeted mutation suite `scripts/mutation-tests.ts`, responsive
geometry suite.

**Target Platform**: Single-user local workstation (Linux, including WSL2 on ext4), Chromium-class
browser; loopback only.

**Project Type**: Web application (React frontend in `src/`, Bun API in `server/`).

**Performance Goals**: lint markers ≤ 500 ms after typing pauses (< 200 KB documents); external
changes visible ≤ 2 s; UI update after delete/undo/restore ≤ 1 s. (Layout responsiveness, not
speed, is the spec's responsiveness goal.)

**Constraints**: byte-exact sources (constitution II); no query execution; no hosted services;
Git remote operations only on explicit action; 2,000,000-byte documents; no folders outside
`data/projects/`.

**Scale/Scope**: up to the shipped examples (1,000-entity / 5,000-link scale data; 145-entity,
25-KPI shopping center; 169-object UBL contract); tens of projects; 96 functional requirements.

No NEEDS CLARIFICATION remain; research resolved R1–R12, and the owner answered PQ1–PQ3.

## Constitution Check (v2.0.0)

*Gate before Phase 0 and re-checked after Phase 1 design.*

| Principle | How the plan complies | Pre | Post |
| --- | --- | --- | --- |
| I. Local-Only Operation | API stays on `127.0.0.1` with the origin check on every new route, including `/api/events`. Files only under `DATA_DIR/projects/`; path validation rejects `..`, absolute paths and `.git/`. Git remote commands only from explicit fetch/pull/push/sync endpoints; `GIT_TERMINAL_PROMPT=0` (no terminal prompt), Git's credential helper window allowed (PQ2), no stored credentials; the workbench itself never prompts for or transmits credentials. No query execution: KPI explanation and SQL preview only; `/api/agent/plan` remains preview. CodeMirror is bundled, no CDN | ✅ | ✅ |
| II. Byte-Exact Source Preservation | Editor never owns bytes: saves are source-range patches over the base bytes (CRLF/mixed endings tested, R2). Item edits patch only the item's range; RDF edits gated by graph-isomorphism check (FR-055). Metrics extension edits touch only that metric's `data` block (R1, criterion 4). Migration verifies SHA-256 per file | ✅ | ✅ |
| III. One Validation Rule Set | `src/validation.ts`/`src/input.ts` remain the single rule set; the metric extension schema is pinned in `schemas/` and validated by the same module in browser (worker), API save and scanner. Files arriving via Git are validated on scan and shown invalid, never rewritten | ✅ | ✅ |
| IV. Atomic, Hash-Checked File Persistence | Temp + fsync + rename for files and state; `baseHash` on every save (409 with diff); journal for multi-file operations (R7); cache rebuildable (SC-015); Git via argument arrays, per-repo queue, timeouts, `core.autocrlf=false`; deletes move to trash, never rewrite history; migration backs up and verifies | ✅ | ✅ |
| V. Pinned Official Standards | Ossie, ODCS schemas unchanged; workbench extension schema added as `schemas/semantic-workbench-metric-v1.json`, labelled an application schema. Upstream fixtures untouched (extension tests use generated copies) | ✅ | ✅ |
| VI. Verification Gate | Each phase lists unit, API, browser and mutation additions (below); responsive geometry assertions extended; browser checks use isolated `DATA_DIR` | ✅ | ✅ |
| VII. Honest Claims | README updated per phase: data layout, Git network use, "explains, does not execute", supported edit guarantees per serialization, counts produced by tests | ✅ | ✅ |

New runtime dependencies (Technical Constraints): CodeMirror 6 packages, MIT licence, actively
maintained, no network at runtime, 140 KB gzip for the full set (R2). No other runtime
dependency is added; Git is a machine prerequisite for Source Control only.

Gate result: **PASS**, no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-workbench-improvements/
├── spec.md
├── plan.md                       # this file
├── research.md                   # Phase 0 (R1 metrics verdict, R2–R11)
├── data-model.md                 # Phase 1
├── quickstart.md                 # Phase 1
├── contracts/
│   ├── http-api.md
│   ├── sse-events.md
│   ├── ui-contracts.md
│   ├── metric-extension.schema.json
│   └── mapping-extension.schema.json
├── metrics-proposal.md
├── constitution-amendment-proposal.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
server/
├── index.ts                      # reads DATA_DIR; runs migration + recovery on start
├── handler.ts                    # router; legacy /api/documents facade (R9)
├── routes/                       # projects, files, drafts, trash, suggestions, git, events, explain, kpis
├── projects/
│   ├── paths.ts                  # DATA_DIR layout, path validation
│   ├── atomic.ts                 # temp+fsync+rename, hashing
│   ├── state.ts                  # data/state JSON files
│   ├── journal.ts                # multi-file operations + recovery
│   ├── scanner.ts                # git ls-files, hash, validate, index
│   ├── cache.ts                  # SQLite cache (replaces store.ts role)
│   ├── watcher.ts                # fs.watch recursive + debounce + periodic rescan
│   ├── events.ts                 # SSE hub with replay ring
│   ├── trash.ts                  # delete/undo/restore/purge/clear
│   ├── suggestions.ts            # reference-based grouping evidence
│   ├── migration.ts              # v0.1.0 SQLite → folders
│   └── git.ts                    # Bun.spawn wrapper, per-repo queue, porcelain parsing
├── agent/
│   ├── runtime.ts                # unchanged API; reads documents from the folder store
│   └── explain.ts                # KPI explanation + SQL preview (no execution)
└── store.ts                      # removed after Phase 1 (cache.ts + facade replace it)

src/
├── main.tsx                      # shell, split into views below
├── projects/                     # Sidebar tree, DeleteDialog, UndoToast, Trash, Suggestions, useEvents
├── editor/                       # CodeEditor (CodeMirror), languages, lint worker, patch.ts
├── edit/                         # ItemEditor, yaml-patch, json-patch, rdf-patch/{turtle,ntriples,n3,rdfxml}, add/delete forms
├── metrics/                      # extension.ts (shared parse/validate), MetricsView, KpiDetail, Explanation, KpiWizard
├── graph/                        # walk.ts, fullscreen.ts (graph-view.ts, layout.ts, RelationshipEdge.tsx,
│                                 #   NeighborhoodGraph.tsx, FullGraph.tsx stay in src/ and are reworked in place)
├── odcs/                         # ContractOverview, DatasetPage, odcs-diff
├── scm/                          # SourceControl panel, DiffView (merge view), BranchPicker
└── MappingExplorer.tsx           # relayout in place (Phase 11)

schemas/semantic-workbench-metric-v1.json
schemas/semantic-workbench-mapping-v1.json
tests/                            # new: atomic, journal, scanner, trash, git, migration, events, patch, rdf-patch, extension, explain, graph-view
scripts/                          # new browser checks per phase; mutation-tests.ts extended
```

**Structure Decision**: Keep the existing two-tree web application (`src/` frontend, `server/`
API, shared validation in `src/` imported by the API). New server code is grouped under
`server/projects/`; new UI code under feature folders in `src/`. The legacy API facade keeps
existing tests and agent clients working until their checks are migrated.

## Delivery Phases

Each phase ends releasable: all existing suites green plus the phase's new checks; README updated.
Priorities follow the spec (P1 first), with storage first because almost everything depends on it.

| # | Phase | Spec coverage | Ships | Codex |
| --- | --- | --- | --- | --- |
| 1 | **Folder storage foundation**: `DATA_DIR`, atomic writes, state files, cache, scanner (`git ls-files`, `.gitignore`), watcher + SSE, base-hash saves, journal, migration (backup, export, verify, `git init` + initial commit, legacy ids), example loaders create projects, legacy facade | Story 2 (tree, no reload), FR-017/018, FR-025, FR-027–028, FR-075–085, FR-089–090, FR-092 | Projects tree in sidebar; external edits appear live; v0.1.0 workspaces migrate | No |
| 2 | **Delete, undo, trash, Clear, grouping suggestions, rename/move, re-import conflicts** | Story 2, FR-019–026, FR-029, FR-086–088 | No script or reload needed for any cleanup | No |
| 3 | **Ossie layouts + metrics read side**: embedded semantic model in all views; extension parse/validate (schema pinned); Metrics view, KPI detail, explanation + SQL preview (refused rollups), lineage to ODCS, KPI nodes and concept badges, syntax-aware metric edges | Stories 1 (read), 3; FR-001–008, FR-011–016, FR-030–033 | Every Ossie layout works; KPIs navigable and explained | No |
| 4 | **Neighborhood walk**: projection fixes, hidden-neighbor paging, lateral links, centered layout, edge offsets, searchable center, breadcrumbs, KPI indicator | Story 4, FR-034–041 | Working neighborhood (baseline defects 1–9) | No |
| 5 | **CodeMirror source editor**: highlighting (6 serializations + embedded JSON), worker lint with ranges, patch-based save, import-repair editor | Story 5, FR-042–047 | VS Code-like Source tab | No |
| 6 | **Item editing, add/delete, KPI wizard (YAML/JSON)**: item editor, YAML/JSON range patches, style-preserving inserts, dependents on delete, rename references, wizard writing metric + extension | Stories 6, 7 (YAML/JSON), 1 (authoring); FR-009–010, FR-048–054 | Click-to-edit, add/delete, KPI creation | No |
| 7 | **RDF item editing**: N-Triples line edits; Turtle/N3 block rewrite; RDF/XML element edit; isomorphism gate; refusals with jump to Source | Stories 6, 7 (RDF); FR-055 | All formats editable per item | No |
| 8 | **Source Control**: status, diff (merge view), stage/unstage, commit, branches, remote fetch/pull/push/sync, conflicts, hidden-file listing, Add to .gitignore, `.gitignore` editing, altered-bytes report, Git/identity banners, stale-save diff | Story 9, FR-059–065, FR-091–096 | VS Code-like Source Control | No |
| 9 | **ODCS dataset pages**: overview, schema table, lineage with depth, history from Git with property diffs, quality (declared) | Story 8, FR-056–058 | Marquez-style ODCS view | Partly (page layout) |
| 10 | **Full screen and adaptive layout** | Story 10, FR-066–067 | Full-screen graphs; reflow 390×844–2560×1440 | **Yes** |
| 11 | **Mappings layout** | Story 11, FR-068–070 | Binding chains, grouped, side-by-side composer | **Yes** |
| 12 | **UI polish and overlaps** (baseline defects 10–16, status auto-dismiss, nav state) | Story 12, FR-071–074 | No overlaps at any viewport | **Yes** |

Codex phases (10–12, and the page layout of 9) receive a written brief: the relevant FRs, the
ui-contracts table, the baseline defect list with file references, and the exact suites that must
pass. Their output goes through the same review, tests, browser checks and mutation gate.

## Test Strategy per Phase

| Phase | Unit / API (`bun test`) | Browser (`scripts/`, isolated `DATA_DIR`) | New targeted mutants |
| --- | --- | --- | --- |
| 1 | atomic write crash simulation; base-hash 409; journal roll-forward/back; scanner honours `.gitignore` and hides unsupported types; cache rebuild equality; migration byte/hash verification and abort; SSE replay/resync; path traversal rejection; origin check on new routes | `projects-browser-check.ts`: sidebar tree, live update after external edit, two-tab stale save; existing suites via facade | drop base-hash check; skip fsync/rename (write in place); skip migration hash verify; accept `..` paths; omit origin check on `/api/events`; journal recovery always roll-forward |
| 2 | delete-impact references; undo window boundary (10 s); restore never overwrites (409); Clear batch; suggestion evidence (no name similarity); rejected suggestions persist | `trash-browser-check.ts`: confirm → undo → trash → restore → purge; Clear; suggestions accept/reject | undo after expiry allowed; restore overwrites; suggestion from similar names; delete without confirm flag |
| 3 | extension parse/validate/locate (34 shipped metrics); mapping KPI bindings resolve to metrics and concepts; type-vs-expression finding; explanation trees; additivity refusal; lineage to ODCS; consolidated Ossie counts equal split (60 bindings); explain endpoint never calls an executor | `metrics-browser-check.ts`: Metrics list, KPI detail, explanation, refused rollup; Flights both layouts | accept ratio rollup; drop extension schema check; lineage from text match instead of AST; treat embedded layout as ontology-only |
| 4 | projection independent of focus; lateral links toggle; hidden counts; deterministic ranking; walk reducer; edge offset uniqueness | extended `graph-browser-check.ts` + responsive: five-hop walk, no empty flash, no overlapping paths | star-only filter restored; neighbor cap without count; shared route line |
| 5 | patch mapping with CRLF/mixed endings/tabs/trailing newline; lint range mapping; worker debounce | `editor-browser-check.ts`: colors per serialization, inline markers, Go to line, repair dialog | patch inserts LF in CRLF file; lint drops range; editor save sends full text |
| 6 | YAML node patch (comments/anchors kept); JSON value patch (indentation kept); inserts in document style; dependents listing; wizard writes metric + extension + one sorted binding line in the mapping (or creates a minimal mapping) | `item-edit-browser-check.ts`: edit/add/delete per YAML/JSON type, wizard | JSON re-serialization; delete without dependents; wizard duplicates formula |
| 7 | per serialization: isomorphism gate, untouched text identical, refusal cases (collections, reification, N3 formulae) | `rdf-edit-browser-check.ts` | skip isomorphism check; rewrite whole document |
| 8 | porcelain v2 parsing; argument arrays only; per-repo serialization; timeouts; dirty/draft blocking; conflict detection; hidden-file labels; Add to .gitignore pattern derivation; altered-bytes report; missing git/identity | `scm-browser-check.ts` against a local bare remote: commit, branch, switch, push, pull, conflict repair | allow pull with drafts; shell-string invocation; remote call outside explicit endpoint; commit without message |
| 9 | ODCS property diff between commits; lineage depth | `odcs-browser-check.ts` | property diff ignores type changes |
| 10–12 | n/a beyond components touched | `test:responsive` extended: resize sweep, full screen state restore, overlap assertions for every overlay pair in every view | remove overlap assertion; status never dismisses |

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Concurrent writers (tabs, external editors, Git) | base-hash checks, watcher invalidation, per-repo Git queue, rescan after every Git operation; residual race detected on next scan |
| Multi-file atomicity | journal with deterministic recovery (R7); renames within one file system |
| RDF patching (FR-055) | isomorphism gate; refuse rather than approximate; dedicated Phase 7 |
| Git hooks and filters altering bytes | allowed; hash check after each operation reports altered files; `core.autocrlf=false` in managed repos |
| Migration data loss | backup copy, per-file SHA-256 verification, abort without changes, old DB never modified |
| Watcher gaps (non-inotify file systems) | 60 s periodic rescan; manual Refresh |
| Facade drift during transition | facade covered by existing suites until each is migrated; removed only when no check uses it |

## Owner Decisions on Planning Questions

- **PQ1 — cross-model KPIs**: not in this feature. Every KPI lives in its Ossie metric's extension;
  KPIs combining metrics from two semantic models are out of scope (spec, Assumptions).
- **PQ2 — credential window**: allowed. Git's configured credential helper (for example Git
  Credential Manager) may show its own window during an explicit fetch, pull, push or sync;
  `GIT_TERMINAL_PROMPT=0` still prevents a terminal prompt the server cannot answer; remote
  operations wait up to 10 minutes with Cancel (research R5). Consistent with constitution 2.0.0
  Principle I, which forbids the workbench itself from storing, prompting for or transmitting
  credentials, not Git's helper.
- **PQ3 — KPI-to-concept link**: stored in the mapping document's root `SEMANTIC_WORKBENCH`
  extension as KPI bindings, because standard concept mappings have no metric target and the
  mapping schema allows extensions only at the root (research R12). The wizard writes the binding
  there; the metric extension no longer has `concept`/`of`. Phase 3 reads bindings; Phase 6
  writes them.

## Complexity Tracking

No constitution violations; nothing to justify.
