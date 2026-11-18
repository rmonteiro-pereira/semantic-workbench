# Feature Specification: Compile Everywhere

**Feature Branch**: `019-compile-everywhere` (documents only; the implementation branch is created when work starts)

**Created**: 2026-11-17

**Status**: Draft

**Input**: Feature 011 gave the workbench a Tessera compiler, but only as a command line that an
operator runs against a repository. Decision E14 orders the next entry points: the browser and HTTP
export of standard Ossie, an MCP adapter, and a reviewed "convert to standard" operation. Decision
E22 and the owner's 2026-11-16 answer say that the first official Ossie 0.3.0 release is adopted
through the table of supported bases. This feature delivers those four things on top of the
compiler core that already exists. It does not change what the compiler does.

## Summary

- A person can **check** a project against standard Ossie from the browser. The check shows what the
  compiler would refuse and what it would drop, and writes nothing.
- A person can **compile** a project's published snapshot to standard Ossie from the browser and
  over HTTP, review the loss report, accept that exact report, and download the bundle as one zip
  file. The bundle is never written into the project's source tree or the workbench data folders.
- A person with edit rights can **convert** one Tessera ontology in their own working copy to
  standard Ossie. It is a reviewed, one-file change that goes through the same save rules as any
  other edit, and the committed version in Git is the backup.
- An agent connected over MCP can call two read-only tools, one to check and one to compile. They
  are twins of the HTTP operations, so authorization, limits and audit are the same.
- When Ossie 0.3.0 is released, the workbench adopts it as a supported base: exact released
  schemas, a base-table entry, validation of 0.3 documents, an inventory of expression and planner
  changes, and explicit, reviewed conversion of existing documents. **On 2026-11-17 Ossie 0.3.0 is
  not released**, so this group stays open and everything else proceeds.
- Every claim keeps the limits of feature 011: output is "valid against" a named base, loss is
  never silent, accepting a loss report is not approval of the content, and unpublished work never
  becomes agent-visible output.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A steward compiles a published project from the browser (Priority: P1)

A steward opens the export options of a published project and chooses standard Ossie. The workbench
compiles the published snapshot, lists every value the compile would drop, and asks the steward to
accept that exact report. After acceptance the steward downloads one zip file holding the standard
files, a manifest and the loss report.

**Why this priority**: it is the reason for the compiler. Outside systems need standard Ossie, and
the command line is not available to most people who publish.

**Independent Test**: publish a fixture project with one Tessera ontology that has notes, open the
dialog, review, accept, download; validate each file in the zip against the pinned Ossie schema.

**Acceptance Scenarios**:

1. **Given** a published project with notes in a Tessera ontology, **When** the steward starts a
   compile, **Then** nothing is downloaded yet and the dialog lists the dropped values by property
   with counts and shows the report's digest.
2. **Given** that report, **When** the steward accepts it, **Then** the zip is downloaded and its
   manifest records the accepted digest and the commit it read.
3. **Given** the same commit, **When** the compile runs in the browser and from the command line,
   **Then** the files, manifest and loss report are byte for byte equal.
4. **Given** an unpublished project, **When** the steward opens the dialog, **Then** compile is
   unavailable and says why, and check is still available.
5. **Given** a note changed and published after the report was shown, **When** the steward accepts
   the old report, **Then** the compile is refused as an acceptance mismatch and the new report is
   shown.
6. **Given** a published project with no Tessera document, **When** it is compiled, **Then** the
   dialog says the files are already standard and the bundle holds the same bytes.

---

### User Story 2 - An author checks their work against standard Ossie (Priority: P1)

An author editing a Tessera ontology wants to know, before publishing, whether it will compile and
what would be lost. They run a check on their working copy. The result is labelled "unpublished",
lists findings and the loss report, and offers no download.

**Why this priority**: authors need the answer early, and the compile of the published snapshot
cannot show unpublished work.

**Independent Test**: edit a fixture ontology to add a note and a defect; run the check; compare the
findings with the command line's `check --files`.

**Acceptance Scenarios**:

1. **Given** a working copy with an unpublished note, **When** the author runs a check, **Then** the
   report lists the note and the result says it covers unpublished work.
2. **Given** a working copy that fails the pinned schema after compilation, **When** the author
   runs a check, **Then** the findings say so with paths, and no acceptance is offered.
