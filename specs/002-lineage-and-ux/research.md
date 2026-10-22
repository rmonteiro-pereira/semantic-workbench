# Research: v0.3.0 (002-lineage-and-ux)

Decisions taken before design. Each entry: Decision, Rationale, Alternatives considered. Code
references are to `main` at `e768efa` (v0.2.0).

## R1. Column-level lineage model

**Decision**: Replace the object-level builder in `src/odcs/lineage.ts` with a column-level graph
builder in the same module: `buildLineage(files, contractPath)` returns cards (contract objects,
semantic datasets, metrics, external stubs), columns per card and column-to-column edges of kinds
`foreign-key`, `reads`, `aggregates`, `uses`, `transform`. It keeps the existing matching rules
(dataset `source` = object physical name or name; field expressions read through
`expressionRefs` in `src/metrics/deps.ts`; metric dependencies through `metricDependencies`) and
adds: foreign-key column pairs (R2), `transformSourceObjects`/`transformLogic` edges, nested
properties as `parent.child` rows. Queries on the graph are pure functions in the same module:
`closure(graph, ids, direction, budget)` and `around(graph, center, steps)`. The graph is built
once per project revision (content hashes) and memoized; the dataset page's Lineage tab and the
Graph tab use the same result.

**Rationale**: the matching rules already exist, are tested and are the workbench's documented
reading; only the granularity and the direction handling are wrong (spec Appendix A.1). Pure
functions make the reach, closure and budget rules unit- and mutation-testable.

**Alternatives**: a server endpoint computing lineage (rejected: all inputs are already parsed in
the browser; no extra API surface or loopback round trip); reuse `modelOverview`/`neighborhood`
from `src/graph-view.ts` (rejected: they model entities, not columns with ports).

## R2. Foreign keys column to column

**Decision**: Extend `odcsForeignKeys` (`src/odcs.ts`) to return `fromColumns` and `toColumns`
(property paths) alongside the existing object indices: property-level `relationships` give
`from` = the property, `to` = the referenced `object.property`; schema-level `relationships` give
`from`/`to` arrays paired by position (unequal lengths are already a validation finding; no edge).
Fully qualified `schema/<id>/properties/<id>` references resolve through property ids. Existing
callers keep working (fields are added, not changed).

**Rationale**: the current type drops the referenced column (Appendix A.1, `src/odcs.ts:5,27`).

**Alternatives**: a second parser just for lineage (rejected: two readings of the same keys would
drift; constitution III spirit).

## R3. Lineage rendering, layout and paging

**Decision**: Render with React Flow (already used by Graph and Neighborhood). Each card is one
custom node with a header and a column list; every visible column row has a target handle on the
left and a source handle on the right, so edges attach column to column. Cards show 10 columns
per page (pager `1 2 3 …`) and switch to scrolling inside the card above 6 pages; rows on a
highlighted path are pinned above the page; edges of columns not on the current page attach to a
"N more columns" row of that card (so no edge dangles). Initial layout and Full pierce layout run
ELK `layered` (direction RIGHT, `portConstraints: FIXED_ORDER`, one port per visible row) in the
existing ELK web worker (`elkjs/lib/elk-worker.min.js`, as in `src/FullGraph.tsx:72-73`).
Expansion in place uses an incremental placer (R5) that never moves placed cards. Highlighting a
path is computed from the memoized graph (closure on ids) and applied as React Flow node/edge
classes without re-layout.

**Rationale**: reuses the canvas, zoom, mini-map, full screen and worker plumbing of v0.2.0;
ports are what makes column-level edges readable; paging keeps 169-object contracts within the
2-second budget because only visible cards and rows become nodes and ports.

**Alternatives**: the hand-drawn SVG of `DatasetPage.tsx` (rejected: no pan/zoom, no ports, the
defects of Appendix A.1); Cytoscape (rejected: no HTML rows with interactive controls inside
nodes); one React Flow node per column grouped in parent nodes (rejected: thousands of nodes on
UBL, slow and harder to page).

## R4. Lineage reach and walking

**Decision**: Default view = center card, one foreign-key step upstream and downstream, and the
complete downstream reach to metrics (datasets, fields, metrics on metrics); a **Steps** control
(1–5) widens foreign-key reach; cards beyond the reach are "+N more" stubs on the frontier card.
Walking reuses `walkReducer` (`src/graph/walk.ts`) with a new step kind (R5). The reach chosen is
remembered per contract in `localStorage` (try/catch, view convenience only).

**Rationale**: metrics are the product's pillar, so the path to metrics is always complete;
foreign keys fan out widely on UBL (401 keys), so they are bounded by default.

**Alternatives**: whole contract at once (rejected: unreadable at 169 cards and over budget).

## R5. Pierce through: expansion in place and Full pierce

**Decision**: A shared "expansion canvas" model used by Neighborhood and the lineage graph:
`ExpansionState = {center, sets: ExpansionSet[]}` where each set records the node ids and edge
ids it added, its kind (`expand` | `pierce`), direction and budget. Expand adds the node's
neighbors not already present; Collapse removes ids owned only by that set (reference counted
across sets); Undo/Back pops the last set; Forward re-applies it. The walk trail gets a step kind
`expand` alongside the existing re-centering steps (`walkReducer` stays backwards compatible:
steps without `kind` are re-centering). Full pierce computes the transitive closure by
breadth-first search in a worker (`src/graph/pierce.worker.ts`), ordered by step, relationship
kind and name, honouring direction (outgoing, incoming, both), the Value types / Technical
resources / metrics switches and a node budget (default 150, up to 500); it returns the first
budget nodes, frontier nodes with hidden counts and the total reachable count; **Stop** terminates
the worker. Incremental placement (`src/graph/incremental-layout.ts`, pure): a new node goes into
the column next to the node it was expanded from (left for incoming, right for outgoing), at the
free row nearest to that node's row; placed nodes keep their coordinates. Full pierce from a
fresh center uses a full layout (ELK for lineage, the existing column layout for Neighborhood
extended to more than three columns by step distance).

**Rationale**: matches the owner's "build a chain without losing context" and keeps big models
responsive (closure and layout off the main thread, bounded output). Reference counting makes
collapse predictable when two expansions share a node.

**Alternatives**: re-running a full layout on every expansion (rejected: reshuffles the canvas,
SC-011); unbounded pierce (rejected: 5,000-entity fixture).

## R6. Shared legend and column badges

**Decision**: Move the legend of `DatasetPage.tsx:115-128` and its styles
(`src/odcs/odcs.css:57-60,70`) into `src/graph/LineageLegend.tsx` (kinds object, dataset,
field, metric; lines foreign key dashed amber, feeds solid). Edge styles come from one map in
`src/graph/edge-styles.ts`, used by the lineage graph, the asset page and Graph/Neighborhood
when contract objects, datasets or metrics are shown. Column badges (PK, FK, Required, Unique,
classification) come from one `PropertyBadges` component used by the Properties table and the
lineage card rows.

**Rationale**: owner asked for the same visual language from a shared component, not a copy.

## R7. Automatic save and the Commit dialog

**Decision**:
- In `src/main.tsx`, a per-file autosave controller (`src/projects/autosave.ts`, pure state
  machine + React hook): after an edit, wait 1,000 ms of no typing; use the issues the editor's
  validation worker already produced for exactly that text (the worker runs at a 300 ms pause,
  `src/editor/CodeEditor.tsx:34`); if no errors, send `diffPatches(base, text)` with the base
  hash through the existing save endpoint. One save in flight per file; edits during a save
  queue and use the hash the save returns as the next base. The editor document is not replaced
  after a save (no cursor jump); only `current.source/hash` advance.
- With errors, nothing is written; the existing 1.5 s server draft (`src/main.tsx:214-219`)
  keeps the text; the indicator shows "Not saved: N errors".
- Stale save (409): open the existing `StaleSaveDialog`, set the controller to `paused`.
- Switching files or views flushes a pending valid save first; an invalid draft stays as a
  draft (no "Discard unsaved changes?" prompt; the draft is announced instead).
