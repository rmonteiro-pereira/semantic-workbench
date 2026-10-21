# Feature Specification: Column-Level Lineage, One Metric Vocabulary, Git Workflow and a Calmer UI (v0.3.0)

**Feature Branch**: `002-lineage-and-ux`

**Created**: 2026-10-21

**Status**: Clarified; all questions answered by the owner. Constitution 2.1.0 applies.

**Input**: Owner's list for the release after v0.2.0 (`main` at `e768efa`; feature 001 complete):

- The ODCS lineage graph is unusable and buried in the Contract tab. Replace it with a
  column-level lineage graph in the **Graph** tab: each dataset a card with its columns, edges
  from column to column flowing left to right, a selected column highlighting its full upstream
  and downstream path, an asset search box, and an asset page with Lineage, Relationships, Data
  Quality, Properties and History tabs. Reach: contract objects linked by foreign keys, then the
  semantic-model datasets and fields that read each column, then the metrics built on them.
  Walk from card to card as in Neighborhood, with a trail and Back. It must work on the UBL (169
  objects) and shopping center contracts.
- "Metric is KPI": one name, **Metric**, everywhere. Existing files must keep working.
- Git: every import is committed; "Save changes" is useless and the save flow must be redesigned;
  add a remote, clone a repository as a project, set the Git identity from the app, and show a
  credential setup guide. One cloned repository may hold several projects in subfolders.
- UI: use more modals and stop cramming the main screen. Resizable, wider sidebar where nothing
  is cut off; example loaders in a collapsible section; no two close buttons side by side; a
  better place for adding items; Group by still does not work; bindings overflow their boxes in
  Mappings.
- Relationships: "full pierce through on relationships doesn't seem to exist". Neighborhood only
  walks one hop at a time; the user wants to expand a chain in place and to expand the whole
  reachable chain at once, in Neighborhood and in the lineage graph.
- Keep the visual language of the v0.2.0 dataset Lineage tab: its legend (kind icons, "Foreign
  key" and "Feeds" line styles) and the primary-key / foreign-key markers of the Schema table,
  on the new lineage graph and wherever these kinds appear.
- SQL: syntax coloring and lint for SQL wherever it appears, including SQL embedded in YAML and
  JSON definitions in the Source editor (for example `CASE WHEN … END` in metric expressions),
  item editor fields, the metric wizard and SQL previews. Nothing is executed.

## Clarifications

### Session 2026-10-21 (clarify pass, resolved by analysis of the code and the constitution)

- C1: Where does the ODCS lineage live? → A: The **Graph** tab shows the lineage graph whenever
  the open file is an ODCS contract (it replaces the generic entity graph for contracts). The
  Contract tab keeps the contract overview and the asset pages; every asset page and every row
  of the object list has **Open in lineage**. The asset page's own **Lineage** tab shows the same
  graph centered on that asset.
- C2: Which way do foreign keys flow in a left-to-right lineage? → A: From the referenced
  (parent) column to the referencing (child) column: `customers.customer_id` is drawn to the
  left of `orders.customer_id`. This is an application reading of ODCS relationships, labelled
  as such (constitution V); the Relationships tab lists the same keys in both directions.
- C3: Do the stored KPI keys change? → A: No. The extension schemas keep their identifiers and
  keys (`semantic-workbench/metric/v1`, `semantic-workbench/mapping/v1`, `kpi_bindings`), so no
  user file is rewritten (constitution II) and files written by v0.2.0 stay valid. Only words
  shown to people change; the README explains that `kpi_bindings` is the historical key name for
  metric bindings. Existing HTTP paths that contain `kpis` keep working as aliases of new
  `metrics` paths for this release.
- C4: Global or repository Git identity? → A: Repository-local only. Writing the global Git
  configuration would write outside the data root, which constitution I forbids. The identity
  dialog offers "Use the same identity for every project in this workspace", which writes it to
  each repository under `data/projects/`, never to the global file.
- C5: How does the app treat credentials? → A: It still never asks for, stores or sends
  credentials (constitution I). The credential guide is static, step-by-step text with commands
  the user runs in a terminal (credential helper or SSH key); the app may check, read-only,
  whether a helper or an SSH key appears to be configured and say so.
- C6: What does "import auto-commits" mean when the project already has other uncommitted
  changes? → A: The import commit contains only the imported paths; other changes stay
  uncommitted. Message: `Import N files` (one file: `Import <name>`), in a subfolder project
  `Import N files into <subfolder>`.
- C7: Is the header's grouping control the "Group by" that does not work? → A: Yes; the defects
  are listed in Appendix A.2. The Mappings tab's "Group by mapped fields" (query composer
  dimensions) works and is not in scope beyond moving the composer into a dialog.
- C8: Which dialects get SQL coloring and lint? → A: Ossie dialects `ANSI_SQL`, `OSSIE_SQL_2026`
  (read as ANSI), `SNOWFLAKE`, `BIGQUERY` and `DATABRICKS`; ODCS quality `query` text uses the
  dialect of the contract's server type when one is declared, otherwise ANSI. `MDX`, `DAX`,
  `MAQL`, `TABLEAU`, `SIGMA`, `THOUGHTSPOT`, `HOLISTICS_AQL` are not SQL: shown as plain text with
  a "not checked" note.
- C9: Does the Mappings overflow reproduce? → A: Not with the shipped examples (Appendix A.3);
  the requirement stands as a geometry check over all shipped mapping files, plus the concrete
  layout faults that were found.

### Session 2026-10-21 (owner answers)

- Q1: Save flow? → A: Auto-save valid edits to the file after a pause; **Commit…** is the
  header's primary action (FR-040–FR-048).
- Q2: How does a subfolder become a project? → A: A committed `.semantic-workbench.json`
  manifest at the repository root is honoured when present; otherwise the app proposes folders
  that contain supported files and the user confirms; the confirmed list is kept in workspace
  state (FR-064).
- Q3: Deleting a subfolder project? → A: Both: **Remove from workspace** (default; deletes
  nothing) and **Delete folder** (moves the subfolder to the trash; the shared repository shows
  the deletion as uncommitted changes) (FR-066).
- Q4: SQL lint severity? → A: Warnings that never block saving (FR-053).
- Q5: Metrics list scope? → A: The Metrics tab lists every metric of the project; a filter
  shows only metrics with workbench attributes ("governed"); metrics without attributes offer
  **Add attributes** (FR-017).
- Constitution amendment approved: 2.1.0 (MINOR) adds clone, into `data/projects/` only, to the
  user-triggered Git network operations.
- Mappings overflow: the concrete layout faults of Appendix A.3 are the requirements (no
  mid-word breaks, no orphan arrows, wider binding layout, pluralisation), plus a browser check
  that measures overflow with long identifiers (FR-063).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Column-level lineage for an ODCS contract (Priority: P1)

