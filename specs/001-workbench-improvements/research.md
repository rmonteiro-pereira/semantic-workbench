# Phase 0 Research: Workbench Improvements

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-10-20

Each entry records Decision, Rationale and Alternatives considered. R1 is the evaluation the spec
requires (metrics storage); the rest settle the open technical choices of the plan.

---

## R1. Metrics-layer storage: Ossie `custom_extensions` vs `*.metrics.yaml`

**Decision**: Store metrics-layer attributes in Ossie `custom_extensions` on each metric
(`vendor_name: SEMANTIC_WORKBENCH`, `data` as a YAML literal block holding pretty-printed JSON).
The `*.metrics.yaml` fallback is not adopted. KPIs that combine metrics from two semantic models
(the one case the extension cannot express, criterion 6) are out of scope for this feature (owner
decision PQ1). The KPI's ontology concepts are not stored in the metric extension but in the
mapping document's extension (R12).

**Evaluation**. The representation from [metrics-proposal.md](./metrics-proposal.md) was applied
by source-range insertion to every metric of the four shipped semantic models that declare
metrics: `billing.semantic.yaml` (4), `commerce/sales.ossie.yaml` (3),
`commerce/commerce.mapped-semantic.yaml` (2) and `mall/mall.semantic.yaml` (25): 34 metrics, of
which 25 simple, 7 ratio and 2 derived (type inferred from the expression). The harness used the
repository's own parser (`yaml`), validator (`src/input.ts`), agent runtime and planner
(`server/agent/runtime.ts`) and `git diff --no-index`, on throwaway copies only.

| # | Criterion | Result | Verdict |
| --- | --- | --- | --- |
| 1 | Readability in Source | Each metric's extension is one contiguous block of 9–12 lines at the end of the metric (sample below). Embedded-JSON coloring inside the YAML block is feasible with the chosen editor (R2: nested parsing of the block scalar under `data`) and is a Phase 6 task | Pass (coloring to be delivered) |
| 2 | Clean Git diffs | Changing one attribute (`status`) in one metric of each file: `git diff --numstat` = 1 added, 1 deleted line in all four files. Adding an extension only adds lines | Pass |
| 3 | Schema validation with locations | An invalid value (`additivity: "sometimes"`) injected in every metric, validated against a draft extension schema, and the error's instance path mapped through the block scalar's fixed indentation to file line and column: 34/34 located on the exact `"additivity"` key | Pass |
| 4 | Round-trip byte preservation | Removing the inserted blocks restores the original bytes exactly in all four files; reading every `data` string back yields the inserted objects (34/34); the one-attribute edit changes bytes only inside that metric's `data` block | Pass |
| 5 | Editing ergonomics | The item editor form is identical for both storage options; only the write-back target differs (one block in the same file vs another file). No advantage for the fallback | Pass |
| 6 | Coverage | 34/34 metrics representable, including all ratio and derived KPIs. Cross-model references between the four models: 0. Known limit: an Ossie metric cannot reference another model's metrics, so a cross-model KPI cannot be stored this way | Pass on shipped examples; limit recorded |
| 7 | Interoperability | Validation before and after: valid in all four files with identical issue codes. Agent runtime and planner on billing and mapped commerce: identical findings and identical generated SQL for every metric (4 and 2 plans, 0 errors) | Pass |
| 8 | JSON-serialized models | No shipped semantic model is JSON. In a JSON model `data` is one escaped line, so a one-attribute change is a one-line diff of that whole line. Criterion 2 is judged on YAML | Pass (as allowed by criterion 8) |

Size impact: +395 lines over the four files; the 145-entity shopping center model grows from
191,224 to 200,017 bytes (+4.6%) with all 25 KPIs annotated.

Representative block (shopping center `occupancy_rate`, attributes inferred):

```yaml
    custom_extensions:
      - vendor_name: SEMANTIC_WORKBENCH
        data: |
          {
            "schema": "semantic-workbench/metric/v1",
            "label": "occupancy rate",
            "type": "ratio",
            "numerator": "occupied_gla",
            "denominator": "total_gla",
            "additivity": "non_additive",
            "owner": "TBD",
            "status": "draft"
          }
```

**Rules fixed by this decision**
- One `SEMANTIC_WORKBENCH` entry per metric, placed as the metric's last key; existing entries of
  other vendors are left untouched and kept in order.
- `data` is written as a literal block (`|`, clip chomping), 2-space JSON, fixed key order
  (schema, label, type, composition, additivity, time, dimensions, filters, unit, format,
  concept, of, targets, owner, steward, status, replaced_by). Reading accepts any JSON layout
  (compact or folded); writing reformats only that block.
- Model-wide defaults: one entry on the semantic model root with `"schema":
  "semantic-workbench/model/v1"`.
- Schema: `schemas/semantic-workbench-metric-v1.json` (application schema, labelled as such;
  draft in [contracts/metric-extension.schema.json](./contracts/metric-extension.schema.json)).
- The same applies to the semantic model embedded in a consolidated Ossie file.
- The sample above predates R12: `concept`/`of` were removed from the metric extension and moved to
  KPI bindings in the mapping document.

