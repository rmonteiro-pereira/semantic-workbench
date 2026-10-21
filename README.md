# Semantic Workbench

Standalone React + TypeScript + Vite+ application with a local Bun API that stores each project as a Git-backed folder. Explore and edit data contracts, semantic models, ontology definitions and RDF graphs.

## Run

Requires Bun 1.4+ and, for version control of projects, Git 2.40+ with `user.name` and `user.email` configured (`git config --global user.name "Your Name"`, `git config --global user.email you@example.com`):

```sh
bun install
bun run dev
```

Open http://127.0.0.1:5173. API: http://127.0.0.1:4310. Both bind to loopback. Without Git, or without a Git identity, the workspace still opens and edits files; a banner explains what is missing, and projects are not committed until it is fixed and the API is restarted.

## Where your data lives

Everything stays under the data root, `data/` by default. Set `DATA_DIR` to use another folder (the tests and browser checks always use temporary ones):

```text
data/
├── projects/<project>/   one folder per project: your files, byte for byte, in a Git working tree
├── state/                projects.json (project registry), views/ (grouping corrections per file),
│                         drafts/, journal/ (unfinished multi-file operations), suggestions.json
│                         (dismissed grouping suggestions), legacy-ids.json
├── trash/<entry>/        deleted files and projects (with their .git), each with an entry.json
├── backup/               the v0.1.0 database copied before migration
└── cache.sqlite          index of hashes, entities and findings; safe to delete
```

The files in `data/projects/` are the only copy of your definitions. `cache.sqlite` is rebuilt from them on the next start if it is deleted or out of date; the project registry, view settings and drafts live in the JSON files under `state/`, which are always replaced atomically. Back up `data/` with the app stopped, or push projects to a Git remote.

Every save sends the SHA-256 of the version it started from. If the file changed in the meantime (another tab, an external editor, a Git command), the save is refused and both versions are shown side by side: keep editing, load the current file, or explicitly save your version over it. Saves write a temporary file and rename it over the original, so a crash leaves either the old or the new bytes. Imports and project creation are staged and moved into place through a journal; an operation interrupted by a crash is completed or rolled back on the next start, and the outcome is shown.

The API watches every project folder. Files you change, add or delete outside the workbench (an editor, a terminal, a Git checkout) appear in every open tab within about two seconds without a reload; an open file follows the disk unless it has unsaved edits. A full rescan also runs every 60 seconds. Files that `.gitignore` excludes and file types the workbench does not read (for example `.csv` or `.md`) are not listed; files of a supported type that fail validation are listed as invalid and open in Source for repair. As in Git, a file that is already committed stays listed even if `.gitignore` matches it.

**Organizing and cleaning up.** Every project and file in the **Projects** tree has an actions menu: rename a project (its folder keeps its id), import more files into it, move a file to another project, or delete. Every file and project row also has a trash icon at its right edge (muted until the row is hovered or focused, always visible on touch screens) that starts the same confirmation. **Clear workspace** and **Trash** sit below the tree. Nothing needs a script or a reload:

- Deleting asks first. The confirmation names everything that is removed, warns about unsaved edits that would be lost, and lists Ossie `ontology_ref`/`semantic_model_ref` references that would no longer resolve to any remaining file.
- A deleted file or project moves to `data/trash/<entry>/`; a project moves with its `.git` folder, so its history is kept. Git history is never rewritten: a deleted file shows up in Git as an ordinary deletion.
- **Undo** is offered for 10 seconds after a delete or Clear and puts everything back exactly as it was, including drafts and grouping corrections.
- After that, **Trash** restores entries or deletes them permanently; emptying the trash asks for confirmation. A restore never overwrites: if a file or project now occupies the original place, the workbench offers a free name instead. A file whose project no longer exists is restored into a new project with the old name.
- **Clear workspace** moves every project to the trash as its own entry, in one operation.
- Importing into an existing project a file whose name already exists asks whether to replace it or keep both (`name (2).ext`).

