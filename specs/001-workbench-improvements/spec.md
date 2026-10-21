# Feature Specification: Workbench Improvements (metrics layer, projects, editing, graph navigation, source control)

**Feature Branch**: `001-workbench-improvements`

**Created**: 2026-10-20

**Status**: Draft, all questions answered; ready for `/speckit-plan`. Constitution 2.0.0 applies.

**Input**: Owner's improvement list for Semantic Workbench after v0.1.0: syntax highlighting and
inline lint in the Source tab; projects that group an imported ontology set; deleting files,
projects and the whole workspace from the UI without a reload; accepting every Apache Ossie
layout (split three-file set and consolidated file); a redesigned ODCS view; a working
neighborhood graph; navigating across relationships; full-screen graph; better responsiveness;
click-to-edit for a single entity or relationship; adding and deleting entities and
relationships; metrics as first-class citizens; a better Mappings layout; versioning with a diff
view and Git integration; general UI polish including overlapping elements.

**Product direction**: metrics are the central pillar. ODCS contracts describe the physical data
and lead into a **metrics layer**; the ontology is the business vocabulary used to navigate,
define and explain KPIs. The workbench **shows how a KPI is calculated; it never executes
one**. The proposed metrics definition model, storage (Ossie extension first, separate file as
fallback) and authoring workflow are in [metrics-proposal.md](./metrics-proposal.md). Source
Control and file-based storage follow constitution 2.0.0, amended for this feature (record in
[constitution-amendment-proposal.md](./constitution-amendment-proposal.md)).

## Clarifications

### Session 2026-10-20

- Q1: What does "Git integration" mean for versioning? → A: A Source Control panel like VS Code's:
  changed files list, per-file diff, stage/unstage, commit with message, branches (switch and
  create), and push/pull/sync with a remote. Version history and diffs come from Git history.
- Q2: How does an import become a project? → A: One project per import batch. For files imported
  separately, the application infers related files from references and offers grouping
  suggestions that the user accepts or rejects; nothing is regrouped automatically.
- Q3: How are destructive deletes protected? → A: All three: a confirmation dialog (naming what
  is removed and warning about unsaved edits and broken references), an undo window after the
  action, and a recoverable trash.
- Q4: Which formats support click-to-edit and add/delete? → A: All formats, including RDF, OWL and
  SHACL. Item edits must keep the rest of the source intact; preservation guarantees per
  serialization are defined in FR-055.
- Q5: What does "metrics as first-class citizens" mean? → A: Metrics are the major point: ODCS
  leads to a metrics layer, and the ontology serves to navigate, define and explain KPIs. The
  workbench shows how each KPI is calculated and does not execute anything. The definition model,
  workflow and storage are proposed in metrics-proposal.md.
- Q6: What should the ODCS view be? → A: A contract overview (servers, team, SLA, quality),
  editable properties and a proper visualization inspired by Marquez (dataset pages,
  schema/field view, dataset version history, lineage graph).
- Q7: Which consolidated Ossie layout is meant? → A: The official embedded form, as in the
  upstream Flights `flights.yaml`. No custom single-file variant.
- Q8: What does "better responsiveness" mean? → A: Layout only: small screens and window
  resizing, not performance.

- MQ1: Where are metrics-layer attributes stored? → A: First try Ossie's extension mechanism
  (`custom_extensions` on each Ossie metric); if it does not work well against the decision
  criteria in metrics-proposal.md, use a separate `*.metrics.yaml` file with a pinned schema. The
  choice is made during planning.
- MQ2: Which sources may KPIs be calculated against? → A: None. The workbench explains how a KPI
  is calculated (formula breakdown, composition tree, filters, grain, additivity, read-only SQL
  preview, ontology concepts) and never executes it.
- MQ3: Where does project content live once every project has Git history? → A: "A project is a
  folder." Each project is a plain directory under `data/projects/<slug>/` that is a Git working
  tree, and its files on disk are the only source of truth. No folders or repositories outside
  `data/projects/` are opened. The database becomes a rebuildable cache; application state that
  must survive lives in state files under `data/`. Decided after a design review (FR-075 to
  FR-090).
- Q: Which files in a project folder are hidden? → A: Only unsupported file types (and files
  matched by `.gitignore`). Supported files with syntax or validation errors are shown as invalid
  for repair (FR-079).
- Q: Does Source Control list changes to hidden files? → A: Yes, read-only and labelled. The
  scanner and Source Control respect `.gitignore`; the user can add a file or pattern to
  `.gitignore` from Source Control, and `.gitignore` itself is editable (FR-091 to FR-095).
- Q: Are Git hooks and filters allowed in project repositories? → A: Yes. After every Git
  operation a hash check reports files whose bytes were altered (FR-096).
- Q: Is the constitution amendment approved? → A: Yes; version 2.0.0 is applied.
- Q: Are KPIs that combine metrics from two semantic models needed? → A: Not in this feature.
  Every KPI is stored in its Ossie metric's extension; cross-model KPIs are out of scope.
- Q: May push, pull and fetch open Git's credential window when credentials are missing? → A: Yes.
  Git's configured credential helper (for example Git Credential Manager) may show its own
  window; the workbench itself stores no credentials and never prompts for them (FR-063).
- Q: Where is the link between a KPI and the ontology concepts stored? → A: In the project's Ossie
  mapping document, as a `SEMANTIC_WORKBENCH` extension at the document root (one KPI binding per
  line). Standard `concept_mappings` describe how datasets and fields populate concepts; they do
  not define a metric target (FR-010).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define, navigate and understand KPIs through a metrics layer (Priority: P1)

An analyst opens a project (ODCS contract, Ossie semantic model, ontology, mapping, metrics
layer). From an ontology concept such as "Unit", they see the KPIs that measure it (occupancy
rate, sales per m²), open one, and read its definition: type, formula, inputs, time grain,
allowed breakdowns, filters, unit, target and thresholds, owner and status, and the ODCS
properties it ultimately reads, with their quality rules and SLA. An "How it is calculated"
panel explains the KPI step by step: the formula broken down into its inputs, the composition
tree of ratio and derived KPIs, filters, time grain, additivity rules, the ontology concepts
involved and the generated SQL as a read-only preview. Nothing is executed. They create a new KPI
with a guided workflow and mark it proposed for review.

**Why this priority**: The owner names metrics as the main purpose of the workbench; every other
layer exists to feed, explain or govern them.

**Independent Test**: In the shopping center project, navigate from the concept "Unit" to
"occupancy rate", read its explanation (numerator and denominator base metrics, their
expressions, datasets, fields and ODCS properties, grain, additivity, SQL preview) and check it
against the source definitions; create a new ratio KPI through the wizard and see it appear in
the graph and in Source Control as changed files. No query runs at any point.

**Acceptance Scenarios**:

1. **Given** a project with a metrics layer, **When** the user opens Metrics, **Then** every KPI
   is listed with label, type, unit, status and owner, and can be grouped by ontology concept or
   owner and filtered by status, dataset or unit.
2. **Given** an ontology concept, **When** selected in any graph view, **Then** the KPIs that
   measure it, or are about it, are listed and can be opened.
3. **Given** a KPI, **Then** its lineage is shown end to end: ontology concept → KPI → input
   metrics → semantic fields → datasets → ODCS objects and properties, with ODCS quality rules and
   SLA properties of those inputs shown as trust indicators.
4. **Given** the creation wizard, **When** the user picks a concept, input data, type, time grain,
   dimensions, filters, target and owner, **Then** the definition is validated at each step and
   saved as minimal edits to the semantic model (base metrics) and the metrics layer file.
