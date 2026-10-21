# Codex brief: Phase 9 ODCS contract overview and dataset pages (T141, T142)

You are implementing the user interface for ODCS data contracts in the Semantic Workbench
(`/home/rodrigo/projetos/semantic-workbench`, branch `001-workbench-improvements`). React 19 +
TypeScript, Bun 1.4, Vite+. The data layer is already written and tested; your job is the two
page components, their styles and their wiring into `src/main.tsx`.

**Hard rules:** do not commit; do not touch `data/`; do not modify tests or browser checks
(`tests/`, `scripts/`) to make them pass; do not add dependencies; do not change server code
(`server/`) or the data modules listed below. If something in the data layer looks wrong, stop
and say so in your final message instead of changing it.

## Tasks

- **T141** Contract overview page in `src/odcs/ContractOverview.tsx`.
- **T142** Dataset page with header and tabs Schema / Lineage / History / Quality in
  `src/odcs/DatasetPage.tsx`.
- Styles in a new `src/odcs/odcs.css` (imported by the components). Wire both into
  `src/main.tsx` (details below).
- T143 (in-place property edits from the schema table) is done by someone else afterwards. Build
  the Schema table so each row is rendered by a small `PropertyRow` component in
  `DatasetPage.tsx` that receives the object index, the property path and the property, so cells
  can later become editors. Do not implement editing.

## Requirements (spec)

- **FR-056** ODCS contracts MUST have an overview: identity and status, servers, team and roles,
  SLA properties, quality rules, support, pricing and custom properties when present, plus a
  searchable object list with property counts, key indicators and quality rule counts.
- **FR-057** Each schema object MUST have a dataset page with a header (type, property count,
  quality rule count, last change, tags) and tabs: Schema (property table: name, logical type,
  physical type, required, unique, primary key, classification, description, tags, foreign keys
  linked to targets; sortable and filterable), Lineage (graph centered on the object with depth
  control: foreign-key neighbors and downstream semantic datasets, fields, metrics, KPIs;
  property-level lineage), History (versions from Git with property-level changes between two
  versions), Quality (rules with dimension, severity, operators and thresholds, as declared; no
  rule is executed).
- **FR-058** (later, T143) editable values edited in place with minimal source change.
- User Story 8 acceptance: every property's type, required flag and key status is readable
  without Source; lineage from `orders` reaches the sales metrics; after two committed edits,
  History shows both versions with the changed fields; with 169 objects (UBL) the object list
  stays searchable and usable.
- Style reference: Marquez dataset pages (a header with key facts, then tabs). Keep the
  workbench's own look, not Marquez's.

## UI contract (must match exactly; the browser check uses these names)

`contracts/ui-contracts.md`: "ODCS dataset page | header facts; tabs "Schema", "Lineage",
"History", "Quality"; property `table`". In detail:

- `src/main.tsx`: a `.tabs` button named **Contract** (icon `FileCheck2` or similar from
  `lucide-react`), shown only when the open document's model kind is `'ODCS'`
  (`model?.kind==='ODCS'`), placed first in the tab bar. New `tab` value `'contract'`, rendered in
  the `.canvas` view chain (next to `tab==='scm'` / `tab==='metrics'`). Keep a selected object
  name in state (reset when another document opens). If the tab is `'contract'` and the open
  document is not ODCS, show the graph (`'fullgraph'`) instead. Do not switch tabs automatically
  when an ODCS file is opened.
- **Overview**: `<section aria-label="Contract overview">` with an `h2` = contract `name`; facts
  (version, status, domain, dataProduct, apiVersion, id, tenant when present) and the
  description (`purpose`, `limitations`, `usage`). Sections, each a `<section aria-label=…>`
  shown only when present: **Servers**, **Team and roles** (`team` and `roles`), **Service
  levels** (`slaProperties`: property, value, unit, element), **Quality** (contract-level rules
  and the total number of object/property rules), **Support**, **Pricing**, **Custom
  properties**. Then a searchbox **Find an object** (`<input type="search" aria-label="Find an
  object">`) and a table `<table aria-label="Schema objects">` with columns Object, Physical
  name, Type, Properties, Keys, Quality rules, Description, one row per object (header row +
  N rows; filtered rows are removed, not hidden with CSS). The Keys cell reads e.g. `1 PK · 1 FK`
  (primary-key properties; foreign keys from that object = `odcsForeignKeys` entries with
  `from` = this object). Each row has a button named **Open &lt;object name&gt;** (exact) that opens
  the dataset page. Filtering 169 objects must feel instant (no per-keystroke heavy work).
- **Dataset page**: `<section aria-label="Dataset <name>">`, a button **All objects** back to
  the overview, an `h2` = object name, the physical name, the description, and a
  `<div role="group" aria-label="Dataset facts">` containing: type (`physicalType`, plus
  `logicalType`), `<n> properties`, `<n> quality rules` (object + property rules), last change
  (message, short commit, date, author — from `lastChange` over the file's versions; "Not
  committed yet" if none), tags. Tabs: `<div role="tablist" aria-label="Dataset views">` with
  `role="tab"` buttons Schema, Lineage, History, Quality (`aria-selected`), Schema selected first.
- **Schema tab**: searchbox **Filter properties**; `<table aria-label="Properties">` with column
  headers containing Name, Logical type, Physical type, Required, Unique, Primary key,
  Classification, Description, Tags, Foreign keys; each header has a button **Sort by &lt;column&gt;**
  that toggles ascending/descending (first click ascending); default order is source order. One
  row per property, nested properties flattened with `flattenProperties` (dotted paths). Cell
  order follows the columns: name, logical type, physical type, then booleans shown as **Yes**
  or empty, etc. The first `td` is the property name/path. Foreign keys cell: one button per
  target named **Open &lt;target object&gt;** that navigates to that object's dataset page (targets
  from the property's `relationships[].to`, `object.property` or `schema/<id>/properties/<id>`
  notation; also schema-level relationships whose `from` names this property).