3. **Given** a check, **When** it finishes, **Then** no file in the project, the working copy or the
   data folders changed, and no compiled file content was returned.
4. **Given** a person who may read a file but a project where another file of the unit is hidden
   from them, **When** they run a check, **Then** it is refused with the same answer as for a
   file that does not exist.

---

### User Story 3 - A person converts a Tessera ontology to standard Ossie (Priority: P2)

A team decides one ontology no longer needs Tessera. An author with edit rights opens "Convert to
standard", reviews the loss report and a before-and-after comparison, accepts the exact report, and
the file in their working copy becomes standard Ossie. They commit it as they would any change.

**Why this priority**: decision E14 asks for it, but it is a change to source files and so comes
after the read-only entry points.

**Independent Test**: convert a fixture ontology in a test workspace; check the file bytes, the
audit record, and that a stale file or a dirty file is refused.

**Acceptance Scenarios**:

1. **Given** a committed, unchanged Tessera ontology and edit rights, **When** the author accepts
   the report and confirms, **Then** the file holds the compiled standard Ossie, no other file
   changes, and the change is recorded like any save.
2. **Given** the file changed after the review opened, **When** the author confirms, **Then** the
   conversion is refused as a version conflict and nothing is written.
3. **Given** a file with uncommitted changes, **When** the author starts the conversion, **Then** it
   is refused and says to commit or discard first, so that Git holds the backup.
4. **Given** a person with read rights only, **When** they open the dialog, **Then** conversion is
   not offered.
5. **Given** a conversion that a content guard would refuse as a save, **When** it is confirmed,
   **Then** it is refused for that reason and nothing is written.
6. **Given** a converted file, **When** it is opened, **Then** it is an ordinary Ossie ontology with
   no marker, and comments and layout may differ from before (the dialog said so).

---

### User Story 4 - An agent checks and compiles through MCP (Priority: P2)

An agent connected to the local workbench asks whether a project compiles and, for a published
project, asks for the compiled files page by page. It sees findings and the loss report. It gets
file content only when it supplies the digest of the report it was shown, and it cannot convert
anything.

**Why this priority**: decision E14 names the MCP adapter, and agents are the heaviest consumers of
standard output.

**Independent Test**: call both tools through the MCP test client against the fixture project and
compare each answer with the twin HTTP operation.

**Acceptance Scenarios**:

1. **Given** a published fixture, **When** the agent compiles without a digest, **Then** it receives
   the report and the digest and no file content.
2. **Given** the digest, **When** the agent compiles again and asks for a file, **Then** it receives
   a bounded part of the file with the offset to continue.
3. **Given** the project is published again between two pages, **When** the agent asks for the next
   page, **Then** the call fails with a snapshot-changed answer and no mixed content.
4. **Given** the agent checks unpublished work, **When** the answer returns, **Then** it holds
   findings and the loss report, is labelled unpublished and holds no compiled bytes.
5. **Given** the tool list, **Then** the two tools appear with read-only hints and no convert tool
   exists.

---

### User Story 5 - The workbench adopts Ossie 0.3.0 when it is released (Priority: P3)

When the Ossie project publishes 0.3.0, the maintainers add it as a supported base. Documents that
declare 0.3.0 validate, compile and show in the interface, and existing 0.2 documents can be
converted by an explicit, reviewed step. The label of compiled output names 0.3.0 without the word
"draft".

**Why this priority**: the owner decided to adopt the first release, but the release does not exist
yet. Everything else in this feature does not depend on it.

**Independent Test**: after the release, register the released schemas and run the fixtures of the
new base through validation, compilation and conversion.

**Acceptance Scenarios**:

1. **Given** the released 0.3.0 schemas, **When** they are added, **Then** they are stored unchanged
   with their source and a hash, and a check fails if they are edited.
2. **Given** the released base, **When** it is registered, **Then** registration fails if the base
   defines a Tessera name, and otherwise a Tessera schema for it is derived and checked in.
3. **Given** a document that declares 0.3.0, **When** it is validated, **Then** it is judged by the
   0.3.0 rules with no "not validated" notice, and expression checks accept what 0.3.0 allows.
4. **Given** a 0.2 document and its owner's request, **When** the reviewed conversion runs, **Then**
   the owner sees every change, nothing is applied without confirmation, and a legacy metric status
   of "draft" becomes "proposed", never "approved".
