# Feature Specification: Tessera Format and Compiler

**Feature Branch**: `011-tessera-format`

**Created**: 2026-11-17

**Status**: Draft

**Input**: The workbench edits ontologies in Ossie. The owner wants to extend Ossie, but in a way
that "can produce regular Ossie through a tool". The extended format has the working name
**Tessera** (decision E24). This feature is the foundation the rest of the roadmap builds on
(roadmap step 3 of decision R1). It defines the format (marker, namespacing, what a document may
contain beyond Ossie, versioning), validates it with diagnostics, compiles it to regular Ossie,
lets the workbench read and save such documents through the operations it already has, and adds a
command-line entry for the compiler. Item diff, attributes, governance, multi-file units, the
mesh, proposals, sign-in, counters, the ACP panel and further MCP tools are later features.

## Summary

- A Tessera document is an Ossie ontology that carries the marker `tessera: 1` and may use
  properties that Ossie does not have. Every such property starts with the reserved prefix
  `tessera_`. Nothing else about the file changes.
- Format revision 1 is deliberately small. It adds the marker and one property, `tessera_notes`
  (free text for authors). The rest of the machinery is the point: a registry that is the only
  place a later feature may add a property, a schema derived from the pinned Ossie schema, and
  rules for versions and base versions.
- The workbench validates a marked document with the Tessera schema for its Ossie base, and an
  unmarked document exactly as before. Reading, saving, item edits, item addresses, the graph and
  agent context work on a Tessera document with the operations that exist today. No route is
  added.
- The Tessera compiler turns a Tessera document into regular Ossie. It is deterministic. It checks
  that its output passes the pinned Ossie schema and that nothing but the additions changed. Every
  value it drops is listed in a loss report, and the output is released only when that exact report
  is accepted.
- A command-line tool compiles a project's **published snapshot** (read from Git objects, never
  from files on disk) into a bundle outside the source tree: the standard Ossie files, a manifest
  and the loss report. A second command checks any state, including unpublished work, and writes
  nothing.
- Output is labelled "valid against the bundled Ossie 0.2.0.dev0 draft". No claim of compatibility
  with a released Ossie is made (decision E22).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An author edits a Tessera ontology in the workbench (Priority: P1)

An author opens an ontology that declares `tessera: 1`, adds a `tessera_notes` entry to a concept,
and saves. The editor, the graph, the catalog and the inspector show the document as they show any
Ossie ontology. The validation panel lists any problem with a path and a line. An invalid change is
refused before anything is written, and a valid one is saved with its other bytes untouched.

**Why this priority**: without it the format exists only on paper. Authors must be able to use it
with the tools they already have.

**Independent Test**: open, edit, save and re-open a Tessera ontology through the existing file
operations, with the browser validation and the server save checks both running.

**Acceptance Scenarios**:

1. **Given** an Ossie ontology valid under the pinned schema, **When** the author adds
   `tessera: 1`, **Then** the document is valid and every other finding is unchanged.
2. **Given** a valid Tessera ontology, **When** the author adds `tessera_notes` to a concept and a
   relationship, **Then** the document stays valid and the notes do not appear as items in the
   graph, the catalog or the inspector.
3. **Given** a Tessera ontology, **When** the author misspells `tessera_note`, **Then** the document
   is invalid, the finding names the property and its path, and a save is refused with the same
   finding the browser showed.
4. **Given** a saved Tessera ontology, **When** another item is edited through a form, **Then** the
   marker and every addition keep their exact bytes.
5. **Given** a Tessera ontology and the same ontology without marker and additions, **When** their
   documents are inspected, **Then** the items, edges and document type are identical.

---

### User Story 2 - A release job compiles a published project to standard Ossie (Priority: P1)

A release job runs the compiler against a project's repository. It reads the default branch's
committed snapshot, compiles every Tessera ontology to regular Ossie, checks the standard files,
and writes a bundle to a folder outside the repository: the standard files, a manifest naming the
commit and every file's hash, and a loss report. A consumer that knows only Ossie loads the bundle.

**Why this priority**: it is the reason for the format. Without a compiler the extension would cut
the project off from every Ossie tool (decision E14).

**Independent Test**: compile a fixture repository with one Tessera ontology, one standard semantic
model and one mapping; validate each output file with the pinned Ossie schema.

**Acceptance Scenarios**:

1. **Given** a repository whose default branch holds a Tessera ontology with notes, **When** the
   release job compiles it and accepts the loss report, **Then** the bundle's ontology validates
   against the pinned Ossie ontology schema and contains no `tessera` marker or `tessera_` property.
2. **Given** uncommitted edits and a personal branch, **When** the job compiles, **Then** none of
   their content is in the bundle, and the manifest names the commit it read.
3. **Given** the same commit and options, **When** the job compiles twice, on two folders and with
   the files listed in a different order, **Then** the bundles are byte-identical.
4. **Given** a standard semantic model with a `SEMANTIC_WORKBENCH` extension entry, **When** the
   project is compiled, **Then** the model's bytes in the bundle equal the committed bytes.
5. **Given** a repository with no commit on the default branch, **When** the job compiles,
   **Then** it refuses and says the project has no published snapshot.
6. **Given** an output folder inside the repository, **When** the job compiles, **Then** it refuses
   before writing.

---

### User Story 3 - Loss is never silent (Priority: P1)

A reviewer asks the compiler what it would drop. The compiler lists each dropped value with the
document, the item, the property and a digest of the value, and gives the report a digest. The
release job passes that digest back to accept exactly that loss. If anyone changes a note, the
compiler version or an option, the digest changes and the old acceptance no longer applies.

**Why this priority**: decision E15 makes trustworthy standard output a condition of extending
Ossie.

**Independent Test**: compile with and without acceptance, then change one note and reuse the old
acceptance.

**Acceptance Scenarios**:

1. **Given** a Tessera ontology with two notes, **When** it is compiled without acceptance,
   **Then** nothing is written, the report lists both notes, and the exit status says that loss
   needs acceptance.
2. **Given** that report's digest, **When** the compile is repeated with it, **Then** the bundle is
   written and its manifest records the accepted digest.
3. **Given** the old digest, **When** one note is edited and the compile is repeated, **Then** it is
   refused as an acceptance mismatch.
4. **Given** a loss policy file that allows `tessera_notes`, **When** a compile would lose another
   kind of value, **Then** it is refused.
5. **Given** a document that fails the pinned schema after compilation, **When** any acceptance is
   supplied, **Then** the compile is still refused.
6. **Given** a Tessera document with no additions besides the marker, **When** it is compiled,
   **Then** the loss report is empty and no acceptance is needed.

---

### User Story 4 - Ordinary Ossie keeps working unchanged (Priority: P1)

A team with ordinary Ossie files upgrades. Nothing about their files, their validation results,
their access rules, their item addresses or their agent context changes. A role limited to the
"Ossie ontology" document type still applies to a Tessera ontology.

**Why this priority**: the format must be a strict superset, and the release must not regress
anything that works today.

**Independent Test**: run every existing validation, inspection and address fixture before and
after, and compare.

**Acceptance Scenarios**:

1. **Given** the existing validation and example fixtures, **When** they are validated, **Then** the
   findings are identical to the findings before this feature.
2. **Given** an unmarked file that uses a property named like a Tessera property, **When** it is
   validated, **Then** it is judged by the pinned Ossie schema only, as before.
3. **Given** a role that grants edit on the document type "Ossie ontology", **When** the person
   saves a Tessera ontology, **Then** the same decision applies as for the unmarked file.
4. **Given** the items of a Tessera ontology, **When** their item addresses are resolved in the
   source and in its compiled output, **Then** each document-relative address names the same item.
5. **Given** a published Tessera ontology, **When** an agent asks for context, a plan or an
   explanation, **Then** the answers equal those for the same ontology without additions, and no
   addition appears in them.

---

### User Story 5 - A bad Tessera document is refused with a clear reason (Priority: P2)

An author, a script or a future format revision produces a document the workbench cannot handle:
a marker revision it does not know, a base Ossie version it does not support, a `tessera_` property
nobody defined, a property reserved for a later feature, or a marker on a file kind that cannot
carry one. Each case is refused with a finding that says what is wrong and what is supported. None
falls through to "not validated".

**Why this priority**: Principle III forbids a marked document from taking an unvalidated path.

**Independent Test**: one fixture per refusal class, checked in the browser validator, the save
path, the scanner and the compiler.

**Acceptance Scenarios**:

1. **Given** `tessera: 2` when only revision 1 is supported, **Then** the finding says the document
   is newer than this workbench and lists the supported revisions.
