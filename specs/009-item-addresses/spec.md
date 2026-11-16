# Feature Specification: Item Addresses

**Feature Branch**: `009-item-addresses`

**Created**: 2026-11-16

**Status**: Draft

**Input**: One versioned grammar for addressing any model item (concept, relationship, attribute,
field, dataset, metric, join, mapping and their children) across files, projects and renames. It is
used by graph selection, lineage, mappings, branch item diffs, the mesh, governance replacement
pointers, usage counters and MCP resource addresses. Governing decisions: E6 (identity versus
address; A1 is M, not S), the A1 section of the extensions evaluation, the A1 findings of both
Ossie reviews, and the MCP decisions that use addresses (M16 and the resource-address finding of
the MCP review).

## Summary

Today every feature invents its own key for "the thing the user selected": entity ids are positions
in a file (`ontology/3`), the mapping canvas uses `concept:C/R` and `dataset:D/F`, agent context
uses `field:<dataset>.<field>`, and metric extensions use `dataset.field`. None of these survives
a name containing a delimiter, none says which kind of item it names, and none says what happens on
a rename.

This feature delivers:

1. **One grammar**, `sw1`, with a kind on every segment, one escaping rule, and an explicit
   project, document, scope and item chain. The string is canonical: one item has one text.
2. **A promise that is honest about identity.** An address is a *locator* (where an item is now).
   It is stable across reordering and edits. It is not stable across renames and moves. Global
   identity comes only from an item's own declared IRI. The feature invents no persistent ids.
3. **Rename and move handling.** A rename or move made through the workbench rewrites references
   (as `src/app/edit/references.ts` does today) and records a versioned address migration, so
   stored addresses, usage counters and branch diffs can follow. A change made outside the
   workbench is a removal plus an addition until a person reconciles it.
4. **Pure shared functions** for parsing, formatting, deriving the addresses of a parsed model,
   resolving an address, and applying migrations, with property tests.
5. **A defined adoption order** for the consumers that exist today, and a conformance contract for
   the ones that come later (item diff, governance pointers, usage counters, MCP resources, mesh).

Out of scope: the mesh's import resolution and the Tessera format. They build on this grammar and
may not change it.

## Clarifications

### Session 2026-11-16

The questions below came out of the ambiguity scan. Each was answered from the decisions document,
the evaluation and the reviews, the way the decisions document would answer it. None needs the
owner.

- Q: Is the address a URI, or a separate notation that MCP wraps? -> A: A separate canonical string
  that begins `sw1:` and uses only URI-safe characters, so any URI scheme can carry it without
  re-escaping. The MCP resource scheme belongs to feature 006 and is built on this grammar (E6,
  M16). One string per item, never two notations (Astra review finding 5: the evaluation
  alternates between `Document#Item.child` and `concept:C/R`).
- Q: What is "project identity" when projects can be renamed? -> A: The project slug. Verified in
  `src/server/projects/workspace.ts` (`renameProject` changes the display name and keeps the
  slug), so a project rename never changes an address. Moving an item to another project changes
  its address and records a migration (E6).