5. **Given** a KPI, **When** the user opens "How it is calculated", **Then** the explanation
   shows: the composition tree (ratio numerator/denominator, derived inputs, cumulative window,
   fixed filters) down to base metrics; each base metric's expression per dialect with the
   datasets and fields it reads and the ODCS properties behind them; time dimension and grains;
   allowed breakdowns; additivity rules in plain language; the ontology concepts and roles
   involved; and the SQL the planner would generate, labelled "preview, not executed", for a
   grain and breakdown the user chooses.
6. **Given** a ratio or semi-additive KPI, **When** the user asks for a preview with a rollup that
   would be wrong (summing a ratio, summing month-end area across months), **Then** the preview is
   refused with the reason.
7. **Given** a KPI whose declared type disagrees with its expression (for example declared ratio
   but the expression is not a division of the declared metrics), **Then** a finding explains the
   mismatch.
8. **Given** an approved KPI, **When** its definition changes, **Then** it returns to proposed and
   its dependents are listed before saving.
9. **Given** export, **Then** the semantic model remains valid Ossie, and ratio/derived KPIs can be
   exported as Ossie metric expressions, with the metrics-layer attributes kept per the storage
   chosen under MQ1.

---

### User Story 2 - Organize and clean the workspace by project (Priority: P1)

A modeller imports an ontology set, for example Ossie Flights (ontology, semantic model, mapping
and the consolidated file). The sidebar shows one project, "Flights", with its four files listed
underneath. Files imported later on their own are offered as suggestions to join a related
project. Files and projects are deleted from the sidebar with a confirmation, can be undone for a
short time, and remain recoverable from a trash. A Clear button empties the workspace. Every view
updates immediately; no page reload and no maintenance script are needed.

**Why this priority**: Today removal requires a database script and a reload, and every import
lands in one flat list. Every other story adds content to this structure.

**Independent Test**: Import the four Flights files in one batch, see one project; import
`tpcds_semantic_model.yaml` alone and see no suggestion (it references nothing in Flights); import
a mapping that references the Flights ontology and accept the suggestion; delete a file, undo;
delete it again, restore it from the trash; delete the project; load two examples and Clear;
after each step the UI is current without reload.

**Acceptance Scenarios**:

1. **Given** an empty workspace, **When** the user imports several files in one batch, **Then**
   one project is created containing those files, named after the ontology or semantic model they
   contain, each file showing its document type.
2. **Given** a file imported on its own whose references (Ossie `ontology_ref` /
   `semantic_model_ref` names, shared IRIs, ODCS physical names matching dataset sources) point
   into an existing project, **Then** the application suggests adding it to that project, lists
   the evidence, and the user accepts or rejects; a rejected suggestion is not offered again for
   that file.
3. **Given** a file, project or the whole workspace, **When** the user deletes it, **Then** a
   confirmation names everything that will be removed, warns about unsaved edits and about
   references that become unresolved, and the user confirms or cancels.
4. **Given** a confirmed deletion, **Then** an undo control is available for a short window
   (default 10 seconds) and restores the exact prior state.
5. **Given** the undo window has passed, **Then** the deleted items are in the trash, from which
   they can be restored (to their original project, or a new one if it no longer exists) or
   permanently deleted; a restore never overwrites a file created or changed after the delete;
   emptying the trash asks for confirmation.
6. **Given** any delete, restore or clear, **Then** sidebar, open document, graph, catalog,
   Metrics, Mappings and Source Control update without a reload.
7. **Given** a deletion fails, **Then** nothing is removed and an error explains that nothing was
   deleted.
8. **Given** documents saved before projects existed, **When** the upgraded application first
   starts, **Then** every stored source is exported byte-for-byte into project folders (one per
   former example set, others in "Ungrouped"), each project gets an initial commit, view settings
   are kept, and every document still opens.
9. **Given** a file is deleted, **Then** it appears in Source Control as an ordinary deletion to
   commit; deleting a whole project moves its folder, including its Git history, to the trash.

---

### User Story 3 - Import every Apache Ossie layout (Priority: P1)

A modeller imports Ossie definitions in either official layout: the split set (ontology, semantic
model, standalone mapping) or the consolidated embedded form (an ontology file with
`ontology_mappings` that carry an inline semantic model, as in the official Flights
`flights.yaml`). Both import, validate, show in every view, and feed the metrics layer.

**Why this priority**: Ossie is the primary input and the source of base metrics. Today the
consolidated file's embedded datasets, joins and metrics never reach the graph or catalog.

**Independent Test**: Import the Flights split set as one project and `flights.yaml` as another;
both show the same concepts, datasets, joins, metrics and 60 resolved bindings, and both export
byte-for-byte.

**Acceptance Scenarios**:

1. **Given** the split set, **When** imported, **Then** each file validates against its pinned
   schema, and the project shows concepts, datasets, joins and metrics in all views.
2. **Given** a consolidated file imported alone, **Then** its ontology, embedded semantic model
   (datasets, joins, metrics) and embedded mappings appear in the graph, catalog, Metrics and
   Mappings views, and the file is labelled as using the deprecated embedded form.
3. **Given** a project containing both layouts for the same ontology, **Then** reference
   ambiguity is reported with both candidates named, never resolved arbitrarily.
4. **Given** any Ossie layout, **When** exported without edits, **Then** the bytes are identical.
5. **Given** a single file that matches neither official layout, **Then** import reports the
   expected layouts; no custom single-file variant is accepted.

---

### User Story 4 - Explore a neighborhood and walk across relationships (Priority: P1)

A modeller opens Neighborhood on an entity, sees it at the center with all related entities and
the relationships between them, then activates a relationship or neighbor to move the center
there, walking through the model one hop at a time, with a trail and a way back. KPIs attached
to a concept are reachable from the same walk.

**Why this priority**: The owner reports the neighborhood view does not work right (defects in
"Baseline defects in v0.1.0"), and walking across relationships is the main way to navigate the
vocabulary to a KPI.

**Independent Test**: In the UBL model, center on Order, step to a neighbor through a
relationship, step again, go back twice; at each step the center, visible neighbors, hidden
neighbor count and trail are correct.

**Acceptance Scenarios**:

1. **Given** an entity with more neighbors than fit, **Then** shown and hidden neighbor counts
   are stated, and the user can reveal the rest (page through them or filter by relationship).
2. **Given** a center, **Then** it is visually distinct, incoming and outgoing relationships are
   distinguishable, and relationships among visible neighbors can be shown.
3. **Given** a center, **When** the user activates a relationship or neighbor (pointer or
   keyboard), **Then** the other end becomes the center and the previous center stays visible as
   the origin of the step.
4. **Given** several steps, **Then** a breadcrumb trail lists each center, and Back/Forward
   move through it with the same selection.
5. **Given** an OWL/RDF model, **Then** the same projection applies with or without a center, and
   technical resources are included only by explicit choice.
6. **Given** a search term, **Then** an exact name match is offered first, and choosing a result
   makes it the persistent center.
7. **Given** 1,000 entities, **Then** choosing a center uses a searchable picker.
8. **Given** any center change, **Then** no empty-state message flashes, the view fits once nodes
   are measured, and no edges or labels lie on top of each other.
9. **Given** a concept with KPIs, **Then** the neighborhood shows a KPI indicator that opens the
   KPI list for that concept.

---

### User Story 5 - Edit source with highlighting and live lint (Priority: P2)

In Source, the modeller sees syntax colors for YAML, JSON, Turtle, N-Triples, N3 and RDF/XML,
like a code editor, and validation findings appear inline while typing: underlined ranges, gutter
markers and the message on hover, without waiting for save.

**Why this priority**: Source remains the fallback editor for every format; inline findings cut
error-hunting time.

**Independent Test**: Open one file per serialization (and a metrics layer file) and see token
colors; introduce an error and see an inline marker at the exact range after a short pause; fix
it and see the marker clear; export and compare bytes.