- Pending saves are cancelled when the file is deleted, moved or trashed; Git pull/switch is
  refused while drafts or uncommitted changes exist (unchanged rule) and the refusal offers
  **Commit…**.
- Latency: the controller never runs on keystrokes; `diffPatches` (prefix/suffix scan) runs in
  `requestIdleCallback` after the pause; the existing typing-latency check in
  `scripts/editor-browser-check.ts` (1.9 MB file) gains an autosave-on variant with the same
  budget.
- **Commit…** dialog (`src/scm/CommitDialog.tsx`): lists the repository's changes (reuses the
  Source Control status and diff views), ticked files are committed with
  `git commit --only -- <paths>` (after `git add -- <untracked paths>`), so other staged or
  unstaged work is untouched; **Commit & push** calls the existing push. Pre-filled message:
  one file → "Update <file>"; one item edited → "Update <item> in <file>"; several → "Update N
  files".
- **Revert to last commit**: one journaled operation (constitution IV): the base hash is
  checked, the `HEAD` bytes are staged, then the journal moves the current file into a new
  trash file entry and the staged bytes into place; an interruption is completed or rolled back
  on the next start like every other journaled operation.

**Rationale**: owner's choice (Q1); reuses validation worker, patches, drafts, stale dialog and
Source Control; `--only` commits exactly the chosen paths without disturbing the index.

**Alternatives**: auto-commit on every save (rejected: noisy history, owner chose Commit…);
saving on every keystroke (rejected: latency and disk churn).

## R8. Import commits and live Git identity

**Decision**: A server helper `commitPaths(repoDir, paths, message)` (in `server/projects/git.ts`)
adds and commits exactly the given paths with `--only`, used by import into a new project
(replacing `workspace.ts:90` logic), import into an existing project, example loads and the Commit
dialog. It returns `{committed: true, commit}` or `{committed: false, reason}` (no Git, no
identity, merge in progress). Identity is checked per repository on demand
(`git config --get user.name/user.email` with the repository as working directory, which sees
repository-local and global values), cached per repository for 5 s and invalidated when set.
`PUT /git/identity` writes `git config user.name/user.email` in the repository (local scope
only). `workspace.identityConfigured` becomes `identity(repo)`; `/api/status` reports
per-repository results.

**Rationale**: fixes Appendix A.5 (identity seen only globally and only at start; imports into a
project not committed); writing only repository-local config keeps every write inside the data
root (constitution I).

## R9. Clone

**Decision**: `POST /api/clone {url, name}` validates the address exactly like `setRemote`
(no `transport::`, no leading `-`, no newlines), creates `data/projects/.staging-<op>/<slug>`, and
runs `git -c core.autocrlf=false -c core.symlinks=false -c protocol.ext.allow=never clone
--no-recurse-submodules -- <url> <dir>` as a remote command (explicit action, 10-minute timeout,
Cancel, redacted errors). After clone: `core.autocrlf false`, `core.safecrlf false`, then the
manifest/detection step (R10), then a journaled move into place with the registry. Symbolic
links are checked out as plain files (`core.symlinks=false`) and in any case never followed by
the path rules (`assertNoLinks`).

**Rationale**: constitution 2.1.0 allows clone into `data/projects/` only; staging + journal
keeps "all or nothing"; disabling symlinks and submodules prevents writes or reads outside the
project folder.

## R10. Several projects in one repository

**Decision**:
- Registry entries gain optional `folder` (path under `data/projects/`, e.g.
  `team-repo/domains/sales`) and `repo` (the repository folder, e.g. `team-repo`). Entries
  without them keep `folder = slug`, `repo = slug` (v0.2.0 compatible, no migration of files).
- `projectDir(layout, slug)` resolves through the registry (`entry.folder`); Git runs in
  `repoDir(entry)`; Git paths are `relative(repoDir, projectDir)/path`.
- Manifest `.semantic-workbench.json` at the repository root (schema
  `semantic-workbench/repository/v1`, pinned in `schemas/`): `{ "schema": "...", "projects":
  [{"path": "domains/sales", "name": "Sales"}] }`. Paths are relative POSIX folders inside the
  repository, validated with `projectPath`, no nesting. When absent, detection proposes the
  smallest set of folders (depth ≤ 4, skipping `.git` and ignored paths) that contain supported
  files; the user confirms in **Projects in this repository…**; the confirmed list is stored in
  `state/projects.json`; the app never writes the manifest unless the user ticks "Save as
  manifest" (then it is a normal hash-checked save, committed by the user).
- Source Control, branch, history and remote operations are per repository; every Git event
  rescans all projects of the repository; the watcher watches the repository root once.
- Remove from workspace = journaled registry update only. Delete folder = trash entry of kind
  `subproject` holding the subfolder (no `.git`), restore without overwrite; the deletion shows
  as uncommitted changes. Clear workspace moves each repository folder once.

**Rationale**: the owner's answer (manifest if present, otherwise detect and confirm, Q2/Q3); a
slug stays the stable project id so view settings, drafts and legacy ids keep working.

**Alternatives**: slugs with slashes (rejected: every route and state key assumes one segment);
one project per repository with a folder filter (rejected: the owner wants each folder as its
own project).

## R11. SQL inside definitions: coloring and lint

**Decision**:
- Locations (shared table in `src/sql/regions.ts`): Ossie `…expression.dialects[].expression`
  (fields and metrics, flat, legacy and embedded models); Ossie ontology mapping `expression` in
  object, referent and link mappings (standalone and embedded); ODCS quality rules with
  `type: sql` → `query`; ODCS property `transformLogic`.
- Region finder: parse with `yaml`'s `parseDocument` (already used in `src/edit/yaml-patch.ts`
  and `json-patch.ts`; it reads JSON too) and walk to those keys; for each scalar build an
  offset map from value index to file offset for every scalar style: block literal (strip
  indentation per line), block folded (line breaks folded to spaces), plain multi-line,
  single-quoted (`''`), double-quoted and JSON strings (escapes `\"`, `\n`, `\uXXXX`). This map
  turns parser error positions into exact file line/column (FR-052); unmappable positions fall
  back to the scalar's first character.
- Dialect: sibling `dialect` value; `ANSI_SQL` and `OSSIE_SQL_2026` → ANSI checks via the
  PostgreSQL grammar (the same choice as `server/agent/sql.ts:9`); `SNOWFLAKE`, `BIGQUERY`,
  `DATABRICKS` → node-sql-parser's `snowflake`, `bigquery` and `hive`/`trino` builds (Databricks
  SQL is Spark SQL; `hive` is the closest available grammar; findings are warnings anyway);
  ODCS → server `type` (postgres, snowflake, bigquery, databricks, mysql, sqlserver, …) else
  ANSI; `${…}` placeholders are replaced by same-length identifiers before parsing. Non-SQL
  dialects are skipped with an info note.
- Lint is a separate shared module `src/sql/lint.ts` (`sqlFindings(text, filename)` → warnings
  with JSON pointer, line, column) called by the editor's validation worker
  (`src/editor/lint.worker.ts`), the item editor and wizard workers, and the server's file index
  (`indexBytes`) so the API reports the same findings (constitution III). It is not called from
  main-thread `validateInput` uses (graph building), keeping the main thread free.
- Parser loading: in the browser worker, per-dialect builds (`node-sql-parser/build/<db>.js`,
  ~180–300 KB each) are imported lazily on first need; the server keeps the full package.
- Coloring: `@codemirror/lang-sql` (new dependency) nested with `parseMixed` in YAML
  (`BlockLiteralContent`, quoted and plain literal nodes) and JSON (`String`, inner range without
  quotes), at the same key paths as the region finder (the existing JSON-in-YAML nesting in
  `src/editor/languages.ts:53-59` is the pattern). The same SQL language is used in item editor
  expression fields, the wizard inputs and preview panes (read-only CodeMirror).