- Q: What is "document identity" when two documents may share the same `name`? -> A: The
  project-relative file path, which is what the workbench already uses for document ids
  (`<slug>/<path>`). The document's own `name` appears as the first item segment (its scope), so
  two files with the same `name` stay distinct by path (Fable review M1: "a rule for two documents
  with the same name").
- Q: Do items without a name (ODCS foreign keys, mapping object and link mappings, roles) get an
  address? -> A: Yes, a positional segment `kind:#<index>`. It is labelled volatile: it is the only
  segment kind that does not survive reordering, and consumers that need history must not store
  it. No invented ids (E6: "Do not invent persistent IDs for every field").
- Q: How does an address say "published snapshot" versus "my working copy"? -> A: An optional
  `@<snapshot>` suffix carries the snapshot token that feature 008 defines; this feature treats the
  token as opaque text. An address without the suffix means the caller's authoring copy and no
  resolver may treat it as published (E4, E5, M16).
- Q: Where do addresses stored inside a file point when the file is moved? -> A: In-file pointers
  use the shortest form that does not embed what a move of that file would change: the
  document-relative form `sw1:#...` for the same file, the project-relative form `sw1:/path#...`
  for another file of the project. Only stores outside the files (usage counters, migrations,
  audit, MCP) use the absolute form.
- Q: Who may record a reconciliation of an external change? -> A: Anyone who may edit the file that
  holds the new address, through the same authorization boundary as a save, because a
  reconciliation only links two addresses the person can already read and cannot widen access
  (Constitution: one authorization boundary).
- Q: What if a recorded rename is undone in Git (reset, revert, branch switch)? -> A: A stored
  address is migrated only when it no longer resolves in the model being read. An address that
  still resolves is left alone, so a stale record has no effect (FR-047).
- Q: Do import aliases and Ossie QNames (`core:Party`) appear in addresses? -> A: No. An alias is
  a document-local spelling resolved before an address is formed; an address always names the
  resolved item. The mesh feature supplies the alias resolver. QNames are display text and IRI
  shorthand, never addresses.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A developer formats and parses any address without ambiguity (Priority: P1)

A developer who adds a consumer (a diff, a counter, an MCP resource) calls one function to build
the address of an item and one to read an address back. Names that contain `:`, `.`, `#`, `/`, `@`,
`%`, spaces or non-Latin letters work, and two different items never produce the same text.

**Why this priority**: every other story depends on the grammar being exact. Without it each
consumer keeps its private key and the same defects.

**Independent Test**: run the pure module against hostile names and generated cases. No UI, server
or file is involved.

**Acceptance Scenarios**:

1. **Given** a concept named `a:b.c#d/e@f%g`, **When** its address is formatted and parsed, **Then**
   the parsed name equals the original and the text contains none of those characters unescaped.
2. **Given** a dataset and a join that are both named `orders` in one semantic model, **When**
   their addresses are formatted, **Then** the two strings differ by kind and each resolves to its
   own item.
3. **Given** any text that the formatter can produce, **When** it is parsed and formatted again,
   **Then** the result is byte-identical.
4. **Given** text that is not canonical (lowercase escape digits, an unknown kind, an empty name,
   a trailing separator, an unescaped delimiter), **When** it is parsed, **Then** parsing fails
   with a named reason and never returns a guess.
5. **Given** an address longer than the limit or deeper than the depth limit, **When** it is
   parsed, **Then** it is rejected before any scanning work proportional to its length beyond the
   limit.

---

### User Story 2 - An address stays valid across reordering and edits, and says so when it cannot (Priority: P1)

A steward reorders fields, inserts a concept above others and edits descriptions. Every address
that named an item before still names the same item. When the steward renames the item, the old
address stops resolving, and no consumer silently treats the new name as the same thing.

**Why this priority**: this is the promise the whole programme leans on (E6). Positional ids break
it today.

**Independent Test**: derive the addresses of a model, shuffle sibling order and insert items,
derive again, and compare.

**Acceptance Scenarios**:

1. **Given** a model, **When** its sibling lists are reordered and new items are inserted,
   **Then** every address derived before still resolves to the same item.
2. **Given** a concept that declares an IRI, **When** it is renamed, **Then** its address changes,
   its identity (the expanded IRI) does not, and a function that compares two models reports it as
   the same identity at a different address.
3. **Given** a field or metric (which never carries an IRI), **When** it is renamed outside the
   workbench, **Then** the old address resolves to nothing, the new one resolves to the item, and
   nothing links them.
4. **Given** two sibling items with the same kind and the same name (invalid, but present in a file
   that was imported with findings), **When** the address is resolved, **Then** the result is
   "ambiguous" with both matches, and no item is chosen by position.

---

### User Story 3 - A steward renames or moves an item and every stored address follows (Priority: P1)

A steward renames the concept `Customer` to `Client` in the item editor, as today, and ticks the
references to rewrite. The workbench rewrites them and also records one address migration for the
concept and all items under it. Later, a usage counter, an item diff and a stored pointer that used
the old address are read through the migration and show the item under its new address.

**Why this priority**: without recorded migrations a rename splits history (usage) and turns a
rename into a removal plus an addition in every review (Astra review finding 5).

**Independent Test**: rename through the editor flow against an isolated store, then read a stored
address and a diff pair through the migration.

**Acceptance Scenarios**:

1. **Given** a concept with relationships, **When** it is renamed through the item editor, **Then**
   one migration of kind subtree is recorded (old concept address to new concept address) and every
   old address under it migrates to the matching new one.
2. **Given** a file renamed or moved inside its project through the workbench, **When** it is saved,
   **Then** one migration of kind document is recorded and every address in that file migrates.
3. **Given** a rename that is saved together with references rewritten in other files, **When**
   the batch is interrupted after some files were written, **Then** on restart the operation is
   either completed (all files and the migration record exist) or rolled back (none of them
   exist), never a record for a rename that did not happen and never a written rename without its
   record.
4. **Given** an item renamed in an external editor and picked up by a Git pull, **When** a diff
   compares the two states, **Then** the old address is reported removed and the new one added
   until a person records a reconciliation, after which the diff reports one renamed item.
5. **Given** a chain of migrations (A to B, then B to C), **When** the address A is migrated,
   **Then** the result is C, and a later migration back to A does not loop.

---

### User Story 4 - Existing consumers use one grammar, in a safe order (Priority: P2)

A user selects a node in the graph, opens a lineage row, reads a mapping and asks the agent for
context. All of these identify items by the same address. Nothing the user could see before looks
different, and saved view state still works.

**Why this priority**: the grammar has value only when consumers share it. The order matters
because the first consumers are read-only and the last ones rewrite stored state.

**Independent Test**: for each consumer, a test that the old key and the new address select the same
item, and a browser check that selection still works, in order of adoption.

**Acceptance Scenarios**:

1. **Given** the model of any sample project, **When** entities are derived, **Then** each carries
   an address, and the address of every item is unique within its document.
2. **Given** the mapping canvas, **When** a concept, relationship, dataset, field or metric card
   is selected, **Then** it is identified by its address and the card text and positions are
   unchanged.
3. **Given** agent context, **When** it is assembled, **Then** every `concept:`, `dataset:`,
   `field:`, `metric:` and `join:` label is produced from the item's address by the formatter, and
   the context output for the sample projects is unchanged except for the labels.
4. **Given** an existing metric extension that writes `dataset.field`, **When** it is read,
   **Then** the adapter turns it into a field address and the file is not rewritten.
5. **Given** persisted view state keyed by the old ids, **When** the new version starts, **Then**
   the keys are converted once, after a backup and a hash check, and an unconvertible key is kept
   and reported, never dropped.

---

### User Story 5 - Every document layout and nested ODCS item has an address (Priority: P2)

An engineer opens a consolidated file (ontology with embedded semantic model), a legacy file with
several models in a `semantic_model` list, and an ODCS contract with nested properties. Items in
all of them have addresses that follow the same grammar, even where later features will not edit
them.

**Why this priority**: E6 requires locators for nested ODCS properties and existing embedded
layouts, even where extension support is deferred.

**Independent Test**: derive and resolve the addresses of each fixture layout, including property
names that contain dots.

**Acceptance Scenarios**:

1. **Given** an embedded layout (`ontology_mappings[i].semantic_model`), **When** its datasets are
   addressed, **Then** the chain shows the containing ontology, mapping and model.
2. **Given** the legacy multi-model wrapper, **When** two models are addressed, **Then** each is a
   distinct scope by model name.
3. **Given** an ODCS property named `a.b` nested under property `c`, **When** it is addressed,
   **Then** the chain has one segment per level and the dot does not split it.
4. **Given** an item that has no name (an ODCS foreign key, a role, a link mapping), **When** it
   is addressed, **Then** the positional form is used and it is reported as volatile.

---

### User Story 6 - A reader cannot learn that a hidden item exists (Priority: P2)

A person without read access to a project resolves an address in it, subscribes to it, or reads a
migration touching it. The answer is the same as for an address that does not exist.

**Why this priority**: the constitution forbids sending a person any derived view about a resource
they may not read, and the MCP review requires hidden and missing addresses to be
indistinguishable.

**Independent Test**: an authorization test that resolves addresses in readable, unreadable and
guarded projects and compares the responses.

**Acceptance Scenarios**:

1. **Given** an address in an unreadable project, **When** a server-side resolver is called for the
   caller, **Then** the answer is identical in shape and text to the answer for an address that
   exists nowhere.
2. **Given** migrations that touch an unreadable project, **When** a reader of another project asks
   for migrations, **Then** none of them appear.

---

### Edge Cases

- A name that is one or more dots, such as `.` or `..`: legal as a name and escaped like any other;
  as a document path segment it is rejected, because the workbench already refuses dot segments.
- A name that is empty: rejected by the formatter and the parser (the model requires non-empty
  names).
- A name that contains lone UTF-16 surrogates: rejected by the formatter, since it has no UTF-8
  form. Names are compared as given, with no Unicode normalization, so `é` composed and decomposed
  are different names (assumption, see below).
- A name that begins with `#`: escaped, so it can never be mistaken for a positional segment.
- A file whose `name` changes: all of its item addresses change through the scope segment; one
  document-name migration is recorded.
- A project moved to the trash and restored: its slug is unchanged, so addresses are unchanged.
- A document deleted and a new one created at the same path: addresses can coincide with the old
  ones. The migration store records deletions, so history of the old document is not attached to
  the new one silently (see FR-043).
- A migration whose target no longer exists: the migrated address is returned as is and resolves
  to nothing. Following a migration never throws.
- A cycle in recorded migrations, caused by a rename back to the old name: the records are applied
  once each, in order, so the walk always ends.
- A snapshot suffix on an address that is stored in a file: rejected, since a file cannot point at
  its own future publication.
- A very deep ODCS property tree: addresses beyond the depth limit are reported as unaddressable
  with the item's path, never truncated.
- A rename of a project's display name: no address changes and no migration is recorded.

## Requirements *(mandatory)*

### Functional Requirements

**Grammar**

- **FR-001**: The system MUST define one address grammar, named `sw1`, whose canonical text is
  `sw1:<project>/<document-path>#<item>(/<item>)*[@<snapshot>]`. Every address MUST begin with the
  literal `sw1:`, and a later grammar version MUST use a different prefix.
- **FR-002**: Each item segment MUST be `<kind>:<name>` or `<kind>:#<index>`, with `<kind>` taken
  from a closed registry (concept, relationship, ontology, model, mapping, dataset, field, join,
  metric, contract, object, property, foreign-key, role, object-mapping, link-mapping,
  concept-mapping) and the registry versioned with the grammar. An unknown kind MUST fail parsing.
- **FR-003**: Names, project slugs and document path parts MUST be escaped with one rule: every
  UTF-8 byte outside `A-Z a-z 0-9 - . _ ~` becomes `%` followed by two uppercase hexadecimal
  digits. The parser MUST reject lowercase digits, an escape of an unreserved byte, an incomplete
  escape and invalid UTF-8, so each name has exactly one text.
- **FR-004**: The formatter MUST reject an empty name, a name with a lone surrogate, a project slug
  that is empty in an absolute address, and a document path part equal to `.` or `..`.
- **FR-005**: The grammar MUST support four address levels: project (`sw1:<project>`), document
  (`sw1:<project>/<path>`), item (document plus `#` chain), and, through the optional snapshot
  suffix, a historical version of any of these.
- **FR-006**: The grammar MUST support three reference forms of the same address. The absolute
  form names the project. The project-relative form `sw1:/<path>#...` omits the slug. The
  document-relative form `sw1:#...` omits the slug and the path. A resolver MUST turn a relative
  form into the absolute form given a base address, and MUST fail on a relative form without a
  base.
- **FR-007**: The snapshot suffix MUST be `@` followed by one or more of `A-Z a-z 0-9 . _ -`. Its
  meaning is owned by the published snapshot feature. An address without the suffix MUST mean the
  caller's authoring copy and MUST NOT be treated as published by any resolver. A relative form
  stored in a file MUST NOT carry the suffix.
- **FR-008**: An address MUST be at most 4,096 characters and at most 32 item segments. The parser
  MUST check the length before scanning and run in time linear in the input length.
- **FR-009**: Addresses MUST NOT contain import aliases, Ossie QNames, `/`-separated physical
  source names or display names. The grammar's description MUST say so.
- **FR-010**: The grammar document MUST be labelled an application choice and MUST NOT be written
  into a standard Ossie or ODCS file as a new key. Where a later feature stores an address in a
  file it uses the relative forms of FR-006 inside that feature's own extension.

**Kinds, scopes and layouts**

- **FR-011**: Every item MUST be addressed by a chain from the document root, in which each
  segment's name is unique among siblings of the same kind under the previous segment. Two kinds
  under one parent never share a name scope, so a dataset and a join named `orders` have different
  addresses (validation scopes them separately in `src/shared/validation/validation.ts`).
- **FR-012**: The first segment of every semantic-model or ontology document MUST name the
  document's own scope: `ontology:<name>` for an ontology, `model:<name>` for a semantic model,
  `mapping:<name>` for a standalone mapping and `contract:<id>` for an ODCS contract.
- **FR-013**: The system MUST address the consolidated layout (`ontology_mappings[i].semantic_model`)
  as `ontology:<n>/mapping:<n>/model:<n>/...`, the legacy `semantic_model` list as one `model:<n>`
  root per entry, and a standalone semantic model, ontology and mapping as one root.
- **FR-014**: The system MUST address, at least: ontology concepts and their relationships (an
  attribute is a relationship, so it has the relationship address and no second form), concept
  mappings, datasets and their fields, model joins, metrics, ODCS objects, nested ODCS properties
  (one segment per nesting level) and ODCS foreign keys.
- **FR-015**: Items that have no name field MUST use the positional segment `<kind>:#<index>` with
  a zero-based index and no leading zeros. The derivation function MUST mark every positional
  segment as volatile, and no store described in this specification may persist a positional
  address as history.
- **FR-016**: When two siblings of the same kind share a name, derivation MUST mark both
  addresses ambiguous, and resolution MUST return all matches with an `ambiguous` result. Neither
  function may choose by position.

**Identity, location and display**

- **FR-017**: The system MUST distinguish three things, in code and in documentation. Persistent
  identity is the expanded IRI an item declares itself. Versioned location is the address,
  optionally with a snapshot. Display name is the formatted text for people (`Customer.email`) and
  is never parsed.
- **FR-018**: A function MUST return an item's identity: its expanded IRI when the item declares
  one (concepts and relationships can; the existing IRI expansion in
  `src/shared/validation/iri.ts` is reused) and none otherwise. The system MUST NOT generate an
  identifier for an item that does not declare one and MUST NOT treat equal names as equal
  identity.
- **FR-019**: The address of an item MUST be unchanged by reordering siblings, inserting or
  deleting other items, and editing any property other than the name fields and the scope names
  that make up its chain.
- **FR-020**: The address of an item MUST change when the item, any ancestor, the document's own
  name, the document's path or the item's project changes. The documentation MUST say this next to
  every promise of stability.
- **FR-021**: A function MUST produce a human-readable display name for any address, including a
  display name for ambiguous and positional segments, without any escaping, and no parser MUST
  accept display names.

**Pure shared functions**

- **FR-022**: Parsing, formatting, display, relative-to-absolute resolution, and prefix operations
  MUST be pure functions in one module of `src/shared/`, importable by the browser and the server
  with no I/O, no clock and no global state.
- **FR-023**: A pure function MUST derive the addresses of every item of a parsed model, in
  document order, together with each item's kind, volatility and ambiguity, from the same parsed
  data the inspector already produces.
- **FR-024**: A pure function MUST resolve an address against a parsed model and return exactly
  one of: found (with the item), ambiguous (with all matches) or missing.
- **FR-025**: Property tests MUST cover, with a seeded generator that prints its seed on failure:
  round trip in both directions, canonical uniqueness (different names never give the same text),
  rejection of non-canonical text, relative resolution, prefix replacement keeps the suffix,
  derivation is invariant under sibling reordering, and derived addresses of one document are
  unique unless marked ambiguous.
- **FR-026**: The module MUST ship a conformance fixture set (valid, invalid and hostile addresses,
  with the expected parse result and the canonical text), loadable by tests of any consumer so that
  other features test the same cases rather than copies.

**Rename, move and migration**

- **FR-027**: A rename of an item, a concept, a dataset, a field, a metric, a join, a relationship
  or an ODCS property made through the workbench MUST rewrite references exactly as the reference
  scan does today (nothing silently, only what the user ticks) and MUST record one migration for
  the renamed item's subtree.
- **FR-028**: A rename or move of a file inside a project through the workbench MUST record one
  document migration; a change of a document's own `name` MUST record one document-scope
  migration; a move of a file to another project MUST record a document migration across projects.
- **FR-029**: A migration record MUST hold a record id, the old address prefix, the new address
  prefix, a kind (item, document, scope or project-move), the instant it was recorded, and the
  repository commit that was the branch head when it was saved. It MUST hold no person
  identity.
- **FR-030**: A prefix migration MUST match on segment boundaries (the old prefix `Customer` does
  not match `CustomerGroup`), MUST keep the rest of the address unchanged and MUST keep a snapshot
  suffix.
- **FR-031**: Applying migrations to an address MUST apply each record at most once, in recorded
  order, and MUST terminate for any set of records, including records that rename an item back.
- **FR-032**: A person with permission to edit MAY record a reconciliation, which is a migration of
  kind reconciliation from an address that no longer resolves to one that does. Item diff,
  usage and pointer consumers MUST treat it like any other migration. Creating the user interface
  for it belongs to the item diff feature; this feature supplies the record and its validation.
- **FR-033**: A change that reaches the workbench from outside (an external edit, a pull, a branch
  switch) MUST NOT create a migration. Until a reconciliation exists, the old address MUST be
  reported removed and the new one added.
- **FR-034**: Writing a migration MUST be atomic with the rename's file writes: the record is
  written in the same journaled operation as the files, or the files are not written. A retry of
  an interrupted operation MUST NOT create a second record (the record id is derived from the
  operation, not generated per attempt).
- **FR-035**: The migration store MUST be a durable state file under the data root's state
  directory, written atomically, append-only in effect, and readable only through the access
  boundary of the project the records belong to.
- **FR-036**: A migration store MUST never be sent to, or influence, telemetry or logs. Log and
  telemetry labels MUST NOT contain an address, a project slug, a file path or an item name.
- **FR-037**: The migration store MUST have a size bound: records older than the retention period
  are compacted into one record per surviving item chain, so a long-lived project does not grow
  without limit. The default retention is 365 days, configurable (see Assumptions).

**Consumers and adoption**

- **FR-038**: Adoption MUST proceed in this order, each step shippable alone: (1) the module and
  its tests; (2) derived addresses on parsed entities and edges, with the old ids kept; (3) the
  mapping canvas, lineage and graph selection read and write addresses; (4) agent context labels
  and the metric `dataset.field` adapter; (5) conversion of persisted keys; (6) rename and move
  migrations; (7) retirement of private key builders.
- **FR-039**: No existing consumer MUST change what the user sees. Cards, labels, positions,
  context bodies and plan output stay the same except where a label is replaced by the formatted
  address.
- **FR-040**: Persisted state keyed by the old ids or names MUST be converted exactly once, after a
  backup of the previous store, with each converted file's hash checked against its original
  bytes, and the conversion MUST stop without changes if a check fails. A key that cannot be
  converted MUST be kept and listed, never dropped.
- **FR-041**: Existing notations inside user files (the metric extension's `dataset.field`, the
  mapping schema's concept names, `replaced_by` style pointers of later features) MUST be read
  through adapters that produce addresses and MUST NOT be rewritten as a side effect of adoption.
- **FR-042**: Every consumer that is not built yet (branch item diff, governance replacement
  pointers, usage counters, MCP resource addresses, mesh) MUST be able to adopt the grammar by
  using the module, the conformance fixtures and the migration store, with no change to the
  grammar. The contract for that is published in `contracts/` of this feature.
- **FR-043**: Deleting a document or an item MUST NOT record a migration, and the migration store
  MUST keep a deletion marker for the old address so a new item created later at the same address
  does not inherit the old item's history without a reconciliation.

**Safety**

- **FR-044**: A resolver used for a caller MUST return the same result for an address in a project
  the caller may not read as for an address that does not exist, and the resolution of one address
  MUST NOT take more time or produce different events for the two cases.
- **FR-045**: Parsing MUST never throw on arbitrary input; it returns a failure with a reason from a
  closed list. Formatting throws only on a programming error (an invalid kind or name), with a
  message that does not repeat document content beyond the offending name.
- **FR-046**: The module MUST add no runtime dependency and MUST add no network call.

- **FR-047**: A consumer MUST apply migrations to a stored address only when that address does not
  resolve in the model it is read against, so that an undone rename leaves stored addresses
  untouched. The shared function that applies migrations MUST take the resolver result as input and
  return the address unchanged when it resolved.
- **FR-048**: Recording a reconciliation MUST require the same permission as saving the file that
  holds the new address, and MUST be refused for an address in a project the person cannot read.

### Key Entities

- **Address**: the parsed form of an address: project, document path, item chain, optional
  snapshot, and its reference form (absolute, project-relative, document-relative).
- **Item segment**: a kind from the registry plus a name or a position, with volatility.
- **Item identity**: an expanded IRI declared by the item, or none.
- **Display name**: formatted text for people, never parsed.
- **Address migration**: an append-only record that an address prefix became another prefix, with
  kind, instant and base commit.
- **Reconciliation**: a migration recorded by a person for a change the workbench could not see.
- **Deletion marker**: a record that an address was deleted, so reuse of the address is not
  treated as continuity.
- **Conformance fixture**: a shared list of addresses with expected parse and format results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Round trip. For at least 10,000 generated items per run, including every character
  class in FR-003, `parse(format(x))` equals `x` and `format(parse(t))` equals `t` for every
  canonical `t`, with zero failures and the seed printed on failure.
- **SC-002**: Uniqueness. In every fixture and sample project, 100% of derived item addresses in
  one document are distinct unless marked ambiguous, and two items that differ only in kind (a
  dataset and a join with the same name) never share an address.
- **SC-003**: Reorder invariance. For every sample project, shuffling the order of every sibling
  list leaves the set of derived non-positional addresses unchanged in 100% of 1,000 generated
  shuffles per project.
- **SC-004**: Hostile input. 100% of the invalid and hostile conformance cases fail parsing with
  the expected reason, no input throws, and a 4,096-character input is rejected or parsed in under
  10 ms on the CI machine.
- **SC-005**: Rename. After a workbench rename of an item with N descendants, one migration record
  exists and 100% of the N+1 old addresses migrate to their new addresses; after an external
  rename, 0 migrations exist and the diff reports a removal and an addition.
- **SC-006**: Interrupted rename. In a test that interrupts the rename at every write of a
  three-file batch (before each file, after each file, before and after the record), recovery
  ends with either all three files and one record or none of them, and a repeated recovery adds no
  second record.
- **SC-007**: No visible change. The existing browser checks for graph, mapping, lineage and
  metrics, and the agent-context snapshots for the sample projects, pass unchanged after adoption,
  except where a documented label is replaced.
- **SC-008**: Layout coverage. Every item kind of every fixture layout (standalone, consolidated,
  legacy wrapper, ODCS with nesting three levels deep and dotted names) has an address that
  resolves back to the item.
- **SC-009**: Hidden equals missing. In the authorization matrix, 100% of resolution and
  migration reads of an unreadable project return the same answer as an unknown address.
- **SC-010**: Persisted keys. A conversion run over a copy of a store with 1,000 old keys converts
  or reports every key (converted plus reported equals 1,000) and the backup restores the original
  bytes.
- **SC-011**: Mutation. Every targeted mutant added for the grammar (escape set, case of digits,
  segment boundary of prefix match, ambiguity detection, hidden-equals-missing, retry idempotency)
  is detected.
- **SC-012**: Documentation. The README, ARCHITECTURE.md and docs describe the grammar, the
  stability promise and its limits, and every count they quote comes from a test.

## Assumptions

- **Strings are compared exactly.** No Unicode normalization or case folding is applied to names,
  because the pinned schemas and the existing validation compare names exactly. Two names that
  differ only in normalization form are different items.
- **Limits**: 4,096 characters and 32 segments are chosen to sit well above any realistic
  address (the document limit is 2,000,000 bytes and ODCS nests a few levels) while keeping the
  parser bounded (Principle III). They are constants with tests, so a change is mechanical.
- **Retention**: the migration store keeps full records for 365 days and compacts older ones. The
  number has no external source; it is a configurable default chosen to cover a year of releases.
- **Randomized tests use a small seeded generator** under `tests/helpers/`, not a new package, so
  that the module adds no dependency. A library can replace it later without changing tests.
- **No new HTTP route.** Migrations are written inside the existing save and batch-save requests
  and read by server code that already has a caller; a public read route, if later needed, is
  added by the feature that needs it, and the authorization matrix is extended then.
- **Branches.** A migration records the commit that was the branch head when it was saved. Which
  migrations apply to a diff between two refs (those reachable from the later ref and not from the
  earlier) is decided by the item diff feature using that field. This feature supplies the field
  and the pure application function, not the Git walk.
- **Project slug is immutable.** Verified for rename; moving a project between repositories and
  restore from trash keep the slug. If a later feature allows changing a slug it must record a
  project migration of kind project-move.
- **Kind registry is a superset of today's editable kinds** (`ItemKind` in
  `src/shared/edit/item-model.ts`) plus structural kinds (ontology, model, mapping, contract,
  role, object-mapping, link-mapping). Roles and mapping children are positional.
- **Display names** follow `<kind label> <name path joined with dot>`, for example
  `Relationship Customer.email`. Their exact wording is a presentation choice and can change
  without a grammar version change.
- **Dependencies on parallel work**: the snapshot token and its meaning come from the published
  snapshot feature (008); resource URIs and the hidden-equals-missing answer for subscriptions
  from the MCP feature (006); the rename save runs inside the operation boundary of feature 010
  when that lands, and keeps working through today's save path until then; the constitution
  amendments name Principle IV (state files and address-keyed migrations) and Principle V
  (application formats labelled and versioned) and are drafted on the amendment branch.

## Decision Traceability

| Source | Requirement | Note |
| --- | --- | --- |
| E6 versioned locator grammar, separately escaped segments | FR-001 to FR-008 | grammar, escaping, limits |
| E6 name-based locator promises no identity | FR-017 to FR-021 | identity, location, display |
| E6 IRI supplies global identity | FR-018 | no invented ids |
| E6 nested ODCS and embedded layouts as locators | FR-012 to FR-015 | layouts and nesting |
| E6 renames update references, record migrations | FR-027 to FR-031, FR-034, FR-035 | |
| E6 ambiguous external changes become remove/add | FR-016, FR-032, FR-033, FR-047, FR-048 | |
| E6 snapshot version for history | FR-005, FR-007 | |
| E6 A1 is M | Summary, FR-038 | adoption order and size |
| Evaluation A1 (parse and format used by graph, mapping, context, metrics, MCP) | FR-022 to FR-026, FR-038, FR-041 | |
| Evaluation: `concept:C/R` and `Document#Item.child` | FR-001, Clarifications | one notation |
| Fable review M1: kind segment, escaping, same-name documents | FR-002, FR-003, FR-012 | |
| Fable review M1: nested ODCS, embedded layout, legacy wrapper | FR-013, FR-014 | |
| Fable review M1: settle together with 006 | FR-042, Assumptions | |
| Astra review 5: identity, location and display QName separate | FR-017 to FR-021 | |
| Astra review 5: alias scope, project identity | FR-006, FR-009, Clarifications | |
| Astra review 5: stability across reorder, migration of counters | FR-019, FR-027 to FR-031 | |
| Validation: separate join and dataset scopes | FR-011 | |
| E18, E20 apply address migrations | FR-027 to FR-031, FR-042 | counters |
| E17 governance pointers | FR-041, FR-042 | |
| M16 authoring versus published identity | FR-007 | |
| MCP review: hidden and missing addresses indistinguishable | FR-044, SC-009 | |
| R1 row 1 (A1 before MCP resources, diff, usage) | FR-038, FR-042 | |
| R2 increment complete only with tests, docs, mutation | SC-011, SC-012 | |
| Constitution III, IV, VI, VII | FR-008, FR-034 to FR-036, FR-040, SC-010 to SC-012 | |