5. **Given** Ossie 0.3.0 is not released, **When** the feature is delivered, **Then** this story's
   tasks are open, nothing claims 0.3.0 support, and the draft label for 0.2.0.dev0 is unchanged.

---

### Edge Cases

- A project whose published snapshot is larger than the limits of the compiler: refused before any
  content is read, with the limit named.
- A compile that is already running when the project is published again: the running compile
  finishes on the snapshot it started with, and its manifest names that commit.
- A person who closes the dialog after accepting but before the download: nothing is stored; the
  next compile starts again and the same digest still applies if nothing changed.
- A very long property name or document path in the loss list: it wraps; nothing is cut.
- A project with thousands of losses: the dialog groups by property, shows counts first, and lets the
  person open each group; the report itself is complete.
- The zip would exceed the export size limit: refused before the first byte is sent.
- Two people compile the same commit at once: both get the same bytes.
- A check of a project that holds only standard files: it succeeds with an empty loss report.
- A conversion of a file that other Tessera files in the unit refer to: allowed only when the unit
  still compiles with that file standard; otherwise refused with the finding.
- A conversion in a project with no Git: refused, because there is no backup.
- An MCP client of the earlier protocol era: gets the same results as request and response only.
- A base that is declared by a document but is not in the table: refused as in feature 011.

## Requirements *(mandatory)*

### Functional Requirements

**Check**

- **FR-001**: The workbench MUST offer a check of one project against standard Ossie from the
  browser and over HTTP. The check MUST be able to read either the project's published snapshot or
  the caller's saved working copy.
- **FR-002**: A check MUST run the same validation, compilation and output checks as the command
  line's `check` and MUST return findings, the loss report and, for each input file, how it was
  treated. It MUST NOT return the bytes of any compiled file and MUST NOT write anywhere.
- **FR-003**: A check of anything other than a committed published snapshot MUST be labelled
  "unpublished" in its result and in the interface.
- **FR-004**: A check MUST need the same authority as reading every file of the unit.

**Compile**

- **FR-005**: A compile MUST read only the project's published snapshot, resolved to one full
  commit identifier. It MUST NOT read the working copy, drafts, the index or any other branch, and
  MUST NOT fall back to them. A project with no published snapshot MUST be refused with the words
  "no published snapshot".
- **FR-006**: A compile MUST need the authority to export the project, and every compile MUST leave
  an audit record naming the project, the commit and the result.
- **FR-007**: Every compile and check MUST run on a complete unit. When the caller may not read
  every file of the unit, the answer MUST be the same as for a file that does not exist, and MUST
  not name the hidden file or reveal findings about it (decision E10).
- **FR-008**: A compile MUST end in exactly one of three results: released, loss needs acceptance, or
  refused. Loss needs acceptance MUST carry the report and its digest and no file content. Refused
  MUST carry the findings.
- **FR-009**: A loss MUST be accepted by supplying the digest of the report the person was shown, or
  by an inline loss policy in the versioned format of feature 011. The digest MUST match exactly.
  Any change to an input byte, an option or the compiler version MUST change it.
- **FR-010**: No acceptance of any kind MUST release output that fails the pinned schema, a
  reference check, a size limit, a semantic check or the registry (decisions E12 and E15).
- **FR-011**: The released result MUST be one zip file holding the standard files, the manifest and
  the loss report, byte for byte equal to what the command line writes for the same commit and
  options. The zip MUST be streamed to the caller. It MUST NOT be written into the project's source
  tree, a working copy or the workbench data folders (decision E14).
- **FR-012**: A compile MUST apply the same per-document, total and file-count limits as the
  command line and MUST apply the export size limit before sending the first byte.
- **FR-013**: A compile MUST finish on the snapshot it started with even when the project is
  published again meanwhile, and its manifest MUST name that commit.
- **FR-014**: A request that asks for part of the compiled output (a file, from an offset) MUST name
  the commit it expects; the commit is required for such a request. When the published commit differs, the request MUST fail with a
  snapshot-changed answer and MUST NOT return mixed content.
- **FR-015**: Output files read part by part MUST return at most one bounded amount of text per
  answer, the version of the file's content and the offset to continue from. Nothing MUST be
  silently truncated.
