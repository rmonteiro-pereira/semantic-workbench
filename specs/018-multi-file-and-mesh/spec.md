# Feature Specification: Multi-File Ontology Units and the Ontology Mesh

**Feature Branch**: `018-multi-file-and-mesh` (documents only; the feature's own branch is created when implementation starts)

**Created**: 2026-11-17

**Status**: Draft

**Input**: Each department should own its ontology and the departments should link into one whole
(decisions E3, E10, E11, E12, E13, E19, E26, roadmap step 8 of R1). Today one ontology is one file,
and a project cannot use a concept that another project owns. This feature lets one ontology be
split over several files, lets a project import named concepts from another project, freezes what
an import means until the importing project updates it, lets a provider see who depends on it, and
lets the Tessera compiler produce one self-contained standard Ossie ontology from a unit and its
imports. It builds on the Tessera format and compiler (feature 011) and on the published snapshot,
item addresses and operation boundary that exist today.

## Summary

- An ontology can be a **unit**: one **root** document and an ordered list of **part** documents.
  The root's list is the only authority for what belongs to the unit. A part has no ontology
  header of its own. The workbench shows the unit as one ontology in the graph, the catalog and the
  agent context, and each item keeps an address that names the file it sits in.
- A project can **import** named concepts from another project that lives in the same workbench,
  whether that project is in the same Git repository or in another one. The import lists exactly
  which concepts it uses and gives them a local alias. A provider chooses what it **exports**.
- An import never changes by itself. When the importing project is published, each import is
  resolved to an exact provider version and the result is stored in a committed
  **dependency manifest**. The importing project is read and compiled from that manifest until its
  authors update the dependencies on purpose.
- A unit is checked as a **complete set** (all its files and its resolved imports together). An
  author who cannot read every file of the set cannot save a change that depends on the set, and the
  answer is the same whether a file is missing or hidden.
- A provider's **Stewards and Admins** can see, for each published project that imports from it:
  the project's name and domain, the concepts it imports and the version it uses. They see nothing
  else about it, and no counts.
- A **mesh view** shows the workbench's projects as tiles and the published imports between them.
- The compiler turns a unit and its imports into one **self-contained** standard Ossie ontology.
  It refuses when it cannot keep the meaning, and it never guesses.
- Typed links between concepts, composition roots, department and organization compile targets,
  compatibility checks and releases are later features. This one names the extension points they
  will use.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An author splits one ontology over several files (Priority: P1)

An author of a large ontology moves related concepts into part files and lists them in the root.
The root keeps the ontology name and Ossie version. The graph, the catalog and the inspector show
one ontology. Editing a concept saves the file that holds it. Adding a concept lets the author pick
the file. Moving a concept from one file to another keeps its identity for diff and counters.

**Why this priority**: every other part of the mesh needs ontologies that are bigger than one file,
and it is the first thing a team with a large ontology will use.

**Independent Test**: open a fixture unit with a root and three parts, edit, add and move concepts
through the existing editing operations, and compare the graph with the same ontology in one file.

**Acceptance Scenarios**:

1. **Given** a root that lists two parts, **When** the unit is opened, **Then** the graph and the
   catalog hold the concepts of the root and both parts, in the order root first and then the list
   order, and equal the graph of the same ontology written as one file.
2. **Given** a concept in a part, **When** the author edits its description, **Then** only that
   part's file changes and every other byte of every file is unchanged.
3. **Given** the author adds a concept and chooses a part, **Then** the concept is written to that
   part, and a name already used anywhere in the unit is refused with a finding that names both files.
4. **Given** a file that is listed by two roots, **Then** both roots get a finding for duplicate
   ownership and the file is not treated as part of either unit.
5. **Given** a root whose list names a file outside its project folder, a missing file, itself or
   another root, **Then** each case has its own finding and the unit is invalid as a set.
6. **Given** a part that declares an Ossie version different from its root's, **Then** the finding
   says that units cannot mix versions.
7. **Given** a part that no root lists, **Then** the finding says it is an orphan, and the file is
   still readable and editable as a fragment.
8. **Given** an ordinary one-file ontology, **Then** nothing about it changes.

---

### User Story 2 - A department imports concepts from another department (Priority: P1)

The retail team needs `Invoice` and `Currency`, which the finance team owns. The finance team
exports them. The retail author opens the Imports section of the retail ontology, picks the finance
project, ticks the two concepts, gives the alias `fin`, and uses `fin.Invoice` as a type, a parent
or a role in retail concepts. The editor shows what each imported concept is, who owns it and which
version is in use, and refuses any use of a finance concept that was not ticked.

**Why this priority**: it is the point of the mesh: each department owns its definitions and the
whole is built by reference, not by copying.

**Independent Test**: two fixture projects; the provider exports two concepts; the consumer
imports them and references them. Validate, save and read the consumer in the browser path and
through the operation boundary.

**Acceptance Scenarios**:

1. **Given** a provider that exports `Invoice` and `Currency`, **When** a consumer imports them
   with the alias `fin` and uses `fin.Invoice`, **Then** the consumer is valid and the graph shows
   `Invoice` as an imported concept owned by the provider.
2. **Given** a consumer that uses `fin.Customer`, which is not in its allow-list, **Then** the
   finding names the concept and says it is not imported.
3. **Given** a consumer that imports `Ledger`, which the provider does not export, **Then** the
   finding says the provider does not export it, and it says the same when the concept does not exist.
4. **Given** two consumers that use the aliases `fin` and `finance` for the same provider,
   **Then** both are valid and both resolve to the same owner.
5. **Given** one consumer that uses one alias for two providers, or two aliases for one provider,
   **Then** each case is refused.
6. **Given** a provider whose export list names a concept that depends on a concept it does not
   export, **Then** the provider cannot be published and the finding names the missing concept.
7. **Given** a provider in the same repository as the consumer, and one in another repository,
   **Then** both imports work. The same-repository provider cannot be pinned to an older version.
8. **Given** the import editor, **When** the author has no read access to the provider, **Then**
   the provider does not appear in the picker, and a typed name gets the same answer as a name that
   does not exist.

---

### User Story 3 - An import means the same thing until it is updated (Priority: P1)

The retail team publishes with the finance version it resolved. Later finance publishes a change.
Retail's published state, its compile output and its views do not change. When a retail author
chooses "Update dependencies", the workbench shows what changed in the finance interface, resolves
again, and writes a new manifest that goes out with the next publication.

**Why this priority**: without it, any provider edit could silently change another department's
published model (decision E11).

**Independent Test**: publish a provider and a consumer, publish a provider change, and compile
the consumer before and after updating.

**Acceptance Scenarios**:

1. **Given** an import with no pin, **When** the consumer is published, **Then** the manifest
   records the provider's full commit identifier and an interface hash, and later provider changes
   do not alter the consumer's compile output.
2. **Given** a provider that published after the consumer, **When** the consumer's author opens the
   Imports section, **Then** it says an update is available and says whether the exported
   interface changed.
3. **Given** an explicit pin to a commit that is on the provider's published history, or to a
   release tag that resolves to one, **Then** the pin is accepted. A pin to any other commit,
   including one that exists only in the repository's object store, is refused.
4. **Given** a consumer that imports two providers that themselves import the same third provider
   at different resolved versions, **When** it is compiled, **Then** the compile is refused and
   names the third provider and both versions.
5. **Given** a manifest whose pinned commit can no longer be read, or a provider the person may no
   longer read, **Then** compile and publication fail closed with a finding, and no output is made
   from a guess.
6. **Given** a consumer and provider in the same repository, **When** both change in one
   candidate publication, **Then** the import is resolved against the candidate's provider files
   and the whole candidate is accepted or refused together.
7. **Given** a consumer that was never resolved (no manifest or a stale manifest), **Then**
   publication is refused with a finding that offers "Update dependencies".
8. **Given** two projects that import each other, **Then** the manifests are written and a compile
   finishes. A cycle through inheritance is refused.

---

### User Story 4 - The compiler produces one self-contained standard ontology (Priority: P1)

A release job compiles a project that has parts and imports. The output is one standard Ossie
ontology per root, with every part merged in and every imported concept (and what it depends on)
included under a name that shows its owner. A consumer that knows only Ossie loads it. The loss
report and manifest say what was merged, what was imported and from which versions.

**Why this priority**: the format is only useful if it still compiles to standard Ossie (decision
E12), and a unit that cannot compile is worse than no unit.

**Independent Test**: compile the fixture mesh and validate the output with the pinned Ossie
schema; compile it again in a shuffled order; compare with golden files.

**Acceptance Scenarios**:

1. **Given** a root with two parts, **When** compiled, **Then** the output is one ontology that
   holds the root's concepts, then each part's in list order, and contains no part marker, include
   list or Tessera property.
2. **Given** a consumer with imports, **When** compiled, **Then** the output holds the imported
   concepts and everything they depend on, each named by its owner, and every reference in the
   output resolves inside the output.
3. **Given** the same input, **When** compiled twice in different folders and with the files in a
   different order, **Then** the outputs are byte-identical.
4. **Given** an imported concept whose meaning cannot be kept in standard Ossie, **Then** the
   compile fails with the concept and the reason, and no acceptance can release it.
5. **Given** a provider's private concept that an exported concept needs, **Then** the compile
   fails and names it.
6. **Given** two providers that each own a concept with the same name, **Then** the output keeps
   both under their owners' names with no collision, and does so whether or not they collide today.
7. **Given** the compiled output, **When** its own concepts are inspected, **Then** each has the
   name it has in the source. Only imported concepts are renamed.
8. **Given** a unit with no parts and no imports, **Then** the compile result equals the result of
   feature 011.
9. **Given** the manifest of a compile, **Then** it lists each merged part, each provider with its
   version and interface hash, and the address of every source item next to its address in the output.

---

### User Story 5 - A provider's Steward sees who depends on it (Priority: P2)

The finance Steward opens the Used by list of the finance ontology. For every published project that
imports from finance it shows the project's name and domain, the imported concepts and the version
in use, and says whether a newer finance version exists. The Steward can see this even when they
cannot open the importing project. Before an author publishes an import, the workbench tells them
that this will be visible.

**Why this priority**: the owner authorized dependents to be named (decision E19); it makes the
mesh governable but depends on imports existing.

**Independent Test**: publish three consumers, one of which the Steward cannot read; read the list
as a Steward, an Editor and an Admin; remove an import and publish.

**Acceptance Scenarios**:

1. **Given** three published consumers, **When** a Steward of the provider opens Used by, **Then**
   all three appear with name, domain, imported concepts and version, including the one the Steward
   cannot read.
2. **Given** the same list, **When** an Editor or Viewer of the provider opens it, **Then** it is not
   offered, and a direct request answers as for a missing page.
3. **Given** an import that exists only in an unpublished branch or a proposal, **Then** it is not
   listed.
4. **Given** a consumer that removes the import and publishes, or is deleted, **Then** it leaves
   the list.
5. **Given** the list, **Then** it holds no usage counts, no person, no dates of requests, and the
   workbench sends no message to anyone.
6. **Given** an author who adds an import, **Then** a notice before publication says who will see
   the project's name, domain, imported concepts and version, and publication needs it to be shown.
7. **Given** a consumer with no domain, **Then** the list says "No domain".

---

### User Story 6 - An author who cannot read the whole set is protected and not misled (Priority: P2)

An editor may read the root of a unit but not one of its parts. They can open what they may read,
see findings of single files, and keep a private draft. They cannot save or publish a change that
depends on the set. The answer for a part they may not read is the same as for a part that does not
exist. No set finding that mentions a hidden file reaches them.

**Why this priority**: set validation would otherwise leak private definitions (decision E10).

**Independent Test**: one project with access rules that hide one part; save as the partial reader,
as a full reader and with the part deleted; compare the answers.

**Acceptance Scenarios**:

1. **Given** a partial reader, **When** they save a change to a readable file of a unit, **Then**
   the save is refused before the change is examined, and the answer is identical when the hidden
   part is replaced by a missing one.
2. **Given** a partial reader, **When** they open the unit, **Then** they see the files they may
   read with their single-file findings and a notice that the set is not checked for them, with no
   name or count of hidden files.
3. **Given** a full reader, **Then** they see set findings and can save.
4. **Given** findings computed for a full reader, **When** a partial reader opens the same unit,
   **Then** those findings are not shown to them.
5. **Given** a provider's published interface, **Then** a consumer is compiled from it without
   reading the provider's private implementation files.
6. **Given** an access change that hides a file, **Then** the next read applies it and no earlier
   set finding is reused.

---

### User Story 7 - The mesh is visible as a whole (Priority: P2)

Anyone can open the **Mesh** view and see the projects they may read as tiles, grouped by domain,
with an arrow for each published import between two of them. Selecting a project shows what it
imports and what imports from it (as far as the person may see), with versions. The view works
on a phone and in both themes.

**Why this priority**: the owner wants the departments to link into a whole that people can see.

**Independent Test**: a fixture workspace with five projects and six imports; read it as people with
different access; check the view's states in a browser at three widths and two themes.

**Acceptance Scenarios**:

1. **Given** published imports, **Then** the view shows each readable project once and each import
   between two readable projects as one arrow with its owner and version in text.
2. **Given** an import whose other end the person may not read, **Then** the arrow ends at a tile
   that says "A project you cannot open" with no name, and the answer is the same when the other
   end does not exist.
3. **Given** no imports, **Then** the view says so and explains how to start.
4. **Given** loading and failure, **Then** each has its own state and the rest of the workbench
   stays usable.
5. **Given** a project with a very long name or domain, **Then** all of it is readable.
6. **Given** the view, **Then** it uses published declarations only and says so.

---

### User Story 8 - A bad unit or import is refused with a clear reason (Priority: P2)

Every structure problem has its own finding with the files involved and what is allowed: duplicate
ownership, include cycles and self-includes, paths that leave the project, a part with an ontology
header, a mixed Ossie version, an alias used twice, an allow-list that is empty or names the same
concept twice, a use of a concept that was not imported, an import of an unexported concept, a
private dependency in an export, a pin that is not published history, a conflicting second version
of a provider, and an unsupported translation. None falls through to "not validated".

**Why this priority**: the format must never take an unvalidated path (Principle III) and these are
the cases E26 names.

**Independent Test**: one fixture per refusal class checked in the browser validator, the save path,
the scanner and the compiler.

**Acceptance Scenarios**: one scenario per class, each: **Given** the fixture, **Then** the
finding code, the path and the files named in it match the contract.

---

### Edge Cases

- A root with an empty list of parts and its own concepts: it is a plain ontology with the marker.
- A root whose own `ontology` list is empty and whose parts hold all concepts: valid; the compile
  output is non-empty because the parts are merged.
- A part file in JSON and a root in YAML: allowed; output follows the root's serialization.
- A file name that differs from another only in case: refused when it would write the same output
  path (feature 011 rule).
- Two parts that define the same concept name: refused as a duplicate with both files named.
- Roles, parents and identifiers that refer to a concept in another part: resolved over the whole unit.
- A concept moved between parts by the editor: its address changes by the recorded migration, so
  diff, counters and links follow it.
- A concept moved between parts by hand outside the workbench: it appears as removed and added until
  reconciled (decision E6).
- An import whose provider is later moved to another folder or renamed in the workbench: the manifest
  names the provider by its stable project identity and the update flow offers the new place.
- A provider that is trashed or removed: consumers' next publication is refused with a finding;
  already published consumers keep their snapshot but their compile fails closed.
- A provider whose exported concept is deprecated or not yet approved: imports are allowed; status
  is shown where governance exists (feature 016) and is never treated as approval.
- An exported concept is removed by the provider: consumers keep their frozen version; their update
  flow reports that the concept no longer exists.
- Import chains longer than the limit, or a very wide set: bounded, with a finding that says which
  limit was reached.
- A local-mode workbench with one project: imports to other local projects work; there is no
  person-based access, so partial reading does not arise.
- A project without Git or without a published commit: it can hold parts and imports, but it cannot
  be resolved by others and cannot publish dependencies (decision E4).

## Requirements *(mandatory)*

### Functional Requirements

**Units: root, parts and the include list**

- **FR-001**: A Tessera ontology MAY list other files of its own project folder as parts, in an
  ordered list. A root with a non-empty list is the root of a unit. The list is the only authority
  for what belongs to the unit.
- **FR-002**: A part MUST be marked as a part by the format, MUST contain concepts only, and MUST NOT
  declare an Ossie version, a name, imports or its own include list.
- **FR-003**: The unit's Ossie version MUST be the root's. A part that declares a version, or an
  imported provider whose Ossie base differs from the root's, MUST be refused as a mixed-version
  unit. No conversion is offered in this feature.
- **FR-004**: The workbench MUST refuse, each with its own finding that names the files: a file listed
  by two roots (duplicate ownership); a list that names its own root, another root or a part twice
  (include cycle); a path that is absolute, uses a parent folder, contains a backslash or a control
  character, or leaves the project folder (path escape), including by a link; a listed file that does
  not exist; and a listed file that is not a part.
- **FR-005**: A concept name MUST be unique across a whole unit. A repeat MUST be a finding naming
  both files.
- **FR-006**: A part that no root lists MUST be reported as an orphan and MUST remain readable and
  editable as a fragment.
- **FR-007**: A root MAY have no concepts of its own when its parts hold them.
- **FR-008**: Every reference between concepts of a unit (parents, roles, identifiers, constraints,
  mappings) MUST resolve over the whole unit, whichever file holds each end.
- **FR-009**: The browser, the file scan, the save endpoints and the agent-facing readers MUST show
  and treat a unit as one ontology. The graph, the catalog, the inspector and published agent
  context MUST equal those of the same ontology written as one file, except for the file named in
  each item's address.
- **FR-010**: Every item MUST keep an address that names its own file. Moving a concept between files
  with the editor MUST record an address migration so that diff and counters follow the item.
- **FR-011**: The editor MUST let the author choose the file when adding a concept, and MUST save an
  edited item to the file that holds it, keeping every other byte of every file.
- **FR-012**: A unit MUST be bounded: at most 200 parts per root and the existing file, byte and
  alias limits for a unit.
- **FR-013**: A unit with no parts and no imports MUST behave exactly as it does under feature 011.

**Exports and imports**

- **FR-014**: A provider's root MUST be able to declare which of its concepts are exported. A project
  with no export declaration exports nothing.
- **FR-015**: Every exported concept MUST be closed: every concept it needs for its meaning (parent
  types, role players, identifiers and constraint references) MUST itself be exported, imported and
  re-exported, or built in. A provider with an export that is not closed MUST NOT be publishable, and
  the finding MUST name the missing concept.
- **FR-016**: A root MUST be able to import from another project of the same workbench. Each import
  names the provider project, the provider ontology when the provider has more than one exporting
  root, a local alias, an allow-list of concept names and a version choice (follow the latest
  published version, or an explicit pin).
- **FR-017**: A concept of a provider MUST be usable in the importing ontology only by its alias and
  name, only when it is in the allow-list, and only where an ordinary concept reference is allowed.
  Any other use MUST be a finding.
- **FR-018**: The allow-list MUST NOT be empty, MUST NOT repeat a name, and every name MUST be an
  exported concept of the resolved provider version. A name that is not exported and a name that does
  not exist MUST give the same finding.
- **FR-019**: An alias MUST be unique inside the importing unit and MUST map to exactly one provider
  ontology, and one provider ontology MUST appear in at most one import of a unit. Different
  importing units MAY use different aliases for the same provider.
- **FR-020**: A provider's identity for ownership MUST be its project's stable identity and its
  ontology's document, not any alias. An imported concept MUST never become the importer's own.
- **FR-021**: Imports MUST resolve inside the workbench only. The workbench MUST NOT contact another
  system to resolve one.
- **FR-022**: Imports to a provider in the same repository and to a provider in another repository
  MUST both work, as MUST providers and consumers in repositories shared by several projects.
- **FR-023**: Reference cycles between projects (A imports B and B imports A) MUST be allowed and
  traversed with a visited set. Inheritance cycles through imports MUST be refused.
- **FR-024**: An import chain MUST be bounded at eight providers deep, and a unit MUST hold at most
  50 imports. Reaching a bound MUST be a finding that names it.

**Resolution and the dependency manifest**

- **FR-025**: When a project is published, every import MUST be resolved to an exact provider
  version: the provider's full commit identifier of its published snapshot, and the hash of the
  provider's exported interface. The result MUST be stored in a versioned manifest committed in the
  importing project's folder.
- **FR-026**: A person MUST be able to ask for "Update dependencies". The workbench MUST resolve
  every import again, show what changed in each exported interface, and write the manifest to the
  person's working copy. Resolution MUST NOT happen silently at any other time.
- **FR-027**: Serving, compiling and checking a published consumer MUST use its manifest and MUST NOT
  read the provider's current state. A provider change MUST NOT change a consumer until it updates.
- **FR-028**: An explicit pin MUST be accepted only for a commit that is on the provider's published
  history, or a release tag that resolves to such a commit. Any other value, including a commit that
  exists only in the repository's object store or on an unpublished branch, MUST be refused.
- **FR-029**: A compile MUST use one version of each provider. Two paths to one provider with
  different resolved versions MUST be refused and the finding MUST name the provider and both versions.
- **FR-030**: For providers in the same repository as the consumer, resolution MUST use the
  candidate publication snapshot. A pin on such a provider MUST be refused. The manifest MUST record
  the interface hash, and publication MUST check that hash against the candidate's provider files, so
  the consumer and provider move together or not at all.
- **FR-031**: Publication MUST be refused when a manifest is missing, is older than the imports it
  covers, names a pinned object that cannot be read, or names a provider the publishing person may
  not read now. The finding MUST say which, and MUST offer "Update dependencies".
- **FR-032**: A compile or serve step that cannot read a pinned object or has lost access MUST fail
  with a finding and MUST NOT fall back to the provider's current state or to files on disk.
- **FR-033**: Provider changes MUST produce an "update available" status with a summary of what
  changed in the exported interface, not an automatic change. Judging whether a change is
  compatible is a later feature; this feature MUST say "not judged".

**Validation of the set and partial readers**

- **FR-034**: The workbench MUST distinguish three results: the findings of one file, the findings of
  a complete set (the unit and its resolved imports), and the incomplete view of a reader who cannot
  see every file of the set.
- **FR-035**: A save, a form edit or a publication that depends on a set MUST need the person to be
  able to read every local file of the unit and every provider interface it uses. When they cannot,
  the operation MUST be refused before the proposed change is examined, with an answer identical for
  a file that is missing and a file that is hidden.
- **FR-036**: A reader who cannot see every file MUST still see the single-file findings of the
  files they may read, MUST see that the set is not checked for them, and MUST NOT receive a set
  finding, a file name, a count or a path of anything they may not read.
- **FR-037**: Set findings MUST NOT be reused between people or between access states. Findings for a
  set MUST be recomputed whenever any file, any resolved provider version or the person's access
  changes.
- **FR-038**: A provider's published public interface (the exported concepts and everything they
  need) MUST be readable and compilable without reading the provider's private files, and the
  importing side MUST NOT receive the provider's private files.