2. **Given** `tessera: "1"`, `tessera: 0` or `tessera: 1.5`, **Then** the finding says the marker
   must be a whole number of at least 1.
3. **Given** a Tessera ontology whose `version` is missing or not a supported base, **Then** the
   document is invalid. No "Validate as" shortcut is offered.
4. **Given** `tessera_governance` (reserved for a later feature), **Then** the finding says the name
   is reserved and not available in revision 1.
5. **Given** `tessera: 1` in a semantic model, a mapping or an ODCS contract, **Then** the finding
   says that revision 1 allows the marker on ontologies only.
6. **Given** `tessera_notes` on a dataset or inside an embedded semantic model, **Then** the finding
   names the places where notes are allowed.

---

### User Story 6 - Later features extend the format without surprises (Priority: P2)

A developer building attributes, governance or the mesh adds one property or one document part.
They add an entry to the format's registry, a revision number, a disposition for the compiler and
tests. The schema, validation, loss report and documentation follow from that entry. When a new
Ossie base is pinned, a check fails if that base already uses a name Tessera reserves.

**Why this priority**: every later feature in decision R1 builds on this one; a format that cannot
grow safely would be rebuilt.

**Independent Test**: register a throwaway property and a throwaway base in a test and observe the
effects; register a base that collides and observe the failure.

**Acceptance Scenarios**:

1. **Given** a registry entry for a new property with revision 2, **When** a revision 1 document
   uses it, **Then** the finding says the property needs revision 2.
2. **Given** a new base whose schema defines a `tessera_`-prefixed property, **When** the base is
   registered, **Then** registration fails until a migration is written.
3. **Given** a second pinned base, **When** a Tessera document declares it, **Then** validation uses
   the schema derived for that base and the output label names that base.
4. **Given** the Tessera schema for a base, **When** it is regenerated, **Then** the bytes equal the
   checked-in file.

---

### User Story 7 - Agent and MCP consumers meet no surprise (Priority: P3)

The MCP server (feature 006) exposes validation, reading and published context. A Tessera document
reaches those tools through the same shared modules and behaves like an Ossie ontology. The
feature lists the checks 006 must run once it is on the main branch.

**Why this priority**: 006 is about to merge; it should not learn about Tessera by failing.

**Independent Test**: the handoff tasks run the existing tool tests with Tessera fixtures.

**Acceptance Scenarios**:

1. **Given** a Tessera ontology, **When** a tool returns its validation findings, **Then** they are
   the findings the browser shows.
2. **Given** a tool that returns source, **Then** the bytes returned are the committed bytes,
   marker and notes included.
3. **Given** the published-context and plan tools, **Then** no `tessera_notes` value appears in
   their output.
4. **Given** the tool list, **Then** no Tessera-specific tool is added by this feature.

---

### Edge Cases

- A Tessera document in JSON: the marker is the top-level key `tessera`. Output keeps JSON.
- A Tessera document at the 2,000,000-byte limit. Compile applies the same limit before parsing
  and the same alias limit.
- `tessera` appears in a nested object or inside a `SEMANTIC_WORKBENCH` extension payload. It is
  only a marker at the top level of an ontology. Elsewhere it is ordinary data, judged by the
  pinned schema.
- A `tessera_notes` value with control characters or a very long text. It is refused when empty,
  not a string, or longer than the limit.
- The same document marked twice with YAML aliases or anchors, or `tessera: &a 1` with an alias
  reuse. Aliases resolve before checks, as for any document.
- A project that holds an ODCS contract, RDF files and ignored files next to the ontology. The
  compiler lists them in the manifest as not included and copies none.
- A standard Ossie file that is invalid. The compile refuses the whole unit; it never copies an
  invalid file.
- Two documents in the unit that would write the same output path, such as two names that differ
  only in case. The compile refuses.
- A commit that is not on the default branch's history. The compile refuses to use it.
- An output folder that already holds files. The compile refuses rather than merge.
- A compile interrupted halfway. No partial bundle is left under the output name.
- A Tessera ontology whose `ontology_mappings` embed a semantic model (the deprecated
  consolidated layout). The embedded model is standard Ossie and passes through unchanged inside
  the compiled ontology.
- A compiler asked to compile a bundle it produced. Standard files pass through, and the second
  bundle equals the first.
- A document that declares the marker twice in JSON. The parser's duplicate-key rule applies, as
  for all documents.

