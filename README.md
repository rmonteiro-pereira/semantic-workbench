# Semantic Workbench

Standalone React + TypeScript + Vite+ application with a local Bun API and SQLite persistence. Explore and edit data contracts, semantic models, ontology definitions and RDF graphs.

## Run

Requires Bun 1.4+:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:5173. API: http://127.0.0.1:4310. Both bind to loopback. Original document sources and indexed entities are saved together in SQLite transactions. Updates check revisions to prevent overwrites. Data is in `data/workbench.sqlite`; back up `data/` with the app stopped.

## Supported inputs

| Input | Serialization | Editing and validation |
| --- | --- | --- |
| ODCS | YAML / JSON | Form descriptions and full source; pinned official v3.1.0 schema validation |
| Ossie semantic model | YAML / JSON | Current flat model and legacy model arrays; official 0.2.0.dev0 schema validation for versioned flat models |
| Ossie ontology | YAML / JSON | Concepts, roles, inheritance, descriptions and full source; structural checks |
| RDF | Turtle, N-Triples, N3, RDF/XML | Native RDF parser, full source editing and original serialization export |
| OWL | Turtle or RDF/XML (.owl, .rdf, .ttl, .xml) | Classes, object/datatype properties, restrictions, annotations; native definition inspector |
| SHACL | Turtle or RDF/XML (.shacl, .ttl, .rdf, .xml) | Node shapes, property constraints, targets, paths, typed literals and blank nodes |

File extensions help choose parsers; `.owl` is not treated as a serialization by itself. RDF/XML requires valid RDF/XML, not OWL/XML. JSON-LD, TriG, N-Quads, OWL Functional Syntax and Manchester syntax are not yet supported. Imported RDF is parsed locally without fetching `owl:imports` or remote documents. SHACL shapes are inspectable definitions; this application does not execute SHACL validation or OWL reasoning.

Select multiple files with **Import definitions**. Documents are saved individually. The source editor always preserves the imported text until you edit it. RDF form descriptions are read-only; edit RDF in Source. YAML form changes retain comments and unknown fields; JSON form changes retain JSON syntax. Versioned contract/semantic documents receive their available official schema checks; other formats receive syntax and selected structural checks, not blanket conformance certification.

## Commerce example workspace

Click **Load commerce workspace** in the sidebar. It loads seven related documents into SQLite:

- `commerce.odcs.yaml`: a contract for customers, orders, order lines and products, with types, keys, ownership and business-definition IRIs.
- `sales.ossie.yaml`: four datasets, three joins and three sales metrics; physical sources match the contract exactly.
- `commerce-business.ossie.yaml`: eight business concepts sharing IRIs with the OWL ontology.
- `commerce.owl.ttl` and `commerce.owl`: OWL in Turtle and RDF/XML, including inverse properties and an existential restriction.
- `commerce.shacl.ttl`: required customer email, nonnegative order amount and required order lines.
- `commerce-data.ttl`: an eight-resource order-to-cash lifecycle.

The example is fictional and illustrative. **Shared references** in an entity's inspector links other documents containing its exact physical source or IRI. This is explicit reference matching, not inferred equivalence or a cross-document query engine.

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

Checks cover all commerce input formats, exact scale counts, native RDF identity and typed constraints, RDF/XML/Turtle OWL IRI equivalence, malformed inputs, official schemas, transactional saves, graph cycles, 5,000 entities / 15,000 links, relationship selection/editing, multi-format uploads and browser errors. Browser checks mock the API to protect user data. Screenshots go to `/tmp/`.

## Established complex business model: OASIS UBL 2.3

**Load UBL business model** opens a schema-derived procurement-to-payment workspace with **45 business entities and 277 named aggregate relationships**. It covers Order, Invoice, DespatchAdvice, ReceiptAdvice, CreditNote, parties, products, fulfillment, transport, taxation, banking and settlement. The example files are in `public/examples/ubl/`, including extraction provenance in `model-map.json`.

Ossie ontology and OWL share the same 45 concepts. Source role names and occurrence counts come from OASIS's published XSDs. SHACL projects those selected aggregate-role cardinalities. The ODCS and semantic artifacts model an analytical normalization with 169 datasets and 401 joins; repeatable roles use bridge tables. These surrogate keys and relational mappings are application choices, not an official UBL relational model or official OASIS ontology. Both versioned analytical artifacts pass their official companion schemas.

Source: https://docs.oasis-open.org/ubl/UBL-2.3.html . Regenerate with `python3 scripts/extract-ubl.py` then `bun scripts/ubl-example.ts`. Verify browser loading with `bun scripts/ubl-browser-check.ts`.

## UI regression, export and targeted mutation checks

With the dev server running:

```sh
bun run test:ui
bun run test:mutation
bun scripts/live-inspect.ts
```

The UI suite uses real browser downloads and an isolated in-memory SQLite store. It checks reopening existing examples (the previous blank-graph regression), grouped relationship selection, unobstructed controls, all UBL exports plus RDF/XML, unsaved edits, JSON export, re-import, document switching and alignment. `live-inspect.ts` uses the real running API and user workspace read-only, captures screenshots, and compares the live exported document with its SQLite source.

The mutation suite is **targeted**, not a whole-project mutation score. It checks 11 deliberate logic faults in layout, neighborhood filtering, grouping, exports, form edits and SQLite validation/revision checks, plus a browser-injected recreation of the blank-graph bug. Unmodified module baselines must pass, and every mutant must be detected. It writes temporary candidate modules under `/tmp`, never changes application sources, and removes temporary files afterward.

Graph connections group parallel relationships; the inspector exposes each original definition. Names appear on hover or selection, with a Labels toggle for inspecting all labels. Selecting an entity lists all its relationships. Long edges route above intervening columns. The sidebar scrolls documents independently and keeps example/import controls visible. API hot reloads no longer restart the frontend; the dev launcher owns both process groups and uses a strict frontend port.

## Complete interactive graph

The **Graph** tab is a real React Flow canvas, separate from the preserved **Overview** and relationship matrix. It retains every business entity and relationship, with directed parallel-link bundles exposing original definitions. It offers **Network (fCoSE)** and **Layered (ELK)** layouts, compound business-area boundaries, explicit overlap cleanup, area zoom, mini-map panning, selection highlighting, manual dragging, and **Fit model**.

Detailed edge routing uses React Flow Smart Edge's shared background worker. At whole-model zoom, the canvas uses inexpensive native paths; obstacle-aware routes are computed for visible or selected connections at useful detail. This avoids queueing thousands of costly routes for edges too small to inspect. Models above 250 visible business entities open with collapsed areas; click an area count, or use **Expand all**. Internal links remain folded into their area's count until expansion. The 45-entity UBL model opens fully expanded.

Research and architectural choices, including React Flow, ELK, Cytoscape/fCoSE and Sigma, are recorded in [docs/graph-design.md](docs/graph-design.md).

```sh
bun scripts/graph-browser-check.ts
bun scripts/large-graph-browser-check.ts
EXPAND_ALL=1 bun scripts/large-graph-browser-check.ts
```

The large browser check covers the 1,000-entity / 5,000-relationship fixture, model preservation, cancellation back to overview, area expansion, all-node expansion, zoom, selection and worker routing. It uses an API fixture to protect user documents; the graph check uses the real SQLite workspace read-only. Screenshots are written to `/tmp/real-graph-*.png`.