- **FR-039**: Set errors MUST block every publication path, including publication that follows a
  remote.
- **FR-040**: A person who cannot save because of FR-035 MUST be able to keep a private draft.

**Dependents**

- **FR-041**: The workbench MUST keep a registry of published imports, derived only from the
  published snapshots' declarations and manifests. It MUST be updated when a project is published
  or removed and MUST be rebuildable from published snapshots alone.
- **FR-042**: For each published importing project the registry MUST give its name, its domain (or
  "No domain"), the imported public concepts, the resolved version, and whether a newer provider
  version exists. It MUST NOT hold or show usage counts, people, requests, times of reading, or
  imports that exist only in branches or proposals.
- **FR-043**: Only a person who may publish the provider project (Stewards and Admins by default) MAY
  read its dependents, even without access to the importing project. Anyone else MUST get the answer
  they get for a page that does not exist. The exception MUST NOT open the importing project.
- **FR-044**: Before an import is published, its author MUST be shown a notice naming what the
  providers' Stewards and Admins will see, and publication MUST record that it was shown.
- **FR-045**: Removing access to the importing project MUST NOT remove its published entry. Removing
  the import or the project and publishing MUST remove it.
- **FR-046**: The workbench MUST NOT send any message about dependents or imports.

**The mesh view**