**Grouping suggestions.** When a file has explicit evidence that it belongs with another project, **Grouping suggestions** below the tree proposes adding it there and lists the evidence. Three kinds count: an Ossie `ontology_ref` or `semantic_model_ref` naming an ontology or semantic model declared in that project, an IRI shared with a file there, or an ODCS physical name equal to a semantic dataset `source` there. Names that are merely similar never count. A file is offered only when nothing links it to the other files of its own project, and only from the smaller project to the larger one (a file imported on its own joins the project it references, not the reverse). **Add to project** moves it; **Dismiss** is remembered for that file's content and target in `state/suggestions.json`. Nothing is regrouped automatically.

**Upgrading from v0.1.0.** On the first start with a `data/workbench.sqlite` from v0.1.0, the API copies that database (with its `-wal` and `-shm` files) to `data/backup/`, reads the copy, and writes every stored document's exact bytes into project folders: documents of a shipped example set go to that example's project, everything else to **Ungrouped**; duplicate filenames become `name (2).ext`. Each written file is read back and its SHA-256 compared with the stored bytes; any mismatch stops the migration before anything is moved into place, and it is retried on the next start. Each project then gets `git init` and one commit, "Import from Semantic Workbench v0.1.0". Old document ids keep resolving through `state/legacy-ids.json`, and saved grouping corrections move to `state/views/`. The original database is never opened or modified. The migration needs Git and a Git identity; without them it waits, leaves everything untouched and says so.

The workbench only opens folders under `data/projects/` and never contacts a network for these operations: Git runs locally with prompts disabled, and no remote is configured or contacted.

## Supported inputs

| Input | Serialization | Editing and validation |
| --- | --- | --- |
| ODCS | YAML / JSON | Form descriptions and full source; pinned official v3.1.0 schema validation; property- and schema-level foreign keys shown as relationships |
| Ossie semantic model | YAML / JSON | Current flat model and legacy model arrays; official 0.2.0.dev0 schema validation for versioned flat models |
| Ossie ontology | YAML / JSON | Concepts, roles, inheritance, built-in concepts; pinned 0.2.0.dev0 schema or unversioned compatibility checks |
| Ossie mappings | YAML / JSON | Standalone and embedded object/referent/link mappings; pinned schemas, cross-document runtime resolution and query planning |
| RDF | Turtle, N-Triples, N3, RDF/XML | Native RDF parser, full source editing and original serialization export |
| OWL | Turtle or RDF/XML (.owl, .rdf, .ttl, .xml) | Classes, object/datatype properties, restrictions, annotations; native definition inspector |
| SHACL | Turtle or RDF/XML (.shacl, .ttl, .rdf, .xml) | Node shapes, property constraints, targets, paths, typed literals and blank nodes |

File extensions help choose parsers; `.owl` is not treated as a serialization by itself. RDF/XML requires valid RDF/XML, not OWL/XML. JSON-LD, TriG, N-Quads, OWL Functional Syntax and Manchester syntax are not yet supported. Imported RDF is parsed locally without fetching `owl:imports` or remote documents. SHACL shapes are inspectable definitions; this application does not execute SHACL validation or OWL reasoning.

Select multiple files with **Import definitions**. One selection becomes one project, named after the ontology or semantic model it contains, and is committed as one Git commit. The sidebar's **Projects** tree lists each project's files with their document type and whether they are valid. The source editor always preserves the imported text until you edit it. RDF form descriptions are read-only; edit RDF in Source. YAML form changes retain comments and unknown fields; JSON form changes retain JSON syntax. Versioned contract/semantic documents receive their available official schema checks; other formats receive syntax and selected structural checks, not blanket conformance certification.

## Commerce example workspace

Click **Load commerce workspace** in the sidebar. It creates the project "Commerce workspace" with seven related documents (clicking again opens the existing project):

- `commerce.odcs.yaml`: a contract for customers, orders, order lines and products, with types, primary and foreign keys, ownership and business-definition IRIs.
- `sales.ossie.yaml`: four datasets, three joins and three sales metrics; physical sources match the contract exactly.
- `commerce-business.ossie.yaml`: eight business concepts sharing IRIs with the OWL ontology.
- `commerce.owl.ttl` and `commerce.owl`: OWL in Turtle and RDF/XML, including inverse properties and an existential restriction.
- `commerce.shacl.ttl`: required customer email, nonnegative order amount and required order lines.
- `commerce-data.ttl`: an eight-resource order-to-cash lifecycle.