## Requirements *(mandatory)*

### Functional Requirements

**The marker and the revision**

- **FR-001**: A document is a Tessera document if and only if its top-level object has the key
  `tessera`. The value MUST be a whole number of at least 1. Any other value MUST be a finding.
- **FR-002**: YAML and JSON ontology documents MUST both be able to carry the marker. RDF
  serializations MUST NOT carry it.
- **FR-003**: Revision 1 MUST accept the marker on Ossie ontology documents only. The marker on a
  semantic model, a mapping, a data contract or any other file kind MUST be a finding that names
  the allowed kind (decision E2).
- **FR-004**: A document that declares a revision higher than the highest the workbench supports
  MUST be invalid, with a finding that names the declared and the supported revisions. A document
  MUST NOT be read by guessing the meaning of a newer revision.
- **FR-005**: A document of revision N MUST be invalid if it uses an addition whose registered
  revision is higher than N.
- **FR-006**: Removing the last addition from a Tessera document MUST NOT remove the marker.
  The marker is removed only by compilation or by an explicit edit.

**Namespacing and the registry**

- **FR-007**: Every addition MUST be a property whose name starts with the reserved prefix
  `tessera_`. The marker `tessera` is the only reserved name without the prefix.
- **FR-008**: A property starting with `tessera_` that is not registered MUST be a finding. The
  finding MUST name the property and its path.
- **FR-009**: A name registered as reserved for a later feature MUST give a distinct finding that
  says it is reserved and not available in the declared revision. Revision 1 reserves
  `tessera_ai_context`, `tessera_governance`, `tessera_attributes` and `tessera_imports`.
- **FR-010**: There MUST be exactly one registry of additions. Each entry gives the property
  name, the revision that introduced it, the places where it may appear, the shape of its value,
  what the compiler does with it, and the feature that owns it. Validation, the derived schema,
  the compiler and the loss report MUST all read that registry and nothing else.
- **FR-011**: Revision 1 MUST register one addition, `tessera_notes`: free text for authors, a
  non-empty string of at most 10,000 characters, allowed on the ontology root, on each concept and
  on each relationship of an ontology document. It MUST NOT be allowed anywhere else, including
  inside an embedded semantic model.
- **FR-012**: Registering a pinned Ossie base MUST fail when that base's schema defines a property
  whose name starts with `tessera_` or equals `tessera` at a place where Tessera adds one, until an
  explicit migration resolves it (decision E1).
- **FR-013**: The product name, the marker key and the property prefix MUST each come from one
  definition, so that renaming the format is a mechanical change (decision E24).

**Bases and schemas**

- **FR-014**: A Tessera document MUST declare an Ossie `version` that names a supported base. A
  missing or unsupported base MUST be a finding. The "validate as the shipped version" shortcut
  MUST NOT apply to a Tessera document, and a "not validated" notice MUST NOT be given for one.
- **FR-015**: A Tessera document MUST be validated against the Tessera schema for its revision and
  base. That schema MUST be derived mechanically from the pinned Ossie schema of the same base and
  the registry. The pinned Ossie snapshots MUST NOT be edited (Principle V).
- **FR-016**: The derived schema MUST be a checked-in, labelled workbench schema. Regenerating it
  MUST produce identical bytes, and a test MUST fail when it does not.
- **FR-017**: Support for a base MUST be a table entry: the pinned schema, the derived schema, the
  label used in output and whether it is a draft. The compiler, the validator and the output label
  MUST read that table. Base 0.2.0.dev0 MUST be labelled a draft. A pinned development fixture of
  the next Ossie base MUST be exercised by tests and MUST NOT be offered as supported (decision
  E22).
- **FR-018**: Tessera MUST be a strict superset in both directions for revision 1: a document that
  is valid Ossie becomes a valid Tessera document by adding the marker, and removing the marker
  and every addition from a valid Tessera document gives a document that is valid Ossie.

**Reading and saving in the workbench**

- **FR-019**: The browser editor, the inspector, the file scan, the save endpoints and the
  agent-facing readers MUST apply the same Tessera rules from the same shared modules and give the
  same findings (Principle III).
- **FR-020**: Documents without the marker MUST be validated exactly as before this feature. Every
  finding, notice and inspection result for an unmarked document MUST be unchanged.