A data engineer opens a contract and the Graph tab shows its lineage: each contract object, each
semantic dataset and each metric is a card; contract and dataset cards list their columns.
Lines run from column to column, left to right: referenced key → foreign key → the semantic
field that reads the column → the metric that aggregates the field → metrics built on that
metric. Clicking a column highlights its full upstream and downstream path across cards and
dims everything else. A search box finds any asset; walking from card to card keeps a trail.

**Why this priority**: it is the owner's headline request and replaces a view the owner calls
unusable; it is also the bridge from contracts to metrics, the product's central pillar.

**Independent Test**: load the commerce, shopping center and UBL examples, open each contract's
Graph tab, search an object, select columns and walk; compare every drawn edge with the edges
computed from the files.

**Acceptance Scenarios**:

1. **Given** the commerce contract is open, **When** the user opens Graph, **Then** a lineage
   canvas shows `orders` centered with its columns, `customers` to its left with
   `customers.customer_id → orders.customer_id`, the semantic dataset reading `orders` to its
   right with one line per field that reads a column, and the metrics over those fields
   rightmost.
2. **Given** that view, **When** the user clicks `orders.amount`, **Then** every column, field
   and metric on its upstream and downstream path is emphasised (heavier accent stroke and
   highlighted row outline; each line keeps its legend style, so foreign keys stay dashed),
   every other card and line is dimmed, and a side summary lists the path in order; clicking
   empty canvas or pressing Escape clears it.
3. **Given** the UBL contract (169 objects, 401 foreign keys), **When** the user types
   `invoice line` in **Find assets** and picks `invoice_line`, **Then** the graph re-centers on
   it showing one step upstream and downstream by default, each card shows at most 10 columns
   per page with a pager (1 2 3 …) or scrolls, cards beyond the step limit appear as "+N more"
   stubs that expand on click, and the first view appears within 2 seconds.