The example is fictional and illustrative. **Shared references** in an entity's inspector links other documents containing its exact physical source or IRI; Ossie QName IRIs are expanded with the document `prefixes`, so `core:Party` matches `https://…/core#Party` in OWL, SHACL, RDF or ODCS business definitions. This is explicit reference matching, not inferred equivalence or a cross-document query engine.

**Load commerce scale data** adds `commerce-scale.ttl`: exactly 1,000 synthetic business resources and 5,000 explicit business links, plus type and label triples. These are customers, orders, order lines, products, shipments, invoices, payments and warehouses, not thousands of invented ontology classes. This is a navigation benchmark, not a business-rule validated dataset. Regenerate examples with `bun scripts/commerce-example.ts`.

Example files are under `public/examples/commerce/` and downloadable at `/examples/commerce/<filename>`. Earlier benchmark files and documents are retained; they are not used by the current workspace examples.

## Graph exploration

Large graphs open a bounded neighborhood of up to 8 resources. Search uses names and IRIs and includes connected resources. **Graph** opens the complete interactive model; **Overview** retains the business-area map and relationship matrix. Large graphs support collapsing and expanding areas. The catalog exposes all definitions; OWL's default graph projects class-to-class property links while the full graph also shows property resources and restrictions. RDF literals remain in entity definitions rather than becoming nodes. Blank nodes retain their identity within each parsed document.

Click nodes or relationships to inspect their source definitions. Relationship inspection includes endpoints, roles, multiplicity, verbalizations, join keys or RDF predicates. **Auto align** runs a deterministic layered traversal in a Web Worker and fits the visible graph. It handles cycles and disconnected components in linear time but does not minimize crossings. Ontology n-ary relationships expand into navigation edges referring to the same original definition. Metric edges show explicit dataset references in expressions, not observed execution lineage.

## Verification

```sh
bun test
bun --bun run check
bun --bun run build
```

Browser checks require a running dev server and Playwright Chromium:

```sh
bun node_modules/@playwright/test/cli.js install chromium
bun scripts/commerce-browser-check.ts
bun scripts/relationship-browser-check.ts
bun scripts/browser-check.ts
```

Checks cover all commerce input formats, exact scale counts, native RDF identity and typed constraints, RDF/XML/Turtle OWL IRI equivalence, malformed inputs, official schemas, transactional saves, graph cycles, 5,000 entities / 15,000 links, relationship selection/editing, multi-format uploads and browser errors. Browser checks run the API on a temporary data root and send the page's `/api` requests there, so they never touch your workspace. `commerce-browser-check.ts`, `relationship-browser-check.ts` and `browser-check.ts` predate the current layout and also fail on v0.1.0 (stale selectors); they are kept for reference until they are updated. Screenshots go to `/tmp/`.

## Established complex business model: OASIS UBL 2.3

**Load UBL business model** opens a schema-derived procurement-to-payment workspace with **45 business entities and 277 named aggregate relationships**. It covers Order, Invoice, DespatchAdvice, ReceiptAdvice, CreditNote, parties, products, fulfillment, transport, taxation, banking and settlement. The example files are in `public/examples/ubl/`, including extraction provenance in `model-map.json`.

Ossie ontology and OWL share the same 45 concepts. Source role names and occurrence counts come from OASIS's published XSDs. SHACL projects those selected aggregate-role cardinalities. The ODCS and semantic artifacts model an analytical normalization with 169 datasets and 401 joins, declared in the contract as ODCS foreign keys; repeatable roles use bridge tables. These surrogate keys and relational mappings are application choices, not an official UBL relational model or official OASIS ontology. Both versioned analytical artifacts pass their official companion schemas.

Source: https://docs.oasis-open.org/ubl/UBL-2.3.html . Regenerate with `python3 scripts/extract-ubl.py` then `bun scripts/ubl-example.ts`. Verify browser loading with `bun scripts/ubl-browser-check.ts`.