- **FR-021**: A Tessera ontology MUST keep the document type of an Ossie ontology for access
  rules, the file list and every consumer of that type. Its items, edges and entity kinds MUST equal
  those of the same document without the marker and the additions. Additions MUST NOT become
  items, edges or fields.
- **FR-022**: The result of inspecting a document MUST say whether it is standard or Tessera, with
  its revision and base, so that the interface can name it.
- **FR-023**: Findings for Tessera documents MUST carry a JSON-pointer path and a line and column
  when reliable, like other findings, and each refusal class MUST have its own finding code.
- **FR-024**: A valid Tessera document MUST be saved through the existing operations with the
  existing hash check and atomic write, and an invalid one MUST be rejected before any file is
  written. Form edits to other items MUST keep the marker and every addition byte for byte.
- **FR-025**: Item addresses MUST work on Tessera documents with the existing grammar. An addition
  MUST NOT change the address of any item, and each document-relative address in a Tessera document
  MUST name the same item in the compiled output.
- **FR-026**: Published Tessera ontologies MUST be readable for agent context, plans and
  explanations. No addition MUST appear in any of their output, and their output MUST equal that
  of the same document without additions.
- **FR-027**: This feature MUST NOT add an HTTP route or an operation. Reading, saving, validating
  and scanning use the operations listed in the operation inventory today. The inventory and its
  parity cases MUST cover Tessera documents on the read, save and batch-save operations.
- **FR-028**: The interface MUST show Tessera findings in the existing validation panel and name the
  document's format and base where it names the Ossie version today. It MUST NOT add controls.
- **FR-029**: All input and alias limits that apply to documents today MUST apply to Tessera
  documents and to the compiler's inputs.

**Compilation**

- **FR-030**: The compiler MUST be a pure function of its input documents, its options and its
  version. The same input MUST give byte-identical output regardless of the order in which files
  are listed, the folder they sit in, the time, the machine or the user.
- **FR-031**: Compiling a Tessera ontology MUST remove the marker and, according to the registry,
  every addition, and MUST change nothing else: every other property, value and key order MUST be
  kept, and the declared Ossie version MUST be kept.
- **FR-032**: The output MUST contain no `tessera` marker and no `tessera_` property at any depth
  where Tessera defines one.
- **FR-033**: Every compiled document MUST pass the pinned Ossie schema for its base and the
  workbench's structural rules with no "not validated" notice. If it does not, the compile MUST
  fail and no acceptance MUST be able to override that.
- **FR-034**: The compiler MUST check that the output preserves meaning: the same concepts,
  relationships, roles, inheritance, identifiers, IRIs, prefixes, descriptions and agent context as
  the source without additions, and the same resolution of every reference between documents of the
  unit. A difference MUST fail the compile and MUST NOT be overridable (decision E12).
- **FR-035**: A translation that the registry does not define MUST fail the compile. The compiler
  MUST NOT guess.
- **FR-036**: Standard Ossie documents in the unit MUST be validated and copied to the output with
  their exact bytes, including every vendor extension. An invalid standard document MUST fail the
  compile.
- **FR-037**: Compiling its own output MUST give the same output. Compiling a unit with no Tessera
  document MUST give the input bytes.
- **FR-038**: The output of a JSON document MUST be JSON and the output of a YAML document MUST be
  YAML. Output MUST be UTF-8 with LF line endings and one final newline. Values and key order are
  preserved. Comments and layout are not promised to survive; that MUST be stated in the
  documentation.
- **FR-039**: Round trips MUST be stated and tested exactly. Adding the marker to a standard
  document and compiling gives back the same data. Compiling a Tessera document and adding the
  marker again gives the source's data without its additions. The compiler does not recover
  dropped values, and no reverse compiler exists.

**Loss**

- **FR-040**: A loss is any value that the compile removes other than the marker. The report MUST
  list each loss with the document path, the document-relative address of the item, the property
  name, the JSON-pointer path, the byte length of the value and its SHA-256 digest. It MUST NOT
  contain the value.
- **FR-041**: The loss report MUST be machine-readable JSON with a version number. It MUST be
  deterministic: sorted entries, counts per property, no times, paths of the machine, names of
  people or generated identifiers. It MUST name the compiler version, the options, the base label
  and the SHA-256 of every input and output document, and it MUST have a digest computed over its
  canonical form.
- **FR-042**: When a compile has any loss and the loss is not accepted, no compiled file MUST be
  written. The report MUST still be delivered and the exit status MUST distinguish this case from
  a failure.