4. **Given** a centered asset, **When** the user activates **Walk here** on another card (or
   double-clicks it), **Then** that card becomes the center, the trail shows each step with the
   column that led there, and **Back**/**Forward** and any crumb return to earlier centers with
   the same selection.
5. **Given** a column whose card shows another page, **When** its path is highlighted, **Then**
   the card switches to the page containing the highlighted column, or pins it at the top.
6. **Given** an object with properties that declare `transformSourceObjects` and
   `transformLogic`, **When** the graph is shown, **Then** the declared source objects appear
   upstream with a line labelled "declared transform" to the property, and the transform text
   is shown with SQL coloring on hover or in the details.
7. **Given** any card, **When** the user opens it, **Then** the asset page shows tabs
   **Lineage**, **Relationships** (foreign keys in and out, per column), **Data Quality**,
   **Properties** (the v0.2.0 Schema table with in-place edits) and **History**.
8. **Given** the canvas, **When** it is shown, **Then** it carries the same legend as the
   v0.2.0 dataset Lineage tab (object, dataset, field, metric icons; dashed "Foreign key" and
   solid "Feeds" lines), every line is drawn in the legend's style for its kind, and each
   column row shows PK, FK, Required, Unique and classification badges where declared, matching
   the asset page's Properties table.
9. **Given** a semantic dataset whose `source` matches no contract object, **When** the graph
   is shown, **Then** it does not appear; a note says how many datasets in the project read
   none of this contract's objects.

---

### User Story 2 - One name: Metric (Priority: P1)

A business analyst never sees "KPI" again: the tab is **Metrics**, the button is **New
metric**, the explanation reads **How this metric is calculated**, graph nodes and badges say
Metric. Files written by v0.2.0 open and validate unchanged.

**Why this priority**: the owner asked for one vocabulary; mixed words confuse every metric
screen, and the change touches many views, so it must land before new metric work.

**Independent Test**: search the rendered UI of every view and the README for "KPI"; open the
v0.2.0 shopping center example files unchanged and check that all 25 metrics with attributes,
their bindings and explanations appear.

**Acceptance Scenarios**:

1. **Given** any view, **When** it is rendered, **Then** no visible text, accessible name,
   tooltip or status message contains "KPI" (example data such as the shopping center's `kpi:`
   ontology prefix is user content and is shown as written).
2. **Given** a v0.2.0 file with `kpi_bindings`, **When** it is opened, validated, edited with
   the metric editor and saved, **Then** it validates, only the edited lines change, and the
   key is still `kpi_bindings`.
3. **Given** the metric wizard, **When** it is opened from **New metric**, **Then** its title,
   steps and buttons say metric, and the saved result is byte-identical to what v0.2.0 would
   have written for the same answers.

---

### User Story 3 - Save and commit that make sense (Priority: P1)

An editor changes a definition; the file on disk follows the edit by itself once the edit is
valid, a status indicator says "Saved to file · 3 uncommitted changes", and the header's
primary action **Commit…** opens a dialog listing the project's changed files with their diffs,
a suggested message and **Commit** / **Commit & push**. Imports are committed automatically.

**Why this priority**: the owner calls the current Save useless; every user meets it on the
first edit, and committing is how versions, history and lineage History get their data.

**Independent Test**: edit a valid file and wait; check the file bytes on disk, the indicator,
and the Commit dialog; make the file invalid and check that nothing is written; import files and
check the commit.

**Acceptance Scenarios**:

1. **Given** a valid file is open, **When** the user types and pauses for 1 second, **Then**
   the change is written to the file with the usual base-hash check, the indicator shows
   "Saved to file", and the number of uncommitted changes updates.
2. **Given** an edit that makes the file invalid, **When** the user pauses, **Then** nothing is
   written, the indicator shows "Not saved: 2 errors" and opens the findings when clicked; the
   text is kept as a draft and survives a reload.
3. **Given** the file changed on disk while the user had unwritten edits, **When** the next
   automatic save runs, **Then** it is refused, the side-by-side diff dialog of v0.2.0 opens,
   and automatic saving of that file pauses until the user chooses.
4. **Given** the project has changes, **When** the user presses **Commit…**, **Then** a dialog
   lists changed files (all ticked), shows the diff of the selected file, pre-fills a message
   (for example "Update orders in commerce.odcs.yaml"), and **Commit** commits the ticked files
   only; **Commit & push** then pushes and reports the outcome; with no remote it explains how
   to add one.
5. **Given** files are imported into a new or an existing project, **When** the import
   completes, **Then** exactly the imported files are committed as "Import N files", other
   uncommitted changes are left alone, and the status message names the commit.
6. **Given** the repository has no Git identity, **When** an import or commit is attempted,
   **Then** the files are still written, the commit is skipped with "Not committed: set your
   Git identity" and a button that opens the identity dialog; after setting it, committing works
   without restarting the app.

---

### User Story 4 - SQL coloring and lint inside definitions (Priority: P2)

A modeller editing YAML or JSON sees SQL embedded in metric, field and mapping expressions, ODCS
quality queries and transform logic colored as SQL, and a syntax mistake underlined at its exact
line and column in the file, with the same findings in item editor fields, the metric wizard and
SQL previews.

**Why this priority**: expressions are where metric definitions go wrong; today they are plain
strings and "checked structurally, not parsed".

**Independent Test**: open the fixtures below in Source, the item editor and the wizard; check
colors and findings; save and export and compare bytes.

**Acceptance Scenarios**:

1. **Given** this Ossie metric in Source:
   ```yaml
   - name: occupancy_rate
     expression:
       dialects:
         - dialect: ANSI_SQL
           expression: |
             SUM(CASE WHEN units.status = 'occupied' THEN units.gla_m2 ELSE 0 END)
             / NULLIF(SUM(units.gla_m2), 0)
   ```
   **When** it is displayed, **Then** `SUM`, `CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `NULLIF`
   are colored as SQL keywords or functions, `'occupied'` as a string, `0` as numbers, and there
   is no SQL finding.
2. **Given** the same metric with `END` removed, **When** the editor pauses (300 ms), **Then** a
   SQL finding is underlined at the line and column of the file where the expression cannot
   continue (the `)` on the `SUM(CASE …` line), the gutter shows a marker, the message names
   the problem (for example "SQL syntax: expected END"), and the API's validation of the saved
   text reports the same finding at the same location.
3. **Given** the expression is a JSON string in a `.json` file with escapes
   (`"SUM(CASE WHEN status = \"open\" THEN 1 END)"`) or a YAML flow or quoted scalar, **When** a
   finding is reported, **Then** its column accounts for quotes, escapes and indentation and
   points at the right character of the file.
4. **Given** an expression with dialect `DAX`, **When** displayed, **Then** it is plain text
   with the note "DAX is not checked".
5. **Given** an ODCS rule `type: sql` with `query: SELECT COUNT(*) FROM ${table} WHERE
   ${column} IS NULL`, **When** displayed, **Then** it is colored and checked with the
   placeholders accepted.
6. **Given** any SQL-bearing field in the item editor or the metric wizard, **When** the user
   types, **Then** the same coloring and findings appear in that field, and the SQL preview
   panes (metric explanation, Mappings query, wizard preview) are colored the same way.
7. **Given** a file with SQL findings, **When** it is saved or exported, **Then** its bytes are
   exactly what the user typed; the lint never rewrites text.

---

### User Story 5 - A calmer main screen with dialogs (Priority: P2)

The main screen keeps navigation, the primary view and the primary actions; everything else
opens in a dialog. The sidebar is wider, resizable, never cuts names off, and keeps the example
loaders in a collapsible section. There is one clear close control per panel and one clear
place to add things.

**Why this priority**: the owner's cross-cutting UX principle; it also gives the lineage canvas
and Mappings the space they need.

**Independent Test**: the responsive and overlap suites, extended with sidebar resizing, the
dialog inventory (Appendix B) and the "no clipped text" check.

**Acceptance Scenarios**:

1. **Given** a desktop window, **When** the app opens, **Then** the sidebar is 300 px wide, can
   be dragged between 220 px and 520 px (and by keyboard on the resize handle), and the width is
   remembered in this browser.
2. **Given** project and file names longer than the sidebar, **When** shown, **Then** no name is
   clipped without a way to read it: names wrap to at most two lines, and the full name and path
   are in the tooltip and accessible name.
3. **Given** the workspace has at least one project, **When** the app opens, **Then** the
   example loaders are in a collapsed **Examples** section; with no project it is expanded.
4. **Given** a desktop window with the sidebar open, **When** the top of the screen is shown,
   **Then** there is exactly one control that hides the sidebar (a panel icon in the header);
   the sidebar's own close button exists only in the narrow-screen drawer.
5. **Given** a file is open, **When** the user wants to add something, **Then** a **New** menu
   next to the view tabs lists what this file can hold (for example "Concept", "Relationship",
   "Dataset", "Metric", "Contract object", "Property", "OWL class"), each opening a dialog, and
   the details panel offers context-specific adds ("Add property to orders").
6. **Given** grouping suggestions exist, **When** the sidebar is shown, **Then** it shows one
   line "3 grouping suggestions" that opens a dialog with the evidence and Add/Dismiss per file.
7. **Given** any of the six viewports, **When** any dialog of Appendix B is open, **Then** it
   fits the window, traps focus, closes with Escape and returns focus to its opener.

---

### User Story 6 - Group by that groups (Priority: P2)

A user choosing **Group by** in Graph or Overview gets meaningful groups for every document
kind, and the choice says honestly when a mode has nothing to group by.

**Why this priority**: reported as still broken after v0.2.0; for contracts and semantic models
every option produces one or two groups today (Appendix A.2).

**Independent Test**: for each shipped example file and each mode, compare group counts with
expected values; check disabled modes and their reasons.

**Acceptance Scenarios**:

1. **Given** the UBL contract, **When** the user chooses **Suggested communities**, **Then**
   objects are grouped by communities computed over foreign keys (more than one group), not
   shown as a single "Object" group.
2. **Given** a mode with no basis in this file (for example IRI namespaces in a contract
   without IRIs), **When** the menu opens, **Then** the mode is disabled with the reason ("No
   IRIs declared"), instead of producing one "No IRI" group.
3. **Given** a contract whose only domain is the contract-level `domain`, **When** Auto is
   used, **Then** Auto does not choose "Declared domains" (one group of everything) and picks
   the next mode that yields at least two groups.
4. **Given** the user chose a mode explicitly, **When** the menu opens, **Then** the Auto
   option names the mode Auto would pick, not the chosen one.
5. **Given** grouping corrections, **When** the user opens **Adjust grouping…**, **Then** a
   dialog lists entities and groups, with apply and reset; corrections persist as in v0.2.0.

---

### User Story 7 - Remotes, clone, identity and credentials from the app (Priority: P2)

A user connects a project to a remote, clones a remote repository as a new project, sets the
Git identity when it is missing, and follows an in-app guide to set up credentials, without a
terminal except for credential setup.

**Why this priority**: today Git identity must be set in a terminal and the API restarted, and
there is no clone; this blocks teams from using the Git features.

**Independent Test**: with a local bare repository as remote, run add remote, clone, identity
and commit flows in the browser on an isolated data root; no network remote is used.

**Acceptance Scenarios**:

1. **Given** a project without a remote, **When** the user opens **Remote…** (Source Control or
   the project menu), **Then** a dialog takes a name (default `origin`) and URL or path,
   validates it as v0.2.0 does (no `transport::` addresses), and saves it; Fetch, Pull, Push and
   Sync become available.
2. **Given** **Clone repository…**, **When** the user enters a URL or path and a project name,
   **Then** the repository is cloned into a new folder under `data/projects/`, its files are
   validated on scan (invalid ones listed as invalid, never rewritten), line-ending conversion
   is disabled for it, and it appears in the tree; the dialog shows progress with **Cancel** and
   the credential-window notice of v0.2.0.
3. **Given** a repository without `user.name`/`user.email`, **When** the user opens the app or
   attempts a commit, **Then** a banner and the commit dialog offer **Set Git identity…**, which
   writes the values to that repository's configuration; the app recognises them at once.
4. **Given** a push failed for authentication, **When** the error is shown, **Then** it offers
   **Credential setup guide**, which explains a credential helper and an SSH key with
   copyable commands for Windows, macOS and Linux and states that the app never handles
   credentials itself.

---

### User Story 8 - Several projects in one repository (Priority: P3)

A team keeps `domains/sales` and `domains/finance` in one repository. After cloning it, each
subfolder appears as its own project; both share the repository's Source Control, branch and
history.

**Why this priority**: needed for real team repositories, but it builds on clone (Story 7).

**Independent Test**: clone a fixture repository with two project folders and a manifest; check
the tree, Source Control, commits, branch switches and delete behaviour for each project.

**Acceptance Scenarios**:

1. **Given** a cloned repository with project folders, **When** it is added, **Then** each
   declared folder appears as a project named after its folder (renamable), grouped under the
   repository in the tree.
2. **Given** two projects of one repository, **When** the user opens Source Control from
   either, **Then** it shows the whole repository's changes, marking which project each file
   belongs to, and a commit or branch switch affects both projects, which both rescan.
3. **Given** a subfolder project, **When** the user removes or deletes it, **Then** **Remove
   from workspace** (default) unregisters it and deletes nothing, **Delete folder** moves only
   that subfolder to the trash, other projects' files are untouched and history is never
   rewritten.

---

### User Story 9 - Mappings that fit (Priority: P3)

Every binding in the Mappings tab stays inside its box at every viewport; the query composer
opens in a dialog so bindings get the width.

**Independent Test**: geometry check over all shipped mapping files and six viewports.

**Acceptance Scenarios**:

1. **Given** any shipped mapping file and viewport, **When** all binding groups are expanded,
   **Then** no binding element extends past its card, identifiers wrap only at `.`, `_` or
   spaces where possible, and no arrow starts or ends a wrapped line on its own.
2. **Given** a concept with one binding, **When** listed, **Then** it reads "1 binding".

---

### User Story 10 - Pierce through relationships (Priority: P1)

Today a user follows relationships one hop at a time: activating a neighbor makes it the new
center and the previous neighborhood disappears (Appendix A.8). The user wants to keep what is
open and grow it: expand a node in place to add its neighbors, building A → B → C → D on one
canvas, and press **Full pierce** to expand the whole reachable chain at once. This applies to
the Neighborhood view and to the lineage graph.

**Why this priority**: the owner reports the capability as missing; tracing a chain across
several entities or columns is the core reading task of both graphs, and the lineage graph
(Story 1) needs it for its own path view.

**Independent Test**: on the UBL ontology, the shopping center ontology and the UBL contract,
expand nodes, collapse them, undo, run Full pierce in each direction, and compare the shown
nodes and the "hidden" counts with the closure computed from the files.

**Acceptance Scenarios**:

1. **Given** Neighborhood centered on UBL `Order`, **When** the user activates the expand
   control (+) on `OrderLine`, **Then** `OrderLine`'s neighbors are added to the same canvas,
   `Order` and its other neighbors stay where they were, new nodes are placed beside
   `OrderLine` without moving existing ones, and the trail records "expanded OrderLine".
2. **Given** that canvas, **When** the user then expands `Item` and `Price` one after another,
   **Then** the chain `Order → OrderLine → Item → Price` is visible at once with every
   relationship label, and **Collapse** on `Item` removes only the nodes that were added by
   expanding `Item` and are not reachable from other expanded nodes.
3. **Given** a sequence of expansions, **When** the user presses **Undo expansion** (or Back),
   **Then** the last expansion is removed and the canvas returns to the previous state with the
   same positions; Forward re-applies it.
4. **Given** Neighborhood centered on shopping center `Lease`, **When** the user presses **Full
   pierce** with direction **Outgoing**, **Then** every entity reachable from `Lease` along
   outgoing relationships is added, each at most once, cycles are drawn without repeating
   nodes, value types and built-in concepts follow the existing **Value types** switch, and the
   status reads "N entities shown in K steps".
5. **Given** the UBL ontology and **Full pierce** with direction **Both** from `Invoice`,
   **When** the closure exceeds the node budget (150 nodes), **Then** the first 150 nodes in
   breadth-first order (by step, then relationship kind, then name) are shown, the frontier
   nodes carry "+N hidden" markers, a banner says "120 more reachable; Expand further / Show
   step 4 only", and the view stays interactive while layout runs off the main thread.
6. **Given** the UBL contract lineage with `invoice_line.line_extension_amount` selected,
   **When** the user presses **Full pierce**, **Then** every card on that column's upstream
   (foreign-key parents, declared transform sources) and downstream (fields, metrics, metrics
   on metrics) path is opened and laid out left to right, other columns of those cards stay
   paged, and the path is highlighted as in Story 1.
7. **Given** a pierce in progress on a large model, **When** the user presses **Stop** or
   changes center, **Then** the pierce stops, nodes laid out so far stay, and nothing freezes.
8. **Given** a relationship line, **When** the user activates it, **Then** its far end is
   expanded in place (not re-centered); **Walk here** keeps the v0.2.0 re-centering walk.

### Edge Cases

- A foreign key whose target is in another contract file (`file.yaml#…`): shown as an external
  stub card with the reference, never resolved or fetched.
- Composite foreign keys (`from: [a, b]`, `to: [x, y]`): one line per column pair, by position;
  unequal lengths are a validation finding and draw no line.
- Self-referencing and cyclic foreign keys: a card appears once; cycles are drawn as curved
  return lines; path highlighting terminates.
- A column read by many fields (hundreds of lines): lines bundle per card pair with a count;
  selecting the column unbundles its own lines.
- Objects with nested properties: nested columns appear as `parent.child` rows.
- A metric referencing fields of several datasets, and metrics built on metrics (any depth,
  cycles reported by existing validation).
- A semantic dataset whose `source` matches two objects (by physical name and by name): both
  lines drawn, flagged as ambiguous in the details.
- Auto-save while a Git pull, branch switch or merge is in progress: automatic saving waits for
  the Git operation and then re-checks the base hash.
- Auto-save of a file that was deleted, moved or trashed meanwhile: the pending save is
  cancelled; the text stays a draft and the user is told.
- Commit dialog when the repository is mid-merge: only "Commit merge" with the conflict list.
- Import commit when Git is missing or the repository is mid-merge: files are written, the
  commit is skipped with the reason.
- Clone of a repository containing symbolic links, files over the size limit or unsupported
  files: links are never followed (v0.2.0 rule), large or unsupported files are listed as not
  shown in the workspace.
- Clone target name already used: a free name is proposed; nothing is overwritten.
- Two subfolder projects nested in each other: refused when declared.
- SQL inside YAML block scalars with indentation indicators (`|2-`), folded scalars (`>`)
  whose line breaks become spaces, and JSON strings with `\n` and `\u` escapes.
- Full pierce on the 1,000-entity commerce scale model or the 5,000-entity / 15,000-link
  fixture: the node budget applies; the closure itself is computed off the main thread and can
  be stopped.
- Expanding a node already on the canvas through another path: no duplicate; the new
  relationship line is added.
- Collapsing the center: not allowed; collapsing a node shared by two expansions keeps it.
- Very large files (1.9 MB fixture): SQL coloring and lint must not raise typing latency above
  the v0.2.0 budget.

## Requirements *(mandatory)*

### Functional Requirements

**Lineage graph (Story 1)**

- **FR-001**: For an ODCS contract the Graph tab MUST show a lineage canvas of cards: contract
  objects, semantic datasets and metrics. Object and dataset cards list their columns (object
  properties, including nested ones as `parent.child`; dataset fields).
- **FR-002**: Lines MUST connect column to column: referenced column → referencing column for
  every property-level and schema-level foreign key (composite keys pairwise by position);
  object column → semantic field for every field whose expression reads that column (or whose
  name equals it when it has no expression) in a dataset whose `source` equals the object's
  physical name or name; field → metric for every metric that aggregates the field; metric →
  metric for metrics built on metrics; declared transform source → property for
  `transformSourceObjects`.
- **FR-003**: Matching MUST use declared names and parsed expressions only, never run anything,
  and MUST be labelled in the UI as the workbench's reading, not ODCS or Ossie semantics.
- **FR-004**: Layout MUST flow left to right by lineage order; a card appears at most once;
  cycles MUST NOT break layout or highlighting.
- **FR-005**: Selecting a column MUST emphasise its complete upstream and downstream closure
  (all reachable columns, fields and metrics) and dim the rest; selecting a card header
  emphasises the closure of all its columns. A summary lists the path.
- **FR-006**: Cards with more than 10 columns MUST page (numbered pager) or scroll within the
  card; columns on a highlighted path MUST be visible without paging.
- **FR-007**: **Find assets** MUST search objects, physical names, datasets, fields and metrics
  of the project, ranking exact names first; choosing a result centers the graph on it.
- **FR-008**: The canvas MUST show a center asset and, by default, one step upstream and one
  step downstream along foreign keys plus the full downstream reach to metrics; further cards
  appear as "+N more" stubs that expand on demand; a **Steps** control sets the reach.
- **FR-009**: Walking (activate **Walk here** or double-click a card) MUST re-center with a
  trail, Back, Forward and crumbs, sharing the walk model of Neighborhood; walking into a
  semantic model or metric MUST be able to continue in that file's Neighborhood.
- **FR-010**: The canvas MUST offer zoom, pan, fit, full screen (F) and keyboard access to
  cards and columns; selection and walk MUST survive entering and leaving full screen.
- **FR-011**: The asset page MUST have tabs Lineage, Relationships, Data Quality, Properties and
  History; Properties keeps the v0.2.0 in-place edits; Relationships lists foreign keys in and
  out per column with links; History and Data Quality keep v0.2.0 behaviour.
- **FR-012**: The Contract tab MUST keep the overview and object list, each object with **Open
  in lineage** and **Open asset page**. The old object-level lineage graph is removed.
- **FR-013**: For non-ODCS files the Graph tab keeps the v0.2.0 entity graph.

**Pierce through (Story 10)**

- **FR-018**: Neighborhood and the lineage graph MUST offer **Expand** per node (and per
  relationship line) that adds that node's neighbors to the current canvas without removing or
  moving placed nodes (incremental layout), and **Collapse** that removes what that expansion
  alone added.
- **FR-019**: Expansions MUST be recorded in the walk trail as steps ("expanded X"), with
  **Undo expansion**/Back and Forward restoring the exact earlier canvas; walking (re-centering)
  keeps its v0.2.0 behaviour and starts a new canvas.