- Severity: warning, never blocks save or autosave (Q4). Byte-exact: lint and coloring never edit
  text.

**Rationale**: exact positions need the source ranges of the scalar, which the CST provides;
running in the existing worker keeps typing latency; one module keeps browser and API in step.

**Alternatives**: regex-located SQL (rejected: wrong inside multi-document or flow YAML); a
Lezer-only lint (rejected: Lezer SQL is tolerant and reports no syntax errors).

**Dependency justification**: `@codemirror/lang-sql` — MIT, maintained by the CodeMirror author,
about 30 KB minified, no runtime network access, same release line as the other CodeMirror
packages already used. No other new dependency.

**Recorded at install (T001)**: `@codemirror/lang-sql` pinned at exactly `6.10.0` (published
2025-09-16), MIT licence. Measured with `bun build --minify` and the CodeMirror/Lezer packages
it shares with the app left external: 32.6 KB minified, 13.0 KB gzip. Its dependencies
(`@codemirror/autocomplete`, `language`, `state`, `@lezer/common`, `highlight`, `lr`) were
already installed; no network access at runtime.

## R12. Metric vocabulary

**Decision**: UI strings, accessible names, README and docs use "metric"; components and files
renamed (`KpiWizard` → `MetricWizard`, `KpiDetail` → `MetricDetail`, `kpi-save` → `metric-save`,
`kpi-draft` → `metric-draft`); types renamed with deprecated aliases where tests reference them.
Stored formats unchanged (`kpi_bindings`, schema ids). HTTP: `POST /api/projects/:slug/metrics`
and `…/metrics/preview` added; `…/kpis` kept as aliases documented as deprecated.
`GET /api/projects/:slug/metrics` returns all metrics with `governed: boolean` (Q5). A check
(`scripts/terminology-check.ts`) scans rendered text of every view and the README for `KPI`.

## R13. Group by

**Decision**: `isBusinessEntity` becomes kind-aware (EntityType, OWL class, contract Object,
semantic Dataset, Concept mapping); community backbone edges: relationships, foreign keys,
dataset joins, metric references, mapping relationships (inheritance still excluded). The
contract-level `domain` stays a declared domain but counts as "declared" only when at least two
distinct domains exist. `groupingModes(entities, edges)` returns, per mode, the group count and a
reason when below two; the control disables those modes; Auto picks the first mode with ≥ 2
groups in the order declared → example → namespaces → suggested → types; the UBL example areas
are offered when at least two entities match the curated area names (not by model name). The
correction form moves into an **Adjust grouping…** dialog.

## R14. Sidebar, dialogs, Mappings layout

**Decision**: sidebar width as a CSS variable set from `localStorage` (default 300, clamp
220–520) with a `role="separator"` handle (pointer drag, arrow keys ±16 px, Home/End); names wrap
to two lines with `title` and accessible full path; Examples section is a `<details>` collapsed
when projects exist. One header toggle (panel icon) on desktop; the sidebar close button only in
drawer mode. Dialogs use the existing `Modal` (`src/projects/Modal.tsx`). Mappings: identifiers
rendered with `<wbr>` after `.` and `_` and `overflow-wrap: break-word` (not `anywhere`); the
arrow is drawn as a pseudo-element of the following step so it never wraps alone; composer moved
to **Compose a query…**; bindings get the full width minus the concept list; pluralisation
helper. A geometry check with synthetic long identifiers is added (FR-063).

## R15. Concept-mapping graph

**Decision**: The Graph tab of a mapping document (and of a consolidated file's embedded
mappings) renders a mapping canvas from the existing resolver output
(`server/agent/runtime.ts` `buildContext`, served by `GET /api/agent/context`), not from
`inspect()`. The resolver gains two additive fields: `bindings[].kind` (`object` · `referent` ·
`link`, from the task kind it already tracks at `runtime.ts:106-130`) and `metricBindings`
(`readKpiBindings` of the mapping root extension, resolved to metric ids, with findings). A pure
builder `src/mappings/mapping-graph.ts` turns the context into the lineage card model (R1):
concept cards (rows = relationships and attributes referenced by referent mappings), dataset
cards (rows = fields), metric cards; edges of kinds `object`, `referent`, `link` (through the join
fields of the declared dataset relationship), `measures`, `of`. It reuses `LineageCard`,
`LineageCanvas` (layout worker, highlight, paging, pierce, walk), `PropertyBadges` (adds
`Identifying` and `Unmapped`) and the shared legend (adds mapping line kinds). `src/model.ts`
stops projecting concept mappings as unconnected entities: the mapping canvas is the Graph view
for mapping documents; Neighborhood for a mapping document centers on concepts of the mapping
graph. The canvas follows the saved revision like the Mappings tab and says so when the open
file has unsaved edits (autosave makes this brief).

**Rationale**: the resolver already implements the official mapping semantics, findings and
cross-document references; a second reading in the browser would drift. The lineage components
give the same visual language the owner asked for.

**Alternatives**: extend `inspect()` to load other project files (rejected: `inspect` is
per-document and runs on the main thread for every view); a new server endpoint (rejected: the
agent context already carries everything except two additive fields).

## R16. Implementation decisions taken in Phases 1–2 (setup and foundations)

- **Branch.** `002-lineage-and-ux` on the remote still pointed at the last v0.2.0 commit; the
  002 specification commits were on `main`, strictly ahead of it. The branch was fast-forwarded to
  `main` before any work (no merge, no rewrite).
- **Isolated dev server.** Browser checks route `/api` to their own isolated API; the dev server
  used for them runs with `DATA_DIR` on a temporary root, so no check or manual look opens the
  owner's `data/`.
- **SQL fixtures** (T002) are complete, valid documents (the app validates them), so the broken
  `CASE` line sits further down than in the spec's snippet; the tests record the hand-computed
  position in the fixture as committed. The DAX case is its own Ossie fixture (`dax.ossie.yaml`);
  the ODCS fixture declares a PostgreSQL server so its dialect is resolved from `servers[].type`.
- **Foreign keys column to column** (T007): `fromColumns`/`toColumns` are property paths
  (`parent.child` for nested targets); fully qualified references resolve property ids to names.
  Unequal composite arity was not reported by anything before (the pinned ODCS schema only checks
  types; its description says "matching lengths"), so it is now a reference finding at the `to`
  pointer and the key pairs no columns. External references are listed by
  `odcsExternalForeignKeys` for lineage stubs; `odcsForeignKeys` is unchanged for them.
- **Shared legend and badges** (T008, T009): `LineageLegend` and `edge-styles.ts` hold the line
  styles of every lineage and mapping edge kind; the Properties table's Required/Unique/Primary key
  cells and the overview's PK/FK counts render the same `PropertyBadges` (the cell text is the
  badge label instead of "Yes").
- **Walk steps** (T010): `canvasAt(walk)` gives the current canvas (last re-centering step and the
  expansion sets after it), so Back/Forward restore expansions exactly.
- **Repository key** (T011): the workspace sets `layout.locate`, which resolves a slug through the
  registry; Source Control runs Git in `repoDir` (so the per-directory Git queue is per
  repository) and prefixes project paths with the project's folder inside the repository. Status
  entries outside the project folder are kept and marked `outside` (FR-069 shows the whole
  repository); `git log` of a folder omits `--follow`.
- **Dialog conventions** (T012): `Modal` gains `size` (small/medium/large/full) and a `footer`
  slot that stays visible while the body scrolls, and states `aria-modal`. Its test runs the real
  component in Chromium from `bun test` (Playwright, bundled with `Bun.build`), since Escape and
  focus return on a native `<dialog>` are browser behaviour.
- **ODCS check race** (found while gating): `odcs-browser-check.ts` changed the logical type right
  after the description's bytes appeared on disk, sometimes before the page had the save's new
  hash, so the next save was correctly refused as stale (about one run in three). The check now
  waits for the "Saved description of amount" status first; no assertion was removed.

## R17. Implementation decisions taken in Phase 3 (save and commit)