- **FR-043**: A loss MUST be accepted either by supplying the report's digest, or by a loss policy
  file. A digest MUST match exactly; any change to an input byte, an option or the compiler version
  changes it. A policy is a versioned JSON file that lists permitted property names; any loss
  outside the list MUST be refused (decision E15).
- **FR-044**: Schema, reference, size, semantic and registry failures MUST never be accepted by any
  digest or policy.
- **FR-045**: The manifest MUST record how the loss was accepted. The documentation MUST state
  that accepting a loss report is not approval of the exported content.
- **FR-046**: The loss report MUST leave room for the item status counts that decision E15 names.
  Ontology items have no status in revision 1, so the counts MUST be absent rather than zero.

**Sources, bundles and the command line**

- **FR-047**: The compile command MUST read only the committed snapshot of a repository's default
  branch from Git objects, resolved to a full commit identifier. It MUST NOT read the working tree,
  the index, other branches or untracked files, and it MUST NOT fall back to them. A repository
  with no commit on that branch MUST be refused as having no published snapshot.
- **FR-048**: The command MUST accept an explicit full commit identifier only when it is on the
  default branch's history. When a data root is given, the commit MUST equal the one the workbench
  has published for that repository, otherwise the command MUST refuse.
- **FR-049**: The unit MUST be one project folder of the repository at that commit. Reading MUST
  be bounded by the same per-document, total and file-count limits as published snapshots, checked
  before contents are read.
- **FR-050**: The command MUST write the bundle only to an output folder that does not exist or is
  empty and is outside the repository's folders and the data root's project and working-copy
  folders. It MUST write to a temporary folder and rename it, so that no partial bundle is visible.
  It MUST NOT write inside the source tree and MUST NOT change any source file.
- **FR-051**: The bundle MUST hold the output files at their relative paths, a manifest and the
  loss report. The manifest MUST name the repository's default branch, the commit, the project
  folder, each input file with its hash and its treatment (compiled, copied, not included), each
  output file with its hash, the compiler version, the Tessera revisions seen, the options, the
  base label and the accepted loss digest. It MUST state "valid against the bundled Ossie
  0.2.0.dev0 draft" (or the label of the base used).
- **FR-052**: A second command, `check`, MUST run the same validation and the same compilation in
  memory against a snapshot, a folder or the working tree, print findings and the loss report, and
  write nothing. Its output MUST be labelled unpublished when its source is not a committed
  snapshot. `check` MUST never produce a bundle.
- **FR-053**: The command line MUST have documented exit statuses for success, refusal (findings),
  loss needing acceptance, and misuse. It MUST offer human-readable output and JSON output.
- **FR-054**: The command line MUST NOT use the network, MUST NOT need a sign-in and MUST NOT
  rewrite or replace source files. Converting a source document to standard form is not part of
  this feature.
- **FR-055**: Two files that would write the same output path, including paths that differ only
  in case, MUST fail the compile.

**Versioning and extension points**

- **FR-056**: The compiler MUST carry a version. Any change to what it writes for the same input
  MUST change the version. Golden output files MUST pin the behaviour for the current version.
- **FR-057**: A later feature MUST add a property by adding one registry entry, raising the
  revision, defining what the compiler does with it, and adding fixtures. It MUST NOT need to
  change the marker rules, the reader or the report format.

**Governance and documentation**

- **FR-058**: The README, the architecture document, the user guide, the schema notes, the
  development guide, the item-address guide, the agent-runtime guide and the changelog MUST describe
  the format, the compiler and the command line in the same change, with the limits stated as
  plainly as the features.
- **FR-059**: Documentation MUST describe Tessera as "an authoring format that compiles to standard
  Ossie" and MUST NOT call it an Ossie edition, imply upstream endorsement, or claim compatibility
  with a released Ossie (Principle VII, decisions E22 and E24).
- **FR-060**: Documentation MUST say that the command line reads Git as the operating-system user,
  so it is not an authorization boundary, and that unpublished work stays inside the workbench only
  by application guarantee.

**Handoff to the MCP server**

- **FR-061**: Every MCP tool that returns validation findings, a parsed structure, source or
  published context MUST reach Tessera documents through the same shared modules and MUST behave as
  FR-019 to FR-026 describe, with no tool-specific Tessera code. The feature MUST list the checks
  that prove it as tasks for the MCP feature.