**Acceptance Scenarios**:

1. **Given** a supported serialization, **Then** keys, strings, numbers, booleans, comments,
   IRIs, prefixes, literals and XML tags are colored according to the format.
2. **Given** an error is typed, **When** typing pauses, **Then** the range is underlined, the line
   has a gutter marker, and hover or cursor position shows the message, feature path and
   correction hint.
3. **Given** findings without a reliable location, **Then** they are document-level.
4. **Given** a document near the 2,000,000-byte limit, **Then** typing is not blocked by
   highlighting or lint.
5. **Given** CRLF line endings, tabs or a trailing newline, **When** one line is edited and saved,
   **Then** every untouched byte is unchanged.
6. **Given** the editor, **Then** line numbers, Go to line, in-file search, undo/redo, keyboard
   operation, screen-reader descriptions and the import-repair editor keep working.

---

### User Story 6 - Click an item to edit just that item, in any format (Priority: P2)

Clicking an entity, relationship or KPI anywhere it is shown opens an editor scoped to that item,
for every supported format including RDF, OWL and SHACL. Saving writes the change back into the
original file in place and leaves everything else intact.

**Why this priority**: Large files make whole-file editing slow and error-prone; today the
inspector edits only descriptions.

**Independent Test**: Edit one item in each format (Ossie YAML, ODCS JSON, Turtle OWL class,
N-Triples resource, RDF/XML SHACL shape); after each save the file differs from the original only
in that item, and the RDF graph differs only by the intended triples.

**Acceptance Scenarios**:

1. **Given** a selected item, **When** its editor opens, **Then** only that item's attributes (or
   its source fragment) are shown and editable, with highlighting and lint.
2. **Given** an edit that makes the document invalid, **Then** the finding is shown inline and Save
   is disabled.
3. **Given** a valid YAML/JSON item edit, **When** saved, **Then** bytes outside the edited item are
   identical, including comments and formatting.
4. **Given** a valid RDF item edit, **When** saved, **Then** the parsed graph equals the original
   graph minus the removed triples plus the added triples, and text outside the edited
   statements is identical; otherwise the edit is refused with the reason (FR-055).
5. **Given** a rename, **Then** remaining references in the project are listed; none are rewritten
   without per-occurrence confirmation.

---

### User Story 7 - Add and delete entities and relationships from the UI (Priority: P2)

The modeller adds a concept, dataset, contract object, KPI, OWL class or property, SHACL shape or
RDF resource, or a relationship between two existing entities, from the graph or catalog, and
deletes them the same way.

**Why this priority**: Together with Story 6 this makes the workbench a model editor.

**Independent Test**: In an Ossie ontology and in a Turtle OWL file, add an entity, connect it
with a new relationship, save, delete both, save; the final file equals the original.

**Acceptance Scenarios**:

1. **Given** a document, **When** the user adds an entity and fills the fields that document type
   requires, **Then** it is inserted in the document's own style and appears after validation.
2. **Given** two entities, **When** the user adds a relationship (drag between nodes or a form),
   **Then** a relationship of the type the document supports is created (ontology role, dataset
   join with keys, ODCS foreign key, OWL object property assertion or restriction, SHACL property
   shape, RDF triple).
3. **Given** an entity others depend on (relationships, mappings, metrics, KPIs), **When** deleted,
   **Then** the dependents are listed and the user removes them too or cancels.
4. **Given** any add or delete, **Then** it is a draft until Save, with Unsaved changes, draft
   export and validation applying.

---

### User Story 8 - ODCS contracts as dataset pages with lineage and history (Priority: P2)

A data steward opens an ODCS contract and gets a contract overview (status, version, domain,
servers, team and roles, SLA, quality, support, pricing) and one dataset page per schema object,
in the style of Marquez: a header with key facts, a schema tab (property table), a lineage tab
(foreign keys and the semantic datasets, metrics and KPIs that consume the object), a history tab
(versions from Git with field-level changes) and a quality tab. Properties are editable in place.

**Why this priority**: ODCS is the physical entry point of the metrics layer, and the owner rates
the current view as very poor.

**Independent Test**: Open `commerce.odcs.yaml` and `ubl.odcs.yaml`; every property's type,
required flag and key status is readable without Source; lineage from `orders` reaches the sales
metrics; after two committed edits, history shows both versions with the changed fields.

**Acceptance Scenarios**:

1. **Given** a contract, **Then** the overview shows identity and status, servers, team and roles,
   SLA properties, quality rules, support and pricing when present, plus a searchable list of
   schema objects with property counts, key indicators and quality rule counts.
2. **Given** a schema object, **Then** its page header shows type, property count, quality rule
   count, last change and tags, and the schema tab shows a sortable, filterable property table:
   name, logical type, physical type, required, unique, primary key, classification, description,
   tags, foreign keys (linked to their target object).
3. **Given** the lineage tab, **Then** a graph centered on the object shows foreign-key neighbors
   and downstream semantic datasets, fields, metrics and KPIs, with a depth control; property-level
   lineage shows which fields and metrics read a given property.
4. **Given** the history tab, **Then** versions from Git history are listed (version, date, author,
   message, property count) and selecting two versions shows added, removed and changed
   properties.
5. **Given** an editable property attribute, **When** edited, **Then** only that value changes in
   the source and the pinned ODCS 3.1.0 schema validates it.
6. **Given** 169 objects (UBL), **Then** the object list remains searchable and usable.

---

### User Story 9 - Source Control: changes, diffs, commits, branches and remotes (Priority: P2)

Like VS Code's Source Control, each project has a panel listing changed files; the user opens a
per-file diff, stages and unstages files, commits with a message, switches and creates branches,
and pushes, pulls or syncs with a configured remote. File history and version diffs come from
Git history.

**Why this priority**: Versioning is how metric definitions are reviewed and approved
(Story 1), and how ODCS history is produced (Story 8).

**Independent Test**: In a project, save edits to two files, see both as changed, diff one,
stage one, commit with a message, create a branch, switch back, push to a local bare remote and
pull a change made elsewhere; after each step the workspace views reflect the branch's content.

**Acceptance Scenarios**:

1. **Given** saved but uncommitted changes, **Then** the panel lists each changed file with its
   state (modified, added, deleted, renamed) and a count badge.
2. **Given** a changed file, **When** opened, **Then** a side-by-side or inline diff with syntax
   coloring shows the changes against the last commit; the user can also diff any two commits of
   a file from its history.
3. **Given** changed files, **Then** the user stages or unstages individual files or all files,
   and commits staged files with a required message.
4. **Given** branches, **Then** the user sees the current branch, switches to another, and creates
   a new one; switching with unsaved edits is blocked with an explanation, and after switching
   every view shows that branch's content.
5. **Given** a configured remote, **Then** push, pull and sync are explicit actions that report
   ahead/behind counts, progress and errors; conflicts are listed and must be resolved in the
   editor before committing.
6. **Given** content changed by pull or branch switch that fails validation, **Then** the file is
   still shown, marked invalid, and opens in Source for repair.
7. **Given** a save whose file changed on disk since the draft started (another tab, an external
   editor, a Git operation), **Then** the save is rejected and the user is offered the diff
   between their draft and the current file.
8. **Given** unsaved drafts, uncommitted staged changes or a dirty working tree, **When** the user
   pulls or switches branch, **Then** the operation is blocked with an explanation (no automatic
   stash); afterwards the project is rescanned and every view updates.
9. **Given** files are changed outside the workbench (another editor, a terminal Git command),
   **Then** every view updates on its own shortly after, without a reload.
10. **Given** Git is not installed, or the user's Git name or email is not configured, **Then** a
    clear message explains what is missing and how to fix it; viewing and editing still work.