- **Autosave machine** (`src/projects/autosave.ts`): pure reducer plus `useAutosave`. Validity
  comes from the editor worker's result for exactly that text (`onIssues` now passes the text
  checked); otherwise the same worker validates it, so nothing parses the file on the main thread.
  The indicator's "pending" text is *Editing…*. A stale save pauses the file until the user
  chooses in the diff dialog; **Keep editing** keeps it paused and the indicator reopens the diff.
- **Drafts.** Leaving a file with invalid text keeps it as a server draft without a prompt and
  says so; opening the file restores the draft (also after a reload). The v0.2.0 "Discard unsaved
  changes?" prompts on file switch, example load and import are gone (a due valid save is written
  first instead).
- **Typing latency with autosave on.** After a save the app no longer re-parses every project file:
  per-document parses are memoized by content hash and the open file is not parsed for cross-file
  identities. The 1.9 MB latency case runs its API in a child process (`scripts/helpers/api-process.ts`)
  because an API inside the check's own process stalls Playwright's input driver while it validates
  the save, which was counted as typing latency. The machine running the checks was also heavily
  loaded by unrelated work (load average 13), which made wall-clock times swing from 17 to 85 ms
  per key while the page's main thread showed no long task at all. The autosave case therefore
  asserts on the page's own Event Timing (key press to next paint) and long tasks, measured in the
  same page first with no save running (the v0.2.0 condition) and then with an automatic save in
  flight: the second must stay under 30 ms per key or within 4 ms of the first, with no task over
  100 ms (constitution: input never blocked). Typical: 26–28 ms without a save, 27–29 ms during
  one, longest task 0 ms. The v0.2.0 wall-clock case (30 ms per key) is unchanged and still passes.
  A redundant workspace refresh after each automatic save was removed (the server's file event
  already triggers one).
- **`commitPaths`** skips listed paths that are ignored or unchanged and reports
  `{committed:false, reason:'nothing'}` when none remain; the HTTP contract's reasons gain
  `nothing` for that case. The identity is read on every commit (repository-local or global), so
  setting it needs no restart.
- **Import messages** follow C6 (`Import <name>` for one file); three v0.2.0 tests that expected
  "Import 1 file" or an example response without `commit` were updated for this spec change.
- **Commit with `push`** reports the push outcome (`pushed: {ok, message}`) and never fails the
  request after the commit was made; with no remote the message explains how to add one.
- **Revert** is `trash.revertFile`: journal kind `revert` (current file → new trash entry, staged
  `HEAD` bytes → file). A file absent from the last commit is only moved to the trash. A journal
  test hook (`crashAfter`) stops after a step as a crash would, to prove recovery on restart.
- **Checks changed by the spec** (no assertion weakened, each now checks the autosave behaviour):
  `ui-tests` (invalid text → *Not saved: N errors*; repaired text → *Saved to file*; the
  "uses saved document revisions" note can no longer be observed because switching views writes the
  valid save first), `projects-browser-check` (two-tab stale save: tab B's save is held until tab A
  saved), `editor-browser-check` (CRLF patches are sent by the automatic save), `scm-browser-check`
  (the edit that blocks a pull is now an invalid one kept as a draft; the refusal offers Commit…),
  `grouping-validation`, `item-edit` and `rdf-edit` (button names *Save to file*).

## R18. Implementation decisions taken in Phase 4 (column-level lineage)

- **Model** (`src/odcs/lineage.ts`): cards are `object:<file>#<name>`, `dataset:<file>#/<name>`,
  `metric:<file>#/<name>` and `external:<ref>`; columns are `<card>/<path>` (nested properties as
  `parent.child`). Foreign keys run from the referenced (parent) column to the referencing one, per
  column pair for composite keys. A semantic dataset matches an object by physical name or name;
  when both match different objects, both lines are drawn and flagged ambiguous. Metrics enter the
  graph only when they read a matched field, directly or through other metrics (`uses`), so
  unrelated metrics in the same file do not clutter the canvas. Datasets reading none of the
  contract's objects are counted in the footer, not drawn. The v0.2.0 `odcsLineage` and
  `tests/odcs-lineage.test.ts` are replaced by `buildLineage` and `tests/lineage.test.ts`, whose
  expected edges come from an independent reading of the files and are kept as golden lists in
  `tests/fixtures/lineage/` (regenerate deliberately with `UPDATE_GOLDEN=1`).
- **Layout**: ELK layered, left to right, fixed ports at row centres; run through `elk-api` with
  `elk-worker.min.js?url` as the Graph view does (`elk.bundled` inside a module worker fails with
  "_Worker is not a constructor"). More than 8 lines between the same two cards with nothing on
  them selected draw as one bundled line labelled "N lines".
- **First view**: fit when the whole reach stays readable (zoom ≥ 0.55); otherwise the centre card
  at zoom 0.7 (UBL's consignment), with Fit showing everything. The canvas has no mini-map (it
  rendered as a blank overlay over the cards) and hides React Flow's own fit button because the
  toolbar has **Fit**. On a contract's Graph tab the header's "Find an entity" search and Group by
  are hidden: the canvas has its own **Find assets**, and grouping applies to the entity graph.
- **Asset page tabs** (FR-011): `Lineage, Relationships, Data Quality, Properties, History`, opening
  on Properties (the v0.2.0 Schema table, unchanged). `scripts/odcs-browser-check.ts` changed
  because the spec renamed and reordered the tabs ("Dataset views" → "Asset views", "Schema" →
  "Properties", "Quality" → "Data Quality") and replaced the SVG lineage with the canvas; its
  assertions on content are unchanged in substance (foreign-key neighbours, the three sales
  metrics, the per-property lineage table).
- **Stale centre**: switching from one contract to another while the Graph tab is open rendered
  the new graph with the previous contract's centre for one frame and crashed. The centre is now
  validated against the graph in `main.tsx` and in the canvas (a walk step whose card disappeared
  after an edit falls back to the initial centre).
- **Check hooks**: cards and rows carry `data-id`, and lines carry `data-from`, `data-to`,
  `data-count` besides `data-edge-kind`/`data-on-path`, so `scripts/lineage-browser-check.ts`
  compares drawn lines with the golden lists both ways.

## R19. Implementation decisions taken in Phase 5 (concept-mapping graph)

- **Binding kinds** (`server/agent/runtime.ts`): every binding produced under a `link_mappings`
  entry is `link` (the link's anchor object mapping, the linked objects and their identifying
  referents); outside links a referent mapping is `referent` and an object mapping `object`.
  `metricBindings` reads the mapping's `SEMANTIC_WORKBENCH` extension (a standalone mapping's root,
  or the embedded semantic model's root, as the KPI explanation does) and resolves it with the
  existing `resolveBindings`; unresolved concepts or metrics become warning findings on that
  binding only, so the context's `findings` and every other field are unchanged (pinned by a
  digest of the v0.2.0 output in `tests/fixtures/agent-context/digests.json`).
- **Cards** (`src/mappings/mapping-graph.ts`): every ontology concept that is not an Ossie
  built-in (rows: its declared relationships in order, plus nested referent paths such as
  `airport.code`), every semantic dataset (rows: fields), and metric cards reached by an object
  mapping's expression or a KPI binding. Ids are `concept:<name>`, `dataset:<name>`,
  `metric:<name>`; rows `<card>/<path>`.
- **Lines**: an object mapping draws concept card → dataset card for each dataset its identifying
  referents read (fields of referents whose first relationship is in `identify_by` get the
  Identifying badge), and concept → field/metric for its own expression. A referent mapping draws
  the concept's relationship row → each field or metric it reads. A link child draws the owner's
  relationship row → the related concept card, labelled with the relationship; the field rows it
  passes through (`via`) are the child's fields plus their partners in declared semantic joins
  (`orders.customer_id → customers.customer_id`). The `via` rows are highlighted with the line
  rather than drawn as extra segments, because a line back from a dataset (right) to a concept
  (left) would cross the whole canvas. A link's anchor bindings are listed on its child lines.
  KPI bindings draw concept → metric, `measures` solid and `of` dashed. A concept mapping whose
  object expression is a metric and a KPI binding of the same metric are two bindings and draw two
  lines (`object` and `measures`).
