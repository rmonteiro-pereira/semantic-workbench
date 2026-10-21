# Implementation Plan: Column-Level Lineage, One Metric Vocabulary, Git Workflow and a Calmer UI (v0.3.0)

**Branch**: `002-lineage-and-ux` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-lineage-and-ux/spec.md`

## Summary

Release v0.3.0 makes the ODCS contract the start of a navigable, column-level lineage that runs
through semantic fields to metrics, in the Graph tab, with expansion in place and Full pierce
shared with Neighborhood. It replaces Save with automatic saving of valid edits and a Commit
dialog, commits imports, adds clone, remotes, repository-local identity, a credential guide and
several projects per repository. SQL embedded in definitions gets coloring and lint with exact
file positions. The UI moves secondary work into dialogs, gets a resizable sidebar, one
vocabulary ("Metric"), working Group by and a Mappings layout that fits. Technical approach:
reuse the lineage matching rules (`src/odcs/lineage.ts`), React Flow and ELK in a worker, the
walk model, the validation worker, base-hash saves, journal and trash; add a pure expansion
model and incremental placer, a shared SQL region/lint module, and a registry mapping projects to
repository folders ([research.md](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Bun 1.4 (API, tests), Vite+ 1.2 (build)

**Primary Dependencies**: existing `@xyflow/react`, `elkjs` (web worker), `yaml`, `ajv`,
`node-sql-parser` 5.4 (now also in the browser validation worker, per-dialect builds loaded
lazily), CodeMirror 6 packages; **new**: `@codemirror/lang-sql` (R11 justification: MIT, ~30 KB,
no network). Machine Git ≥ 2.40.

**Storage**: unchanged layout (`data/projects/`, `data/state/`, `data/trash/`, cache). Registry
entries gain optional `folder`/`repo`/`remoteAddress`; trash gains `subproject` entries;
repository manifest is user content inside the repository ([data-model.md](./data-model.md)).

**Testing**: `bun test` (unit, HTTP handler on temp `DATA_DIR`), Playwright browser checks with
isolated API (`scripts/helpers/isolated-api.ts`), targeted mutation suite, responsive geometry
suite. New suites: `test:lineage`, `test:autosave`, `test:sql`, `test:git-setup`,
`test:monorepo`, `test:dialogs`, `test:terminology`, `test:mappings-layout`.

**Target Platform**: single-user workstation (Linux incl. WSL2), Chromium-class browser, loopback.

**Project Type**: web application (`src/` frontend, `server/` Bun API).

**Performance Goals**: lineage first view ≤ 2 s on UBL (169 objects, 401 keys); path highlight
≤ 200 ms; Full pierce first nodes ≤ 1 s, no main-thread block > 100 ms; SQL findings ≤ 500 ms
after a pause; typing latency in the 1.9 MB fixture within the v0.2.0 budget with autosave on.

**Constraints**: byte-exact files; nothing executed; Git network only on explicit action (now
including clone); writes only under the data root (repository-local Git config only); 2 MB
documents; no symbolic links followed; constitution 2.1.0.

**Scale/Scope**: shipped examples (UBL, shopping center 145 entity types / 142 objects / 25
governed metrics, 1,000-entity scale data, 5,000/15,000 fixture); 10 user stories, 58 FRs, 11 success criteria.

No NEEDS CLARIFICATION remain: the owner answered Q1–Q5 and approved constitution 2.1.0.

## Constitution Check (v2.1.0)

*Gate before Phase 0 and re-checked after Phase 1 design.*

| Principle | How the plan complies | Pre | Post |
| --- | --- | --- | --- |
| I. Local-Only Operation | New routes (`/api/clone`, identity, repositories, commit/revert) sit behind the same loopback binding and origin check. Clone is a user-triggered remote command into `data/projects/.staging-*` then moved into place (2.1.0); the address becomes the project's remote. Identity is written with `git config` in the repository (local scope) only; the global file is never written. The credential guide is static text and a read-only `credential.helper` check; nothing asks for, stores or sends credentials. Lineage, SQL lint and pierce run locally; nothing is fetched (external foreign keys become stubs) | ✅ | ✅ |
| II. Byte-Exact Source Preservation | Autosave sends source-range patches with the base hash (v0.2.0 mechanism); invalid text is never written and stays a draft. SQL lint and coloring never edit text. Metric renaming changes no stored key (`kpi_bindings` kept). The manifest is written only on explicit request through a normal save. Lineage, grouping and expansion are derived views stored nowhere in files | ✅ | ✅ |
| III. One Validation Rule Set | SQL lint is one shared module called by the editor worker, item editor, wizard and the server's `indexBytes`; findings carry JSON pointers and exact line/column, or attach to the expression start. Files arriving by clone or pull are validated on scan and never rewritten. Lint stays bounded (2 MB limit, per-expression size cap 100,000 chars as in `parseExpression`) | ✅ | ✅ |
| IV. Atomic, Hash-Checked File Persistence | Autosave and revert use the atomic, hash-checked save; a stale base pauses autosave and opens the diff. Clone, subfolder registration, remove-from-workspace, subproject delete/restore and revert-to-last-commit are journaled. Git runs with argument arrays, explicit working directory inside `data/projects/`, no prompts, timeouts, per-repository queue (the queue key moves from project to repository so two projects of one repository never interleave); clones set `core.autocrlf=false`, `core.symlinks=false`, no submodules. No history rewrite (revert restores a file from `HEAD` as a new change) | ✅ | ✅ |
| V. Pinned Official Standards | No standard schema changes. The repository manifest schema is an application schema, pinned in `schemas/` and labelled as such; lineage matching, foreign-key direction and SQL dialect mapping are labelled as workbench readings | ✅ | ✅ |
| VI. Verification Gate | Every story has unit tests and a browser check on an isolated root; new mutants: autosave writes invalid text, autosave ignores stale base, commit `--only` dropped (commits other paths), import commit includes unrelated paths, identity written with `--global`, clone without explicit action / outside `data/projects/` / with symlinks enabled, manifest path with `..` accepted, subproject delete touches sibling project, lineage drops foreign-key direction, closure ignores budget, collapse removes shared nodes, incremental placement moves placed nodes, SQL position mapping off by escapes, lint blocks save, Group by Auto picks a one-group mode. Geometry assertions for sidebar, dialogs, lineage cards and Mappings across the viewport matrix | ✅ | ✅ |
| VII. Honest Claims | README documents lineage as a reading of declared names, the metric vocabulary and the historical `kpi_bindings` key, autosave and Commit, clone among network operations (2.1.0), repository-local identity, the manifest format, SQL lint as warnings with dialect coverage, and pierce budgets; counts come from tests | ✅ | ✅ |

Technical Constraints: new dependency `@codemirror/lang-sql` justified in research R11;
`node-sql-parser` was already a runtime dependency (server) and is now bundled into the
validation worker as lazily loaded per-dialect chunks (no network). Heavy work (ELK layout,
closure, SQL lint) runs off the main thread.

## Project Structure

### Documentation (this feature)

```text
specs/002-lineage-and-ux/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── sse-events.md
│   ├── ui-contracts.md
│   ├── sql-regions.md
│   └── repository-manifest.schema.json
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── main.tsx                      # autosave wiring, header (New, Commit…, status), dialogs, sidebar resize
├── odcs/
│   ├── lineage.ts                # column-level LineageGraph, closure, around (replaces object-level builder)
│   ├── LineageCanvas.tsx         # new: React Flow canvas for the Graph tab and the asset Lineage tab
│   ├── LineageCard.tsx           # new: card node with column rows, ports, pager, badges
│   ├── lineage-layout.worker.ts  # new: ELK layered with ports
│   ├── DatasetPage.tsx           # asset page tabs (Lineage, Relationships, Data Quality, Properties, History)
│   └── ContractOverview.tsx      # Open in lineage / Open
├── odcs.ts                       # foreign keys with column pairs
├── graph/
│   ├── expansion.ts              # new: ExpansionState, expand/collapse/undo (pure)
│   ├── incremental-layout.ts     # new: placement that never moves placed nodes (pure)
│   ├── pierce.ts / pierce.worker.ts  # new: bounded, direction-aware closure
│   ├── walk.ts                   # step kind 'expand'
│   ├── LineageLegend.tsx         # new: shared legend
│   └── edge-styles.ts            # new: shared line styles
├── NeighborhoodGraph.tsx         # expand in place, Full pierce
├── PropertyBadges.tsx            # new: PK/FK/Required/Unique/classification badges
├── sql/
│   ├── regions.ts                # new: SQL regions + offset maps (YAML/JSON)
│   └── lint.ts                   # new: shared SQL lint (lazy per-dialect parsers)
├── editor/{languages.ts,lint.worker.ts,CodeEditor.tsx,SqlField.tsx}
├── projects/{autosave.ts,Sidebar.tsx,Suggestions.tsx,ImportDialog.tsx,api.ts}
├── scm/{CommitDialog.tsx,RemoteDialog.tsx,CloneDialog.tsx,IdentityDialog.tsx,CredentialGuide.tsx,RepositoryProjectsDialog.tsx}
├── metrics/{MetricWizard.tsx,MetricDetail.tsx,metric-save.ts,metric-draft.ts,MetricsView.tsx}
├── communities.ts, overview.ts, GroupingControls.tsx, AdjustGroupingDialog.tsx
└── MappingExplorer.tsx, style.css
server/
├── projects/
│   ├── git.ts                    # commitPaths (--only), identity per repository, clone
│   ├── workspace.ts              # registry folder/repo, import commits, clone flow, live identity
│   ├── paths.ts                  # projectDir via registry, repoDir
│   ├── repositories.ts           # new: manifest read/validate, detection, registration
│   ├── scm.ts, trash.ts, scanner.ts, watcher.ts, state.ts
├── routes/{git.ts,projects.ts,clone.ts,repos.ts,metrics.ts,kpis.ts}
schemas/semantic-workbench-repository-v1.json
tests/   (lineage, expansion, pierce, incremental-layout, sql-regions, sql-lint, autosave, git-commit-paths, identity, clone, repositories, subproject-trash, grouping-modes, terminology)
scripts/ (lineage-, autosave-, sql-, git-setup-, monorepo-, dialogs-, terminology-, mappings-layout- browser checks; mutation-tests.ts additions)
```

**Structure Decision**: same web-application layout as v0.2.0; new modules sit next to the
code they extend; pure logic (lineage graph, expansion, placement, closure, SQL regions,
autosave state) in plain modules for unit and mutation tests; React components stay thin.

## Delivery phases (detail in tasks.md)

1. Setup and shared foundations (dependency, fixtures, Modal reuse, edge styles, legend,
   badges, foreign-key column pairs).
2. Save and commit flow (US3) — early, because later phases touch editing.
3. Column-level lineage (US1).
4. Pierce through (US10), Neighborhood and lineage.
5. Metric vocabulary (US2).
6. SQL coloring and lint (US4).
7. Main screen and dialogs, sidebar (US5).
8. Group by (US6).
9. Git setup: identity, remote, clone, credential guide (US7).
10. Several projects per repository (US8).
11. Mappings layout (US9).
12. Polish, README, verification record.

Each phase leaves every existing suite green and is shippable on its own.

## Complexity Tracking

No constitution violations. Two choices recorded for review:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Git queue keyed by repository instead of project | subfolder projects share one index | per-project queues could interleave two Git commands on one repository |
| `node-sql-parser` in the browser worker (lazy per-dialect chunks) | constitution III needs the same lint in browser and API | server-only lint would make editor findings wait for a round trip per pause and differ offline from the editor worker path |