- **FR-016**: Documentation and the dialog MUST state that accepting a loss report is not approval
  of the exported content, and that the zip is valid against the named base, not against a
  released Ossie unless the base is a released one.

**Convert to standard**

- **FR-017**: A conversion MUST act on one Tessera ontology file in the caller's own working copy and
  MUST change only that file.
- **FR-018**: A conversion MUST need the authority to edit that file. A person who may only read MUST
  NOT be offered it.
- **FR-019**: A conversion MUST be refused when the file has uncommitted changes, when the project has
  no Git history that holds the committed version, or when the file is not a Tessera ontology.
- **FR-020**: A conversion MUST be bound to the hashes of the unit's input files and to the loss
  digest shown for them. When any input changed after the review, it MUST be refused as a version
  conflict and nothing MUST be written.
- **FR-021**: The converted file MUST equal the file the compiler would put in the bundle for the same
  input, and the unit MUST still validate and compile afterwards. A conversion that would leave the
  unit failing MUST be refused with the findings.
- **FR-022**: A conversion MUST be applied as an ordinary save, so that content guards, the hash
  check, atomic writing, access rules and the audit record apply exactly as for any other save. It
  MUST NOT commit, push or publish.
- **FR-023**: The review MUST show the loss list, a before-and-after comparison, and a plain warning
  that comments and layout may not survive and that dropped values are not recovered.
- **FR-024**: An ordinary export MUST never replace a source file. Only the conversion MAY, and only
  by FR-017 to FR-023.

**Interface**

- **FR-025**: The browser MUST offer, in its existing export flow, a choice to export standard Ossie,
  and MUST offer check and conversion where a Tessera document is shown in the validation panel.
  Controls that the person's authority or the project's state do not allow MUST be absent or
  disabled with the reason in words.
- **FR-026**: The compile dialog MUST have these states: nothing to do (no Tessera document), loading,
  findings (refused), loss needs acceptance, released, and an error with a retry. Each MUST be
  readable without colour.
- **FR-027**: The loss preview MUST group losses by property with counts, list each loss's document
  and item address, show the status counts when the report has them, and show the report's digest.
  It MUST NOT show lost values.
- **FR-028**: Acceptance MUST be an explicit action the person takes after the preview, and the dialog
  MUST send the digest it displayed, not a fresh one.
- **FR-029**: Every new view MUST use the current visual design (tokens, controls, layout language),
  work in light and dark themes and at phone width, wrap long text, and never clip or cut text with an
  ellipsis. Keyboard and screen-reader use MUST work for every action.
- **FR-030**: With no new control used, every existing screen MUST be unchanged except for the added
  entry points.

**MCP**

- **FR-031**: The MCP endpoint MUST offer exactly two new tools, one to check and one to compile.
  Each MUST be the twin of the HTTP operation of the same name and run through the same operation
  boundary, authorization, limits and audit.
- **FR-032**: Both tools MUST be read-only, idempotent and closed-world in their hints, and the server
  MUST NOT depend on the hints.
- **FR-033**: The compile tool MUST return the report and digest first, then manifest and file list
  after acceptance, then file content by bounded parts as in FR-015. It MUST NOT return unpublished
  content. The check tool MAY read the caller's working copy and MUST return findings and the loss
  report only (decision E5).
- **FR-034**: Neither tool MUST accept a loss on its own initiative: the digest MUST come from the
  caller's arguments.
- **FR-035**: No tool MUST write, convert or publish. The contract documents of the MCP feature MUST
  list the conversion as not an agent operation yet.
- **FR-036**: The tools MUST be available wherever the MCP endpoint is mounted. They add no exposure
  in server mode where the endpoint is not yet mounted.
- **FR-037**: Failures MUST use the existing MCP result codes; a changed published commit between two
  part reads MUST use the code the tools already use for a changed version. A compile that needs acceptance or is
  refused MUST be a successful tool result with a state, as validation findings are; a project with no
  snapshot MUST answer `not_published`.

**Adopting the next Ossie base**

- **FR-038**: When Ossie 0.3.0 is released, the exact released schemas MUST be stored unmodified, with
  their source address, release identifier, retrieval date and SHA-256, and a test MUST fail when they
  are edited (Principle V).
- **FR-039**: The new base MUST be added as one table entry. Registration MUST fail while the base
  defines a Tessera name. The Tessera schema for it MUST be derived mechanically and checked in, for
  every revision the workbench supports.