**Alternatives considered**: `*.metrics.yaml` (equal on criteria 2–5 and 7, better only on
criterion 6, at the cost of a second file per model and cross-file identity resolution);
dbt MetricFlow YAML (Jinja filters, dbt project layout); nested YAML under a non-standard key
(fails the pinned Ossie schema, which allows no additional properties).

---

## R2. Source editor component

**Decision**: CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `search`, `language`, `lint`,
`lang-yaml`, `lang-json`, `lang-xml`, `legacy-modes` for Turtle and N-Triples, `merge` for diffs).

**Rationale**
- Size: the complete set above, bundled and minified, is 431 KB (140 KB gzip). Monaco's package
  is about 100 MB unpacked and ships multi-megabyte workers; it has no Turtle/N-Triples grammars
  (they would be custom Monarch grammars either way).
- Byte-exact text: CodeMirror (like Monaco) normalizes line breaks in its document, so the editor
  never owns the file bytes. Saves are computed as **source-range patches**: the editor's change
  set is mapped back to offsets in the original text and applied there. Tested on a mixed
  `\r\n`/`\n` document: editing one line produced `a: 1\r\nb: 20\nc: 3\r\n` from
  `a: 1\r\nb: 2\nc: 3\r\n`, preserving every untouched line ending. Inserted line breaks use the
  file's dominant style. This is the same mechanism item edits need (FR-082), so one patch path
  serves Source, item editor and wizard.
- Lint: `@codemirror/lint` takes diagnostics with ranges, gutter markers and hover tooltips;
  findings without a range stay document-level. Validation runs in a Web Worker, debounced
  (~300 ms), so typing is never blocked (FR-045).
- Highlighting: Lezer grammars for YAML, JSON and XML (RDF/XML); stream modes for Turtle (also used
  for N3) and N-Triples. Embedded JSON inside the `SEMANTIC_WORKBENCH` block scalar via nested
  parsing (R1 criterion 1).
- Diff: `@codemirror/merge` provides side-by-side and unified views with syntax colors, used for
  Source Control, stale-save conflicts and ODCS history.

**Alternatives considered**: Monaco (size, workers, no RDF grammars, heavier CSP/worker setup in
Vite+); keeping the textarea overlay (no tokenization, LF normalization on input, no ranges);
Shiki/Prism highlighting over a textarea (no editing model, no lint ranges).

---

## R3. File watching on Linux/WSL under Bun

**Decision**: `node:fs.watch(projectDir, {recursive: true})` per project folder, plus watching
`.git/HEAD` and `.git/index` through the same recursive watcher; 150 ms debounce per project;
reconcile by rescanning changed paths (hash compare) and after every Git operation; a full
rescan on startup and every 60 s as a safety net.

**Rationale**: On Bun 1.4.0 under WSL2 (ext4), a recursive watcher reported creates, changes,
atomic temp-file renames, files inside newly created subfolders and `.git/HEAD` writes. Project
folders live under `data/projects/` inside the repository on the Linux file system, where
inotify works. The periodic rescan covers missed events and file systems without inotify (for
example a checkout placed on `/mnt/c`, which is out of scope but must not corrupt state).

**Alternatives considered**: chokidar (extra dependency, same inotify underneath); polling only
(latency and CPU on large projects); Git-only status polling (misses unsupported/ignored files'
effects and external edits between operations).

---

## R4. Pushing changes to the browser

**Decision**: Server-sent events at `GET /api/events` (Bun `Response` with a `ReadableStream`,
`text/event-stream`, 15 s heartbeat comments, monotonically increasing event ids, `Last-Event-ID`
replay from a bounded in-memory ring, `resync` event when the ring is exceeded). Events are
invalidations (project and paths changed), not file contents; the UI refetches.

**Rationale**: One-way server→browser notification is all that is needed; `EventSource`
reconnects automatically; it works through the existing Vite `/api` proxy and stays on loopback.
The origin check applies to the event stream like other endpoints.

**Alternatives considered**: WebSockets (bidirectional, more code, no benefit); polling (latency,
load).

---

## R5. Git integration

**Decision**: Shell out to the installed `git` with `Bun.spawn([...args], {cwd, env, stdin,
stdout:'pipe', stderr:'pipe'})`, one serialized queue per repository, and porcelain/`-z` output.

- Environment: the API's own environment is inherited (so `credential.helper`, `SSH_AUTH_SOCK`,
  `DISPLAY` and WSL interop reach Git), plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, and
  `GIT_OPTIONAL_LOCKS=0` for read-only status calls; `stdin` is not a terminal.
- Credentials (owner decision PQ2: the credential window is allowed). Mechanism:
  `GIT_TERMINAL_PROMPT=0` only stops Git's own username/password prompt on a terminal, which a
  background server process cannot answer and which would otherwise hang. It does not stop Git
  from calling the configured `credential.helper`. Git Credential Manager is therefore free to
  show its GUI window: the workbench does not set `GCM_INTERACTIVE=never` or
  `GCM_GUI_PROMPT=false` (GCM's documentation: `GCM_INTERACTIVE` "Permit or disable GCM from
  interacting with the user (showing GUI or TTY prompts)"; `GCM_GUI_PROMPT` "Permit or disable GCM
  from presenting GUI prompts", enabled by default). GCM's text fallback is not available
  because there is no terminal, so the GUI is the only prompt. For SSH remotes, an `ssh-agent` or
  a configured `SSH_ASKPASS` program is used if present. If no helper is configured, the operation
  fails with Git's message and the UI explains how to configure a helper or SSH key. Constitution
  2.0.0 Principle I is respected: the window belongs to Git's helper; the workbench never stores,
  prompts for or transmits credentials itself, and remote operations run only on explicit action.
- Timeouts: 30 s for local commands. Fetch/pull/push/sync run up to 10 minutes so the user can
  finish a credential window; the UI shows "Waiting for Git (credentials may be requested in a
  separate window)" with Cancel, which kills the process. stderr is shown on failure.