- **FR-047**: The interface MUST offer a Mesh view that shows the projects the person may read, their
  domains, and the published imports between them, from published declarations only, and says so.
- **FR-048**: An import with an end the person may not read MUST appear as an arrow to an unnamed
  tile and MUST be identical for an end that does not exist.
- **FR-049**: Selecting a project MUST show its published imports with owner, concepts and version,
  and, for people allowed by FR-043, its dependents.
- **FR-050**: The Mesh view and its details MUST work without a mouse, state every relation in
  words and not by colour alone, and show a text alternative of the arrows.

**Compilation**

- **FR-051**: Compiling a unit MUST merge the root's concepts and then each part's in list order into
  one standard ontology at the root's place. No part file MUST appear in the output, and no marker,
  include, import, export or part property MUST remain.
- **FR-052**: Compiling imports MUST include each imported concept and everything it needs, taken
  from the provider version in the manifest, so the output is self-contained and every reference
  resolves inside it.
- **FR-053**: Each imported concept MUST be written under a name that names its canonical owner, in
  every case and not only when names collide. The importer's own concepts MUST keep their names. Every
  reference to an imported concept in the importer MUST be rewritten to that name, whatever alias
  the source used.
- **FR-054**: The compile MUST refuse, without any way to accept, a dependency on a private concept,
  a provider of another Ossie base, a translation that the format does not define, a name that would
  collide after qualification, and any change of meaning that the meaning check finds (feature 011).
