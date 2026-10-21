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