- Commands: `git init -b main`; `git config core.autocrlf false` (and `core.safecrlf false`) in
  managed repos; `git -c core.quotepath=off status --porcelain=v2 -z --branch`;
  `git ls-files -co --exclude-standard -z` for the scanner (so `.gitignore` is honoured by Git
  itself); `git add -- <paths>`, `git restore --staged -- <paths>`; `git commit -F -` (message on
  stdin); `git branch --format`, `git switch`, `git switch -c`; `git remote add/set-url`;
  `git fetch`, `git pull --no-rebase --no-edit` (merge, so conflicts surface as conflicted files),
  `git push -u <remote> <branch>`; `git show <rev>:<path>` and `git log --follow -z --format` for
  history; `git diff --no-ext-diff` only for counts (rendering uses R2's merge view).
- Hooks and filters run normally; after each operation, changed paths are rehashed and files whose
  bytes differ from what the workbench wrote or Git reports are listed (FR-096).
- Missing Git or missing `user.name`/`user.email`: detected at startup and on commit; a banner
  explains the fix; non-Git features work.

**Alternatives considered**: isomorphic-git (reimplements Git; hooks, filters, credential helpers
and some merge cases differ from the user's Git; larger surface to trust); libgit2 bindings (native
build, not Bun-friendly).

---

## R6. Durable application state

**Decision**: JSON files under `data/state/`, one file per concern, written with
write-temp → `fsync` → rename → `fsync(dir)`, each carrying `formatVersion`:
`projects.json` (registry), `views/<project>.json` (view settings and grouping corrections keyed
by path), `suggestions.json` (rejected suggestions), `drafts/<project>/<path-hash>.json` (draft
text plus base hash), `trash/index.json` (trash log), `journal/<op-id>.json` (in-progress
multi-file operations), `legacy-ids.json` (v0.1.0 document id → project/path).

**Rationale**: Human-readable, diffable, trivially backed up with `data/`, no second database to
keep consistent with the cache, and atomic per file. Volumes are small (hundreds of entries).

**Alternatives considered**: a second SQLite file (opaque, contradicts "SQLite is a cache" in
spirit); YAML (slower to parse safely, no benefit); one big state file (contention, larger
blast radius on corruption).

---

## R7. Multi-file operations and crash recovery

**Decision**: Journal-then-act: write `journal/<op-id>.json` listing every step (source and
destination paths, expected hashes), perform the steps with renames (same file system), mark the
journal done, then delete it. On startup, unfinished journals are rolled forward when every source
still exists and every destination is free, otherwise rolled back, and the outcome is reported.

**Rationale**: Renames inside `data/` are atomic per file; the journal gives deterministic
recovery for project delete, restore, Clear, multi-file KPI saves and migration.

---

## R8. Migration from v0.1.0

**Decision**: On first start with `data/workbench.sqlite` present and no `data/state/projects.json`:
copy the database to `data/backup/workbench-<timestamp>.sqlite`; group documents (example sets by
their known filenames, everything else into "Ungrouped"); write each source with its exact bytes,
disambiguating duplicate filenames (`name (2).ext`); verify SHA-256 of every written file against
the stored bytes; `git init`, configure, `git add -A`, `git commit -m "Import from Semantic
Workbench v0.1.0"`; write `legacy-ids.json` and carry `document_views` grouping into
`views/<project>.json`. Any failed verification aborts, removes the partially written folders via
the journal, and leaves the database untouched. The old database is never modified.

---

## R9. API compatibility while migrating

**Decision**: Keep `GET/POST /api/documents` and `/api/documents/:id/grouping` as a facade over the
folder store (document id = legacy id or `<project>/<path>`; `revision` replaced by `baseHash`,
with the facade accepting either during the transition), and keep `/api/agent/*` unchanged in
shape. Mapping ids returned by `/api/agent/catalog` are re-based on `<project>/<path>`, and
legacy ids continue to resolve through `legacy-ids.json`.

**Rationale**: Existing browser checks, the mutation suite and external agent clients keep working
while the UI moves to project endpoints.

---

## R10. Neighborhood graph

**Decision**: Replace the star-only filter with a center-plus-neighbors projection that keeps
lateral links (toggle), ranks neighbors deterministically (relationship kind, then name), pages
hidden neighbors, keeps the OWL projection independent of focus, places the center in a middle
column (incoming left, outgoing right), and routes long edges with per-edge offsets so no two
share a path. Walk history is a reducer (`back`, `forward`, `push`) in the UI.

**Rationale**: Fixes defects 1–9 of the spec's baseline list while reusing the existing React Flow
canvas, routed edges and tests.

---

## R12. KPI-to-concept bindings in the mapping document

**Decision**: Store each KPI's ontology concepts (`measures`, optional `of`) as KPI bindings in a
root-level `custom_extensions` entry (`vendor_name: SEMANTIC_WORKBENCH`) of the project's
standalone Ossie mapping document, as a JSON block with one binding per line, sorted by metric
name. The metric extension no longer carries `concept`/`of`. Schema draft:
[contracts/mapping-extension.schema.json](./contracts/mapping-extension.schema.json).

**Why standard concept mappings are not used**: The pinned Ossie ontology schema defines
`ConceptMapping` as `{"concept": ..., "object_mappings": [ObjectMapping], "link_mappings":
[LinkMapping]}` with `"additionalProperties": false`; `ObjectMapping` has `concept`,
`referent_mappings` and `expression`, and `Expression` is `{"type": "string", "description":
"ANSI SQL expression"}`. There is no metric target. The Ossie ontology specification describes
mappings as "patterns of expressions that reference fields in a logical model" and an expression
as a "SQL expression that computes a value from fields". Shipped examples that write a metric
name as an object-mapping expression (for example `Revenue` → `gross_revenue`, and 25 KPI
concepts in the shopping center mapping) rely on the workbench runtime's interpretation of
standalone metric names; that interpretation stays readable as evidence but is not used as the
storage for KPI bindings. Per-binding extensions are impossible: in the pinned mapping schema
`custom_extensions` exists only at the document root (it references the core
`SemanticModel/properties/custom_extensions`), not on `ConceptMapping`.

**Where bindings go when there is no standalone mapping**: the wizard creates a minimal standalone
mapping document (`concept_mappings: []` is valid; the schema sets no minimum) with the required
`version`, `name`, `ontology_ref` and `semantic_model_ref`. For a consolidated file, `OntologyMap`
allows no extensions, so bindings go in the root extension of its embedded `semantic_model`.

**Evaluation on the shopping center mapping** (`mall.mapping.yaml`, 914 concept mappings, 1,056
resolved bindings): a root extension with 23 KPI bindings was appended.
- Validation: valid before and after, identical issue codes.
- Byte preservation: the original bytes are an exact prefix of the new file (31 added lines);
  the block reads back to the 23 bindings.
- Diffs: changing one binding's `of` = 1 added, 1 deleted line; adding a binding in sorted position
  = 1 added line. Appending after the last binding also changes the previous line (JSON comma),
  so 2 added and 1 deleted line in that case.
- Agent runtime: identical findings (0), bindings (1,056) and generated SQL for all 25 metrics.

**Alternatives considered**: `concept`/`of` in the metric extension (works, but the mapping
document is where the ontology–semantic link belongs and the owner asked for it there); writing
new standard `concept_mappings` with metric-name expressions (not standard semantics, mixes
population mappings with KPI identity); one extension entry per KPI (the schema allows only a
root-level list, and several entries make diffs and validation messages harder to read).

## R11. Testing approach

**Decision**: Per constitution VI: `bun test` for units and HTTP handler tests against a
temporary `DATA_DIR`; browser checks (Playwright) start the API with an isolated temporary
`DATA_DIR` (never the user's `data/`); new targeted mutants per phase in
`scripts/mutation-tests.ts`; geometry assertions in the responsive suite. A `DATA_DIR` environment
variable (default `data/`) is introduced in Phase 1 for this isolation.

---

## R13. Implementation decisions taken in Phases 0–1

Small decisions made while implementing the storage foundation, consistent with the constitution
and recorded here so later phases build on them.

- **Migration needs Git and an identity.** FR-075 requires every project to be a Git working tree
  and FR-089 an initial commit. Without Git ≥ 2.40 or without `user.name`/`user.email`, the
  migration is postponed: nothing is written, the database is untouched, the banner explains, and
  it is retried on the next start. Completion is marked by `state/legacy-ids.json` (not by the
  registry), so projects created while a migration was failing or postponed are kept and the
  migrated projects are added beside them (names made unique).
- **The v0.1.0 database is never opened.** The database and its `-wal`/`-shm` files are copied to
  `data/backup/` and hash-checked; a second copy of the backup is read. Sources are read as
  `CAST(source AS BLOB)`, so the exported bytes are the stored bytes, not a decoded and re-encoded
  string. (Bun's SQLite binding drops a leading byte order mark when text is inserted, so v0.1.0
  never stored one.)
- **Example origins.** Migrated example sets get `origin: example:<id>` so the example loaders open
  them instead of creating duplicates; everything else is "Ungrouped" with `origin: migration`.
  An example loader also opens any project that already holds every example file with identical
  bytes; this replaces v0.1.0's reuse of documents by filename.
- **Journal steps are renames only.** Content is written to staging folders first
  (`data/projects/.staging-<opId>/`, so Git runs inside `data/projects/`, and
  `data/state/.staging-<opId>/`); the journal then moves finished folders and state files into place.
  Replacing the registry is two renames (current → staging, new → current). Recovery checks the
  remaining steps in order against the file system as earlier steps would leave it, and settles a
  rename whose `done` flag was not yet written.
- **Patch offsets** are UTF-16 code-unit offsets into the base text decoded from UTF-8 (the unit of
  JavaScript strings and CodeMirror). Files must be valid UTF-8; a leading BOM is kept. Files that
  are not valid UTF-8 are listed as invalid and cannot be saved through the API.
- **Legacy facade versions.** `/api/documents` keeps an integer `revision`, now derived from the
  content hash (first 48 bits + 1), and also accepts `baseHash`; both are hash-checked. Documents
  created through the facade go to the "Ungrouped" project. Facade and agent errors keep the
  v0.1.0 status 400.
- **`GET /api/status`** (added to contracts/http-api.md) reports Git availability, identity,
  the migration report and recovery outcomes for the banner (FR-090), since these are facts of
  the start-up, not of one project.
- **Read-only Git calls** (`ls-files`, `status`) use `--no-optional-locks`, so they do not refresh
  `.git/index` and the watcher does not react to the workbench's own scans.
- **First file opened** is the first file of the tree (registry order, then path) rather than the
  most recently updated document; after an import the batch's last file opens, as before.
- **Older browser scripts.** `commerce-browser-check.ts`, `relationship-browser-check.ts` and
  `browser-check.ts` fail on v0.1.0 as well (stale selectors, verified in a v0.1.0 worktree); they
  were moved to isolated data roots so they can no longer write to a real workspace, but are not
  part of the gate.

## R14. Implementation decisions taken in Phase 2

- **Trash log.** Each trash entry is `data/trash/<entryId>/entry.json` beside its `payload/`
  (plus `draft.json`, `view.json` or `drafts/` when there were drafts or view settings), instead of a
  separate `state/trash/index.json` (R6). The entry files are durable, written atomically and
  outside the cache, so FR-078 holds, and an entry cannot disagree with an index. Entry ids are ULIDs.
- **What is journaled.** Delete, project delete, Clear (all projects in one journal, entries sharing
  a `batchId`), undo/restore, move and import into an existing project are rename-only journals.
  Undo of a Clear is one undo call per entry (the UI sends them together).
- **Restore targets.** A file whose project is gone is restored into a new project with the old name
  (created and committed like an import). A taken file path or project id is a 409 `occupied` with
  a free alternative (`name (2).ext`, `<slug>-2`); nothing is ever overwritten.
- **Broken references** in the delete confirmation are Ossie `ontology_ref`/`semantic_model_ref`
  names that no remaining file declares. Shared IRIs and physical names are not "references" that
  break, so they are not listed.
- **Grouping suggestions** are computed on request from per-file facts memoized by content hash; the
  cache's `suggestions` table stays unused. A file is offered to another project only when nothing
  links it to the other files of its own project and its project is the smaller one (on equal
  size, the one registered later). Without the size rule, the two halves of a project that are
  only connected through a separately imported mapping would be offered to the mapping's
  one-file project. Limit: an unrelated file inside a large batch is not offered to a smaller
  project (the spec's "suggestions offer to split" edge case is therefore only partly covered).
  Accepting a suggestion whose name is taken in the target keeps both (`name (2).ext`).
- **Imports into an existing project and moves are not committed**; they appear as changes for
  Source Control (Phase 8). "Replace" overwrites only after the user chose it in the conflict
  dialog; the replaced bytes remain recoverable only from Git history if they were committed.
- **Row delete icons (owner request).** Every file and project row in the Projects tree has a
  Trash2 icon button (aria-label "Delete <path>" / "Delete project <name>", tooltip, 28 px hit
  area) before its actions menu. It is muted (opacity 0.4) until the row is hovered or focused,
  red on hover, and always fully visible where `(hover: none)` or `(pointer: coarse)` matches. It
  opens the same confirmation as the menu's Delete. The filename ellipsizes before the icons;
  `scripts/helpers/tree-geometry.ts` asserts this in the responsive suite at all six viewports
  and in test:trash at 390 and 2560 px and with touch emulation.

## R15. Implementation decisions taken in Phase 3

- **Reference scan.** `src/metrics/deps.ts` is a tokenizer, not a parser: it skips string literals,
  comments, function names, keywords, `AS` aliases, `::` casts, `EXTRACT(… FROM …)` parts and typed
  literals. On every expression of the shipped examples it finds exactly the column references
  of the `node-sql-parser` syntax tree (tests/metric-deps.test.ts, about 2,000 expressions, 0
  differences); expressions the parser rejects are skipped by the comparison. One scan feeds graph
  edges, `dependsOn`, the Metrics view and the explanation (fixes baseline defect 20).
- **Metric cycles are warnings** in validation, not errors: a file with a cycle stays importable
  so it can be repaired, and the planner still refuses cyclic metrics.
- **Inference without extensions.** Type: `a / b` or `a / NULLIF(b, 0)` over two metrics is a
  ratio, other metric references make it derived, else simple. Additivity: ratios, distinct counts,
  averages, minima and maxima are non-additive; SUM/COUNT are additive; derived KPIs combine their
  inputs (`*` or `/` makes them non-additive); otherwise unknown. Inferred values are labelled.
- **Rollup rules of the preview.** `rollup=sum` is refused for non-additive and unknown
  additivity. A grain coarser than a semi-additive input's minimum grain is refused for the KPI and
  for every KPI built on it (occupancy rate per quarter is refused because GLA is a month-end
  stock and the declared period aggregation is *last*); the workbench does not generate
  last-period SQL. Grains outside `allowed_grains` (or finer than `min_grain`) are refused.
- **Previews plan over the semantic model** (`modelContext`, planner `scope: 'model'`), so a KPI
  is explainable without a mapping and mapping errors elsewhere do not block it.
- **Lineage to ODCS** matches `dataset.source` to an ODCS object's `physicalName` (or `name`
  when no physical name is declared) and each column read by the field's expression to a property's
  `physicalName`/`name`, exactly. Quality rules of the object and property and the contract's
  `slaProperties` (all, or those whose `element` starts with the object's physical name) are shown
  as declared, not checked.
- **Routes.** The explain route is matched before the file route; a GET of a file whose path ends in
  `/explain/<name>` therefore reads as an explanation (documented in contracts/http-api.md).
  `GET /api/projects/:slug/metrics` was added to the contract.
- **Shopping center example.** All 25 metrics carry extensions (one key per line inside the block),
  the mapping carries 25 KPI bindings (`measures` as `kpi:` QNames, `of` the entity). CalendarMonth
  gained `first_day` (a date) as the monthly time dimension, so the preview's `DATE_TRUNC` has a date
  to truncate; resolved bindings went from 1,056 to 1,057. The ODCS contract declares four quality
  rules and three SLA properties so trust indicators can be shown. Purchase spend uses
  `purchase_orders.order_date` (day grain). Flights ships without metrics, so the layout tests and
  the browser check add one KPI to copies of the split and consolidated files.
- **KPI node type.** Graph nodes for Ossie metrics are labelled KPI and can be hidden (remembered per
  model like value types); concepts named by a KPI binding (`measures` or `of`) carry a KPI badge
  in the graph, the neighborhood and the catalog.

## R16. Implementation decisions taken in Phase 4

- **Projection API.** `neighborhood()` in `src/graph-view.ts` replaces the star-only filter; the old
  `graphView()` remains as a thin wrapper for imports and tests. Neighbors are ranked by the
  relationship's `data.kind`, then name, then id; the page size is 12 (the toolbar adds 12 at a
  time). The previous center of the walk is always kept visible even beyond the page.
- **Default center.** With no center chosen, the most connected entity that is not a value type or
  built-in concept (ties by name), instead of the first declared entity; on the shopping center
  model the first declared hub was the `Identifier` value type with 134 neighbors.
- **Links between neighbors** are on by default only when there are at most ten of them; beyond that
  they bury the center's own relationships. The toggle always states the count (FR-036).
- **Two-way neighbors** (relationships in both directions) join the shorter side of the layout.
  The fitted area is symmetric around the center so it stays in the middle of the canvas even when
  one side has more columns (FR-034).
- **Routing** is computed by the application (`src/graph/routes.ts`), not React Flow's step paths:
  edge ends are spread along each node side, every vertical segment gets its own x within its gap,
  long and backward edges get their own lane above or below, edges between nodes of one column run
  along the column's right side, and self-relationships loop over their node. Labels are placed by a
  greedy search over segment midpoints so they neither overlap each other nor nodes. Browser checks
  read the rendered SVG paths and label boxes (`scripts/helpers/edge-geometry.ts`).
- **Auto align removed.** Its layered layout put the center in the first or last column (defect 9)
  and was terminated by selection changes (defect 5). **Re-center** restores the column layout
  instantly; `src/layout.worker.ts` was deleted.
- **Walk state** lives in the app (`src/graph/walk.ts`, a reducer of `{doc, center, name, via}`
  steps, at most 100), so Back can reopen another file. A center reached without a step (default
  center, newly opened file) is shown as an unsaved last crumb and recorded as the origin when the
  first step is taken. Choosing a center from the picker or search is a step.
- **Cross-file continuation (FR-037, SHOULD).** Targets are other files of the same project whose
  entities share an identity key (`entityKeys`: IRI, expanded QName, physical name, source,
  business-definition URL) or, between an Ossie ontology and a mapping, a concept mapping of the
  same concept name. Matching by plain names elsewhere is not attempted.
- **Search.** The toolbar search no longer jumps the neighborhood to the first substring match; it
  lists matches ranked exact name, name prefix, word prefix (camelCase aware), substring, then IRI,
  ties by shorter name. An "exact first" mutant was dropped as equivalent (exact matches already
  win on prefix plus length); the word-prefix rule is mutated instead.
- **Legacy browser scripts.** `scripts/browser-check.ts` and `scripts/relationship-browser-check.ts`
  still click **Auto align**; they already failed on v0.1.0 (reported in Phase 0) and are not in the
  gate. `scripts/graph-browser-check.ts` now runs on an isolated data root and is `test:graph`.

## R17. Implementation decisions taken in Phase 5

- **Patches per transaction.** The editor component keeps the file's exact text; each CodeMirror
  transaction is mapped onto it (`src/editor/patch.ts`): normalized positions become original
  offsets through the original's line starts (a line break is `\r\n`, `\n` or a lone `\r`, as in
  CodeMirror), and inserted `\n` becomes the dominant style (ties go to LF). A file without `\r`
  takes a direct path with no mapping, so typing in a 1.9 MB file costs about one frame per key
  (16 ms measured in the browser check). The save sends one patch, the common prefix and suffix
  kept, never splitting a `\r\n` or surrogate pair; an overwrite after a stale-save conflict still
  sends the whole text, because its base is not the text the edits started from.
- **Highlighting.** Lezer grammars for YAML, JSON and XML; one application tokenizer for Turtle,
  N3 and N-Triples instead of the legacy Turtle mode, which colors local names by their first
  letter (capitalized names as comments) and numbers as keywords. Colors follow VS Code Light+
  (YAML keys and XML tags `#800000`, YAML values and keywords `#0000ff`, JSON keys `#0451a5`,
  strings `#a31515`, numbers `#098658`, comments `#008000`, IRIs and prefixes `#267f99`). The app has
  no dark theme, so only the light palette exists; screenshots are light only.
- **Nested JSON** in a `SEMANTIC_WORKBENCH` block is parsed with `parseMixed` when the block scalar
  is the `data` value of a mapping that also names `SEMANTIC_WORKBENCH`.
- **Validation off the main thread.** The editor's findings come from a worker after a 300 ms pause.
  While Source is open, the app shows those findings (save gating, findings panel) and rebuilds the
  model only when another view needs it; the textarea version validated the whole file on the main
  thread on every keystroke.
- **Lint ranges.** A finding with a line covers the token at its column (from the column to the next
  whitespace), or the whole line without a column; lines outside the document fall back to
  document-level, listed above the editor.
- **Go to line** is a field in the editor bar bound to Ctrl+G (as in VS Code), not CodeMirror's
  panel, because the panel's keyboard binding conflicts with find-next and the field is labelled for
  screen readers; it selects the line with the cursor at its start. Tab is not captured for
  indentation, so keyboard users can leave the editor with Tab (Enter keeps the indentation).
- **Browser checks** read and set the editor text through a property on the content element
  (`workbenchEditor`), since CodeMirror renders only the visible lines; the earlier suites that used
  textarea APIs now use `scripts/helpers/code-editor.ts`.
- **Mutants.** The "inserted line breaks use LF" mutant and "drop lint ranges" and "save sends full
  text" are killed; moving the patch start off a `\r\n` boundary was tried as a mutant and is
  equivalent (the patched text is identical), so it is not listed.


## R18. Implementation decisions taken in Phase 6

- **One patcher for YAML and JSON.** Both are parsed with the `yaml` library's syntax tree (JSON is
  read as flow collections), and an edit is a structural diff of the old and new item value:
  unchanged values keep their bytes, a changed scalar is rewritten in its own quoting style (a
  block literal stays a block literal), new keys go after the item's last key and new list entries
  after the last entry or before the next unchanged one, removed entries take their own lines (or
  their comma in JSON). New text follows the file: line breaks, indentation unit, list indentation
  (`key:\n- a` or indented), flow lists for keys that are flow lists elsewhere in the file, `[x]`
  versus `[ x ]`, and in JSON the container's `:` / `,` spacing and whether nested values sit on one
  line. A YAML flow collection that changes is rewritten as a whole (it is one line); an emptied
  block list is written `key: []`. The inspector's description field uses the same patcher, which
  fixes baseline defect 22 (JSON re-serialized on every edit).