- **FR-020**: **Full pierce** MUST expand the transitive closure from the center or the
  selection along relationships in the chosen direction (Outgoing, Incoming, Both; default
  Outgoing in Neighborhood, Both in lineage), optionally limited to one relationship kind, each
  node at most once, cycles terminating.
- **FR-021**: Full pierce MUST respect the Value types switch (added to Neighborhood, sharing
  Graph's per-model setting), the Technical resources switch and the metrics shown/hidden switch, and MUST stop at a node budget (default 150 nodes, adjustable up
  to 500) with frontier markers "+N hidden", a banner with the hidden count, **Expand further**
  (next budget) and **Stop**.
- **FR-022**: Closure computation and layout for expansions and pierce MUST run off the main
  thread; the canvas stays interactive and cancellable; results are deterministic for the same
  input.
- **FR-023**: In the lineage graph, Full pierce on a column MUST open the cards of its complete
  upstream and downstream path through to metrics (FR-002), and on a card, the union over its
  columns, within the same budget rules.
- **FR-024**: Activating a relationship line MUST expand its far end in place; **Walk here**
  remains the re-centering action.

**Shared legend and column badges**

- **FR-025**: The legend of the v0.2.0 dataset Lineage tab MUST become one shared component
  (not a copy) used by the lineage graph, the asset page, and Graph/Neighborhood whenever
  contract objects, datasets, fields or metrics are shown; its "KPI" entry becomes "Metric".