11. **Given** a change to a file the workspace hides (an unsupported type), **Then** Source Control
    lists it with a "not shown in workspace" label; it can be staged, unstaged and committed, and
    its diff is viewable read-only, but it cannot be edited in the workbench.
12. **Given** a changed or untracked file in Source Control, **When** the user chooses "Add to
    .gitignore" (for the file, or for a pattern such as its extension or folder), **Then** the
    entry is appended to the project's `.gitignore`, the file disappears from the changes list
    and the workspace, and `.gitignore` itself appears as a change.
13. **Given** the project's `.gitignore`, **Then** it is listed in the project tree, opens in the
    source editor as plain text, and saving it immediately updates what the workspace and Source
    Control show.
14. **Given** a Git operation after which a file's bytes differ from what the workbench wrote or
    expected (for example because of a hook or a `.gitattributes` filter), **Then** the altered
    files are reported after the operation.

---

### User Story 10 - Full-screen graph and a layout that adapts to any window (Priority: P3)

The modeller expands Graph or Neighborhood to fill the screen, and the whole application adapts
to small screens and window resizing without lost controls or overlapping panels.

**Why this priority**: Improves reading large models; independent of data management.

**Independent Test**: Enter and exit full screen from Graph and Neighborhood; resize the window
across the six-viewport matrix; every control stays reachable and nothing overlaps.

**Acceptance Scenarios**:

1. **Given** Graph or Neighborhood, **When** full screen is activated (button or shortcut),
   **Then** the canvas fills the screen and refits, and the inspector opens as an overlay when an
   item is selected.
2. **Given** full screen, **When** Escape or the exit control is used, **Then** the previous
   layout, zoom and selection are restored; if the browser refuses full screen, the view fills
   the browser window instead.
3. **Given** any viewport from 390×844 to 2560×1440 and any resize between them, **Then** the
   sidebar, toolbars, inspector, Metrics, ODCS pages, Source Control and editors reflow without
   horizontal page scroll, clipped controls or overlap.

---

### User Story 11 - Read mappings in a clearer layout (Priority: P3)

In Mappings, each binding reads as a left-to-right chain (concept → relationship path → field or
metric → dataset → physical source), with conditions and findings attached to the binding, and
the query composer stays beside the evidence.

**Why this priority**: The tab works but is one long column of run-together text.

**Independent Test**: In mapped commerce and Flights, select Customer and Airport; every binding
is a chain with separated elements; the composer stays visible on desktop widths.

**Acceptance Scenarios**:

1. **Given** a binding, **Then** fields, physical sources and metrics are separate labelled
   elements.
2. **Given** many bindings, **Then** they are grouped by dataset, collapsible, with counts.
3. **Given** a finding, **Then** it sits next to the binding it concerns and links to the item
   editor.
4. **Given** desktop width, **Then** concept list, evidence and composer are side by side; on
   narrow widths they stack in that order.

---

### User Story 12 - Polished interface without overlapping elements (Priority: P3)

Every panel, toolbar, status message, legend and control is readable and clickable at every
supported viewport; nothing overlaps; messages disappear when no longer relevant; navigation
state is consistent.

**Why this priority**: Cross-cutting quality the owner sees daily.

**Independent Test**: The responsive suite asserts no bounding-box intersection between overlays
and controls at all six viewports in Graph, Neighborhood, Overview, Metrics, ODCS, Mappings,
Source Control and Source, with and without the inspector.

**Acceptance Scenarios**:

1. **Given** a graph view with bundle selector, status line, mini-map and zoom controls, **Then**
   none overlap at any supported viewport.
2. **Given** a status message, **Then** it disappears after a short time or on the next action and
   never hides controls.
3. **Given** the sidebar and tabs, **Then** the active item matches the current view.
4. **Given** narrow widths, **Then** popovers stay anchored to their control and within the
   viewport.

### Edge Cases

- A KPI whose input metric is deleted, renamed or deprecated: KPI marked broken with the reason.
- A ratio KPI whose denominator can be zero: the explanation states how the expression handles
  it (for example `NULLIF`) or flags that it does not.
- Two KPIs with the same name in different projects: names are unique per project only.
- Importing a filename that already exists in the target project: replace (as a change visible
  in Source Control) or keep both, by user choice.
- A batch that mixes unrelated files: still one project; grouping suggestions offer to split.
- Deleting a file other files reference: the confirmation names the files whose references break.
- Restoring a trashed file whose project was deleted: restored into a new project with the old
  name.
- Undo after another change happened in the meantime: undo restores the deleted items without
  reverting the later change.
- Another browser tab has the workspace open during delete, clear, branch switch or pull: it
  detects the change on its next action and refreshes rather than saving over newer content.
- Pull or branch switch that brings an invalid or unsupported file: shown, marked invalid,
  repairable.
- Merge conflicts after pull: conflicted files listed; commit blocked until resolved.
- Item edits in Turtle where a subject's statements are spread over several blocks, or inside
  blank-node property lists, collections or RDF/XML nested descriptions (FR-055).
- Consolidated Ossie file whose embedded semantic model has the same name as a separate semantic
  model in the project: reported as ambiguous.
- Very large neighborhoods (hundreds of neighbors) and self-relationships.
- Full screen requested while a modal dialog is open.
- Two writers change the same file (two tabs, an external editor, a Git command): the base-hash
  check rejects the stale save and shows the diff.
- The application stops in the middle of a multi-file operation: the journal completes or rolls
  it back on next start.
- The cache database is deleted or corrupted: it is rebuilt from the project folders with no loss.
- An unsupported file type is placed in a project folder: hidden from the workspace, untouched on
  disk, and its changes still listed (read-only, labelled) in Source Control.
- A supported file with syntax errors is placed in a project folder: shown as invalid, repairable.
- A tracked file is later matched by a new `.gitignore` pattern: Git keeps tracking it; Source
  Control explains that ignore rules do not apply to tracked files.
- A `.gitignore` pattern hides a file that other files reference: references to it are reported
  as unresolved, naming the ignore rule.
- Git hooks or `.gitattributes` filters in a project change bytes on commit or checkout: the
  rescan detects the hash change and reports it (see Risks).
- Git missing, or user name/email unset: clear message; editing still works, commits are disabled.
- Pull or branch switch with a dirty working tree: blocked with an explanation.
- Migration finds two documents with the same filename for the same project: both are kept with
  disambiguated names, and the mapping records which old id went where.
- Restore from trash where the original path is now taken: user chooses a new name; nothing is
  overwritten.

## Requirements *(mandatory)*

### Functional Requirements

**Metrics layer (Story 1)**

- **FR-001**: The system MUST support a metrics layer per project in which each KPI has: name,
  label, description, type (simple, ratio, derived, cumulative, filtered), inputs (Ossie base
  metrics or other KPIs), additivity, time dimension with minimum and allowed grains, allowed
  dimensions, structured filters, unit and format, targets with direction and thresholds, owner
  and steward, and lifecycle status, stored in the metric's Ossie extension; and a binding to the
  ontology concept it measures and the concept it is about, stored in the mapping document's
  extension (research.md R1, R12).
- **FR-002**: Formulas MUST remain Ossie metric expressions in the semantic model; metrics-layer
  attributes MUST reference metrics by name and MUST NOT duplicate formulas.
- **FR-003**: Metrics-layer attributes MUST be stored in Ossie's extension mechanism (metric-level
  for KPI attributes, mapping-document root for KPI bindings); the content MUST be validated
  against pinned application schemas by the same shared rules in browser, store and API.
- **FR-004**: Cross-references MUST be checked as workspace findings: inputs exist, no dependency
  cycles, grains allowed by the time dimension, filters and dimensions refer to existing fields,
  concept IRIs exist in the project's ontology, and the declared type agrees with the expression.
