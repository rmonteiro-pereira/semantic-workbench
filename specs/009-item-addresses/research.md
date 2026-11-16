# Research: Item Addresses

Everything below was checked in the code or in the pinned schemas on this branch. A claim from a
review that could not be reproduced is marked.

## What exists today

| Fact | Where | Consequence |
| --- | --- | --- |
| An entity id is its path in the file (`ontology/3`, `schema/0`, `datasets/2`), built with `path.join('/')` | `src/shared/core/model.ts:125-129` | An insert above an item changes the id of every later one. Ids are fine as React keys, wrong as references. |
| Edge ids use a running counter (`r-<i>-<n>`, `fk-<n>`) | `src/shared/core/model.ts:213-250` | Edges need an address derived from their endpoints and label, not from the counter. |
| Mapping canvas ids are `concept:<n>`, `dataset:<n>`, `metric:<n>`, and fields `dataset:<d>/<f>` | `src/app/mappings/mapping-graph.ts:70-76` | First adopter. A field named `a/b` already collides here. |
| Agent context labels are `concept:<n>`, `dataset:<n>`, `field:<d>.<f>`, `metric:<n>`, `join:<n>` | `src/server/agent/context-assembly.ts:136-172` | Second notation. `field:a.b.c` is ambiguous when either part contains a dot. |
| Metric extensions store `dataset.field` and the schema pattern is `^[^.\s]+\.[^.\s]+$` | `schemas/semantic-workbench-metric-v1.json` (`fieldRef`) | A stored notation inside user files. It cannot name a dataset or field containing a dot or space. It is read through an adapter and never rewritten. |
| ODCS lineage ids are built with `objectId(contractPath, name)` and property paths with a `.` prefix join | `src/app/odcs/lineage.ts:245-280` | A third notation, and a dotted property name splits it. |
| Concept names are `{type: string}` with no pattern | `schemas/ossie-ontology-0.2.0.dev0.json` (`OntologyComponent.concept`) | `:`, `.`, `#`, `/`, `@` are all legal in names. |
| Duplicate names are reported per scope: datasets in one scope, model relationships (joins) in another, relationships of a concept in a third | `src/shared/validation/validation.ts:78-88`, `:200`, `:246`, `:260` | A dataset and a join can share a name legitimately, so a name alone is not a key and a kind is needed. |
| Concept IRIs are checked for uniqueness and expanded with the document's prefixes | `src/shared/validation/validation.ts:185-192`, `src/shared/validation/iri.ts`, `src/shared/core/references.ts` | Identity for concepts already exists and is reusable. Relationships may declare an `iri` too. Fields, datasets, metrics and joins have none. |
| Document id is `<project slug>/<path>` | `src/server/projects/workspace.ts:240` | Document identity is already the path, so the grammar reuses it. |
| `renameProject` changes `name` and keeps the slug | `src/server/projects/workspace.ts:782-794` | The slug is stable identity for a project. |
| The rename flow reads references with `findReferences`, rewrites ticked ones with `rewriteReferences`, then saves one file with `api.save` or several with `api.saveBatch` (`/api/projects/<slug>/save-batch`) | `src/app/edit/ItemEditor.tsx:91-150`, `src/server/routes/kpis.ts:17-42` | The place to attach a migration is the same request that writes the files. |
| Qualified field references inside expression values are already scanned | `src/app/edit/references.ts:98`, `:201` | The evaluation's claim that field rename never updates expressions is wrong (E18 says so); this feature extends coverage only where an address consumer needs it. |
| Relationship renaming handles only `identify_by` | `src/app/edit/references.ts:190` | Known gap from E18; the plan lists it as a dependency of the rename task, not as part of this feature. |
| Files move through `createFileMove` (`moveFile`), also used by suggestions | `src/server/projects/workspace.ts:456-460` | The server already knows old and new location, so a document migration can be derived there with no client input. |
| Multi-file operations use a journal of reversible renames, recovered at start | `src/server/projects/journal.ts` | The migration store update can be one more step of the same journaled operation. |
| Durable state files are JSON with `formatVersion`, written atomically | `src/server/projects/state.ts`, `atomic.ts` | The migration store follows the same convention. |
| Tests are flat files in `tests/`, subfolders for areas; mutants are cases in `scripts/*-mutants.ts` registered in `scripts/mutation-tests.ts`; browser checks are `scripts/*-browser-check.ts` | repository layout | New code follows the same placement. |
| `fast-check` is not a dependency | `package.json` | A seeded generator under `tests/helpers/` avoids a dependency (Technical Constraints). |

## Findings that could not be fully reproduced

- The evaluation says positional ids make "ideas 2, 4, 5, 6 and 7" depend on A1. Those ideas are
  not built yet, so only the dependency is verifiable, not the usage. The plan treats them as
  future consumers with a contract.