- **Unmapped and findings**: a concept no binding, link or KPI binding names, and a field no
  binding reads, carry the Unmapped badge. Resolver findings attach to the concept card of the
  concept mapping their evidence path is in (a failed binding has no line to attach to), metric
  findings to the metric card, KPI binding problems to the metric card; anything else (reference
  resolution) is listed above the canvas.
- **Reach**: the mapping canvas shows the cards within *Steps* lines of the centre in any
  direction (plus the dataset cards a shown link passes through); a mall-sized mapping (190
  concepts, 426 datasets) is never drawn whole. Expand adds every neighbour of a card.
- **Model projection** (FR-034): concept mappings stay entities in `inspect()` because item
  editing, the catalog, validation navigation and Source lines use them, but no Graph view draws
  them any more: Graph shows the mapping canvas. Neighborhood keeps its v0.2.0 entity view for a
  mapping document (a concept mapping and the items around it), which the existing graph checks
  cover; the mapping canvas is the place for the mapping's lines. On a consolidated file the switch
  (`Mapping graph` / `Ontology graph`, role group "Graph view") sits in the canvas toolbar and in
  the entity graph's toolbar.
- **Readable views** (owner review of the Phase 4 screenshots, applies to both canvases): cards
  are 400 px wide with 30 px rows, column names 13 px and types/badges 11 px. The first view fits
  everything only when column names stay at 12 px or more (zoom ≥ 0.93); otherwise it fits the
  centre and its direct neighbours, otherwise it shows the centre card alone at that zoom. When a
  path is selected the view brings the path's cards into a readable view; **Fit** still shows
  everything at any zoom. More than six leaf cards of one kind hanging off one card (UBL
  consignment's bridge tables) show as one dashed "N more objects" card that opens on request;
  grouping is off while a path is selected. `scripts/lineage-browser-check.ts` and
  `scripts/mapping-graph-browser-check.ts` assert the 12 px rule at 1280×720 and 1440×900.
  Mapping link lines carry the relationship as a label; lineage lines are unlabelled (column
  names are already on the rows). Two lines between the same ports (an object mapping and a KPI
  binding of the same metric) are drawn 7 px apart.
- **Checks changed by the spec**: `scripts/metrics-browser-check.ts` opens the consolidated Flights
  file's Graph tab to look at KPI nodes; since FR-034 that tab opens on the mapping graph, so the
  check switches to **Ontology graph** first (its assertions are unchanged).
  `scripts/odcs-browser-check.ts` and `scripts/lineage-browser-check.ts` press **Fit** before
  counting cards, because the readable first view may leave outer cards off screen. The mapping
  canvas keeps the Graph view switch reachable while the mapping resolves or fails to resolve.

## R20. Implementation decisions taken in Phase 6 (pierce through)

- **Expansion sets** (`src/graph/expansion.ts`): a set records every node its expansion reaches,
  not only the new ones; the canvas is the base view plus the union of the sets in force, which
  is the reference counting of R5 without counters. Collapse is a set of kind `collapse` that
  removes an earlier set (the data model's `kind` gains `collapse`), so Back/Forward replay any
  sequence exactly; a set whose origin leaves the canvas goes with it. Sets live in an in-memory
  registry keyed by id; walk steps carry the id. Trail labels: "expanded X", "collapsed X",
  "pierced X".
- **Placement**: Neighborhood places expansion nodes with `placeNew` (column beside the origin,
  nearest free row) and pierce nodes with `placeLayers` (column by step distance, at most 8 per
  column, wrapping outward); the lineage and mapping canvases place expansion cards with
  `placeBoxes` (card-height aware) after the ELK layout of the centre's reach and any pierce. The
  placement is pure and cheap, so it runs on the main thread; the closures run in workers
  (`pierce.worker.ts`, `lineage-pierce.worker.ts`) and ELK in its worker.
- **Pierce lines**: Full pierce in Neighborhood draws the lines that reached each node (a tree)
  rather than every relationship among up to 500 nodes; the full set is one Expand away.
- **Responsiveness**: canvases over 60 nodes render only what is on screen, and an addition of
  more than 30 nodes is revealed 30 per frame; the 1,000-entity pierce's longest main-thread task
  is about 50 ms in the dev build (`scripts/graph-browser-check.ts` asserts ≤ 100 ms).
- **Relationship lines** (FR-024): clicking a line in Neighborhood expands its far end in place
  instead of walking; nodes, **Walk here** and the keyboard still walk. No existing check relied
  on line clicks walking.
- **Lineage pierce** (`src/odcs/lineage-pierce.ts`): ancestors and/or descendants of the selected
  column, or of every column of a card, as in path highlighting; cards in step order, cut at 150
  cards. The UBL example's governed metrics are counts, so `invoice_line.line_extension_amount`
  reaches its dataset field but no metric; the commerce check covers a path through to metrics.
- **Scenario data**: the UBL ontology has 45 entities, so Full pierce Both from `Invoice` shows
  all 45 without reaching the budget; the budget banner is checked on the 1,000-entity commerce
  scale model. `OrderLine` reaches `Item` through `LineItem` in this ontology, so the chain check
  expands OrderLine, LineItem and Item and expects Order, OrderLine, LineItem, Item and Price.
  "Show step K only" from the scenario text is not offered: Expand further and Undo expansion
  cover the same need without another control.
- **Find assets** now also lists contract object columns (kind *Column*) and concept
  relationships, so a column can be found and pierced directly (FR-007 already named columns).


## R21. Implementation decisions taken in Phase 7 (one name: Metric)

- **Wording.** Every rendered text, accessible name, tooltip, placeholder and status message says
  "metric" (FR-014): `KPI · Metric` in the catalog became `Metric`, `KPIs shown/hidden` became
  `Metrics shown/hidden`, `New KPI` became `New metric`, the detail region is `Metric <label>`, and
  validation messages say "metric" (`A ratio metric requires numerator and denominator.`,
  `Metric "x" is bound more than once…`). Stored data is unchanged: the extension key
  `kpi_bindings`, the schema ids and the `kpi` module of the shopping center keep their names. The
  explanation heading is `How this metric is calculated`, as in the UI contract.
- **Code names.** The four modules are renamed (`MetricWizard`, `MetricDetail`, `metric-save`,
  `metric-draft`); exported `Kpi*` types and `planKpiSave` stay, with `Metric*` aliases, so the
  v0.2.0 tests and the mutation suite's category names are untouched.
- **Routes.** `metrics` and `metrics/preview` are served by the same handler as the v0.2.0 `kpis`
  paths (one regular expression in server/routes/kpis.ts) rather than a second file, so the aliases
  cannot drift; tests/metrics-api.test.ts compares both byte for byte.
- **Non-governed items.** The http contract lists the fields a non-governed metric has. The list
  also carries what the workbench infers without attributes (type with `typeDeclared: false`,
  inputs, concepts from bindings, findings); attribute fields (owner, status, unit, targets) are
  absent. The table needs the inferred type, and Add attributes prefills from it.
- **Add attributes.** `POST metrics` accepts `existing: true`: the metric must exist and have no
  extension; only its `custom_extensions` entry is added (the expression and every other line keep
  their bytes). The wizard opens as `Add attributes to <label>`, prefilled (label, type, numerator
  and denominator or inputs, aggregation, concepts, unit); name and expression are read-only. A
  metric already bound to a concept keeps its binding and none is added.
- **Test changes required by the spec (FR-014).** Expected strings changed from "KPI" to
  "metric" in tests/kpi-save.test.ts (deprecation message, `metric binding of`),
  tests/metric-extension.test.ts (four extension messages), tests/kpi-bindings.test.ts (duplicate
  binding message), scripts/metrics-browser-check.ts (counts `25 metrics`, `Find a metric`,
  `Group metrics by`, `Metric <label>` regions, `Sum the metric values`, `Metrics shown/hidden`,
  the `Metric` badge and catalog tag, `How this metric is calculated`),
  scripts/item-edit-browser-check.ts (`New metric`, `Metric type`, `Metric Vacancy rate`,
  `Find a metric`) and scripts/graph-browser-check.ts (`Open N metrics for Property`, `Find a
  metric`). Each assertion checks the same behaviour as before; only the wording differs. The mall
  example has 25 metrics, all with attributes, so its count is unchanged.

## R22. Implementation decisions taken in Phase 8 (SQL coloring and lint)

- **ANSI fallback.** An ANSI (or undeclared) expression is accepted when either the PostgreSQL or
  the SQLite grammar parses it, as the governed planner does (server/agent/sql.ts); the reported
  finding is the PostgreSQL one. Without it, the official Flights mapping
  (`FLIGHT.id WHERE ( FLIGHT.diverted == TRUE )`) would show warnings the planner itself accepts.
- **Unknown dialects.** A declared Ossie dialect outside the contract's table is treated like the
  non-SQL dialects (left plain, "not checked"); an unknown ODCS server type falls back to ANSI as
  the contract says.
- **Message.** `SQL expression (<dialect>): syntax error near "<token>". Checked, not executed.`;
  the token is read from the value at the mapped position (the parser's "found" is one character).
- **Unmappable positions.** The offset map is rebuilt from the raw text for each scalar style and
  compared with the parsed value; on any difference the finding goes to the expression's first
  character (FR-052). Every SQL region of every shipped example maps exactly (tests/sql-regions).
- **Coloring.** The YAML and JSON languages nest `@codemirror/lang-sql` (StandardSQL) where the
  key path read from the syntax tree matches the region table; the lint uses the exact YAML CST.
  Read-only previews (metric explanation, wizard, Mappings) draw the same grammar and colors as
  spans inside their existing `<pre><code>`, so their text stays exactly the SQL.
- **Wizard inputs.** The wizard's free SQL input is the Expression (derived, cumulative and
  filtered metrics); the filter is structured (field, operator, value), so it has no SQL text to
  color or lint.
- **Cache.** The index cache version is bumped (3) so cached findings gain the SQL warnings.
- **Worker chunks.** Workers are built as ES modules (`worker.format: "es"` in vite.config.ts) so
  the grammar builds stay separate chunks loaded on first need; with the default IIFE format every
  grammar was inlined into one 3.3 MB worker. The validation worker is now 0.7 MB and each grammar
  0.2–0.3 MB.
- **Gate note.** The first browser runs after the new dependencies were added failed in
  `test:graph` and `test:odcs` while the dev server re-optimized dependencies (page reloads mid
  check); with the dependency cache warm, both pass repeatedly, unchanged.

## R23. Implementation decisions taken in Phase 9 (calmer main screen, dialogs)

- **Drawer names.** The contract names the desktop toggle (`Hide sidebar` / `Show sidebar`) and
  the drawer's close button; below 1100 px the header button keeps its v0.2.0 names (`Open
  workspace` / `Close workspace`) because it opens and closes the drawer there.
- **Examples.** Collapsed by default once projects exist; the user's toggle is kept for the
  session, and loading an example from the open group keeps it open (so a second example is one
  click away).
- **Import.** The Import dialog chooses the destination; it opens the one file field of the page
  (kept outside the dialog, so the page still has exactly one file input). Name conflicts and
  repairs keep their own dialogs. The tree's "Import files into this project" opens the same
  dialog with that project chosen.
- **Validation.** Findings are no longer shown inline above the canvas; the Save state indicator
  (and the status bar's Validation details) opens the dialog. The canvas keeps its "Repair in
  Source" message for a file that cannot be shown.
- **Dialogs.** The native modal dialog makes the page inert but lets Tab leave for the browser's
  own controls; Modal now cycles Tab inside, and Escape stops at the dialog, so a dialog opened
  from the drawer closes without closing the drawer.
- **Toolbars.** With the 300 px sidebar the Graph toolbar would wrap at 1280×720 and cost the
  canvas a row; on desktop it stays one row and scrolls sideways with the edge fade used on
  smaller screens; the lineage search shrinks before the toolbar wraps.
- **Test changes required by the spec (FR-060–FR-062).** Checks that clicked `Close workspace` on
  desktop now use `Hide sidebar` / `Show sidebar` (responsive-ui-tests); checks that clicked
  `Load …` with projects present open the Examples group first (helper
  scripts/helpers/examples.ts); `Export` is reached through `More actions` and `Add item` through
  `New` (helper scripts/helpers/header.ts); inline validation findings are read in the Validation
  details dialog opened from Save state (ui-tests, grouping-validation, examples-ui); grouping
  suggestions are read in their dialog (trash-browser-check); the project row's accessible name is
  the project name as the contract says (projects-browser-check, previously "Shop, 3 files"); a
  long file name at 390 px wraps to two lines with its title instead of ellipsizing on one line
  (trash-browser-check). Each check keeps its behaviour; only how the control is reached changed.

## R24. Readability step (owner request, between Phases 9 and 10)

- **Tools.** Oxfmt 0.73 and Oxlint 1.88, both shipped with Vite+ 1.2.0 (`vp fmt` and `vp lint`
  forward to them); no Prettier. Scripts run them with `bunx --bun` because the machine has no
  Node.js. `.oxfmtrc.json`: 100 columns, 2 spaces, semicolons, single quotes, trailing commas,
  `arrowParens: avoid`. `.oxlintrc.json`: correctness rules and `one-var` are errors; judgement
  rules (name length, function length, nesting, complexity, nested ternaries) are warnings,
  listed by `bun run lint:full`, so older code does not block the gate.
- **Gate.** `bun run check` runs TypeScript, `fmt:check` and Oxlint; the mutation baseline runs
  `fmt:check` and lint first; `scripts/check-comments.ts` rejects spec, task and research IDs in
  comments and is part of `check`.
- **Mutation anchors.** The reformat and the one-declaration split moved code, so every anchor was
  re-derived from the formatted source by a whitespace-insensitive match and checked to occur as
  many times as before; the commit-message mutant now names the `throw` so both commit paths still
  lose their check. 116 mutants, all killed.
- **Test changes.** tests/explain.test.ts walked only imports written `from 'x'`; after formatting
  it reaches every module, where `.exec(` is RegExp#exec, so the no-execution check bans the
  process APIs themselves (Bun.spawn, Bun.$, execSync, spawnSync) next to the child_process import
  ban. The Full pierce check reads the canvas's node ids (`data-canvas-ids`) because large canvases
  render only what is on screen; the Flights mappings check waits for the mapping list to load.
  Test and check names lost their IDs; assertions are unchanged.
- **Refactors.** `src/main.tsx` (2,730 lines, one component) became a 386-line entry point that
  composes hooks and components under `src/app/`; `CodeEditor.tsx` became a hook
  (`useCodeMirror`), a status bar and text/navigation helpers. Comments were rewritten in all of
  src/, server/, scripts/ and tests/. Written by Codex from the briefs in
  specs/002-lineage-and-ux/codex/readability-*.md and reviewed; behaviour checked by every suite.
- **Two fixes the refactor exposed.** Splitting `main.tsx` changed the order in which component
  stylesheets load, and the metrics explanation's unscoped `.lineage-row`/`.lineage-head` rules
  began to override the lineage canvas cards. Those rules are now scoped under `.kpi-lineage`, so
  stylesheet order no longer matters. Separately, the lineage canvas scheduled its first readable
  view 80 ms after layout; a Fit clicked in that window was undone by it. An explicit Fit now
  cancels the pending first view (the ODCS check caught this once machine load changed; it failed
  the same way on the Phase 9 commit).

## R25. Implementation decisions taken in Phase 10 (Group by that groups)

- **Business entities and backbone.** Communities now run over ontology concepts and classes,
  contract objects, semantic datasets and metrics, and concept mappings. Their edges are the
  document's own relationships (foreign keys, joins, metric references) plus, for mapping
  documents, a link from each concept mapping to every other mapped concept it names inside its
  link mappings. A mapping document has no relationships of its own, so without these links every
  mapping would be its own community. Value types and primitives stay out, as before.
- **When a mode is enabled.** A mode is enabled when it finds at least two real groups: distinct
  domains, namespaces, communities (with at least one backbone edge), example areas or definition
  types. Catch-all groups (Unassigned, No IRI, Built-in concepts) do not count, so "one namespace
  plus No IRI" stays disabled. Every enabled mode therefore yields at least two groups.
  Disabled modes stay in the menu, greyed, with the reason in the option text.
- **Contract-level domain.** ODCS objects cannot declare their own domain, so the contract-level
  `domain` is every object's only declared domain and Declared domains is disabled with "Only the
  contract-level domain is declared". When an entity declares its own domain, that domain comes
  before the copied contract domain.
- **UBL example areas.** Offered when at least 80% of the entities carry a curated UBL name. The
  UBL files match 98–100%; the next highest shipped file (commerce) matches 50%, and mall 4%,
  because names like Order or Address are common. The model name no longer matters.
- **Stored choices.** A mode stored from an earlier session that the document cannot use falls
  back to Auto, and the menu shows Auto.
- **Auto label.** The Auto option names the mode Auto would pick for the document, whatever mode
  is selected.
- **Adjust grouping.** The correction form moved from a nested disclosure into the **Adjust
  grouping** dialog (entity, destination group or new group name, the current groups with
  counts, the corrections in effect, Apply and Reset). Corrections persist as before.
- **Lineage and Neighborhood.** Group by is shown on a contract's Graph tab, which is the lineage
  canvas; objects of the open contract are tinted with their group colour (a light wash of the
  colour on the card header). Neighborhood nodes carry their group colour as a 4 px edge.
- **Test changes.** `tests/grouping.test.ts` asserted that Declared domains groups a contract into
  its single contract domain and that Auto picks it; the spec now requires the opposite, so the
  test checks that the domain is still every object's declared affiliation, that the mode is
  disabled with its reason and that Auto moves on. The overview mutants that targeted the old Auto
  expression now target the equivalent counts in the new code.

## R26. Implementation decisions taken in Phase 11 (Git setup from the app)

- **Identity, live.** No cache: `GET /api/status` and every Source Control status read
  `user.name`/`user.email` with the repository as working directory each time (a few
  milliseconds). `PUT …/git/identity` runs `git config --local` in the repository, or in every
  repository with `allRepositories`; the user's global configuration is never written. The scope
  reported is `local` when both values are set in the repository's own configuration.
- **Remote dialog.** The inline remote form of the Source Control panel became the **Remote**
  dialog (name, URL, Save, Remove); `DELETE …/git/remote` removes a remote. The address checks
  moved into one function shared by remotes and clone. `scripts/scm-browser-check.ts` now sets
  the remote through the dialog (spec change: FR-065 asks for a dialog).
- **Clone.** The clone runs in `data/projects/.staging-clone-<op>/` with `-c core.autocrlf=false
  -c core.symlinks=false clone --no-recurse-submodules`, then sets `core.autocrlf`,
  `core.safecrlf` and `core.symlinks` in the clone and moves it with the registry in one journal
  step. A clone interrupted by a stop has no journal entry yet, so start-up removes any
  `.staging-clone-*` folder and reports it as a rolled-back `clone` operation. The registry entry
  records `origin: 'clone'` and the redacted address. Invalid files are reported in the `done`
  event; a symbolic link arrives as a one-line text file, which is usually not a valid
  definition and is listed too.
- **Clone dialog placement.** Clone is offered from the Import dialog (**Clone a Git
  repository…**), so the sidebar keeps one import entry. A quick clone can finish before its
  request returns, so the dialog keeps every `clone` event and looks up its operation afterwards.
- **Credential guide.** Offered next to a Source Control error whose text matches Git's
  authentication phrases (`could not read Username`, `Authentication failed`, `Permission denied
  (publickey)`, HTTP 401/403), and from a failed clone. A failed Commit & push says that Source
  Control offers the guide. The browser check produces a real refusal with a local HTTP server
  answering 401, so no network remote is used.
- **Source Control error kept.** The panel used to clear any error when it reloaded the status,
  and every action reloads it, so a failed push's message disappeared at once. Load errors and
  action errors are now separate.
- **Identity in the Commit dialog.** It listens for the `identity` event and updates only the
  identity flag, so the files the user unticked stay unticked.
- **Responsive sweep helper.** The overlap sweep opened the sidebar by checking whether
  **Open workspace** was visible right after a resize, before the page had switched layout; it
  failed about one run in three. The helper now waits for the layout that matches the viewport
  and shows a desktop sidebar that an earlier check hid. No assertion changed.
- **Architecture review fixes.** An unchanged masked address (`https://***@…`) saved from the
  Remote dialog keeps the original; any other masked address is refused. "Every repository"
  fills in only repositories without an identity. Two clones started together reserve
  different names and folders. The address and remote-name rules live in `git.ts` with
  `redactCredentials`; the status summary is `workspace.status()`; the browser imports the
  identity and clone event types from the server; the clone dialog sits in `src/scm/` with the
  other Git setup dialogs; the credential helper route moved to the Git routes.

## R27. Implementation decisions taken in Phase 12 (several projects in one repository)

- **Where the rules live.** `server/projects/repositories.ts` holds the pure rules: manifest
  parsing (schema `semantic-workbench/repository/v1`, only `schema` and `projects`, no root,
  no `..`, `.git`, absolute or nested folders) and detection (the outermost folders that hold
  definition files, cut at four levels; ignored files are already absent from `git ls-files`).
  `repository-projects.ts` does the I/O: reading and saving the manifest and writing the
  registry. The manifest is workbench configuration, so the scanner treats it as a file it does
  not read (it is never listed as an invalid definition).
- **Registration replaces the set.** `PUT /api/repos/:repo/projects` makes exactly the chosen
  folders the repository's projects: a folder that already has a project keeps its slug, a new
  folder gets a free name and slug, and a project whose folder is left out is removed from the
  workspace (nothing is deleted). After a clone with a manifest the repository's own project is
  replaced by the declared ones, and the `done` event lists their slugs so **Open project** opens
  the first. Names never repeat a name already in the workspace (`sales (2)`).
- **Starting choice.** **Choose projects…** after a clone starts from the manifest or the
  detected folders; **Projects in this repository…** from the menu starts from the projects
  registered now, so it never pretends a choice the user did not make.
- **Source Control paths.** Status lists the whole repository. Each change keeps `path` as in
  v0.2.0 and adds `repoPath`, the owning `project` and its `projectPath`. The panel and the
  Commit dialog act on changes by `repoPath` (`repoPaths` on stage, unstage and commit;
  `repoPath` on diff), because two projects can hold the same relative path and a sibling's file
  cannot be named from the viewing project. Open and Revert go through the owning project. A
  file of no project (a README at the root, the manifest) is staged and committed like any
  other, but cannot be opened, reverted or added to a project's `.gitignore`.
- **Delete request.** The contract sketched `mode` and `confirm` as query parameters; the
  existing delete routes take a JSON body with `confirm: true`, so `mode` joined that body
  (`{mode: 'remove'}` or `{mode: 'delete', confirm: true}`). The response for a deleted
  subproject is `{entryId, undoUntil}`, as for any project.
- **Watcher.** One watcher per repository. A file change notifies only the project whose folder
  holds it; a change under `.git` (HEAD, index, refs) notifies every project of the repository.
- **Trash.** Deleting a subproject moves only its folder (kind `subproject`); restore refuses an
  occupied folder (409) and re-registers the project with its folder and repository. Clear
  moves a repository with subprojects once (kind `repository`) and Undo restores every project.
- **Tests on the shared fixture.** `tests/subprojects.test.ts` and the browser check use the
  `monorepo` and `monorepo-no-manifest` bare repositories from `tests/helpers/git-fixtures.ts`.
- **Architecture review fixes.** A manifest that cannot be applied after a clone (a missing
  folder, a link) no longer turns a finished clone into a failure: the `done` event carries
  `manifestError` and the repository stays one project. A whole project restored from the trash
  comes back into the folder named by its slug, without the folder and repository it had, so a
  root project whose name differs from its folder restores intact. No repository is left on disk
  without a project: **Remove from workspace** is refused for the last project of a repository
  (the dialog offers only Delete), and deleting that last project moves the whole repository
  (kind `repository`); the same rule makes Clear move repositories whole, with no flag tied to
  the batch. Removing projects goes through one function of `repository-projects.ts`. Manifest
  schema errors are `ManifestError`. The watcher announces a change under `.git` once per
  repository. The repository routes keep parsing their body by hand, as the trash routes do.

## R28. Implementation decisions taken in Phase 13 (Mappings that fit)

- **Arrow on the step.** The separate arrow element became a `::before` of each step after the
  first, so it always starts a line with the step it leads to. Names get a `<wbr>` after each
  `.` and `_` and wrap with `overflow-wrap: break-word` only as a last resort.
- **Composer dialog.** **Compose a query…** in the Mappings heading opens the composer as a
  dialog (`src/mappings/QueryComposer.tsx`); its choices and preview stay in the Mappings view,
  so closing and reopening keeps them, and changing concept clears them as before. The page has
  two columns: concepts and bindings. `scripts/ui-tests.ts` and `scripts/examples-ui-tests.ts`
  now open the dialog before choosing metrics (spec change: FR-063 moves the composer into a
  dialog); the old check that the composer column sat right of the bindings now checks that the
  bindings take the width and that the dialog fits at 390 px. The late-response check closes the
  dialog to change concept and confirms the reopened composer shows no SQL.
- **Geometry check.** `scripts/mappings-layout-browser-check.ts` imports every shipped mapping document
  with its ontology and semantic model, plus the mapped commerce trio with 80-character dataset,
  field and concept names and a long dotted source, opens every group and measures each card at
  the six viewports: no element past its card, no text overflowing its box, every arrow on the
  line of its step. On the previous layout it reports detached arrows.
- **Architecture review fixes.** The arrow check measures the `::before` arrow itself (its
  offset and line height against the step's label) and reports a step with no arrow; moving the
  arrow 60 px down makes it fail. The check is named `mappings-layout-browser-check.ts`, like
  the other browser checks. Load errors and preview errors are separate: a failed load shows on
  the page, a failed preview in the composer. Changing the mapping document closes the composer.
- **Gate under outside load.** During this phase's gate another workload drove the machine's load
  average to about 99, and six browser suites failed on timeouts and time budgets in steps that
  do not touch the Mappings tab. Rerun at low load, all six passed with no change. The typing
  budget in `test:editor` passes with little margin (about 29.5 ms per key against 30 ms with a
  save in flight), so it is the first check to fail on a busy machine.

## R29. Typing latency

- YAML above 500,000 UTF-16 code units uses CodeMirror's existing legacy streaming mode.
  Its parser stops at the viewport instead of synchronously rebuilding the tree through the
  background parse frontier. Keys, plain values, strings, numbers and comments retain the
  editor's highlight palette. Smaller YAML retains the mixed SQL/JSON parser; the shipped
  SQL and extension examples fit below the threshold. Large YAML has basic YAML highlighting
  rather than embedded SQL/JSON highlighting and structural folding.
- The size mode is chosen at mount and reconsidered only for an external replacement; typing
  across the threshold retains the document’s chosen parser. Source propagation stays synchronous:
  byte preservation, external replacement,
  validation, drafts and autosave keep their existing paths. No deferred text can overwrite a
  newer editor value. React rendering is unchanged in this change.
- A terminal-only `bun test` benchmark used the profile script's 1,932,802-character fixture,
  46 single-character insertions at the first concept, and `EditorState.update`. Before every
  insertion, `ensureSyntaxTree` requested the stated parse frontier with a 1,000 ms budget;
  only the transaction was timed. At 4,000 characters parsed, the mean fell from **3.48 to
  1.33 ms/key**; at 104,000 characters, **10.71 to 0.76 ms/key**. These numbers exclude React,
  layout, Event Timing quantization and autosave. The reviewer must measure the browser's
  39-keystroke check with a save in flight to establish the **22 ms** target.

- The React follow-up memoizes the workspace sidebar (including the project tree), toolbar,
  header, resize handle and footer. Stable event callbacks read the latest committed handlers;
  the creation menu keeps explicit model/document dependencies. The header receives source
  availability, save status and the validation error instead of the full source and autosave
  object; the footer receives booleans and counts. Repeated keystrokes with the same visible
  status therefore skip those subtrees and their icons. Inactive canvas views were already
  unmounted and cursor state already belonged to the editor. Text propagation, byte-preserving
  edits, validation and autosave remain synchronous on their existing paths.
- **Browser measurements** (the editor check's method: mean `keydown` Event Timing duration
  over 39 keystrokes, keys under 16 ms counted as 16; dev build; load average under 8):

  | State | Without a save | With a save in flight |
  | --- | --- | --- |
  | Before (Phase 13) | 27–29 ms | 29.3–30.4 ms |
  | Streaming YAML for large files | 27.5–29.7 ms | 25.6–26.7 ms |
  | Plus memoized app shell | 17.4–28 ms (first run warms up) | **16.6–16.8 ms** |

  The CPU profile before the change showed, per keystroke, up to ~15 ms re-parsing YAML (the
  `@lezer/yaml` tree never reuses a node, so each transaction re-parsed up to the background
  parse frontier), 5–9 ms of React rendering the whole app, and ~11 ms of style, layout and
  paint. A first attempt that deferred `setSource` with `startTransition` lost a keystroke (an
  older `value` reached the editor and was applied as an external replacement) and was dropped.
  The editor check's budget is unchanged. The change was written by Codex from two briefs
  (`codex/phase-14-latency*.md`) and reviewed and measured here.

- README documents the reduced colouring and lack of folding for YAML above 500,000 characters.
- `useStableHandler` names the latest-committed-handler contract and restricts calls to events
  and passive effects; the inspector and item-editing refs remain unchanged because they publish
  during render, so moving publication to a layout effect would change their timing.
- The app passes the stable `setTab` setter directly instead of wrapping it.
- New unit tests cover YAML key tags, mixed SQL/JSON parsing, size-mode transitions and forwarding
  to the latest published handler.

- Large mode now retains viewport SQL/extension-JSON colouring and indentation folding, with a
  document-local Full parsing switch. Persistent text summaries avoid scanning offscreen blocks
  again after each edit. Browser latency was not remeasured in the port-restricted sandbox;
  the prior save-in-flight baseline is 16.6–16.8 ms/key and the reviewer target remains ≤22 ms/key.
- **Large file mode, final numbers** (same method, 1.9 MB file, load average under 8, after
  SQL and extension-JSON colouring for the lines on screen and indentation folding were added):
  large file mode 17.8–18.5 ms per key with a save in flight (editor check: 18.3 and 18.5 ms);
  **Full parsing** chosen in the status bar 27.5–34.1 ms, which is the cost the mode avoids.
  Validation, findings, SQL lint, autosave and drafts are the same in both modes. The status
  bar names the mode (`Large file mode`, with a tooltip giving the 500,000-character threshold
  and the reason) and switches to **Full parsing** and back for the open document.
  `test:sql` checks the indicator, SQL colours on screen in large file mode, and both switches.
- **Final overlap sweep.** The new dialog check first reported the Grouping suggestions dialog
  as clipped by the sidebar. The dialog is a modal `<dialog>` in the browser's top layer, so the
  sidebar cannot clip it, and the screenshots confirm it. The check now stops looking for
  clipping ancestors at an open modal dialog.