- **FR-026**: Lines MUST be drawn in the legend's styles: foreign keys dashed, "feeds" (reads,
  aggregates, uses, declared transform) solid; path emphasis adds weight and accent colour
  without changing the style.
- **FR-027**: Column rows in lineage cards MUST show PK, FK (with its target on hover),
  Required, Unique and classification badges where declared, with the same labels and colours
  as the Properties table and the contract overview's PK/FK counts.

**Metric vocabulary (Story 2)**

- **FR-014**: All UI text, accessible names, tooltips, status messages, README and docs MUST
  use "metric" for what v0.2.0 called KPI. A metric with workbench attributes is described as a
  metric with attributes, not a different kind.
- **FR-015**: Stored formats MUST NOT change: the extension schema identifiers and keys,
  including `kpi_bindings`, are kept; v0.2.0 files validate and round-trip byte-exact.
- **FR-016**: HTTP endpoints MUST offer `metrics` names for create and preview; the v0.2.0
  `kpis` paths remain as documented aliases in this release.
- **FR-017**: The Metrics tab MUST list every metric of the project, with a filter for metrics
  with workbench attributes ("governed") and **Add attributes** on metrics without them.

**Save, commit and import (Story 3)**

- **FR-040**: A valid edit in Source MUST be written to the file 1 second
  after the last keystroke, through the same validation, size limit, base-hash check and
  atomic write as v0.2.0; only the changed ranges are sent.
- **FR-041**: Automatic saving MUST NOT write while the text has validation errors; the text is
  kept as a server draft as in v0.2.0 and the indicator shows "Not saved: N errors".