- **KPI extension JSON is patched as JSON.** A `SEMANTIC_WORKBENCH` block scalar is mapped line by
  line to its JSON text; a changed attribute is one changed line (plus the comma when appended
  last), never a re-printed block. Applies to metric extensions and mapping KPI bindings alike.
- **The item editor edits the item's own lines.** Its text is the item from the start of its line
  (so a list item keeps its `- `) without the common indentation; edits are put back with that
  indentation and the file around it untouched, and the whole file is validated in the worker.
  Findings outside the item are shown only when they are errors (they block Save); warnings about
  the rest of the file are left out of the item editor.
- **Drafts until Save, per dialog.** Item edits, additions and deletions live in their dialog
  (validated live, nothing written) until Save or Delete, which write through the base-hash
  checked save. If the open file had unsaved Source edits, the dialog starts from them and saving
  includes them. Edits that touch several files (delete with dependents in other files, ticked
  rename rewrites) use a new journaled `POST /api/projects/:slug/save-batch`; a stale hash or an
  invalid result rejects the whole batch.
- **Dependents and references** are found by structure, not by text search: roles and `extends`
  naming a concept, concept mappings, KPI bindings (`measures`, `of`, `metric`), joins naming a
  dataset, expressions reading `dataset.` or a metric name (with the syntax-aware tokenizer's
  rules), foreign keys to `object` or `object.property`, `identify_by` entries. On delete, items
  that depend on the target are removed with it, from the last position to the first; expression
  references in mapping files cannot be removed safely and are listed for Source. If any resulting
  file would be invalid, Delete stays off and says why. A rename never rewrites anything unless the
  occurrence is ticked; unticked broken references keep Save off through validation.