## UI regression, export and targeted mutation checks

With the dev server running:

```sh
bun run test:ui
bun run test:responsive
bun run test:edges
bun run test:grouping-validation
bun run test:projects
bun run test:trash
bun run test:mutation
bun scripts/live-inspect.ts
```

`bun run test:trash` checks the row trash icons (muted until hover or focus, keyboard reachable, at least 28 px, no overlap with the filename at 390 px and 2560 px, visible without hover on touch), suggestions (accept and dismiss), delete confirmation with its warnings, Undo, restore and permanent delete from the trash, project delete and restore, and Clear with Undo, all without a page reload. `bun run test:projects` checks the project tree, an external edit appearing in an open tab within 2 seconds, a stale save from a second tab, and a restart after deleting `cache.sqlite` (projects, files, view settings and drafts are restored).

The UI suite uses real browser downloads and an API on a temporary data root. It checks reopening existing examples (the previous blank-graph regression), grouped relationship selection, unobstructed controls, all UBL exports plus RDF/XML, unsaved edits, JSON export, re-import, document switching and alignment. `live-inspect.ts` uses the real running API and workspace read-only (every non-GET request is refused), captures screenshots, and compares the live exported document with its project file.

The responsive suite checks six viewports from 390×844 through 2560×1440, including 1280×720 and 1366×768 desktops. It verifies canvas space, contained controls, project-tree rows whose names end before their delete and menu icons, workspace drawer keyboard access, selection-centered neighborhoods, relationship details, repeated view changes and resizing. Screenshots go to `/tmp/workbench-responsive-*.png`. The compact header and collapsible workspace preserve canvas space; details appear only when selected.

`bun run test:edges` measures Flights SVG endpoints against rendered entity borders during entity and business-area dragging, zooming, selection, and both layout modes. Worker routes render only when their endpoints match the current React Flow handles; live curves keep connections attached while dragging or waiting for a fresh route.

The mutation suite is **targeted**, not a whole-project mutation score. It checks 60 deliberate logic faults in validation, RDF definitions, size limits, layout, neighborhood filtering, grouping, exports, form edits and the folder store (a dropped base-hash check, an invalid save accepted, a write in place instead of temporary file and rename, skipped migration hash verification, `..` and `.git` paths accepted, no origin check on the event stream, journal recovery that always rolls forward, undo after the 10-second window, a restore that overwrites, suggestions from similar names, deletion without the confirmation flag), plus a browser-injected empty neighborhood node projection. Unmodified module baselines must pass, and every mutant must be detected. It writes temporary candidate modules under `/tmp`, never changes application sources, and removes temporary files afterward.