- **FR-055**: The output MUST be a pure function of the files, the manifest, the provider snapshots
  named in it, the options and the compiler version, as under feature 011.
- **FR-056**: The loss report MUST list what each compile drops under the existing rules. Merging parts
  and translating imports are not losses. An export declaration that the standard has no place for MUST
  be reported as a loss and need acceptance.
- **FR-057**: The manifest of a compile MUST list the merged parts, each provider with its version and
  interface hash, and a map from each source item address to its output address, and the meaning check
  MUST use the map.
- **FR-058**: The compile of a project that has imports MUST read provider snapshots only from the
  published history named by the manifest. The command line MUST refuse a project that has imports
  from another repository unless it is given the workbench data folder.
- **FR-059**: Compile limits and the alias limit of feature 011 MUST apply to units and provider
  closures.

**Registry, format and documentation**

- **FR-060**: The new properties and the part marker MUST be added to the format through its registry
  with a new revision, and the schema, validation and loss report MUST follow from the registry
  (feature 011, FR-057).
- **FR-061**: Documents of an earlier revision MUST be read unchanged, and a document that uses a
  new property under an earlier revision MUST get the existing "needs revision" finding.
- **FR-062**: No new agent-visible operation MUST be added. Agent-facing reads (context, plans,
  explanations, validation findings) MUST treat a unit as one ontology and MUST NOT include
  an unpublished import or part (decision E5).