- **FR-042**: A refused save (stale base) MUST open the v0.2.0 diff dialog and pause automatic
  saving for that file until the user chooses.
- **FR-043**: Automatic saving MUST run off the typing path: typing latency in the 1.9 MB
  fixture MUST stay within the v0.2.0 budget, and at most one save per file is in flight
  (later edits queue on the hash it returns).
- **FR-044**: The header's primary action MUST be **Commit…** with a status indicator
  "Saved to file · N uncommitted changes" (or "Not saved: N errors", "Saving…"); the indicator
  opens the Commit dialog or the findings.
- **FR-045**: The Commit dialog MUST list the project's (repository's) changed files with tick
  boxes, per-file side-by-side diff, a pre-filled editable message, **Commit** and **Commit &
  push**; it MUST refuse an empty message and show conflicts during a merge. The Source Control
  panel keeps its full controls.
- **FR-046**: **Revert to last commit** for a file MUST be offered (Commit dialog and file
  menu) with a confirmation; the replaced version goes to the trash so it can be restored.
- **FR-047**: Item editors, add/delete dialogs and the metric wizard keep an explicit **Save
  to file** and MUST NOT imply a commit.
- **FR-048**: Pull, Sync and branch switch MUST keep refusing while drafts or uncommitted
  changes exist, and the refusal MUST offer **Commit…**.
- **FR-049**: Every import (new project, into an existing project, example load, clone is
  excluded) MUST commit exactly the imported paths with the message of C6 when Git and an
  identity are available; otherwise the files are written and the reason is shown.

**SQL coloring and lint (Story 4)**

- **FR-050**: The Source editor MUST color SQL embedded in YAML (block, folded, plain, single-
  and double-quoted scalars) and JSON strings at these locations: Ossie
  `expression.dialects[].expression` of fields and metrics; Ossie ontology mapping
  `expression` (object and referent mappings, standalone or embedded); ODCS quality rules with
  `type: sql` (`query`); ODCS property `transformLogic`.
- **FR-051**: The dialect MUST be taken from the sibling `dialect` (Ossie) or the contract's
  server type (ODCS), per C8; non-SQL dialects are left plain with a "not checked" note.
- **FR-052**: SQL syntax findings MUST come from the shared validation rules (constitution
  III), so the editor, the item editor, the wizard and the API report the same findings; each
  finding MUST carry the exact file line and column, mapped through YAML indentation and
  folding, quotes and escapes; when the position cannot be mapped reliably the finding is
  attached to the expression's first character.
- **FR-053**: SQL findings MUST be warnings and MUST NOT block saving or automatic saving.
- **FR-054**: The same coloring and findings MUST appear in item editor expression fields, the
  metric wizard's expression and filter inputs, and all SQL previews.
- **FR-055**: Lint MUST NOT change any byte of the file; nothing is executed.

**Main screen and dialogs (Stories 5, 9)**

- **FR-060**: The main screen MUST contain only: the sidebar (navigation, projects tree,
  collapsed Examples, Import), the header (title, **New**, **Commit…**, status indicator,
  export in an overflow menu), the view tabs and search, the primary view and the details
  panel. Everything in Appendix B MUST open as a dialog.
- **FR-061**: Sidebar width default 300 px, resizable 220–520 px by pointer and keyboard,
  remembered per browser; names never clipped without full text available; Examples section
  collapsed by default when at least one project exists.
- **FR-062**: On desktop one header control hides and shows the sidebar; the sidebar's close
  button appears only in drawer mode.
- **FR-063**: Mappings: no binding element outside its card at any viewport; identifiers break
  preferentially at `.`, `_` and spaces; arrows never orphaned; correct singular/plural; the
  query composer opens in a dialog; a browser check measures binding overflow with
  synthetic long identifiers (80-character names without separators and dotted paths) at the six
  viewports.

**Git setup and monorepos (Stories 7, 8)**

- **FR-064**: Clone a repository by URL or path into a new folder under `data/projects/`, only
  on explicit user action, with progress, Cancel, the 10-minute limit and redacted errors of
  v0.2.0; then disable line-ending conversion and scan. Subfolder projects are declared by a
  root `.semantic-workbench.json` manifest when present, otherwise proposed by detection and
  confirmed by the user; the confirmed list is stored in workspace state.
- **FR-065**: Add, change and remove a project's remote in a dialog (existing validation).
- **FR-066**: A subfolder project MUST offer **Remove from workspace** (default, deletes
  nothing) and **Delete folder** (to the trash; uncommitted deletion in the shared repository); Clear workspace moves whole
  repositories to the trash; Undo and Trash restore keep v0.2.0 guarantees.
- **FR-067**: Git identity MUST be checked per repository, live (no restart), and set
  repository-locally from the app (C4).
- **FR-068**: The credential guide MUST be static instructions (C5); the app never asks for,
  stores or sends credentials.
- **FR-069**: Subfolder projects of one repository MUST share one Source Control view, branch
  and history, and every Git operation on the repository MUST rescan all its projects.

**Group by (Story 6)**

- **FR-070**: Suggested communities MUST be computed for contracts (over foreign keys),
  semantic models (over joins and metric references) and mapping documents (over concept
  relationships), not only ontologies.
- **FR-071**: A mode that yields fewer than two groups for the file MUST be shown disabled with
  its reason; Auto MUST pick the first mode yielding at least two groups.
- **FR-072**: A contract-level `domain` MUST NOT by itself make Auto choose Declared domains.
- **FR-073**: The Auto option label MUST name what Auto would choose; the UBL example areas
  option MUST NOT depend on the model's name.
- **FR-074**: The same grouping MUST apply in Graph, Overview and the lineage canvas (as card
  tint), and grouping corrections open in a dialog.

### Key Entities

- **Lineage card**: an asset (contract object, semantic dataset, metric, external reference
  stub) with its file, kind and ordered column list.
- **Lineage column**: a property path or field name on a card, with its type and keys.
- **Lineage edge**: column to column, with kind (foreign key, reads, aggregates, uses, declared
  transform) and the definition it comes from (file and path).
- **Lineage walk**: ordered steps (re-center or expansion) with the column or relationship that
  led to each.
- **Expansion set**: the nodes and lines a single expansion or pierce added, so it can be
  collapsed or undone; with direction, budget and hidden frontier counts for a pierce.
- **Repository**: a Git working tree under `data/projects/`, with its remotes and identity.
- **Project**: a repository root or a declared subfolder of one; files, drafts and view
  settings belong to it.
- **Embedded SQL region**: a range of a file holding SQL text, with dialect and the mapping
  from expression offsets to file positions.
- **Metric**: an Ossie metric, optionally with workbench attributes (the extension) and a
  binding to a concept.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the UBL contract, the lineage view for any object appears within 2 seconds of
  choosing it, and highlighting a column's path completes within 200 ms (measured by the
  lineage browser check on the UBL fixture).