- **FR-005**: Metric dependencies shown anywhere (graph edges, Metrics view, inspector, lineage,
  explanation) MUST come from the same syntax-aware analysis the agent runtime and planner use.
- **FR-006**: The system MUST derive and show each KPI's lineage down to ODCS schema objects and
  properties, and show ODCS quality rules and SLA properties of those inputs as trust indicators.
- **FR-007**: The system MUST provide a Metrics view per project: list, search, group by concept or
  owner, filter by status, unit, dataset; and a KPI detail page with definition, explanation,
  lineage, targets and history.
- **FR-008**: Ontology concepts MUST show the KPIs that measure them or are about them, in all
  graph views and in the catalog; KPIs MUST be a distinct node type that can be shown or hidden.
- **FR-009**: The system MUST provide a guided creation workflow (concept → data → type and inputs
  → time and breakdowns → targets → governance → explanation and SQL preview → save) with
  validation at each step.
- **FR-010**: Saving a KPI MUST write minimal edits to the semantic model (the metric and its
  extension) and, when concepts are chosen, to the KPI binding in the mapping document's root
  extension (creating a minimal standalone mapping document if the project has none, or using the
  embedded semantic model's root extension in a consolidated file), in one journaled project save.
- **FR-011**: For every KPI the system MUST show "How it is calculated": the composition tree down
  to base metrics, each base metric's expression with the datasets, fields and ODCS properties it
  reads, filters, time grain, allowed breakdowns, additivity rules in plain language, and the
  ontology concepts and roles involved.
- **FR-012**: The explanation MUST include the SQL the planner would generate for a chosen grain
  and breakdown, labelled as a read-only preview. The workbench MUST NOT execute KPI or metric
  queries, register data sources or store calculated values.
- **FR-013**: The SQL preview MUST be refused, with the reason, for rollups that violate
  additivity (summing ratios, summing semi-additive measures over time).
- **FR-014**: The explanation MUST state how division by zero and missing values are handled by
  the expression, or flag that they are not.
- **FR-015**: KPI status MUST follow draft → proposed → approved → deprecated; changing an
  approved KPI returns it to proposed; deprecation requires a replacement or reason; dependents
  MUST be listed before any change is saved.
- **FR-016**: The system MUST export ratio and derived KPIs as plain Ossie metric expressions so
  other Ossie tools keep the formulas.

**Projects, deletion, trash (Story 2)**

- **FR-017**: The workspace MUST organize documents into projects, shown as a collapsible project
  → files tree with each file's document type.
- **FR-018**: Each import batch MUST create one project, named after the ontology or semantic
  model it contains (user can rename).
- **FR-019**: For files imported separately, the system MUST infer related projects from
  references (Ossie reference names, shared IRIs, ODCS physical names matching dataset sources)
  and offer grouping suggestions with their evidence; the user accepts or rejects; rejected
  suggestions are not repeated for that file; nothing is regrouped automatically.
- **FR-020**: Users MUST be able to rename projects and move files between projects.
- **FR-021**: Users MUST be able to delete a file, delete a project, and clear the workspace from
  the UI.
- **FR-022**: Every delete MUST show a confirmation that names what is removed and warns about
  unsaved edits and references that will break.
- **FR-023**: After a confirmed delete, an undo control MUST be offered for 10 seconds and restore
  the exact prior state.
- **FR-024**: Deleted files and projects MUST go to a trash from which they can be restored or
  permanently deleted; emptying the trash requires confirmation; Clear moves the whole workspace
  to the trash.
- **FR-025**: After delete, undo, restore or clear, every view MUST update without a page reload.
- **FR-026**: Multi-document deletes and restores MUST be all-or-nothing, or recover to a
  consistent state after a crash (FR-083).
- **FR-027**: Delete, restore and trash operations MUST be available through the local API under
  the same loopback and origin rules; no user task may require a maintenance script.
- **FR-028**: Existing documents MUST be migrated into project folders without loss (FR-089).
- **FR-029**: Re-importing a filename that exists in the target project MUST ask whether to
  replace it or keep both.

**Ossie layouts (Story 3)**

- **FR-030**: The system MUST accept the split Ossie set and the official consolidated embedded
  form, each validated against its pinned schema; other single-file layouts MUST be rejected with
  the expected layouts named.
- **FR-031**: For a consolidated file, graph, catalog, neighborhood, Metrics and Mappings MUST
  include the embedded semantic model's datasets, joins and metrics and the embedded mappings.
- **FR-032**: The UI MUST label each file's layout and note that the embedded form is deprecated
  upstream.
- **FR-033**: Cross-file reference resolution MUST look in the file's project first and report
  ambiguity with all candidates named.

**Neighborhood and graph navigation (Story 4)**

- **FR-034**: The neighborhood MUST place the center visibly at the center, distinguish it, and
  distinguish incoming from outgoing relationships.
- **FR-035**: The neighborhood MUST state shown and hidden neighbor counts and let the user reveal
  hidden neighbors.
- **FR-036**: The user MUST be able to show or hide relationships among visible neighbors.
- **FR-037**: Activating a relationship or neighbor MUST move the center across it; a breadcrumb
  trail with Back/Forward MUST record the walk, and SHOULD continue into another file of the same
  project when the target is defined there (shared IRI or mapping reference).
- **FR-038**: The OWL/RDF projection MUST be the same with or without a center, with an explicit
  control to include technical resources.
- **FR-039**: Choosing a center MUST use a searchable picker ranking exact matches first; a chosen
  search result becomes the persistent center.
- **FR-040**: Changing the center MUST NOT show a transient empty state; the view MUST fit after
  nodes are measured; edges and labels MUST NOT share a path or position.
- **FR-041**: Concepts with KPIs MUST show a KPI indicator in the neighborhood that opens their
  KPI list.

**Source editor (Story 5)**

- **FR-042**: The source editor MUST color syntax for YAML, JSON, Turtle, N-Triples, N3 and
  RDF/XML according to the detected serialization.
- **FR-043**: The editor MUST show findings inline while typing (range underline, gutter marker,
  message on hover/cursor) after a short pause, from the shared validation rules.
- **FR-044**: Findings without a reliable location MUST be document-level.
- **FR-045**: Highlighting and lint MUST NOT block typing for documents up to the 2,000,000-byte
  limit.
- **FR-046**: The editor MUST preserve all untouched bytes, including line-ending style, tabs and
  trailing newline.
- **FR-047**: The editor MUST keep line numbers, Go to line, in-file search, undo/redo, keyboard
  operation and screen-reader descriptions, and MUST also serve the import-repair dialog and the
  item editor.

**Item editing, add and delete (Stories 6, 7)**

- **FR-048**: Selecting an entity, relationship or KPI anywhere MUST offer an item editor scoped to
  that item, for every supported format.
- **FR-049**: Users MUST be able to add entities and relationships in every supported format
  through forms that request the fields the format or its pinned schema requires.
- **FR-050**: Users MUST be able to delete entities and relationships; deleting an entity MUST list
  dependent relationships, mappings, metrics and KPIs and let the user remove them too or cancel.
- **FR-051**: Renames MUST report remaining references in the project; rewriting them requires
  per-occurrence confirmation.
- **FR-052**: Item edits, additions and deletions MUST be drafts until Save and MUST pass the
  shared validation and base-hash check.
- **FR-053**: For YAML, item edits MUST change only the edited node's text and keep comments,
  anchors, key order, quoting and indentation elsewhere; for JSON, only the edited value's text,
  keeping the document's indentation style elsewhere.
- **FR-054**: New items MUST be inserted in the document's own style (indentation, quoting, list
  style for YAML/JSON; prefixes and indentation for Turtle/N3; element style for RDF/XML).