- **FR-063**: The documentation MUST describe the unit, imports, exports, the manifest, partial
  readers, dependents and the Mesh view, say that no typed links, composition, organization targets,
  compatibility judgement or releases exist yet, and say that the dependents list is visible to
  provider Stewards and Admins by design.
- **FR-064**: All new interface MUST use the existing visual design (tokens, components, layout), have
  empty, loading, error and long-text states, work at phone width in light and dark themes, never
  clip or cut text with an ellipsis, and never rely on colour alone.

### Key Entities

- **Unit**: a root and its parts, treated as one ontology.
- **Root**: the ontology document that lists the parts and holds the version and name.
- **Part**: a file of concepts with no header, owned by one root.
- **Export**: a concept a provider offers to others, closed over what it needs.
- **Import**: a root's declaration of concepts it takes from a provider, with alias, allow-list and
  version choice.
- **Alias**: a local spelling of a provider. It is not an identity.
- **Provider and consumer**: the project that owns concepts, and the project that imports them.
- **Dependency manifest**: the committed record of each import's resolved provider commit and
  interface hash.
- **Interface hash**: a digest of a provider's exported concepts and what they need.
- **Complete set**: a unit plus its resolved imports.
- **Reader view**: what a person who cannot see every file of a set is shown.
- **Dependents registry**: the rebuildable record of published imports.
- **Mesh view**: the picture of projects and published imports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every one-file ontology fixture and example, findings, inspection results,
  addresses and graph equal those recorded before this feature. Zero differences.