- Persisted view state keyed by entity ids (grouping corrections, layout hints) was not fully
  inventoried: the grouping correction request is validated in `src/server/handler.ts:115` and its
  key shape is set by `src/app/graph/AdjustGroupingDialog.tsx`. The first adoption task is an
  inventory with a test that lists every persisted key shape, so conversion (FR-040) covers all of
  them. Nothing in the plan assumes the answer.

## Decisions

### D1. Locator, not identity

**Decision**: the address is a locator. Persistent identity is only the item's own IRI.
**Why**: E6. Inventing an id for every field would require writing ids into files (Principle II,
and the pinned schemas have no slot) or keeping a side table that external edits invalidate.
**Rejected**: generated ids in a sidecar (breaks on external edits, adds a second source of truth);
content hashes (change on every edit); positional ids (the current defect).

### D2. One string, kind on every segment, escaping by percent-encoding

**Decision**: `sw1:<project>/<path>#kind:name/kind:name[@snapshot]`, everything outside
`A-Za-z0-9-._~` percent-encoded in uppercase.
**Why**: `/` and `:` are already the separators of the two existing notations, so people read it
without learning a new alphabet; percent-encoding is the one escaping scheme every URI-aware tool
(MCP clients, browsers, `URL`) leaves intact; uppercase and "no escape of an unreserved byte"
make the text canonical, which makes equality a string comparison and property-testable.
**Rejected**:
- Backslash escaping: depends on the host language's string rules and breaks in JSON and URLs.
- JSON-array form: unambiguous but unreadable and not a single token in a URI.
- A dot before child names (`Customer.email`): ambiguous with names that contain dots (the exact
  defect found in the reviews). It survives only as the display name.
- Separate notation for MCP: two notations are what the Astra review objected to.

### D3. Absolute, project-relative and document-relative forms

**Decision**: three spellings of one address, with a pure resolver.
**Why**: a pointer stored in a file must survive the file moving (Principle II keeps the file the
source of truth). A usage counter outside the file needs the absolute form. Both come from one
function so they cannot drift.

### D4. Positional segment for unnamed items

**Decision**: `kind:#<index>` and a volatility flag.
**Why**: ODCS foreign keys, roles and mapping children have no name field, and E6 requires them to
be locators. `#` is always escaped inside names, so the form cannot collide with a real name.
**Rejected**: dropping them (E6 requires coverage); generating names (invented identity).

### D5. Migrations as prefix records, applied on miss

**Decision**: a rename records one prefix rewrite for the whole subtree. A consumer applies the
records only when the stored address no longer resolves.
**Why**: a concept with 50 relationships renamed once would otherwise write 51 records, and a
revert in Git would leave records that wrongly move addresses that resolve again. Applying on miss
makes stale records harmless.
**Rejected**: per-item records (size); applying always (unsafe after revert); graph of aliases
(complexity, needs cycle handling the ordered pass does not need).

### D6. Source of a migration

**Decision**: file moves are recorded by the server inside `moveFile`. Item renames and scope
renames are declared by the client in the same save request, validated at the boundary against the
files the request writes. External changes record nothing.
**Why**: the server alone can see a move, and cannot tell a rename from a removal plus an addition
in saved content. A client claim is trusted only for addresses inside the files and project the
caller is already allowed to write (FR-049).

### D7. Store location and format

**Decision**: `<data root>/state/address-migrations/<project slug>.json`, `formatVersion: 1`,
records ordered by append, replaced atomically, updated in the same journaled operation as the
files. Records hold no person identity (Principle I: derived data about a resource is only served
to people who may read it; E20: counters are identity-free).
**Why**: matches the other durable state files. Per-project files keep deletion, trash and restore
simple and keep the read boundary one project wide.
**Rejected**: a cache table (the cache is rebuildable and migrations are not); one global file
(crosses read boundaries); storing records in the repository (diffs and permissions would leak
through Git, and a pull could rewrite them).

### D8. Hidden equals missing

**Decision**: the server-side resolver is a function of (caller's readable set, address). It
returns the missing result for an unreadable project without touching project data.
**Why**: MCP review ("the acknowledgement must not distinguish a hidden address from a missing
one") and Principle I. Doing no work for the unreadable case also removes the timing difference.

### D9. Randomized tests without a dependency

**Decision**: a 40-line seeded generator in `tests/helpers/`, with a case count and seed printed
on failure.
**Why**: the property statements here are small and the character classes are known; the cost of
a package is not justified (Technical Constraints). A library can replace it later.

### D10. What the mesh and Tessera inherit

The mesh resolves import aliases to a project slug and a document, then forms an absolute address.
Tessera stores relative forms. Neither may add a kind or a segment form without a new grammar
version; the contract lists the extension points (kind registry version, `sw2` prefix).