### Key Entities

- **Tessera document**: an Ossie ontology document with the marker, a revision and an Ossie base.
- **Marker**: the top-level key `tessera` and its revision number.
- **Revision**: the version of the Tessera rules a document declares. Revision 1 is the first.
- **Base**: the pinned Ossie version a document builds on; named by the document's `version`.
- **Addition**: a property starting with `tessera_` that Ossie does not have.
- **Registry entry**: the definition of an addition or of a reserved name.
- **Compilation unit**: the Ossie documents of one project folder at one snapshot.
- **Published snapshot source**: the committed state of the default branch, identified by a full
  commit identifier.
- **Loss**: one value the compile removes, identified by document, item and property.
- **Loss report**: the deterministic list of losses with its digest.
- **Acceptance**: a digest or a policy that releases output carrying a given loss.
- **Manifest**: the record of what was read, compiled, copied and written.
- **Bundle**: the output folder: standard files, manifest and loss report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every existing validation, example and address fixture, the findings and
  inspection results equal those recorded before this feature. Zero differences.
- **SC-002**: Compiling the fixture project 100 times with the files presented in shuffled order
  and from different folders gives one bundle: all hashes equal.
- **SC-003**: For a fixture holding every kind of addition at every allowed place, 100% of the
  removed values appear in the loss report, and the output holds none of them.
- **SC-004**: Every output document of the fixture project validates against the pinned Ossie
  schema with no notice, and every reference between its documents resolves as in the source.
- **SC-005**: Every refusal class in User Story 5 and in FR-033 to FR-035, FR-044, FR-047, FR-048,
  FR-050 and FR-055 has a test that fails when the check is removed.
- **SC-006**: Each acceptance mismatch (changed note, changed option, changed compiler version) is
  refused in a test, and no supplied digest or policy lets a schema, reference, semantic or
  registry failure through.
- **SC-007**: For every item of the fixture ontology, the document-relative address in the source
  names the same item in the compiled output.
- **SC-008**: A compile of a project folder with 200 documents and 20 MB in total finishes within
  30 seconds on the development server. These numbers were chosen here and not measured; the task
  that implements the check records the measured values.
- **SC-009**: A new base and a new property can be added in a test without editing the marker,
  reader or report code.
- **SC-010**: The mutation suite detects every mutant of schema selection, compilation, loss
  reporting and acceptance.
- **SC-011**: The new documentation passes the repository checks, and each claim in it names
  behaviour covered by a test.

## Assumptions

- **Registry of revision 1.** One real addition, `tessera_notes`, exists so that the compile, the
  loss report and the acceptance can be exercised end to end. The roadmap's real additions
  (agent context, governance, attributes, imports) are later features and are reserved by name
  only.
- **Authoring only.** `tessera_notes` is for people who edit the file. It never reaches agents,
  plans, explanations or compiled output.
- **Operator tool.** The command line runs with the operating-system user's own access to the
  repository. Authorization of person and agent callers applies when the compiler is exposed
  through HTTP or MCP, which is a later feature.
- **Published in the command line.** The default branch is named by an option or taken from the
  repository's remote head, falling back to `main`. When the command is given a workbench data
  root it uses the workbench's own published commit.
- **Chosen numbers.** The 10,000-character limit for notes and the performance target in SC-008
  were chosen here without measurement. The input limit of 2,000,000 bytes and the snapshot limits
  are the existing ones.
- **Draft base.** Only Ossie 0.2.0.dev0 is supported. It is an unreleased upstream draft, and the
  README and the output say so.
- **Existing machinery.** Bun, TypeScript, the YAML library, the schema compiler and the Git access
  of the server are used as they are. No new dependency is added.
- **Constitution 4.0.1** already describes Tessera, the compiler and loss acceptance. No
  amendment is needed.

## Out of Scope

Each item below is a later feature in the roadmap (decision R1). The extension point that it needs
from this feature is named after the dash.

- Item diff, work-in-progress overlay and publication review. Needs: stable item addresses on
  Tessera documents (FR-025) and the format's reader.
- Attributes, item-level agent context and governance attributes. Needs: the registry (FR-010),
  reserved names (FR-009), revisions (FR-005) and the compiler dispositions (FR-035).
- Multi-file Ossie, document parts, composition roots, imports, the connected-project mesh and
  department and organization targets. Needs: the unit (FR-049), the marker rules and the manifest.
  Revision 1 allows no part or composition marker.