- **SC-002**: A fixture ontology written as one file and as a root with three parts gives the same
  graph entities and edges, and compiles to the same standard ontology (concept order aside, which is
  fixed). Zero differences.
- **SC-003**: Compiling the fixture mesh 100 times with shuffled file order and from different
  folders gives one output: all hashes equal.
- **SC-004**: Every output of the fixture mesh validates against the pinned Ossie schema with no
  notice, and every reference resolves inside the output.
- **SC-005**: Every refusal class in User Story 8, FR-004, FR-015, FR-018, FR-028, FR-029, FR-031,
  FR-035 and FR-054 has a test that fails when its check is removed.
- **SC-006**: In the partial-reader fixture, the answer for a hidden file and for a missing file
  are byte-identical for every operation that reads or saves the unit (zero differences), and no set
  finding of a full reader appears for a partial reader.
- **SC-007**: After a provider publishes a change, the consumer's compile output, views and agent
  context are byte-identical to before until it updates. Zero differences.
- **SC-008**: The dependents list for a fixture of 50 importers returns in 200 ms on the development
  server (assumed target, not measured; the task records the measured value) and lists exactly the
  published importers.
- **SC-009**: A compile of a unit of 200 parts, 20 imports and 20 MB in total finishes in 30 seconds
  on the development server (assumed, same target as feature 011; the task records the measured value).
