# Using Semantic Workbench

Semantic Workbench edits definitions as files and explains how metrics are calculated. It never
connects to a warehouse, executes an analytical query or calculates live metric values. It does
not apply SHACL shapes to an instance graph or perform OWL reasoning. SQL shown in the application
is a preview.

For installation, see [the README](../README.md#quick-start). Shared-server sign-in and permissions
are covered in [the server guide](server-mode.md).

## Workspace navigation

The app works on one project at a time, the **selected project**.
Opening a file selects the file's project, and choosing another project's row in the **Projects**
tree switches to it and opens its first file (a project with no files shows its empty state).
Everything else follows the selected project: the open files, metrics, Mappings, shared references,
the Neighborhood trail, Source control, the files in Trash and the project that Import starts on.
Nothing falls back to another project's documents, and Back and Forward return to the project you
left. Other projects stay in the tree so you can switch to them.

The sidebar starts with **Add project**, whose menu holds **Import files**, **Clone a repository**
and **Load an example**. The examples open beside the menu; on a phone they replace it, under a
**Back** row. Below it are **Model explorer**, **Source editor**, **Source control** and the
**Projects** tree, and the footer holds **Trash**, **Settings** and where the project folders live.
**Settings** opens a panel beside the sidebar, level with its row (on a phone, above it), with
**Theme** (System, Light, Dark), **Clear workspace** and, for people allowed to administer,
**Admin**. The tree has its own scrollbar and takes the height left above the footer, so the footer
stays fully visible at any window height. All files remain reachable by scrolling and keyboard
focus. The selected file is brought into view when it would be hidden.

On desktop, drag the sidebar separator or use its arrow keys, Home and End to choose a width
between 220 and 520 pixels; the browser remembers it. Long project and file names wrap to two
lines and retain full-name tooltips. Below 1100 pixels the sidebar becomes a drawer. A drawer
opened while the workspace loads stays open when the initial document appears.

The header is one row at every width. Its title is the open file's name, with the model's long
name in the tooltip; with no file open it reads "Open a file from Projects" and has no Commit
button. Under the name, a muted line gives the project, the kind of file and the save state. A
save that needs action, such as "Not saved: 2 errors", turns red and underlined; selecting it
opens the findings. On the right are **Commit…** (an icon below 1100 px), **More actions** and
the account menu. **More actions** holds **New** and **Export**; on a phone the **New** items open
in place, under a **Back** row. On a phone (up to 650 px wide) the row shows the file name, a dot
for the save state, **Commit…** as an icon and **More actions**; a save that needs action keeps
its words beside the dot. Tabs that do not fit scroll sideways with edge cues; keyboard navigation
reveals the focused tab. Model views, Source and Source Control retain separate sidebar navigation
states.

**Settings → Admin** opens the administration page for people allowed to administer. Its **Git remotes**
section lists every project with its remote address, or "No remote", with **Set remote…** and
**Remove remote** for each project. With no projects it says so and offers **Back to
workspace**, where **Add project** is. Addresses are shown without credentials. In server mode, the
person menu contains **Connected accounts** and **Sign out**. In local mode there is no sign-in or
person menu.

### Back and Forward

Back undoes the last action a click caused, and Forward redoes it. The browser's Back and Forward
buttons, the mouse's back and forward buttons and the Back and Forward arrows of the Neighborhood
and lineage trails all move through the same list of actions. Back covers opening a file, changing
the tab, selecting an entity, a relationship or a metric, centring or expanding the Neighborhood,
the lineage walk (centre, expand, full pierce, opening a count card or a column list, splitting a
bundled line), opening or collapsing graph areas, the graph, Neighborhood and lineage switches
(Labels, Value types, Metrics, Mini-map, Technical resources and the others), layout and grouping
choices, the Mappings concept and **Show more**, and the sidebar's folders. Typing is not an
action: the editor keeps its own undo, and text in a search box is not restored. Deleting a file is
not undone by Back; **Undo** in the toast and **Trash** restore it. Back and Forward only change
what is shown: a grouping choice is saved when you make it, and going back shows the earlier
grouping without saving it. After a reload the earlier actions are gone, and Back leaves the app as
the browser normally does. The Admin page keeps its own
address, so Back leaves a section as before.

## Files, imports and project organization

Choose **Add project → Import files** and then **A new project** or **An existing project**. One selection for a new
project becomes one project, named from its definitions when possible. New-project imports are
preflighted as a batch. Errors open **Review import** so you can choose a file, repair its source
or filename, and import only when all errors are resolved. Cancel leaves the current document and
workspace untouched. Batch registration is journaled rather than leaving a partially imported
project. Repaired drafts remain available for retry. If a network reply is lost, refresh and
inspect the workspace first: the server may have completed the import even though the browser
did not receive its result.

A project or file's actions menu provides rename, import, move, export, history and delete actions
as applicable. Each row also has a direct trash button. Renaming a project preserves its folder
identifier. Importing a filename that already exists asks whether to replace it or keep both.
Supported files that are invalid on disk stay listed and open in Source for repair. Unsupported
file types are not model documents, but Source Control can still show their Git changes.

Files changed outside the application appear through live updates, normally within about two
seconds. A full scan also runs every 60 seconds. An open document follows disk changes unless it
has unsaved edits. Git-ignored files are omitted, except that an already tracked file remains
listed even when a new ignore rule matches it.

Imports and example loads make a commit containing exactly the imported files when Git, an
identity and repository state permit it. Other changes are left alone. If committing is not
possible, the files are still imported and the application explains why.

### Saving versus committing

Valid Source edits autosave one second after typing stops. Item editors, add/delete dialogs and
the metric wizard retain explicit **Save to file** or confirmation actions. Saving never implies
that a file has been committed or pushed.

The save-state indicator distinguishes saving, saved-but-uncommitted changes, validation errors
and a changed disk version. Invalid text remains an unsaved draft that survives reload. Selecting
the indicator or **Validation details** opens the findings. SQL syntax findings are warnings and
do not block saving.

The **Export** entry of **More actions** downloads the current open source, including an invalid
unsaved draft, without saving or committing it. Use it to keep a separate copy before resolving a
conflict or abandoning a draft. **Export project…** is different: its ZIP reads stored project
files and excludes unsaved drafts.

Every save carries the SHA-256 of the source it started from. If that version is stale, the save
is refused and a side-by-side diff offers these choices:

- Keep editing, with automatic saving paused for that file.
- Load the current disk version.
- Explicitly replace it with your version.

Untouched bytes, comments, quoting, indentation and line endings remain unchanged. File replacement
is atomic. Multi-file imports, moves and other coordinated changes use a recovery journal that is
completed or rolled back at the next startup.

**Commit…** lists changed files with a diff, initial selections and a suggested message.
**Commit** commits only selected files; unrelated staged or unstaged changes are preserved.
**Commit & push** then performs an explicit push. **Revert to last commit** asks first, restores
the committed file and retains the replaced version in the trash.

### Delete, undo and restore

A delete confirmation lists the affected files, unsaved drafts and references that would stop
resolving. Files and projects move to the trash rather than being immediately destroyed. A project
keeps its Git repository and history. Git sees deleted files as normal uncommitted deletions;
history is not rewritten.

**Undo** is available for ten seconds and restores files, drafts and grouping corrections.
Afterward, **Trash** can restore entries or permanently purge them. It lists the selected
project's deleted files, says how many deleted files of other projects are not listed, and a separate
section lists deleted projects. Emptying the trash asks for
confirmation and removes the entries of every project. Restore never silently overwrites another file: it offers a free name when needed.
A file whose original project no longer exists can be restored into a newly created project.
Server mode also applies project-creation, ownership and restore permissions.

**Settings → Clear workspace** moves the projects to the trash. Shared-repository projects are handled as
repository groups so their history and unpublished work can be retained together.

### Project export

**Export project…** downloads a streaming, uncompressed ZIP containing the project's stored files,
relative folders and `.gitignore`. It excludes `.git/`, ignored files and unsaved drafts. The dialog
names known unsaved edits and can offer **Save and export** for the open file.

**Include Git history**, off by default, adds `git-history.bundle`. The bundle can be read by
`git clone`; it is not a copy of the internal `.git` directory. Project exports larger than
64,000,000 bytes are refused before response bytes are sent.

In server mode, exports include only readable files from the caller's view. The number omitted
appears in `X-Export-Omitted`; omitted names are not disclosed. History is allowed only for a
whole-repository project when its history never touched unreadable paths, and includes the
checked-out branch rather than other people's working branches. Exports are audited.

### Grouping suggestions

The application suggests moving an isolated file into another project only from explicit
relationships: matching Ossie model/ontology references, a shared IRI, or matching ODCS physical
names and semantic dataset sources. Similar filenames alone do not count. The suggestion lists
its evidence. **Add to project** moves the file; **Dismiss** remembers the decision. Files are
never regrouped automatically. In server mode, suggestions and dismissals follow each person's
working copy and access.

## Source Control and Git repositories

Local mode uses the machine's Git configuration. **Set Git identity…** writes repository-local
`user.name` and `user.email`, optionally for other repositories that have no identity. It never
changes global Git configuration. Without Git or an identity, definitions can still be edited;
a banner explains which version-control operations are unavailable.

The **Source control** panel provides:

- Staged changes, unstaged changes and merge conflicts of the selected project, with side-by-side
  diffs. In a repository shared by several projects, changes of the other projects are counted in a
  note rather than listed; Stage all, Unstage all and Commit act on the whole repository. Switch
  project in the sidebar to see another project's changes.
- Per-file or bulk stage/unstage, commit messages and commit actions.
- Local and remote branches, new branches and branch switching. A **Tracking origin/main** line
  under the picker names the remote branch Pull and Push use; a branch with no upstream shows
  **Not published** instead of counters, and its first push is **Publish branch**.
- The remote address, and **Fetch**, **Pull**, **Push** and **Sync** buttons under it. **Remote…**
  to set the address up appears for Admins only (always in local mode); everyone else sees the
  address without the button. On a server, **Sync…** opens Pull, Publish and Push for the published
  branch.
- The same model tabs and **Find an entity** search as the model views, so a tab is one click away.
- Exact-path, extension and folder ignore rules, plus a Source editor for `.gitignore`.
- File history and comparison of two revisions or a revision with the working tree.

Pull merges rather than rebases. Conflicts remain visible until repaired in Source and staged.
Pull, Sync and branch switching refuse unsaved or uncommitted work rather than stashing it. Git
itself refuses to overwrite conflicting untracked files. If a hook or filter rewrites saved bytes,
the panel reports the mismatch. Managed repositories use `core.autocrlf=false`.

Remote commands run only after an explicit user action, can be cancelled and have a ten-minute
limit. Local credential helpers may open their own authentication window; the application shows
that it is waiting for Git. The **Credential setup guide** explains helper and SSH setup without
collecting a password or token; it also gives a command to sign in once from a terminal, because
the application cannot answer terminal prompts. After signing in, retry the action. A push that
Git rejects because the remote has newer commits shows a plain summary and **Pull remote changes**;
Git's own output is under **Show details**. Server-mode credentials work differently; see
[remote Git on a shared server](server-mode.md#remote-git).

### Clone a repository

Choose **Add project → Clone a repository** (the Import dialog also links to it). Supply a URL or local path, an optional name and,
if needed, **Folder in repository**. A clone is staged before registration. Failure, cancellation
or interrupted startup recovery leaves no partially registered clone. Invalid definitions are
listed for repair, not rewritten. A failed clone keeps what you entered: **Edit details** returns to
the form and **Retry** runs it again. A repository with no commits or no definitions is cloned and
reported as such; **Open project** then shows an empty project with **Import files**.

Submodules are not fetched. Symlinks are checked out as plain files, line-ending conversion is
kept off, and external Git helper transports such as `ext::` are refused.

### Several projects in one repository

A repository-root `.semantic-workbench.json` can declare project folders:

```json
{
  "schema": "semantic-workbench/repository/v1",
  "projects": [
    { "path": "domains/sales", "name": "Sales" },
    { "path": "domains/finance" }
  ]
}
```

Declared folders become projects after clone. Without a manifest, **Choose projects…** proposes
folders containing definitions, down to four levels, and can save a manifest. **Projects in this
repository…** changes the selection later.

The tree groups projects under their repository. They share a branch, history and Source Control
panel; repository-wide operations rescan every project. **Remove from workspace** unregisters a
subproject without deleting its files. **Delete folder** moves that folder to the trash. Removing
the final project through deletion moves the entire repository with its history.

Paths must remain inside the repository. Absolute paths, `.`/`..` segments, `.git`, duplicates,
unknown keys and nested project folders are refused. An invalid manifest leaves the repository
available as one project and reports why it could not be applied.

### One folder of a larger repository

**Folder in repository** accepts a clean repository-relative path such as `semantic/ubl`.
Absolute paths, `..`, backslashes and wildcard characters are refused. A trailing slash is removed.

A folder clone uses partial clone and cone-mode sparse checkout. Only that folder, repository-root
files and files directly in its parent folders are checked out. Git may fetch required blobs
later. A missing folder can be created with the first commit and push when the dialog offers it.

For an existing local project, the Remote dialog previews moving its files under the requested
folder. **Move files and save** records one move commit without rewriting history. It requires a
Git identity and no unsaved or uncommitted work. A retry finishes a move interrupted before its
commit. Changing an existing folder also requires no untracked files in the old folder.

Staging and commits are confined to the project folder. A branch without that folder is refused.
The panel header names the remote, branch and folder. Joining unrelated team history is supported
only through the local folder workflow; server mode instead instructs the caller to clone the
folder. Server working copies each retain their own sparse configuration.

## Model views and graph navigation

**Overview** retains business areas and a relationship matrix. **Catalog** exposes definitions;
a long entity name wraps between its words on the card instead of being cut. **Graph** shows the
complete interactive model; ODCS and mapping documents use their specialized canvases.
**Neighborhood** centers exploration on one entity.

Graph connections may bundle parallel relationships, but the inspector retains every original
definition. Selecting an entity lists its relationships; selecting a relationship shows endpoints,
roles, multiplicity, verbalization, join keys or RDF predicates. Shared references follow exact
IRIs or physical-source names, including QName expansion from declared prefixes; they are not
inferred equivalence.

### Full graph

The default **Network (fCoSE)** layout groups connected entities by area. Switch to **Layered
(ELK)**, which preserves orthogonal routes while they match current handles, with the **Layered /
Network** control in the graph toolbar. The
toolbar also holds **Re-layout**, the crosshair select that zooms to an area (**Zoom to group**), **Collapse areas**, **Expand all**, and
switches for **Labels**, **Value types**, **Metrics** and **Mini-map**; a check mark shows which
are on. On a phone these controls fold behind **Controls**. The canvas supports grouped areas,
dragging, area zoom and selection. Network detail routing uses a shared background worker;
whole-model views use less expensive paths.

The first view shows every entity by name; models above 250 visible business entities start with
one counted card per area. Expand an area or choose **Expand all** to
show every entity. Internal relationships remain available when the area opens. **Fit model**
returns the complete layout to view. A finite viewport cannot show unlimited full-size labels.

### Neighborhood and expansion

Incoming neighbors appear left of the center; outgoing neighbors appear right. The initial view
shows up to twelve neighbors, on a phone too, with a shown/hidden count and **N more neighbors**.
Cards keep their type (in words, such as "Entity type"), their whole description, wrapped to as many
lines as it needs, and metric count at every zoom. Cards never overlap, links stop at the card border
and never cross a card, and links that arrive at one card are spread along its side. **Labels** shows
every relationship name when it is on.
The picker ranks exact name matches first. Walking to a neighbor records a trail; Back, Forward
and breadcrumbs restore earlier centers (see [Back and Forward](#back-and-forward)). **Continue in <file>** follows an explicitly shared
identity into another project file and retains return navigation.

**+** expands a node in place without moving already placed nodes. **−**, **Undo expansion** and
walk history remove or restore only that expansion's contribution. **Show all connected** follows
Outgoing, Incoming or Both directions from the selection or center. It stops at 150 entities;
frontier markers explain hidden reachable nodes. **Expand further** permits up to 500, and **Stop**
cancels the worker operation. Each run is one trail step, "All connected to <name>"; repeating the
same run goes back to that step, and a run that adds nothing new adds no step. The Neighborhood, lineage and mapping views share the
same bounded traversal and the same step wording.

The toolbar filters neighbors by **Relationship** and switches **Links between neighbors**,
**Technical resources**, **Labels**, **Value types** and **Metrics** on or off. **Re-arrange** puts
dragged nodes back in their columns. OWL opens with classes only unless technical resources are
requested. Graph names and labels compensate for zoom; names retain full-name tooltips, and long
identifiers wrap at natural separators without changing their spelling.

### Full screen and grouping

Graph and Neighborhood support the toolbar's full-screen button or **F**. Escape or **Exit full
screen** restores the prior layout, zoom and selection. If browser full screen is refused, the
view fills the browser window instead. On phones, secondary controls sit behind **Controls** and
cross-file links behind **Other files**.

**Group by** offers declared domains, IRI namespaces, suggested communities, definition types and
curated UBL areas where applicable. Unavailable modes are disabled with their reason. Automatic
selects the first applicable mode and names the choice. Communities are deterministic structural
suggestions, not new semantic facts: closely linked entities are joined, and those groups are
joined again while that keeps links inside areas. Entities with no relationships are grouped by
type. **Adjust grouping…** changes view state, not source files.
Grouping corrections are personal in server mode.

## Data contracts and column-level lineage

The **Contract** tab shows the ODCS identity, status, team and roles, further declared sections
as count buttons that open a dialog, and searchable tables.
Open a table for Properties, Lineage, Relationships, History and Data Quality. Sections that the
contract does not declare are omitted rather than presented as empty required inputs.

Properties include logical/physical types, keys, classification, descriptions and tags. Nested
names use `parent.child`. The logical type and the Required, Unique and Primary key flags change in
the table row and save at once; **Edit** opens a dialog for the rest. Filtering, sorting and
property editing preserve the original YAML or
JSON. Server-mode classification restrictions remain enforced by the API. History compares
committed property changes. Data Quality displays declared rules and thresholds; none is run.

The lineage canvas connects tables, semantic datasets, metrics and external references by their
columns. It reads declared foreign keys, transforms and expression references. Exact physical
names connect semantic sources with ODCS tables; this interpretation is workbench behavior rather
than an additional claim made by either standard. A semantic dataset with its table's name whose
fields are that table's columns, unchanged, is a copy: the table card stands for both and carries
a **Semantic dataset** badge beside its type, and metrics connect to the table's columns. A dataset that renames,
computes or adds a field keeps its own card.

Click a line to see what it stands for. A single line selects its relationship, highlighting
both columns and listing them under **Selected path**. A bundled line, labelled with the number
of lines it stands for, splits into those lines. A line to a counted card, such as **17 more
tables**, opens that card; the view keeps the table at the other end of the line in place, so the
opened cards stay on screen.

Select a column to highlight its upstream/downstream path. **Selected path** appears beside the
canvas or in a phone dialog. **Find assets**, Walk here, Back/Forward and expansion retain context.
The first view frames the nearest cards whole at a readable size; the other cards are laid out
beside them, a pan away, and **Fit** shows every card.

A wide table shows relevant columns and **+ N more columns**, which opens one scrolling list,
not pagination. Lists above thirty columns offer filtering. Edges for offscreen connected rows
remain anchored at the list edge with a marker. When the list opens, the view pans so the whole
card shows, or its top when the card is taller than the canvas. **Show fewer** closes the list. A foreign-key
sentence reads child to parent, such as `orders.customer_id → customers.id`, even though dependency
lines run from referenced columns toward their consumers.

The **Hops** control follows one to five foreign keys in either direction and lists the reached
tables and keys by hop. Toolbar switches show or hide **Metrics** and **Other contracts**
(references to tables in other contracts). Badges and the legend distinguish PK, FK, Required, Unique and line kinds.
Labels without room remain available on hover. **Open in lineage** centers on the selected table.

## Editing and validation

Select an entity, relationship or metric and choose **Edit**, or press **E**. Catalog cards and
metric details also expose editing. Existing items open in a right-hand drawer; new items use a
centered dialog. Fields and Source edit the selected definition, with pinned Save/Cancel actions.
The whole draft is validated before saving.

**New**, **Add relationship** and **Add property** preview inserted text in the file's style.
Renames list references and rewrite only the selected ones. Deletion lists dependent definitions
and mappings; references that cannot be safely rewritten are left for Source repair. Multi-file
changes are journaled, not silently applied in separate partial operations.

RDF item editing uses predicate/object rows or a resource-local Source fragment. Every proposed
edit must produce exactly the original graph minus intended removals plus intended additions.
Changing unrelated resources is refused. Statements with adjacent comments require confirmation
before removal. A refusal is shown once and retains its jump to Source.

| Serialization | Preserved-edit scope | Source-only cases |
| --- | --- | --- |
| N-Triples | Changed whole lines | Unsupported document syntax |
| Turtle | Changed predicate/object pairs | Statements the editor cannot split safely |
| N3 | Turtle-style statement edits | Resources involved in formulae or rules |
| RDF/XML | Changed property elements | Collections, reification, `rdf:li`, nested descriptions |

The source editor supports YAML, JSON, Turtle, N3, N-Triples and RDF/XML highlighting, folding,
search/replace, Go to line, undo/redo and inline findings. Extension JSON inside YAML is colored as
JSON; supported embedded expressions are colored as SQL. Plain text and `.gitignore` stay plain.
Validation runs in a worker after a 300 ms pause and reports exact lines where available.
Document-level findings remain listed when a reliable location cannot be produced.

YAML documents above 500,000 characters open in large-file mode with viewport-based embedded
language coloring and indentation folding. **Full parsing** overrides that budget until another
document opens. Editing or an external replacement of the same document retains the chosen mode.

### Validation coverage and limits

Each definition is limited to 2,000,000 UTF-8 bytes. Validation includes syntax, duplicate keys,
unsupported YAML tags and unsafe alias expansion, duplicate identifiers, dangling references,
inheritance cycles, declared keys/joins and supported schema checks. Ordinary relationship cycles,
self-links and disconnected components remain legal.

ODCS 3.1.0 and versioned Ossie 0.2.0.dev0 definitions use pinned companion schemas. Other versions
and legacy/unversioned layouts report their more limited structural coverage. RDF/XML is checked
for XML errors and rejects DTD/entity declarations. RDF imports never fetch remote ontologies or
`owl:imports`.

OWL restriction and SHACL definition checks are selected structural checks, not full logical or
standards conformance. JSON-LD, TriG, N-Quads, OWL/XML, Functional Syntax and Manchester syntax are
not supported inputs. See [schema provenance](../schemas/README.md).

### SQL expressions

Ossie semantic fields, metrics and mapping expressions, ODCS SQL quality rules and transform logic
share SQL highlighting and syntax warnings in the editor and API. ANSI and `OSSIE_SQL_2026` use the
PostgreSQL grammar; Snowflake and BigQuery have their grammars, and Databricks uses Hive coverage.
`${name}` placeholders are allowed. DAX, MDX, MAQL and other non-SQL dialects remain plain with a
not-checked note. Warnings retain their original locations through YAML scalar styles and JSON
escapes, never modify bytes, and never block saving. Nothing is executed.

## Metrics and governed definitions

The **Metrics** tab lists every metric in the open file's project. Search and the Group by, Type, Status
and Owner selects beside it support owner, type, status, concept and file views; **Governed only** keeps metrics with workbench
attributes. A metric without attributes can use **Add attributes** without changing its name or
formula. Metric badges connect concepts and graph nodes to the relevant definitions.

Each detail explains:

- **What it is:** description, type, additivity, unit, status, ownership and measured concept.
- **How it is calculated:** formula in words, dependent metrics and fields, time/grain/breakdown
  rules, additivity, missing values, division-by-zero behavior and a SQL preview, all shown
  without opening anything.
- **Where inputs come from:** semantic fields and sources, ODCS tables/properties and declared
  quality/service-level information.

Changing grains, breakdowns or rollup choices updates the preview, or refuses an invalid
combination such as summing ratios or rolling up incompatible stock grains. These are definition
checks, not measured results.

**New metric** is an eight-step wizard: concept, model, type and inputs, time/breakdowns, targets,
ownership/status, explanation/preview and exact file changes. It stores one governed expression,
not a second copy of a formula. Save writes the semantic definition and its concept binding as one
journaled operation. Projects without a mapping document receive a minimal standalone mapping.

Attributes use `custom_extensions` with `vendor_name: SEMANTIC_WORKBENCH` in the Ossie model.
Bindings live in the mapping root, or the embedded model of a consolidated Ossie file, under the
preserved storage key `kpi_bindings`. These are application extensions, not standard Ossie
semantics. Their schemas are versioned under `schemas/`.

Metric statuses are draft, proposed, approved and deprecated. The metric field editor reopens an
approved metric as proposed when its definition changes beyond governance fields. That is not a
universal rule for raw Source saves: server guards apply according to the caller's permission and
the write path. Authorized approvers can retain approval where the guard permits the change;
incoming-content operations can refuse rather than demote it. Deprecation needs a replacement or
reason. See [the server governance rules](server-mode.md#governed-content).

## Ontology mappings and agent context

The **Mappings** view resolves ontology → mapping → semantic model → physical source. Object,
referent and link mappings retain source evidence and report missing or ambiguous references.
Bindings are grouped by dataset. The concept list and the bindings scroll on their own inside the
tab; each dataset group shows its first five bindings and **Show N more** reveals ten at a time,
**Show fewer** folds them again, and a long concept list works the same way. The tab lists only the
mappings of the open file's project, says so when that project has none, and asks you to open a
project when no file is open. Search includes unbound concepts; empty views offer Source navigation
for the selected mapping document. **Compose a query…** selects mapped fields/metrics and previews a
newly composed governed query. **Export agent context** downloads metadata.

For mapping files, **Graph** shows concepts and relationship rows, datasets/fields, metrics and
resolved mapping lines. Select a row to highlight its bindings and relevant joins. **Unmapped
only** exposes unbound concepts and fields. Findings retain their own message and **Edit item**
action. Consolidated files can switch between mapping and ontology graphs.

Both split Ossie files and deprecated consolidated `ontology_mappings` layouts are supported.
Other mixed single-file layouts are rejected with a description of the supported alternatives.
Agent endpoints expose catalog, context and plans; the workbench does not call a hosted language
model. See [agent runtime and protocol](agent-runtime.md).