- **SC-010**: Full pierce on the UBL ontology (Both, from `Invoice`) and the shopping center
  ontology (Outgoing, from `Lease`) shows the first nodes within 1 second, never blocks input
  for more than 100 ms, and its shown + hidden counts equal the closure computed from the files.
- **SC-011**: Expanding or collapsing a node moves no previously placed node (position change
  0 px), checked by the graph browser suite.
- **SC-002**: For the commerce, shopping center and UBL contracts, 100% of drawn edges match
  the edges computed from the files, and no expected edge is missing.
- **SC-003**: Zero occurrences of "KPI" in rendered UI text, accessible names and the README
  (outside quoted user data and the historical key name).
- **SC-004**: All v0.2.0 example files validate and round-trip byte-exact after the change.
- **SC-005**: A first-time user can make an edit and commit it in at most two actions after
  typing (open Commit…, press Commit).
- **SC-006**: Every SQL finding in the fixtures points at the exact line and column of the file
  (checked against hand-computed positions), including a JSON-escaped and a folded-YAML case.
- **SC-007**: For every shipped example file, every enabled Group by mode yields at least two
  groups.
- **SC-008**: Zero clipped texts in the sidebar and zero overflowing binding elements across the
  six viewports of the responsive suite.
- **SC-009**: Clone, add remote, identity and commit flows pass end to end against a local bare
  repository with no terminal command.

## Assumptions

- The canvas reuses the graph library already in the app; no new runtime dependency is assumed
  except possibly a CodeMirror SQL language package (to be justified in the plan; no network).
- Default reach (one step of foreign keys, full downstream to metrics) is an application
  choice; users can change it per view; the choice is remembered per contract in this browser.
- Ontology concepts that a metric measures appear as chips on metric cards, not as cards.
- The automatic save pause is 1 second; status messages keep the v0.2.0 five-second rule.
- Example loads are imports for FR-049 (committed as "Import N files"); the v0.2.0 example
  project creation commit already does this for new projects.
- A clone's remote becomes the configured remote of the new project, so later fetch/pull/push
  are "against a remote the user configured" (constitution I).
- Out of scope: running SQL or quality rules, fetching external contracts, OWL reasoning,
  a lineage view for files other than ODCS contracts, rewriting stored KPI keys.

## Dependencies

- **Constitution 2.1.0 (approved, MINOR)**: principle I adds **clone**, into `data/projects/`
  only, to the user-triggered Git network operations. Subfolder projects stay inside
  `data/projects/` and need no amendment.
- v0.2.0 modules reused: walk model, validation worker, base-hash save, journal, trash, Source
  Control, metric extension readers, SQL expression parser.

## Appendix A - Current behaviour and defects (v0.2.0, `e768efa`)

### A.1 ODCS lineage today

- `src/odcs/lineage.ts:9-13` — lineage is object-level only: node kinds are object, dataset,
  field, metric, KPI; contract columns are never nodes, so column-to-column lines are impossible.
- `src/odcs.ts:5,27` — `OdcsForeignKey` keeps only object indices (`from`, `to`) and a label;
  the referenced column is dropped, so foreign keys cannot be drawn column to column.
- `src/odcs/lineage.ts:71-78` — distance is breadth-first with foreign keys followed in both
  directions, so referencing and referenced objects land in the same column as downstream
  datasets: no upstream/downstream reading.
- `src/odcs/DatasetPage.tsx:117,143-147` — fixed 196×40 px boxes placed in columns by distance,
  sorted by kind; labels truncate; fields are separate boxes rather than rows of their dataset.
- `src/odcs/DatasetPage.tsx:150` — edges between boxes in the same column are drawn as loops
  on the right edge, overlapping each other.
- `src/odcs/DatasetPage.tsx:153-158` — no zoom, pan, selection, highlighting or navigation:
  nodes are plain `div`s with a `title` tooltip.
- `src/odcs/DatasetPage.tsx:120-123` — the lineage is computed twice (depth 99 and the shown
  depth) on every change.
- `src/odcs/DatasetPage.tsx:60,64` — the graph is reachable only as the third level (Contract
  tab → object → Lineage tab); `src/main.tsx:568` gives contracts the generic entity graph.
- `src/odcs/lineage.ts` ignores `transformSourceObjects`/`transformLogic`
  (`schemas/odcs-v3.1.0.json:1739-1753`), the only upstream lineage ODCS itself declares.

### A.2 Group by

Measured with `modelOverview` on the shipped examples (groups per mode):

| File | auto | declared | namespaces | suggested | types |
| --- | --- | --- | --- | --- | --- |
| `ubl.odcs.yaml` (169 objects) | declared: 1 | 1 | 1 ("No IRI") | 1 ("Object") | 1 |
| `mall.odcs.yaml` (142) | declared: 1 | 1 | 1 | 1 | 1 |
| `commerce.odcs.yaml` (4) | declared: 1 | 1 | 1 | 1 | 1 |
| `mall.semantic.yaml` (167) | types: 2 | 1 | 1 | 2 (= types) | 2 |
| `mall.mapping.yaml` (167) | types: 1 | 1 | 1 | 1 | 1 |
| `mall.ontology.yaml` (195) | namespaces: 12 | 1 | 12 | 51 | 3 |

- `src/communities.ts:2` — `isBusinessEntity` accepts only `EntityType` and `OWL class`;
  contract objects are `Object` (`src/model.ts:100`), semantic datasets `Dataset`
  (`src/model.ts:73`), mappings `Concept mapping` (`src/model.ts:93`). Suggested communities
  are therefore empty for contracts, semantic models and mappings.
- `src/overview.ts:48-57` — when no community exists the entity silently keeps its
  definition-type group, while the control says "Suggested communities".
- `src/model.ts:58` — the contract-level `domain` is copied onto every object, so
  `src/overview.ts:26` makes Auto choose "declared" and put all objects in one group.
- `src/model.ts:106` — namespaces are computed only for Ossie ontologies; other kinds always
  produce a single "No IRI" group (`src/overview.ts:47`).
- `src/GroupingControls.tsx:16` — the Auto option's label uses the resolved current mode, so
  after choosing a mode explicitly, Auto is mislabelled with that mode.
- `src/main.tsx:512` and `src/overview.ts:26` — the UBL areas option and Auto's choice depend on
  the model name containing "UBL".
- `src/GroupingControls.tsx:17` — corrections hide in a nested disclosure inside an ⓘ popover.

### A.3 Mappings layout

- Geometry check (all `.mapping-explorer` elements against their parent box, every group and
  binding expanded) on `mall.mapping.yaml`, `commerce.mapping.yaml`, `billing.mapping.yaml`,
  `flights.mapping.yaml` and `flights.yaml` at 390, 800, 1024, 1100, 1280, 1440 and 1920 px:
  no element overflowed. The overflow the owner saw was not reproduced with the shipped
  examples; FR-063 makes it a permanent geometry check.