- **SC-010**: The Mesh view and the import editor have recorded screens in light and dark at three
  widths with every state, and a review finds no clipped text and no meaning carried by colour alone.
- **SC-011**: The mutation suite detects every mutant of unit resolution, alias mapping, pin
  acceptance, manifest checking, reader filtering and qualification.
- **SC-012**: Each claim in the new documentation names behaviour covered by a test.

## Assumptions

- **Same workbench only.** An import names a project that lives in the same workbench data folder.
  Imports from another workbench or a network address do not exist.
- **The project's domain** is the domain the project is assigned to in the workbench's access settings.
  A project with none shows "No domain".
- **Format revision.** This feature adds revision 3 of the format (feature 016 adds revision 2). The
  numbers follow merge order, and the later feature renumbers.
- **Version of ordinary Ossie.** Only the base supported by the base table is available (feature 011).
  Units may not mix bases.
- **Defaults** (chosen here, not measured, changeable without changing a requirement): 200 parts per
  root; 50 imports per unit; import chain depth 8; dependents list pages of 50; SC-008 and SC-009
  targets. The 10,000 files, 64,000,000 bytes and 2,000,000 bytes limits are the existing ones.
- **Access.** Reading a provider's interface needs read access to the provider project. There is no
  separate "interface only" permission.
- **Published** has the meaning of decision E4: the committed snapshot of the default branch.
- **Constitution 4.0.1** already covers units, imports and the dependency disclosure exception; no
  amendment is needed.

## Out of Scope

Each item is a later feature. The extension point is named after the dash.

- Typed links between concepts (same-as, close-to) and composition roots. Needs: the unit's part and
  include rules, the manifest and the registry (decision E26, roadmap row 9).