- Shared proposal branches. No dependency on the format.
- Person sign-in, usage counters and the ACP panel. No dependency on the format.
- Further MCP tools, including a compile tool and MCP resources. Needs: the compiler as a pure
  function and the manifest and report formats.
- The HTTP and browser export of standard Ossie, and the reviewed "convert to standard"
  operation with backup. Needs: the compiler core and the report. Decision E14 orders them after
  the command line.
- Adoption of the first released Ossie base (decision E22). Needs: the base table (FR-017).
- Companion-file reconstruction of dropped values (decision E15).
- Status-based projections such as approved-only export (decision E16). Needs: governance status.

## Decisions made while specifying

The owner has not been asked. Each choice is the one most consistent with the decisions file, and
the owner may overrule it.

1. **Prefix `tessera_`, not `sw_`.** Decision E1 gives `sw_` names as examples and a marker
   `sw_format`. Decision E24 later fixed the marker as `tessera: 1` and asked for one constant.
   A prefix drawn from the same name keeps one rename point.
2. **One real addition, `tessera_notes`.** The decisions assign every useful addition to a later
   feature. Without one, the compiler, loss report and acceptance could not be tested end to end.
   Notes are small, authoring-only and lost on compile, which exercises the loss path.
3. **Four reserved names.** `tessera_ai_context`, `tessera_governance`, `tessera_attributes` and
   `tessera_imports` are reserved by name so that no author uses them before their feature exists.
4. **Marker on ontologies only.** Decision E2 keeps semantic models, datasets, mappings and
   governance in standard Ossie unless a mesh construct needs more.
5. **The unit is one project folder.** Decision E3 defines parts and composition roots, and E26
   an ordered include list. Both need multi-file units, which are a later feature. Standard files
   pass through byte for byte.
6. **Two commands.** `compile` reads only the published snapshot and writes a bundle. `check` works
   on any state and writes nothing. This keeps Principle I ("never falls back to files on disk")
   and still lets an author see what would be lost.
7. **Comments are not promised.** Output keeps values and key order. Keeping every comment
   through removal of nodes is not reliable, and the compiler must never trade determinism for
   it. The source file is never rewritten.
8. **Acceptance by digest, plus an optional policy file.** Decision E15 names both; a digest alone
   would make automated releases impractical.
9. **The report holds a digest of each lost value, not the value.** The report is shared with
   reviewers and automation, and a note may hold anything.
10. **Revision rule.** A feature that makes the format accept anything new raises the revision. A
    document declares the highest revision of the additions it uses or more. An older workbench
    refuses a newer document instead of dropping parts of it.
11. **No route and no operation.** Reading, saving and scanning already pass through the
    operation boundary. The HTTP and browser export is later (decision E14), so there is nothing
    to add to the inventory beyond parity cases.
12. **The document type stays "Ossie ontology".** Access rules are written against that type.
    A new type would let a Tessera file escape existing rules.
13. **Output folder outside the repository.** Decision E14 asks for generated bundles outside
    scanned source directories.
14. **The next-base fixture.** Decision E22 asks for a pinned 0.3 development fixture without
    naming a source. The plan pins the upstream development schema if one exists when the task
    runs, and otherwise uses a synthetic second base to exercise the table and the collision check.
15. **Chosen numbers** (notes limit, performance target) are marked as chosen, not measured.

## Gaps and contradictions in the decisions file

Reported for the owner; none blocks this feature.

- E1 names `sw_format` as the marker and `sw_*` as the prefix, E24 names `tessera: 1`. Resolved by
  decision 1 above.
- E3 and E26 describe extended-root, part and composition-root schemas. Only the root exists in
  this feature; parts and composition wait for multi-file units.
- E15 asks for "status counts" in the loss report, but ontology items have no status until
  governance exists. The report leaves the field out (FR-046).
- E4 defines published as the "configured default branch" of the workbench. A stand-alone command
  has no configuration; the plan names the rule it uses (Assumptions).
- E10 limits compilation to complete, authorized units. A command line run as the operating-system
  user has no workbench authorization; the limit is documented (FR-060).
- E22 asks for a pinned 0.3 development fixture without a source (decision 14).
- No decision says when the marker revision rises. Decision 10 supplies the rule.
- E23 says constitution 4.0.0; main holds 4.0.1. The difference is wording only.