- **KPI save** is planned by one shared function (`src/metrics/kpi-save.ts`) used by
  `POST /kpis` and `POST /kpis/preview`: metric appended to the model's metrics (or a `metrics`
  key added), extension validated against the pinned schema with `schema` first, binding inserted
  in sorted position (R12), a minimal mapping document created next to the semantic model when
  none references it (named `<model stem>.mapping.yaml`, `ontology_ref` to the project's first
  standalone Ossie ontology; refused with a message when there is none), the embedded semantic
  model's root used in a consolidated file. Two mapping documents drawing from the same model are
  refused rather than guessed. The request takes an optional `modelPath` (contract updated).
- **Wizard preview** is a server call that applies the plan in memory and returns the planner's
  explanation and the added and removed lines per file; the wizard shows the formula, composition
  tree, SQL preview ("Preview, not executed") and the exact lines before Save.
- **Status rules (FR-015).** Allowed transitions: draft → draft/proposed; proposed →
  draft/proposed/approved; approved → approved/proposed/deprecated; deprecated →
  deprecated/proposed. "Definition" means the expression and every extension attribute except
  governance ones (`status`, `replaced_by`, `deprecation_reason`, `owner`, `steward`, `label`) and
  the description; changing it on an approved KPI sets `proposed` and says so. A new KPI is draft or
  proposed. Deprecation without `replaced_by` or `deprecation_reason` is the existing extension
  finding, which keeps Save off. Dependents (metrics using the KPI, its binding, mappings whose
  expression is the metric name) are listed at the top of the editor before any change is saved.