- `src/style.css:474` — bindings rely on `overflow-wrap: anywhere`, which breaks identifiers
  mid-word (`DATABASE.SCHEMA.RUNWA|YS`) rather than at `.` or `_`.
- `src/style.css:491-494` — the chain is a wrapping flex row with arrows as separate items, so
  an arrow is left alone at the end or start of a line.
- `src/style.css:471` — three columns (230 px concepts, bindings, 280-350 px composer) leave
  the bindings 443 px at 1366×768 with the sidebar open.
- `src/MappingExplorer.tsx:48` — "1 bindings".
- `src/MappingExplorer.tsx:51` — the binding list starts collapsed above 12 bindings, so the
  1,057 shopping center bindings are hidden behind one summary.

### A.4 Sidebar and header

- `src/style.css:504` — sidebar fixed at 245 px; not resizable.
- Measured at 1366×768 and 1600×1000: project names ("Shopping center ···"), file names
  (`commerce.mapped-semantic.yaml`, `flights.semantic_…`) and all example subtitles are clipped;
  example loaders run below the window edge.
- `src/main.tsx:418` with `src/style.css:507,553` — the sidebar's "Close workspace drawer" X is
  shown on desktop at x≈202 px; `src/main.tsx:472` — the header toggle shows a second X
  ("Close workspace") at x≈261 px. Two adjacent close buttons do the same thing.
- `src/main.tsx:445-451` — seven example loaders always expanded in the sidebar.
- `src/main.tsx:444` and `src/projects/Suggestions.tsx:7` — grouping suggestions open inline in
  the sidebar and push the tree.
- `src/main.tsx:475` — **Add** sits between the title and Export, adds "an entity or
  relationship" to the open file without saying which kinds; context adds live separately in
  the details panel (`src/main.tsx:603-604`); disabled without explanation when nothing is
  addable.
- `src/main.tsx:522` — validation findings open inline above the canvas and shrink it.

### A.5 Save, commit and identity

- `src/main.tsx:481-489,307-328` — **Save changes** writes the open file only; the message
  "Saved to the project folder" (`:318`) says nothing about commits.
- `src/main.tsx:214-219` — unsaved text is already kept as a server draft after 1.5 s.
- `server/projects/workspace.ts:90` — a new project from an import is committed as "Import N
  files" only when an identity was found at start-up.
- `server/projects/workspace.ts:221-246` — importing into an existing project writes files but
  never commits; moves (`:207-220`) and accepted suggestions (`:262-266`) do not commit either.
- `server/projects/git.ts:72` and `server/projects/workspace.ts:44` — the identity is checked
  once at start-up from `data/projects/` (global configuration only); a repository-local
  identity is never seen and fixing it needs a restart (README "Run").
- `server/projects/git.ts:18` lists `clone` as a remote command but nothing offers it.
- `server/projects/scm.ts` `setRemote` exists; the remote field lives inline in the Source
  Control panel.

### A.6 Projects and repositories

- `server/projects/paths.ts:11,22` — a project is exactly one folder `data/projects/<slug>`
  with a single-segment slug; each project is its own repository. Subfolder projects need a
  project-to-repository mapping in the registry.
- `server/projects/trash.ts` — project delete moves the folder with its `.git`; for a subfolder
  project this would remove part of another repository's tree.

### A.7 Terminology and SQL

- 111 occurrences of "KPI"/"KPIs" in `src/` and `server/` code and UI strings, 12 README lines;
  for example the catalog label "KPI · Metric" (`src/main.tsx:560`), the graph badge
  (`src/FullGraph.tsx:14`) and the lineage kind (`src/odcs/DatasetPage.tsx:115`).
- `schemas/semantic-workbench-mapping-v1.json` — stored key `kpi_bindings` (kept, C3).
- `src/editor/languages.ts:8-10` — YAML already nests a JSON language for extension blocks;
  no SQL nesting exists. `server/agent/sql.ts` parses expressions for planning only; README
  states SQL expressions are "checked structurally, not parsed".
- SQL-bearing keys: `schemas/ossie-0.2.0.dev0.json` `DialectExpression.expression` (fields,
  metrics) with dialect enum (`:38-41`); `schemas/ossie-ontology-0.2.0.dev0.json`
  `ObjectMapping.expression`, `ReferentMapping.expression`; `schemas/odcs-v3.1.0.json` quality
  `type: sql` with `query` (`:2192-2195,2386-2392`) and `transformLogic` (`:1746`).

### A.8 Neighborhood walk and the existing legend

- `src/graph/walk.ts:4-18` — a walk step is a new center (`push`), with Back, Forward and jump;
  there is no notion of expanding a node while keeping the canvas.
- `src/NeighborhoodGraph.tsx:34,37` — each render computes one neighborhood of the current
  center (`neighborhood(... {center, limit, keep:[previous]})`): only the previous center is
  kept; everything else from earlier steps disappears.
- `src/NeighborhoodGraph.tsx:26,111` — neighbors are paged (`NEIGHBOR_PAGE`, 12) with "N more
  neighbors"/"Fewer"; `:64` **Walk here** re-centers; `:113` "Links between neighbors" only
  adds lines among already visible neighbors; `:123-125` trail with Back/Forward.
- `src/odcs/DatasetPage.tsx:115-116,128` — the legend (kind icons and labels, "Foreign key" and
  "Feeds" line items) is local to the Lineage tab; styles in `src/odcs/odcs.css:57-60,70`
  (foreign key dashed amber, feeds solid). Its "KPI" kind is renamed Metric.
- `src/odcs/DatasetPage.tsx:20-31,101` and `src/odcs/ContractOverview.tsx` — PK/Required/
  Unique columns, FK target buttons and PK/FK counts that the lineage cards must match.

## Appendix B - Dialog inventory

| Today (inline or crowded) | v0.3.0 dialog |
| --- | --- |
| Grouping suggestions panel in the sidebar | **Grouping suggestions** (opened from a one-line count) |
| Adjust grouping inside the ⓘ popover | **Adjust grouping…** |
| Header **Add** and details-panel adds | **New ▾** menu → one **Add <kind>** dialog per kind |
| Import file picker, import-into, name conflicts, repair | **Import…** (new project or into a project, conflict choice, repair) |
| Save changes button | **Commit…** (files, diffs, message, Commit / Commit & push, Revert) |
| Remote field in Source Control | **Remote…** |
| (none) | **Clone repository…**, **Set Git identity…**, **Credential setup guide**, **Projects in this repository…** |
| Validation findings inline above the canvas | **Validation details** dialog (status indicator opens it) |
| Query composer column in Mappings | **Compose a query…** |
| Raw "Full definition" JSON in the details panel | **View definition** |
| Lineage reach and filters | **Lineage options** |

Already dialogs and kept: delete confirmation, trash, rename, move, stale save diff, item
editors, metric wizard. The main screen keeps: sidebar navigation and tree, header title,
**New**, **Commit…**, status indicator, view tabs, search, the primary view and the details
panel.