- **FR-055**: For RDF serializations, every item edit MUST satisfy: (a) the parsed graph after the
  edit equals the original graph minus the removed triples plus the added triples (checked before
  the edit is accepted); (b) text outside the edited statements is byte-identical; and per
  serialization:
  - **N-Triples**: line-level edits only (replace, add or remove whole triple lines);
  - **Turtle / N3**: the subject's statement block is rewritten in place using the document's
    prefixes and indentation; if the subject's statements span several blocks, each affected
    block is rewritten in place and others are untouched; new prefixes are added to the prefix
    section; comments inside a rewritten block are kept where they attach to an unchanged
    statement, otherwise the user is warned before saving; N3-specific constructs (formulae,
    rules) are editable only in Source;
  - **RDF/XML**: the subject's node element is edited in place, keeping other elements,
    namespace declarations and comments; attribute order of the edited element may change;
    constructs that cannot be edited in place (for example parse-type collections or reified
    statements spanning elements) are refused with a link to the exact lines in Source;
  - blank-node property lists and collections are edited as a whole with their parent statement.

**ODCS view (Story 8)**

- **FR-056**: ODCS contracts MUST have an overview: identity and status, servers, team and roles,
  SLA properties, quality rules, support, pricing and custom properties when present, plus a
  searchable object list with property counts, key indicators and quality rule counts.
- **FR-057**: Each schema object MUST have a dataset page with a header (type, property count,
  quality rule count, last change, tags) and tabs: Schema (property table: name, logical type,
  physical type, required, unique, primary key, classification, description, tags, foreign keys
  linked to targets; sortable and filterable), Lineage (graph centered on the object with depth
  control: foreign-key neighbors and downstream semantic datasets, fields, metrics, KPIs;
  property-level lineage), History (versions from Git with property-level changes between two
  versions), Quality (rules with dimension, severity, operators and thresholds, as declared;
  no rule is executed).
- **FR-058**: Editable ODCS values MUST be edited in place with minimal source change and
  validated against the pinned ODCS 3.1.0 schema.

**Source Control (Story 9)**

- **FR-059**: Each project MUST have Git history; the Source Control panel MUST list changed files
  with state and count, open per-file diffs (against the last commit, or between any two commits
  of a file), stage and unstage files, and commit staged files with a required message.
- **FR-060**: Users MUST be able to see the current branch, switch branches and create branches;
  switching with unsaved edits is blocked with an explanation; after a switch every view shows the
  branch's content.
- **FR-061**: Users MUST be able to configure a remote and push, pull and sync as explicit actions
  showing ahead/behind counts, progress and errors; conflicts are listed and block commit until
  resolved.
- **FR-062**: Files committed to Git MUST be byte-identical to the files saved by the workbench;
  content arriving by pull or branch switch MUST pass through shared validation and be shown as
  invalid when it fails.
- **FR-063**: The workbench MUST NOT store, request or transmit remote credentials itself; it uses
  the machine's Git configuration. Git's configured credential helper (for example Git Credential
  Manager) MAY open its own window during an explicit fetch, pull, push or sync, and the UI shows
  that the operation is waiting for credentials and can be cancelled. Remote operations are the
  only network use and occur only on explicit action.
- **FR-064**: A stale save (FR-081) MUST be rejected with the diff between the draft and the
  current file.
- **FR-065**: Pull and branch switch MUST be blocked while unsaved drafts exist, and initially
  also while the working tree or index is not clean (no automatic stash); after any Git operation
  the project MUST be rescanned and the UI updated. Merge conflicts MUST appear as conflicted
  files that open in the editor for repair.

**Full screen and layout (Story 10)**

- **FR-066**: Graph and Neighborhood MUST offer full screen (button and keyboard shortcut), Escape
  to exit, restoration of the prior view, and a window-filling fallback.
- **FR-067**: Every view MUST reflow from 390×844 to 2560×1440 and on window resize without
  horizontal page scroll, clipped controls or overlap.

**Mappings (Story 11)**

- **FR-068**: Mappings MUST show each binding as a chain (concept → relationship path → field or
  metric → dataset → physical source) with conditions and findings attached.
- **FR-069**: Bindings MUST be groupable by dataset and collapsible, with counts; fields, sources
  and metrics MUST be separate labelled elements.
- **FR-070**: Findings in Mappings MUST link to the item editor for the offending item.

**UI polish (Story 12)**

- **FR-071**: No overlay (status line, bundle selector, mini-map, zoom controls, toasts, popovers,
  inspector) may overlap another overlay or an active control at any supported viewport.
- **FR-072**: Status messages MUST auto-dismiss or clear on the next action.
- **FR-073**: Navigation state (sidebar, tabs) MUST indicate the current view correctly.
- **FR-074**: Existing behavior and checks (exports, grouping, validation navigation, agent
  endpoints, examples) MUST keep passing.

**Project storage (MQ3; Stories 2 and 9)**

- **FR-075**: Every project MUST be a plain directory under `data/projects/<slug>/` that is a Git
  working tree. The files on disk MUST be the only source of truth for project content.
- **FR-076**: The workbench MUST NOT open, import in place, or write to folders or repositories
  outside `data/projects/`. Importing copies files into a project folder.
- **FR-077**: The database MUST be a rebuildable cache only (file hashes, indexed entities,
  diagnostics, derived suggestions); deleting it MUST lose nothing, and it MUST be rebuilt by
  rescanning the project folders.
- **FR-078**: Application state that must survive (project registry, view settings and grouping
  corrections keyed by project and path, rejected grouping suggestions, drafts with their base
  hash, trash log and entries) MUST live in state files under `data/` outside the cache, written
  atomically (write to a temporary file, then rename), in a simple, human-readable durable format.
- **FR-079**: Opening or refreshing a project MUST scan its folder, hash each file, validate and
  index it. Files of unsupported types, and files matched by `.gitignore`, MUST be hidden from
  the workspace views and left untouched on disk. Files of a supported type that fail parsing or
  validation MUST be shown, marked invalid, and open in Source for repair.
- **FR-080**: The workbench MUST watch each project folder and its Git `HEAD` and index,
  debounce bursts of changes, reconcile after every Git operation, and push changes to open
  browser tabs as they happen, so that external edits, Git operations, deletions and Clear appear
  without a reload.
- **FR-081**: A draft MUST record the content hash of the file it was based on (replacing integer
  revisions). Saving MUST reject the draft if the file's current hash differs; otherwise it MUST
  apply the edit, validate, write a temporary file, atomically rename it over the original, and
  reindex.
- **FR-082**: Item edits MUST be applied as patches to source ranges, so that bytes outside the
  edited range are unchanged (FR-053 to FR-055).
- **FR-083**: Operations that touch several files (project delete, restore, Clear, multi-file KPI
  saves, migration) MUST be journaled so that an interrupted operation is completed or rolled
  back on the next start.
- **FR-084**: Git commands MUST run through the machine's installed Git with argument lists (never
  a shell string), an explicit working directory inside `data/projects/`, interactive prompts
  disabled, timeouts, Git's error output shown to the user, and Git operations serialized per
  repository.
- **FR-085**: Repositories created by the workbench MUST disable line-ending conversion
  (`core.autocrlf=false`) so committed bytes equal saved bytes.
- **FR-086**: Deleting a file MUST move it to `data/trash/<entry-id>/` with metadata (original
  project and path, time, content hash); deleting a project MUST move its whole folder, including
  `.git`, there. Git history MUST never be rewritten by a delete.
- **FR-087**: Undo (10 seconds) and restore from the trash MUST put items back at their original
  location; if a file now exists at that path or the project changed after the delete, restore
  MUST NOT overwrite it and MUST ask for a new name or location.