**Group by → IRI namespaces** places each definition in the namespace of its IRI, labelled with the declared prefix of the longest matching namespace (Ossie `prefixes`, or the RDF document's prefixes). Definitions without an IRI are listed under **No IRI**. Auto grouping picks namespaces when business entities use at least two declared prefixes and no domains are declared.

Graph connections group parallel relationships; the inspector exposes each original definition. Names appear on hover or selection, with a Labels toggle for inspecting all labels. Selecting an entity lists all its relationships. Long edges route above intervening columns. The sidebar scrolls documents independently and keeps example/import controls visible. API hot reloads no longer restart the frontend; the dev launcher owns both process groups and uses a strict frontend port.

## Complete interactive graph

The **Graph** tab is a real React Flow canvas, separate from the preserved **Overview** and relationship matrix. It retains every business entity and relationship, with directed parallel-link bundles exposing original definitions. It offers **Network (fCoSE)** and **Layered (ELK)** layouts, a **Value types** switch that hides value types and built-in concepts with their relationships (remembered per model in this browser), compound business-area boundaries, explicit overlap cleanup, area zoom, mini-map panning, selection highlighting, manual dragging, and **Fit model**.

Detailed edge routing uses React Flow Smart Edge's shared background worker. At whole-model zoom, the canvas uses inexpensive native paths; obstacle-aware routes are computed for visible or selected connections at useful detail. This avoids queueing thousands of costly routes for edges too small to inspect. Models above 250 visible business entities open with collapsed areas; click an area count, or use **Expand all**. Internal links remain folded into their area's count until expansion. The 45-entity UBL model opens fully expanded.

Research and architectural choices, including React Flow, ELK, Cytoscape/fCoSE and Sigma, are recorded in [docs/graph-design.md](docs/graph-design.md).

```sh
bun scripts/graph-browser-check.ts
bun scripts/large-graph-browser-check.ts
EXPAND_ALL=1 bun scripts/large-graph-browser-check.ts
```

The large browser check covers the 1,000-entity / 5,000-relationship fixture, model preservation, cancellation back to overview, area expansion, all-node expansion, zoom, selection and worker routing. It uses an API on a temporary data root; the graph check reads the real workspace without changing it. Screenshots are written to `/tmp/real-graph-*.png`.

## Input validation and repair

The browser, inspector, folder store, and HTTP save endpoint share the same validation rules. Invalid documents are rejected before any file is written. All imports in a selected batch are preflighted before saving; a batch containing errors opens **Review import**. Choose a file, inspect errors and warnings, edit the source or filename, and import when all errors are resolved. Cancel or Escape returns to the untouched open document. A batch is written all or nothing: if the API fails, nothing from the batch is imported and the repaired drafts stay in the dialog for a retry.

Invalid edits remain in **Source**, with Save disabled and findings showing JSON-pointer paths and YAML/JSON line/column locations. **Validation details** exposes coverage warnings even on valid documents. **Go to line** focuses the source editor. Export continues to preserve draft bytes, including invalid drafts, so work can be recovered externally. A valid file's graph, overview, catalog, relationship inspector, and export controls retain their existing behavior.

Checks include:

- YAML/JSON syntax, duplicate mapping keys, unsupported tags, alias expansion limits, cyclic aliases, supported serializations, filenames, and a 2,000,000-byte UTF-8 input limit. N-Triples uses a strict N-Triples parser; RDF/XML is checked for XML errors before RDF parsing and rejects DTD/entity declarations.
- Official pinned ODCS 3.1.0 and Ossie semantic 0.2.0.dev0 schemas. Other versions and legacy wrappers report their structural-only coverage. Versioned Ossie ontologies and mappings use pinned official 0.2.0.dev0 schemas; unversioned ontologies retain the compatibility profile. Schema checks do not certify full semantic conformance.
- Scoped duplicate concept/dataset/field/metric/relationship names, duplicate ontology IRIs, dangling concept/parent/dataset references, inheritance cycles, declared primary keys and join fields, and composite join arity. Missing field catalogs produce a warning instead of incorrectly rejecting externally defined columns. Arbitrary SQL expressions are checked structurally, not parsed or executed.
- Inheritance uses iterative Kahn topological elimination in O(V + E), tested on 20,000-node chains and cycles. Ordinary relationship cycles, self links, multiple parents, disconnected components, and parallel links remain legal.
- Ossie ontology global identifiers: `iri` on concepts and relationships accepts a full IRI or a `prefix:local` QName whose prefix is declared in the top-level `prefixes` map; undeclared prefixes and duplicate expanded concept IRIs are rejected. `uri` is not an Ossie field: versioned ontologies report it with a rename-to-`iri` hint, and unversioned ones warn that it is ignored.
- RDF syntax; selected OWL restriction checks (property, qualifier, cardinality, hasSelf); selected SHACL definition checks (property paths including sequences/alternatives/inverses, cycles in path expressions, count/length bounds, typed flags and IRI parameters). External class/property IRIs are allowed and never fetched.

These are input and supported-definition validators. They do not certify full OWL profile conformance or logical satisfiability, execute SQL, fetch imports, or apply SHACL shapes to a separate data graph. SHACL advanced/SPARQL constraints are preserved but not evaluated. Full standards reasoning needs a separate engine.

`tests/validation.test.ts` includes malformed and positive cases for every supported input family and revalidates all shipped examples. `tests/api-validation.test.ts` and `tests/files-api.test.ts` exercise the actual HTTP handler against a temporary data root. `bun run test:ui` covers repair, mixed batches, cancellation, invalid source/save recovery, original graph navigation, and byte-exact exports; screenshots are written to `/tmp/workbench-validation-*.png`. `bun run test:mutation` includes deliberate removal of duplicate, reference, cycle, join, schema, size, SHACL, and OWL checks.

Standards references: [ODCS schema](https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json), [Ossie semantic specification](https://github.com/apache/ossie/blob/main/core-spec/spec.md), [W3C SHACL](https://www.w3.org/TR/shacl/).

## Ontology mappings and agent tools

**Load mapped commerce** demonstrates separate ontology, semantic model, and mapping documents. The **Mappings** tab resolves object/referent/link mappings, displays source evidence and physical sources, exposes governed metrics and AI metadata, exports agent context, and composes a new revenue-by-region SQL preview from selected building blocks. Missing or ambiguous document/field/concept references are reported. Existing Graph, Overview, Catalog, Source, import repair and byte-exact source export remain available.

Standalone mapping documents and deprecated embedded `ontology_mappings` are supported using pinned Apache schemas. Agent clients can call `/api/agent/catalog`, `/api/agent/context`, and `/api/agent/plan`. The runtime supplies explicit mapping traversal and immutable metric definitions; callers supply language interpretation and any external query execution. No hosted LLM is required or called. See [agent runtime and integration protocol](docs/agent-runtime.md) for examples, supported composition, graph integrity checks, and limits.

## Reproducible example execution

The generated [subscription billing example](public/examples/billing/README.md) has 36 business entities, 46 joins, 119 mapping bindings, four governed metrics and an executable synthetic SQL fixture. It verifies revenue, recurring revenue, distinct invoice counts, dependent ratios, computed fields and missing-dimension fact preservation.

```sh
bun run examples:generate
bun run test:examples
# With the dev server running:
bun run test:examples:ui
```

All five [official Apache Ossie examples](tests/fixtures/ossie-mapping/README.md) are pinned and hash-checked without modifications. Use **Load Ossie Flights** in the workspace sidebar to open the official ontology graph and load its semantic model plus standalone and embedded mappings. Both mapping forms resolve and are tested through the UI. TPC-DS imports with a warning for an unexposed physical primary-key column; window expressions remain preserved rather than being executed by the current planner. [Verification results and SQL](docs/example-verification.json) record 20 actual synthetic-fixture SQL executions. Browser screenshots are saved under `/tmp/`.

## Grouping and validation navigation

The graph and overview share a grouping selector: declared domains, suggested communities, definition types, and the explicitly curated UBL example areas. Flights has no declared domains: its suggested communities derive from a deterministic, bounded modularity pass over business relationships. Inheritance, direction, duplicate links and primitive hubs do not influence those suggestions. Shared values remain separate; every relationship stays available. Grouping details explain the basis and offer per-entity corrections saved as view settings in `data/state/views/`. Original definitions and exports are unchanged. ODCS contract-level domain declarations are retained.

Source and import-repair editors show numbered lines, red error highlights and amber warning highlights. Findings include named feature paths, offending source snippets and correction guidance. Go to line selects and scrolls to the affected line. Findings without a reliable location remain explicitly document-level. `bun run test:grouping-validation` verifies mode changes, persisted corrections, byte-exact exports, line highlighting and safe repair cancellation in an isolated browser workspace.

## Shopping center administration example

**Load shopping center administration** opens a reference model for retail real-estate administration: 145 entity types in eleven namespaced modules (core, asset, party, lease, legal, hr, proc, ops, fin, perf, kpi), 259 declared joins, 1,056 mapping bindings and 25 governed KPIs, including occupancy rate, minimum rent per m², delinquency rate, sales per m², occupancy cost ratio, footfall, net operating income, payroll cost, headcount, purchase spend and payables outstanding. Leasing, operations, legal, HR, procurement and finance share one contract register and one party model. The same specification produces Ossie, OWL, SHACL, ODCS and RDF instance data, plus a synthetic SQLite fixture whose KPI results are checked against independently computed values. See [the example README](public/examples/mall/README.md). Regenerate with `bun scripts/mall-example.ts`.