- **FR-040**: The label of compiled output for the new base MUST name its version and MUST NOT say
  "draft". The label of 0.2.0.dev0 MUST be unchanged.
- **FR-041**: A document that declares 0.3.0 MUST be validated by the released rules, including the
  mapping and expression rules, with no "not validated" notice and no fall-back to 0.2 rules.
- **FR-042**: Before any change to validation or planning for 0.3.0, a written inventory MUST list what
  the release changed that the workbench reads (including primary SQL expressions and dataset-scoped
  metrics) and which tests cover each.
- **FR-043**: Conversion of existing documents to 0.3.0 MUST be explicit and reviewed: a preview of
  every change, base hashes, a backup through Git, and nothing applied without confirmation.
- **FR-044**: Existing metric payloads MUST be converted only by the reviewed conversion (decision E17).
  A legacy status "draft" MUST become "proposed" and MUST NOT become "approved". Unrelated vendor
  entries and mapping bindings MUST be preserved.
- **FR-045**: Until the release exists, no document, screen or output MUST claim support for 0.3.0 or
  compatibility with a released Ossie, and the pinned 0.3 development fixture of feature 011 MUST stay
  unsupported in the table.

**Documentation**

- **FR-046**: The README, architecture document, user guide, operations table, MCP pages, development
  guide and changelog MUST describe the new entry points and their limits in the same change, naming
  that the command line is the operator's tool and the HTTP and MCP entry points are authorized.

### Key Entities

- **Compile request**: a project, a source (published snapshot or working copy), and optional
  acceptance.
- **Compile result**: released, loss needs acceptance, or refused, with findings, report and manifest.
- **Acceptance**: a report digest or an inline loss policy.
- **Check result**: findings and report for a source, labelled published or unpublished.
- **Conversion**: a reviewed rewrite of one Tessera ontology file to standard form.
- **Output part**: a bounded piece of one compiled file with its commit and version.
- **Base entry**: one row of the table of supported Ossie bases.
- **Base inventory**: the written list of what a new base changed that the workbench reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the fixture project, the zip from the browser operation and the bundle from the
  command line have equal hashes for every file. Zero differences.
- **SC-002**: Every refusal in FR-005, FR-007, FR-010, FR-014, FR-019, FR-020 and FR-021 has a test that
  fails when the check is removed.
- **SC-003**: The authorization matrix for the new operations passes for each role, for a hidden file
  in the unit, for an application identity and for the local MCP caller, with hidden and missing files
  answered identically.
- **SC-004**: After a check, a byte comparison of the project, working copy and data folders before and
  after shows no change.
- **SC-005**: After a conversion, exactly one file differs, equals the bundle's file for the same
  input, and one save record exists in the audit log.
- **SC-006**: The new interface shows zero differences from the last release on every existing screen
  in the recorded comparison, and every new state is captured in light and dark themes at phone and
  desktop width with no clipped text.
- **SC-007**: A compile of a project folder with 200 documents and 20 MB finishes within 30 seconds on
  the development server, using the same chosen figures as feature 011 (assumed, not measured); the
  task records the measured values.
- **SC-008**: The tool contract tables of the MCP feature list the two tools and the conversion's
  disposition, and its tests pass against the registry and the inventory.
- **SC-009**: The mutation suite detects every mutant of acceptance matching, snapshot selection for
  compile, unit completeness, conversion preconditions and paging.
- **SC-010**: After the 0.3.0 release (when it exists), every fixture of the new base validates,
  compiles and converts, and the base's schema files match their recorded hashes.

## Assumptions

- **Compiler core.** Feature 011 is complete: the compiler, loss report, manifest, base table and
  command line exist, and the compiler is a pure function of bytes and options.
- **Single-folder units now.** A unit is one project folder, as in 011. Feature 018 widens units to
  several files and imports. This feature reads units through one seam so that 018 needs no change
  here.
- **Status counts.** Feature 016 adds status counts to the loss report. This feature shows them when
  the report holds them and does not need them to ship.
- **Export authority.** The authority that today allows a zip export of the project also allows
  compile. No new permission is added.
- **Local MCP only.** The MCP endpoint is mounted in local mode only until feature 013 and its
  follow-ups. The tools exist in the registry now.