- **Lineage tab**: `<select aria-label="Lineage depth">` with options `1`…`max(1, maxDepth)`,
  default `2` (or max if smaller). A `<div role="region" aria-label="Lineage graph">` showing
  `odcsLineage(files, path, objectName, depth)`: nodes laid out in columns by depth (center at
  depth 0), each node an element with attribute `data-lineage-kind` = node kind
  (`object|dataset|field|metric|kpi`) and the node label as its text; draw the edges (inline SVG
  is fine) with foreign keys visibly different from downstream edges; a small legend. Large
  lineages (mall `occupancy_snapshots`, depth 6) must stay readable: columns scroll inside the
  region, not the page. Then `<table aria-label="Property lineage">`: one row per property of the
  object with the fields and metrics that read it (from `lineage.properties`).
- **History tab**: load `scm.versions(project, path, 20)` (newest first; `source` text) and parse
  each with `parse` from `yaml` (JSON parses too). `<table aria-label="Versions">`: header + one
  row per version: contract `version`, date, author, message, the object's property count in
  that version. Two selects **From version** / **To version** whose option values are the full
  commit ids (default: second newest → newest). A
  `<section aria-label="Changes between versions">` listing `diffObject(fromData, toData, name)`:
  added / removed / changed properties (the words added/removed/changed visible) and, for changed
  ones, each attribute with before → after values (JSON for non-strings), plus object-level
  attribute changes. If there are fewer than two versions, say so. Refetch when the file changes
  (the page receives a `version`/hash prop).
- **Quality tab**: `<table aria-label="Quality rules">`: header + one row per declared rule of the
  object and its properties (scope: object or property name), name, dimension, severity, type,
  metric/rule/query, operator and threshold (`mustBe`, `mustNotBe`, `mustBeGreaterThan`,
  `mustBeGreaterOrEqualTo`, `mustBeLessThan`, `mustBeLessOrEqualTo`, `mustBeBetween`,
  `mustNotBeBetween`, shown as e.g. `= 0`, `between 1 and 5`), unit, description. Above it the
  sentence "Rules are shown as declared in the contract; the workbench does not run them." When
  there are none, say so (and keep the sentence).

## Data layer to use (do not modify)

- `src/odcs/lineage.ts`: `odcsLineage(files:{path,data}[], contractPath, objectName, depth)` →
  `{center,nodes,edges,properties,maxDepth}`; `objectId`.
- `src/odcs/odcs-diff.ts`: `diffObject`, `diffContracts`, `lastChange`, `flattenProperties`.
- `src/odcs.ts`: `odcsForeignKeys(data)` (`from`/`to` are schema indexes).
- `src/projects/api.ts`: `scm.versions(project,path,limit)`, type `Doc`.
- In `main.tsx`: the open document's parsed data is `(model as any).document`; the project's
  docs are `docs.filter(d=>d.project===current.project)` (`Doc` has `path`, `filename`, `source`,
  `hash`). For lineage, parse each project doc's source with `parse` from `yaml` in try/catch and
  skip RDF files (`rdfSyntax(source, filename)` from `src/rdf.ts`); memoize by hashes.
- Existing components/styles to reuse or imitate: tables like `.metrics-table` /
  `.metrics-table-wrap` in `src/metrics/metrics.css`; `src/metrics/Lineage.tsx` for the visual
  vocabulary (icons `Table2`, `Database`, `Gauge`); colors: text `#243936`, accent `#1e6a4f` /
  `#247d65`, borders `#dce4e2` / `#dbe3e4`, muted `#6f8881`. Code style: compact TypeScript as in
  `src/scm/SourceControl.tsx` (one-line helpers, short comments explaining why).

## Constitution rules that matter

- Nothing is executed: quality rules and metrics are shown as declared. Say so.
- Derived views never rewrite the source document (no saves from these pages in this task).
- Honest labels: workbench interpretations (lineage matching by physical name) are labelled as
  such ("matched by physical name").
- Local only: no network requests other than the existing `/api` calls.

## Polish findings to respect (do not make worse)

1. The sidebar Projects tree is cramped; do not add anything to the sidebar.
6. A stale status toast persists after switching documents; do not add new toasts.
Layout: the page must fit the `.canvas` area; at 390×844 no horizontal page scroll (tables
scroll inside their own wrapper); the responsive suite must keep passing.

## Tests that must pass

- `bun test` (all), `bun --bun run check` (TypeScript), `bun --bun run build`.
- `bun run test:odcs` (`scripts/odcs-browser-check.ts`, the acceptance check for this work —
  needs the Vite dev server: `bun node_modules/vite/dist/vite/node/cli.js dev --host 127.0.0.1
  --strictPort` in the background; the check runs its own isolated API). Its in-place edit checks
  are added later; everything currently in it must pass.
- Must not break: `bun run test:ui`, `test:examples:ui`, `test:responsive`, `test:metrics`,
  `test:item-edit`.
If the sandbox prevents running the dev server or Chromium, say so in your final message and
report which checks you could run.

Final message: list the files you changed, what you ran and the results, and anything you were
unsure about.