- Department and organization compile targets that merge several exports into one bundle. Needs: the
  deterministic qualification by owner and the address map of this feature (decision E13).
- Compatibility analysis, breaking-change acknowledgement and releases. Needs: the interface hash,
  the item diff of feature 017 and the manifest's resolved versions (decisions E27, A4, A9).
- Published mesh agent context that spans projects. Needs: the manifest and the dependents registry
  (roadmap row 11).
- Imported usage counts. Needs: the registry's rule that counts for a hidden importer are never shown
  (decisions E19, E20).
- Semantic-model includes and imports of datasets or metrics (decision E2).
- Imports from other workbenches or network addresses.
- Notifications of any kind.
- A permission to read only a provider's interface.

## Decisions made while specifying

The owner has not been asked. Each choice is the one most consistent with the decisions file.

1. **One flat include list, authoritative in the root.** Decision E26 says the ordered list is
   authoritative and parts identify syntax. Parts may not include other parts, so an include cycle
   can only be a self-include or a root in the list. Nesting can be added later.
2. **Concept order of the compiled output:** the root's concepts, then each part's in list order,
   then imported concepts sorted by owner and name. A fixed order keeps output deterministic.
3. **Provider identity is the project's stable identity plus the ontology document,** not an IRI.
   Ossie 0.2 has no ontology-level namespace IRI (see gaps).
4. **Every imported concept is qualified by its owner in the output,** even without a collision, as
   decision E13 asks for deterministic qualification. Own concepts are not renamed.
5. **Exports must be closed.** A provider cannot publish an export that needs a private concept
   (decision E12: fail rather than expose private definitions).
6. **Updating dependencies is explicit and publication is refused until it is done.** Decision E11
   says floating imports resolve "when the consumer publishes". The workbench cannot write the manifest
   into a commit that is already made, so the author's "Update dependencies" action does the resolving
   and publication checks it.
7. **Same-repository providers cannot be pinned and are checked by interface hash.** Decision E11
   forbids independent historical pins inside one candidate snapshot.
8. **Dependents are visible to people who may publish the provider.** This maps "Stewards and Admins"
   (decision E19) to the existing publish permission instead of a new one.
9. **The Mesh view shows published declarations only.** Unpublished imports are shown to their author
   in the import editor, labelled as not published.
10. **A provider's interface is readable only with read access to the provider.** The failing case
    fails closed (decision E11).
11. **The dependency manifest is a committed workbench file,** so published snapshots stay
    self-describing and the compile needs no state outside Git.
12. **The registry is derived state.** It can be deleted and rebuilt from published snapshots, so it
    cannot become a second source of truth.
13. **Merging parts is a translation, not a loss.** The standard output holds all concepts, so nothing
    is dropped. An export declaration is reported as a loss, because the standard has no place for it.
14. **Chosen numbers** are marked as chosen, not measured.

## Gaps and contradictions found

Reported for the owner; none blocks this feature.

- E26 asks that aliases map to "the provider's canonical namespace IRI". Ossie 0.2.0.dev0 ontologies
  have no ontology-level namespace IRI (only item IRIs and prefixes). Resolved by decision 3. The
  question returns when a released base adds one.
- E11 says floating imports are resolved "when the consumer publishes" and stored in a manifest, but a
  manifest inside the published commit cannot be written by the act of publishing. Resolved by decision 6.
- E10 wants a provider's public interface compiled "without requiring" private parts, and E11 says to
  fail closed when "current access is unavailable". Taken together they need a decision on who may
  read an interface. Resolved by decision 10, and a permission to read only an interface stays out of scope.
- E19 says "Stewards and Admins" but the workbench's roles can be customized. Resolved by decision 8.
- E19 says historical records remain only "limited to audit authorization", and the audit log has no
  record of imports today. This feature records the notice and publication in the existing audit
  record and adds no new history.
- E13 describes department exports that are "self-contained consumer bundles" and an organization
  target. Only the self-contained part is built here (FR-052, FR-053).
- E3 describes "extended-root, part and composition-root schemas". Composition roots are out of scope.
- Feature 014's counters key items by address and exclude importers (014 FR-030). The dependents
  registry shows importers by design to a narrower audience. The two must never share a store; the plan
  states this.
- The owner-qualified name of an imported concept needs a separator. The pinned schema allows any text in a
  concept name, but the mapping code reads dots as steps of a path. The plan's first compile task settles the
  character; the spec only requires that the name show its owner.
- Feature 011 states that revision 1 allows no part marker. This feature adds it in a new revision.
- Feature 012 (shared proposals) promotes atomically over every project of a repository. Same-repository
  imports depend on that atomicity; the plan states the check it relies on.