- **FR-088**: Clear MUST move every project to the trash as individual trash entries.
- **FR-089**: Migration from the v0.1.0 database MUST run once on startup: back up the database;
  export every stored source byte-for-byte into project folders (known example sets into their
  example projects, the rest into "Ungrouped"); disambiguate duplicate filenames; verify every
  exported file's hash against the stored source; `git init` and an initial commit per project;
  keep a mapping from old document ids to (project, path); and carry over view settings and
  grouping corrections. A failed verification MUST stop the migration and leave the database
  untouched.
- **FR-090**: Missing Git, or a missing Git user name or email, MUST produce a clear message in
  the UI; non-Git features MUST keep working.

**Source Control: hidden files, .gitignore, hooks (Story 9)**

- **FR-091**: Source Control MUST list changes to files hidden from the workspace (unsupported
  types), labelled "not shown in workspace", with read-only diff, stage, unstage and commit; they
  MUST NOT be editable in the workbench.
- **FR-092**: The scanner and Source Control MUST respect the project's `.gitignore` rules (as Git
  interprets them): ignored files are not indexed, not shown in the workspace and not listed as
  changes.
- **FR-093**: Source Control MUST offer "Add to .gitignore" for a changed or untracked file, with a
  choice of the exact path or a pattern derived from it (extension, folder); the entry is appended
  to the project's `.gitignore` with the same atomic, hash-checked save as any other file.
- **FR-094**: `.gitignore` MUST be listed in the project tree and editable as plain text in the
  source editor (highlighting for comments and patterns; no model validation).
- **FR-095**: Saving `.gitignore` (directly or through FR-093) MUST trigger a rescan so the
  workspace and Source Control reflect the new rules without a reload.
- **FR-096**: Git hooks and filters configured in a project MUST be allowed to run. After every
  Git operation the workbench MUST compare file hashes with the expected bytes and report files
  whose bytes were altered.

### Key Entities

- **Project**: a folder `data/projects/<slug>/` that is a Git working tree; has a display name,
  slug, current branch, optional remote and member files. Registered in the project registry.
- **Document (file)**: a file in a project folder, identified by (project, relative path), with
  exact bytes, content hash, serialization, detected type (ODCS, Ossie ontology, semantic model,
  mapping, consolidated, RDF, OWL, SHACL, or the fallback metrics file) and validity.
- **Draft**: unsaved edits to one document, with the base content hash they started from.
- **Project registry and application state**: durable state files under `data/` holding the
  project list, view settings and grouping corrections per (project, path), rejected suggestions,
  drafts and the trash log; never derived from the cache.
- **Cache**: rebuildable index of hashes, entities, diagnostics and suggestions.
- **Operation journal**: record of an in-progress multi-file operation, used for crash recovery.
- **Legacy id mapping**: map from v0.1.0 document ids to (project, path).
- **KPI / metric-layer entry**: governed business measure (attributes in FR-001), stored in its
  Ossie metric's `SEMANTIC_WORKBENCH` extension, referencing Ossie metrics and, through lineage,
  ODCS properties.
- **KPI binding**: link from a KPI (metric name) to the ontology concept it measures and the
  concept it is about, stored in the mapping document's root `SEMANTIC_WORKBENCH` extension.
- **Base metric**: Ossie metric in a semantic model: name, expression per dialect, description,
  data type.
- **KPI explanation**: derived view of a KPI: composition tree, expressions, inputs down to ODCS
  properties, rules, concepts and SQL preview; never stored in documents.
- **Grouping suggestion**: proposed file-to-project assignment with evidence and accepted/rejected
  state.
- **Trash entry**: folder `data/trash/<entry-id>/` holding a deleted file or whole project folder
  (with `.git`) plus metadata: original project and path, deletion time, content hash.
- **Commit / version**: Git commit (id, author, time, message, changed files); a file version is
  the file's content at a commit.
- **Model item**: entity or relationship with its location in the source, used by the item editor
  and graphs.
- **Neighborhood walk**: ordered centers visited with the relationship used for each step.
- **Finding**: validation result with severity, code, path, optional range, message and hint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the shopping center project, a user goes from the concept "Unit" to the
  occupancy rate KPI's definition and lineage down to ODCS properties in at most four
  interactions.
- **SC-002**: A user creates a ratio KPI from two existing base metrics, with grain, target and
  owner, in under 3 minutes using the wizard, without opening Source.
- **SC-003**: For every governed metric in the shipped examples, the explanation lists exactly the
  base metrics, datasets, fields and ODCS properties its definition uses (checked against the
  definitions), and no workbench action executes a query.
- **SC-004**: 100% of SQL previews requested with an invalid rollup (sum of a ratio, sum of a
  semi-additive measure over time) are refused with a reason.
- **SC-005**: A user deletes a file, a project, or the workspace in at most three interactions,
  undoes within 10 seconds, and restores from the trash afterwards; the UI updates in under
  1 second with no reload.
- **SC-006**: Zero user tasks require a maintenance script or a page reload.
- **SC-007**: All five pinned official Ossie examples plus `flights.yaml` import; the split and
  consolidated Flights projects show identical concept, dataset, join, metric and binding counts
  (60 bindings each).
- **SC-008**: In the UBL model, a user walks five relationship hops and returns to the start using
  only the neighborhood view, with correct shown/hidden counts at every step.
- **SC-009**: Lint markers appear within 500 ms after typing pauses for documents under 200 KB.
- **SC-010**: Exports are byte-identical to stored sources for every shipped example after
  open/close; after an item edit, YAML/JSON files differ only within the edited item and RDF
  graphs differ exactly by the intended triples, in all six serializations.
- **SC-011**: Every ODCS property's type, required flag and key status is visible without Source
  for both shipped contracts, and lineage from an ODCS object reaches every metric that reads it.
- **SC-012**: A user commits, branches, switches, pushes and pulls a project entirely from the
  Source Control panel, and each per-file diff shows exactly the changed lines.
- **SC-013**: At every viewport from 390×844 to 2560×1440, and during resize between them, the
  responsive suite finds zero overlapping overlays, zero clipped primary controls and no
  horizontal page scroll in every view; full screen enters and exits without losing view state.
- **SC-014**: All existing suites keep passing, and the targeted mutation suite detects every
  mutant, including new ones for deletion/trash, grouping suggestions, Git staging, RDF edit
  isomorphism, additivity guards, type/expression consistency and neighborhood filtering.

- **SC-015**: Deleting the cache database and restarting restores every project, file, view
  setting, grouping correction, draft and trash entry with no loss.
- **SC-016**: Migration of a v0.1.0 workspace exports 100% of stored sources with hashes equal to
  the stored bytes, and every old document link resolves to its new (project, path).
- **SC-017**: A file changed by an external editor or terminal Git command appears in every open
  tab within 2 seconds, without a reload.

## Assumptions

- Single local user; no accounts. Loopback binding and the origin check remain the security
  boundary.
- The workbench never executes KPI or metric queries; the no-execution principle stands.
  Constitution 2.0.0 governs file-based storage and Git remote operations.
- Git operations use the Git installation on the machine and its credential configuration; the
  workbench stores no credentials. Projects without a remote work fully offline.
- **Implementation constraints decided in the storage design review (not product
  requirements)**: Git is invoked with `Bun.spawn` using argument arrays, explicit `cwd`,
  `GIT_TERMINAL_PROMPT=0` and timeouts; changes reach the browser through a server-sent event
  stream; application-state files live under `data/state/`; trash under `data/trash/`.
- Pull and branch switch initially require a clean working tree and index; automatic stashing may
  be added later.