- **Where the editor opens.** Details panel **Edit** (and the **E** key) for any selected entity or
  relationship in Graph, Neighborhood, Overview or Catalog; an **Edit** button on each catalog
  card; **Edit KPI** in the KPI detail. For inheritance and metric-reference edges the editor opens
  the concept or metric that holds them. Graph double-click keeps its existing zoom-to-node meaning.
  RDF items and built-in concepts have no item editor yet (Phase 7); Source remains.
- **Mutants.** JSON container diff disabled (whole-node re-serialization), YAML map diff disabled
  (whole-item rewrite), delete without dependents, wizard and server copying the formula into the
  extension, binding lines appended unsorted, approved KPI kept approved after a change. The
  existing `model` mutant now targets the patcher call. 83/83 killed.

## R19. Implementation decisions taken in Phase 7

- **The graph gate (FR-055).** Every RDF item edit, addition, deletion and Source fragment edit is
  parsed back and compared with the original: the triples not describing the edited resource
  (its own statements plus the blank nodes reachable from them) must be isomorphic before and after,
  and the resource's description must be isomorphic to the intended statements. Otherwise Save is
  refused with the reason. Ground triples are compared as sets; blank nodes by colour refinement
  (hashing each node with its neighbourhood until stable) followed by a backtracking match when
  classes stay ambiguous. Above 200 ambiguous blank nodes the refined hashes are accepted without
  the search (no shipped example comes near; the bound keeps the check interactive).