- **Defaults.** Output part size is the existing MCP limit of 32,768 bytes. Request limits are the
  existing limits of the save and export operations. The performance figures are chosen, not
  measured. A compile in the browser is bounded by the existing export size limit (64,000,000 bytes).
- **Ossie 0.3.0.** Checked on 2026-11-17 with the upstream repository's release and tag lists: no 0.3.0
  release or tag exists (the only tag is `osi-0.1.1-rc1`). The check is repeated when the group is
  started.

## Out of Scope

- Changes to what the compiler does, new losses, new options or any new Tessera property.
- The approved-only projection of decision E16. It needs governance status from feature 016 and its own
  fail-closed rule for retained items.
- Multi-file units, imports, department and organization targets (features 018 and later).
- Shared proposals, sign-in, counters and the agent panel.
- A convert tool for MCP, an MCP resource for bundles, and an MCP prompt.
- Writing bundles to a folder from the server, publishing bundles as release artifacts, release tags.
- Companion-file reconstruction of dropped values.
- A reverse compiler from standard Ossie to Tessera.
- Upstream proposals and vendor registration (decision E25).

## Decisions made while specifying

The owner has not been asked. Each choice is the one most consistent with the decisions file; the
owner may overrule it.

1. **Compile needs export authority; check needs read.** The compile leaves the server as a download,
   and today's export has the same authority and always writes an audit record. A check returns no
   file content.
2. **Check may read the working copy; compile may not.** Decision E5 lets authoring tools read work in
   progress and return findings. A compile releases content, so it follows E4 and reads only the
   published snapshot.
3. **The check returns the loss report for unpublished work.** The report holds digests, not values, so
   it is findings-like and leaks no definition text.
4. **Acceptance by digest or inline policy only.** Decision E15 names both. The browser always uses the
   digest it displayed.
5. **The bundle is one streamed zip.** Decision E14 says generated output lives outside the source
   tree and is distributed as a download. Nothing is stored on the server.
6. **Conversion requires a clean committed file.** Decision E14 asks for "backup and conflict checks".
   Git already holds the backup when the file is committed and unchanged, and the existing version
   check is the conflict check. No second backup store is added.
7. **Conversion is one file and one ordinary save.** Guards, audit and access rules then apply without
   a new code path. The author commits as usual.
8. **MCP names.** Two tools named in the style of the existing ones: `check_standard` and
   `compile_standard`. Reason: the existing tool names are a verb and a noun in lower snake case.
9. **A compile that needs acceptance is a successful tool result.** Validation findings are returned
   that way already; the closed list of error codes stays closed.
10. **Part reads name the commit.** The compile is deterministic, so no output is stored between
    calls. A commit mismatch is the only state needed.
11. **Base adoption is a conditional group.** The owner decided to adopt at the first release. That
    release does not exist, so the group is specified and left open.
12. **0.3 adoption starts with an inventory.** The release's changes cannot be known today, so the
    first task after release writes the list that later tasks use.
13. **Chosen numbers** (performance target, part size reuse) are marked as chosen or existing.

## Gaps and contradictions found

Reported for the owner; none blocks this feature.

- Decision E5 says authoring tools may return validation findings but not unpublished plans. It does
  not say whether a loss report for unpublished work is allowed. Decision 3 treats it as findings.
- Decision E14 asks for "backup" without defining it. Decision 6 defines it as the committed Git
  version, which excludes projects without Git history.
- Feature 011 FR-028 says the validation panel gets no controls. This feature adds two, by design.
- Decision E16 asks for an approved-only projection, E17 for governance status, and the task list for
  this feature does not include the projection. It is listed as out of scope until 016 exists.
- Decision E17 asks for reviewed conversion of metric payloads at 0.3 adoption, but also says all
  governance rules extend to every supported item first. The conversion therefore waits for feature 016
  as well as the release.
- Decision E22 says new-version files are today rejected by strict validation and expression checks.
  The size of the work (rated L in the decisions file) cannot be estimated until the release is read;
  the inventory task exists for that reason.
- The MCP contract documents require every route to have a disposition. The new routes need rows, and the
  MCP feature is not yet on the main branch, so those rows land with whichever merges second.
- Decision M17 expects every browser capability to map to an operation. The compile dialog is the
  browser face of the operations added here, so no new browser-only capability remains.