- The undo window is 10 seconds; the trash keeps items until the user restores or empties them.
- Projects are folders; project membership is not written into source documents and changes no
  standard's semantics.
- Grouping suggestions use only explicit evidence (reference names, IRIs, physical names), never
  similarity of names.
- Syntax highlighting, diff and lint may use established open-source components that run locally
  and make no network calls.
- **Implementation constraint (not a product requirement)**: the UI polish work in Story 12 is
  intended to be implemented with the Codex CLI (`codex`), which is installed on the development
  machine. Its output is held to the same review, test, browser-check and mutation gates as any
  other change.
- Out of scope: "AI Cookie Cutter" and "Skald → Prompt Lab" (unrelated topics); hosted LLM
  features; executing KPI, metric or SQL queries of any kind; SHACL data validation and OWL reasoning; JSON-LD, TriG
  and other serializations not already supported; multi-user collaboration; custom single-file
  Ossie layouts; performance work beyond what FR-045 requires; KPIs that combine metrics from
  more than one semantic model (deferred); a separate `*.metrics.yaml` file.

## Risks

- **Concurrent writers**: tabs, external editors and Git commands can change files at the same
  time; mitigated by base-hash checks, watchers and per-repository serialization, but a change
  between hash check and rename remains possible and must be detected on the next scan.
- **Multi-file atomicity**: a file system offers atomic rename per file only; multi-file
  operations rely on the journal for recovery rather than true atomicity.
- **RDF patching**: in-place edits of Turtle, N3 and RDF/XML (FR-055) are the hardest guarantee to
  keep; edits that cannot be patched safely must be refused rather than approximated.
- **Git hooks and filters**: hooks and `.gitattributes` filters are allowed and can alter bytes on
  commit or checkout; managed repositories disable line-ending conversion, and post-operation
  hash checks report any alteration (FR-096) rather than prevent it.

## Baseline defects in v0.1.0 (input for planning)

These defects exist in the v0.1.0 code and explain parts of Stories 1 to 6, 8, 9, 11 and 12. File
and line references point at tag `v0.1.0`.

**Neighborhood graph (Story 4)**

1. Focused neighborhoods drop every relationship between neighbors (only links touching the
   center survive), while an unfocused small model shows all links; clicking any node in a model
   of eight or fewer entities therefore hides links abruptly. `src/graph-view.ts:68`,
   `src/graph-view.ts:73`.
2. Neighbors are capped at seven, taken in source declaration order; the rest are dropped with no
   count or way to reach them except the Center list. The summary reports "Showing 8 of N
   entities", not hidden neighbors. `src/graph-view.ts:72`, `src/NeighborhoodGraph.tsx:51`.
3. The OWL "classes only" projection applies only when there is no center and no search; once a
   center is set, property resources, restrictions and RDF resources appear, so the same model
   looks different after one click. `src/graph-view.ts:62` (codified by the test "explicit RDF
   technical focus bypasses default OWL class projection" in `tests/graph-view.test.ts`).
4. Search centers on the first substring match in declaration order rather than the best match,
   and the search center is never stored: clearing the search jumps back to the previous center.
   `src/graph-view.ts:66`, `src/graph-view.ts:69`.
5. Node construction depends on the selected entity, so every selection change rebuilds nodes and
   terminates a running Auto align without notice; selecting a relationship clears the entity
   selection, and the center node has no styling of its own (only the selected node gets a
   coloured border). `src/NeighborhoodGraph.tsx:20-27`.
6. Nodes start empty and are filled in an effect, so the "This model has no entities to display"
   message renders for one frame on every document switch; the fit effect relies on a
   nodes-initialized flag that stays true across center changes and can fit before new nodes are
   measured (to be confirmed with a browser check). `src/NeighborhoodGraph.tsx:14`,
   `src/NeighborhoodGraph.tsx:29-35`, `src/NeighborhoodGraph.tsx:54`.
7. Every long (over 350 px) or backward relationship is routed along one shared horizontal line
   at the same height, with its label at that height, so such edges and labels overlap; for
   backward edges the corner curves assume left-to-right travel and draw hooks at both ends.
   `src/RelationshipEdge.tsx:6-10`, `src/NeighborhoodGraph.tsx:37`.
8. The Center list renders one option per entity (1,000 in the commerce scale data), with no
   search. `src/NeighborhoodGraph.tsx:48`.
9. The layered layout ranks nodes by edge direction, so the center can sit in the first or last
   column instead of the middle. `src/layout.ts:83-113` used from `src/NeighborhoodGraph.tsx:22`.

**Overlapping and polish (Story 12)**

10. The graph bundle selector sits at 16 px from the left and 62 px from the bottom, on top of the
    zoom controls column at the bottom left. `src/style.css:436` (`.graph-bundle-choice`) with
    `<Controls>` in `src/FullGraph.tsx:94`.
11. The full-graph status line spans from 55 px on the left to 25 px from the right edge and wraps,
    so it runs under the mini-map at the bottom right and can grow into the bundle selector.
    `src/style.css:434`, `src/style.css:531`, `src/style.css:565-566`.
12. Status messages are never cleared after loading or saving, and the message box is fixed above
    the footer across the canvas, covering the graph status line and controls. `src/main.tsx:117`,
    `src/main.tsx:142`, `src/style.css:522`.
13. The open grouping-details popover is fixed at 100 px from the top regardless of where its
    control is, so it can cover the header or toolbar when the toolbar wraps. `src/style.css:596`.
14. Business-area titles are 20 px, single-line and absolutely positioned, so long names spill
    beyond narrow area boxes. `src/style.css:434` (`.full-area-title`).
15. The sidebar "Model explorer" item is always styled as active, and it opens Neighborhood while
    the default tab is Graph; "Source editor" is never shown as active. `src/main.tsx:189-194`.
16. Neighborhood and Overview share one tab value and differ only by a flag, which complicates
    active-tab state and navigation. `src/main.tsx:96`, `src/main.tsx:255-259`.

**Data management, Ossie layouts, metrics, mappings, editing**

17. There is no delete endpoint (only list and save) and the sidebar is a flat list; removal
    requires `scripts/clear-db.ts` and a page reload. `server/handler.ts:67-79`,
    `server/store.ts:13-30`, `src/main.tsx:198-209`.
18. Saving overwrites the source in place; no earlier revision is kept, so there is nothing to
    diff. `server/store.ts:22-24`.
19. A file containing an `ontology` list is treated as an ontology only; the embedded semantic
    model and mappings of the consolidated form never reach the graph or catalog.
    `src/model.ts:116-128`.
20. Metric-to-dataset links come from a plain text search for `dataset.` in the expression, which
    misses unqualified references and matches names that merely end with a dataset name, unlike
    the syntax-aware analysis in the agent runtime. `src/model.ts:182-183`.
21. In a binding, the field list and "Governed metrics:" are concatenated with no separator.
    `src/MappingExplorer.tsx:30`.
22. Inspector edits are limited to descriptions; editing a JSON document through the inspector
    re-serializes the whole file with two-space indentation. `src/model.ts:189-193`,
    `src/main.tsx:344`, `src/main.tsx:360`.
23. ODCS objects show only property names in the inspector (`fields` keeps names only), with types,
    keys and contract sections available only in the raw definition. `src/model.ts:111`,
    `src/main.tsx:367-375`.
24. Lint covers whole lines only (no column ranges), runs synchronously on every keystroke on the
    main thread, and the editor is a plain text area, which normalizes line endings to LF once
    the user types. `src/main.tsx:81`, `src/SourceEditor.tsx:117-126`.
25. Examples are de-duplicated by filename only, and imports never check for an existing
    filename, so repeated imports create duplicate documents. `src/main.tsx:110`,
    `src/main.tsx:151-152`.