- **No new dependency.** `n3` (already used) reads Turtle, N-Triples and N3; RDF/XML is read with
  `rdflib` (already used) and patched with a small offset-keeping XML scanner, so the patchers know
  exact byte ranges.
- **Where text goes.** N-Triples: whole lines; new lines after the resource's last line. Turtle and
  N3: the statement block is rewritten in place one predicate-object segment at a time (removed
  segments take their separator; a value added to an existing predicate is `, value`; a new
  predicate goes after the last one with the block's own separator and indentation; a resource
  without statements gets a new block at the end of the file in the file's layout). Additions go to
  the resource's first block when it has several. Prefixes the new text needs are declared after
  the existing directives only for well-known vocabularies; other IRIs are written in full.
  RDF/XML: the node element stays where it is, property elements are replaced, removed or added
  with the element's indentation, a self-closing element is opened when it gains a child, and new
  IRIs are written absolute (`rdf:resource`) rather than relative to `xml:base`.
- **What is refused (jump to Source).** N3: resources that appear inside a formula or rule, and
  statements the tokenizer cannot split. RDF/XML: `rdf:parseType="Collection"`, reification
  (`rdf:ID` on a property), `rdf:li`, and resources also described in a nested element elsewhere.
  The RDF/XML typed node name (`<owl:Class …>`) is the resource's type and is shown locked; a
  nested description can only be removed as a whole. Nested blank nodes (`[ … ]`) are edited as one
  object value in Turtle syntax; labelled blank nodes (`_:x`) are followed through the graph.
- **Object values are written and read in Turtle syntax** for every serialization (the item editor
  shows `"text"@en`, `c:Order`, `<…>`), so one editor serves all four formats; N-Triples and
  RDF/XML get them converted. Prefixed names use the file's prefixes plus the well-known ones.
- **Comments.** Removing statements that carry or are followed by a comment inside the removed
  range shows the comment and needs a ticked confirmation before Save.
- **Delete.** Removes the resource's statements and, in the same file, the statements that name it
  (listed first); other project files that mention its IRI are listed to fix in Source, not edited.
- **Separate components.** RDF uses `RdfItemEditor` and `RdfAddItem` (same drawer, actions and
  validation as the Phase 6 editor) instead of extending the YAML form model, whose item paths do not
  apply to graphs. Add offers OWL class, object and datatype property, SHACL node and property
  shape, and any RDF resource.

