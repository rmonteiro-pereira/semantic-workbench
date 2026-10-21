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
