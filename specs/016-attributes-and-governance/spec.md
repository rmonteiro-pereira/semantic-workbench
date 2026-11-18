# Feature Specification: Attributes, Agent Context and Governance in Tessera

**Feature Branch**: `016-format-specs` (documents only; the implementation branch is created when the work is taken up)

**Created**: 2026-11-17

**Status**: Draft

**Input**: The Tessera format (feature 011) reserved three names for later: `tessera_attributes`,
`tessera_ai_context` and `tessera_governance`. This feature makes them real, with the screens that
edit them. Decisions E17 (governance), E18 (attributes), E16 (published but not approved items),
E5 (agents see published work only) and E15 (loss is reported) shape it. The owner requires
ontology attributes defined in the interface, agent-facing context, and governance attributes with a
status.

## Summary

- An **attribute** is an ordinary single-role relationship whose target is a value type or a built-in
  concept. It keeps its standard serialization. There is no second attribute collection. The
  workbench presents such relationships as attributes and lets an author create, edit, rename,
  reorder and remove them, and link them to value types that many concepts share.
- `tessera_attributes` is a small, reference-only list on a concept. It fixes the display order of
  the concept's attributes. It defines nothing.
- `tessera_ai_context` holds agent-facing context for a concept or relationship (attributes
  included), in the same shape as the standard Ossie `ai_context`. Agents receive it only from the
  published snapshot.
- `tessera_governance` holds an item's status, owner, steward, classification and deprecation
  details. Statuses are `proposed`, `approved` and `deprecated`. A missing status is "not set" and is
  never read as approved.
- The rules that already protect metrics (only an approver sets approved or deprecated, nobody
  approves their own item, an approved item's definition is protected, demotion instead of refusal)
  extend to ontology items on every write path before the governance editor is switched on.
- The three additions are revision 2 of the format. The compiler drops them from standard output and
  lists each loss. The loss report gains the status counts that decision E15 asked for.
- Agent answers carry the governance flag of the items they use, so a non-approved published item
  is shown as such and never hidden (decision E16).
- Existing metric governance is shown in the same editor, read only, without rewriting any metric file.
- Three defects named by decision E18 are fixed: a supplied IRI is lost when a concept is created,
  built-in concepts cannot be chosen as a target, and renaming a relationship does not update
  every reference to it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An author defines attributes on a concept (Priority: P1)

An author opens a concept, sees an **Attributes** section, and adds "email" with the built-in
String as its type. They add "customer tier" and choose a value type that other concepts also use.
They reorder, rename and remove attributes. The file holds ordinary relationships, plus a revision-2
ordering list when the author reorders.

**Why this priority**: it is the owner's fixed UI requirement and the base of the other two
editors.

**Independent Test**: create, edit, rename, reorder and remove attributes in a fixture ontology
through the editor and the save path; inspect the saved bytes and every reference.

**Acceptance Scenarios**:

1. **Given** a concept with no attributes, **When** the author adds an attribute with a built-in
   target, **Then** the saved document holds one single-role relationship to that built-in, and no
   second collection of attributes exists.
2. **Given** a relationship with two roles, **Then** it is not shown as an attribute.
3. **Given** a relationship with one role whose target is an entity type, **Then** it is not shown as
   an attribute.
4. **Given** an attribute that other items refer to, **When** it is renamed, **Then** every reference
   is rewritten and the save is refused if one cannot be.
5. **Given** a document at revision 1, **When** the author reorders attributes, **Then** the editor
   says the document must move to revision 2 and does it only after the author agrees.
6. **Given** a value type used by three concepts, **When** the author opens it, **Then** the details
   list the attributes that use it.
7. **Given** an attribute is removed, **Then** it is also removed from the ordering list.

---

### User Story 2 - An author records governance, and the rules hold (Priority: P1)

An author sets an owner and a steward on a concept and proposes it. A steward approves it. Later an
author edits the approved concept's definition; the workbench offers to return it to proposed
instead of silently changing an approved item. A steward deprecates it and names a replacement.

**Why this priority**: governance with no enforcement would be a label. Decision E17 requires the
rules before the editor.

**Independent Test**: run saves as an author, a steward and an admin across every write path
against fixture ontologies; compare with the same rules on metrics.

**Acceptance Scenarios**:

1. **Given** an author, **When** they set status `approved` on a concept, **Then** the save is
   refused and says who may do it.
2. **Given** a steward who is the item's owner, **When** they approve it, **Then** it is refused as
   self-approval.
3. **Given** an approved concept, **When** an author changes its definition, **Then** the save is
   refused or offered as a demotion to proposed, as it is for metrics.
4. **Given** an approved concept, **When** an author edits only its description, **Then** the save
   succeeds.
5. **Given** a deprecated item, **When** the author names a replacement that does not exist, **Then**
   the document is invalid and the finding names the missing item.
6. **Given** the same unauthorized change arriving by import, pull, revert, restore, move, publish or
   an agent's save, **Then** each is refused by the same rule.
7. **Given** a person who cannot read an item's file, **Then** the refusal text names neither the
   item nor its kind.

---

### User Story 3 - Agents get the context and the status of published items (Priority: P2)

An author writes instructions, synonyms and examples for a concept and an attribute. After
publication, an agent that asks for context receives them, together with each item's status. An
unpublished edit never reaches an agent, including the author's own agent.

**Why this priority**: it is why the context exists, but it needs the editors first.

**Independent Test**: publish, edit without publishing, and compare the agent context, plan and
explanation outputs.

**Acceptance Scenarios**:

1. **Given** a published concept with agent context, **When** an agent asks for context, **Then** the
   answer holds that context at the item's address.
2. **Given** an unpublished edit of the same context, **Then** the answer is unchanged.
3. **Given** a published item with status proposed or deprecated, **When** an agent asks for context,
   a plan or an explanation that uses it, **Then** the item is included and flagged with its status.
4. **Given** an item with no governance, **Then** it is included and its status reads "not set".
5. **Given** owner, steward or classification values, **Then** they are not in any agent answer.
6. **Given** a `tessera_notes` value, **Then** it still appears in no agent answer.

---

### User Story 4 - Standard output stays clean and the loss is counted (Priority: P1)

A release job compiles a project that uses attributes ordering, agent context and governance. The
bundle is standard Ossie with every attribute still a relationship. The loss report lists each
dropped value and says how many lost governance entries were proposed, approved, deprecated or not
set.

**Why this priority**: decision E15 makes trustworthy output a condition of extending Ossie, and the
status counts were waiting for governance.

**Independent Test**: compile a fixture with every addition at every allowed place, and compare the
output and report with golden files.

**Acceptance Scenarios**:

1. **Given** the fixture, **When** compiled with the report's digest, **Then** the output validates
   against the pinned Ossie schema and holds no marker and no `tessera_` property.
2. **Given** the fixture, **Then** every attribute relationship is byte-equal in the output to the
   source relationship.
3. **Given** governance on four items with different statuses, **Then** the report counts them per
   status and the counts are part of the digest.
4. **Given** a unit with no governance, **Then** the report has no status counts.
5. **Given** an approved item whose governance is dropped, **Then** the loss entry says so, and
   accepting the report is not described as approval.
6. **Given** the old digest of a report made before a status changed, **Then** it is refused.

---

### User Story 5 - Metric governance appears in the same place (Priority: P2)

A steward opens a metric and a concept. Both show owner, steward, status and deprecation in the same
section. The metric's file is unchanged unless the steward edits it through the existing metric
editor.

**Why this priority**: decision E2 asks for one domain model with adapters for different storage
places.

**Independent Test**: render the section for a metric and a concept; compare metric file bytes before
and after viewing.

**Acceptance Scenarios**:

1. **Given** a metric with status `draft`, **Then** the section shows "draft (older value)" and never
   "approved".
2. **Given** a metric, **When** the steward edits status through the section, **Then** the change is
   written to the metric's existing extension and guarded as today.
3. **Given** a metric file that is only viewed, **Then** no byte changes.

---

### User Story 6 - Editing defects of decision E18 are gone (Priority: P1)

An author creates a concept with a full IRI, chooses String as an attribute target, and renames a
relationship that an expression and a mapping refer to.

**Independent Test**: the three cases against fixture documents.

**Acceptance Scenarios**:

1. **Given** a new concept form with an IRI, **Then** the saved concept holds that IRI.
2. **Given** the relationship target list, **Then** the eight built-in concepts are offered, after the
   declared ones.
3. **Given** a relationship renamed in an ontology, **Then** its other references in that document
   and its mappings are rewritten, or the save is refused with the reference that blocks it.

---

### User Story 7 - Older documents and older workbenches stay safe (Priority: P2)

A document at revision 1 keeps working. A document that uses a revision-2 name without declaring
revision 2 gets a clear finding. A workbench that only knows revision 1 refuses a revision-2
document and never drops its parts.

**Independent Test**: validate fixtures at both revisions.

**Acceptance Scenarios**:

1. **Given** `tessera: 1` and `tessera_governance`, **Then** the finding says the property needs
   revision 2.
2. **Given** `tessera: 2` and no addition, **Then** the document is valid.
3. **Given** all documents of 011's fixtures, **Then** their findings are unchanged.
4. **Given** `tessera_attributes` on a relationship, **Then** the finding names the places where it
   may be used.

---

### Edge Cases

- An attribute whose target value type is renamed: the relationship, the ordering list and mappings
  follow.
- A relationship with one role to a value type that the document does not declare and that is not a
  built-in: it is invalid already; it is not offered as an attribute.
- An ordering list that names a relationship twice, or one that is not an attribute: a finding with
  the entry's position.
- A concept that extends another: attributes are those the concept declares. The details also list
  inherited attributes, marked as inherited and not editable there.
- A very long description, context text or reason: it wraps in every view and is never cut.
- Two authors edit governance of one item: the existing hash check refuses the second save.
- Governance on an item whose document is not a Tessera document: the editor offers to mark the
  document as Tessera revision 2 first and does nothing until the author agrees.
- A Tessera ontology with `ontology_mappings` embedding a semantic model: the embedded model keeps
  its standard governance place and gets no `tessera_` property.
- An item that is deprecated and has no replacement: allowed, with a reason or without.
- `ai_context` already present at the root of the ontology: unchanged; `tessera_ai_context` is only
  for concepts and relationships.
- Metric payloads with an unknown status: shown as "unknown value", never as approved.
- An attribute whose owner concept is deleted: the attribute goes with it; the delete confirmation
  says so.

## Requirements *(mandatory)*

### Functional Requirements

**The format at revision 2**

- **FR-001**: The format MUST accept `tessera_attributes`, `tessera_ai_context` and
  `tessera_governance` in documents that declare revision 2 or higher, and MUST give the existing
  "needs a higher revision" finding when a revision-1 document uses one.
- **FR-002**: Each of the three MUST be registered through the format's one registry, with its places,
  value shape, compiler disposition and owner, and removed from the reserved-name list. Validation,
  the derived schema, the compiler and the loss report MUST need no other change.
- **FR-003**: `tessera_attributes` MUST be allowed on a concept only. `tessera_ai_context` and
  `tessera_governance` MUST be allowed on a concept and on a relationship.
- **FR-004**: Revision 1 documents, and their findings, MUST be unchanged by this feature.

**Attributes**

- **FR-005**: A relationship MUST be an attribute if and only if it has exactly one role and that
  role's concept is a value type of the same document or a built-in concept. No other rule makes a
  relationship an attribute.
- **FR-006**: An attribute MUST keep its standard serialization. The format MUST NOT add an
  attribute collection, and an attribute MUST have the same item address as the relationship it is.
- **FR-007**: `tessera_attributes` MUST be a list of distinct relationship names of its concept, each
  naming an attribute of that concept. A name that is repeated, missing or not an attribute MUST be a
  finding that names the entry and its position.
- **FR-008**: Attributes not in the list MUST be shown after the listed ones, in file order. A
  document without the list MUST show attributes in file order.
- **FR-009**: The interface MUST let an author create, edit, rename, reorder and remove an attribute
  of a concept through the existing save operations, with the existing hash check and atomic write.
- **FR-010**: The attribute form MUST ask for a name, a type, a reading sentence, optionally a
  description and multiplicity, and MUST offer the concepts of type value and the eight built-in
  concepts as types. The reading sentence MUST have a suggested default the author can change,
  because the standard requires one.
- **FR-011**: A value type's details MUST list the attributes that use it, across the document.
- **FR-012**: Removing an attribute MUST remove its entry from `tessera_attributes`. Renaming one MUST
  rewrite its entry.
- **FR-013**: Inherited attributes MUST be listed on a concept's details, marked inherited, with a
  link to the concept that declares them.
- **FR-014**: Writing `tessera_attributes` MUST need a document at revision 2. The interface MUST
  explain this and MUST raise the revision only on the author's confirmation.

**Agent context**

- **FR-015**: `tessera_ai_context` MUST accept the same value shapes as the standard Ossie
  `ai_context` (a text, or instructions, synonyms and examples) and the same limits.
- **FR-016**: The interface MUST let an author edit it for a concept and a relationship, with the
  three fields separate and a preview of what an agent receives.
- **FR-017**: Agent context, plans and explanations MUST include `tessera_ai_context` of an item, at the
  item's address, only when they are produced from the published snapshot. Unpublished text MUST
  never be included (decision E5), including for the author's own agent.
- **FR-018**: The browser preview of the working copy MAY include unpublished context and MUST say so
  in the words the preview already uses.
- **FR-019**: `tessera_notes` MUST still never appear in agent output (feature 011).

**Governance**

- **FR-020**: `tessera_governance` MUST be an object that may hold `status` (`proposed`, `approved` or
  `deprecated`), `owner`, `steward`, `classification`, `replaced_by` and `deprecation_reason`. It MUST
  hold at least one of them and no other key.
- **FR-021**: A missing status MUST read as "not set". It MUST NOT count as approved in any check,
  answer or export.
- **FR-022**: `replaced_by` and `deprecation_reason` MUST be allowed only with status `deprecated`.
  `replaced_by` MUST name an existing item of the same kind in the unit.
- **FR-023**: Setting status `approved` or `deprecated`, and changing the owner or steward of an
  approved item, MUST need approver authority, the same as for metrics. A person MUST NOT approve an
  item that they own. Owner comparison MUST be case-insensitive and refuse in doubt, as for metrics.
- **FR-024**: Changing or removing an approved item, except its description and its notes,
  MUST be refused or offered as a demotion to proposed, exactly as for metrics.
  Changing its agent context MUST count as changing it.
- **FR-025**: Classification on an ontology item MUST be a declaration. Changing it, and changing the
  content of an item at or above the protected level, MUST follow the rules that data-contract
  properties follow today. It MUST NOT enforce any read restriction.
- **FR-026**: Each rule in FR-023 to FR-025 MUST apply on every write path that can carry the change:
  save, batch save, item edit, import, pull, revert, restore, move, publish, and saves by an agent or an
  application. Refusal text for an unreadable item MUST name neither the item nor its kind.
- **FR-027**: The governance editor MUST be unavailable, not hidden, until the rules of FR-023 to
  FR-026 are active, so that no build offers the editor without them.
- **FR-028**: Governance MUST be available for concepts, relationships and attributes of ontologies
  through `tessera_governance`, and for metrics through their existing place. Datasets, fields and
  joins are not part of this feature.

**Metric adapter**

- **FR-029**: One domain description of governance MUST serve both storage places. Metrics MUST be read
  and written only in their existing extension and MUST NOT be rewritten when merely viewed.
- **FR-030**: The legacy metric status `draft` MUST be shown as "draft (older value)" and treated as
  not approved. An unknown status MUST be shown as an unknown value and treated as not approved.
- **FR-031**: Two representations of governance for one item (for example a metric carrying a second
  copy) MUST be a finding.

**Compilation and loss**

- **FR-032**: The compiler MUST drop `tessera_attributes`, `tessera_ai_context` and
  `tessera_governance` from standard output and list each as a loss. It MUST NOT fold agent context
  into root instructions, a description or another item's metadata (decision E12).
- **FR-033**: The compiled attribute relationships MUST equal the source relationships. The meaning check
  MUST fail the compile when they do not, and no acceptance MUST override that.
- **FR-034**: The loss report MUST carry, when any governance is lost, the count of lost governance
  entries by status (`proposed`, `approved`, `deprecated`, `not set`). The counts MUST be part of the
  digest and MUST be absent, not zero, when no governance is lost.
- **FR-035**: The report version and the compiler version MUST change, and golden files for the old
  version MUST be replaced in the same change.
- **FR-036**: The documentation MUST state that accepting a loss report is not approval and that
  standard output does not carry status.

**Agent output**

- **FR-037**: Context, plan and explanation output that uses an item MUST carry the item's governance
  status and, for a deprecated item, its replacement and reason. Non-approved published items MUST be
  included and flagged, never removed (decision E16).
- **FR-038**: Agent output MUST NOT contain owner, steward or classification values of ontology items.
- **FR-039**: Output for a document without any addition MUST equal the output before this feature,
  except for the status field of items that carry governance.

**Editing defects**

- **FR-040**: Creating a concept with an IRI MUST save that IRI.
- **FR-041**: The relationship target choices MUST include the built-in concepts after the declared
  ones, and the form MUST accept a built-in target.
- **FR-042**: Renaming a relationship MUST rewrite every reference to it in the document and its
  mappings that a person could write, and MUST refuse the save, naming the reference, when a reference
  cannot be rewritten. Rewriting MUST NOT touch an unrelated item with the same name.

**Interface**

- **FR-043**: The new sections (attributes, agent context, governance) MUST use the existing tokens,
  controls and layout language, and MUST have empty, loading, error and long-text states.
- **FR-044**: They MUST work at phone width, in light and dark themes, with no horizontal page scroll.
- **FR-045**: No text MAY be clipped, cut or ellipsized. Long names, readings, context and reasons
  MUST wrap.
- **FR-046**: Status MUST be shown as words and a shape, never by colour alone. Status text MUST meet
  contrast AA in both themes.
- **FR-047**: The attribute row MUST offer a place for another feature to add a mark (traffic count,
  change mark) without changing the row's own code.
- **FR-048**: The graph drawing MUST be unchanged by this feature. Attributes are presented in the
  details and the catalog.
- **FR-049**: A person who may not edit an item MUST see the sections read only, with the reason.

**Documentation**

- **FR-050**: The README, architecture document, user guide, agent-runtime guide, schema notes,
  item-address guide, development guide and changelog MUST describe the three additions, the rules
  and their limits in the same change.
- **FR-051**: The documentation MUST say that classification is a declaration, that governance is not
  carried to standard output, and that agent context is read from the published snapshot only.

### Key Entities

- **Attribute**: a relationship with one role to a value type or built-in, presented as an attribute.
- **Attribute order**: the optional list on a concept that fixes display order.
- **Agent context**: instructions, synonyms and examples for agents, per item.
- **Governance entry**: status, owner, steward, classification and deprecation details of an item.
- **Status**: proposed, approved or deprecated; "not set" when absent.
- **Governance adapter**: the one reader and writer view over the two storage places.
- **Status counts**: counts of lost governance entries by status in the loss report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every 011 fixture and every existing validation, address and agent-context fixture gives
  identical findings and output. Zero differences.
- **SC-002**: Across the write paths of FR-026, every fixture case an unauthorized person attempts is
  refused, and the same case by an authorized person succeeds: 100% of the matrix.
- **SC-003**: Every metric governance rule has a twin case for ontology items, and the two sets of
  outcomes are equal.
- **SC-004**: For the all-additions fixture, 100% of removed values appear in the loss report, none
  remain in the output, and status counts equal the counts computed from the source.
- **SC-005**: Attribute relationships in the output are byte-equal to the source for every fixture.
- **SC-006**: An agent answer produced before and after an unpublished edit is byte-equal, for context,
  plan and explanation.
- **SC-007**: The attribute, agent-context and governance sections show no clipped text, no
  colour-only status and no horizontal page scroll at 360 px width, light and dark, in a recorded
  comparison. The width of 360 px is the narrowest width the existing responsive checks use.
- **SC-008**: Creating, editing, renaming, reordering and removing an attribute each succeed through
  the editor in the browser check on a fixture of 200 concepts. The time bound is measured by the
  task that builds the check; no number is assumed here.
- **SC-009**: The mutation suite detects every mutant of the attribute rule, the revision check, the
  governance rules on ontology items, the published-only context rule and the status counts.
- **SC-010**: With none of the three additions in use, every screen of the last release's journey
  compares equal, apart from the new sections' presence on details panels.

## Assumptions

- **Feature 011 is the base.** Its registry, revision rule, compiler, loss report and bases exist.
- **Ontologies only.** Governance for datasets, fields and joins stays out; metrics keep their place.
- **Limits** (assumed, not measured): at most 200 entries in the ordering list, owner and steward up to
  200 characters, deprecation reason up to 2,000 characters, agent context fields as the standard
  allows and each text up to 10,000 characters (the same as notes in 011).
- **Roles.** Approver authority means what it means for metrics today: a Steward of the project's domain
  or an Admin.
- **People.** Owner and steward are text values compared as metrics compare them; person sign-in
  (feature 013) may later improve identity matching and needs no change here.
- **Mapping documents** may name relationships; they are standard Ossie and are rewritten on rename like
  other references.
- **No new route or operation.** Reading, saving and publishing use today's operations.
- **Defaults** carry their source in the plan.

## Out of Scope

- Item diff and the overlay of unpublished work (feature 017). This feature leaves the place for the mark.
- Imports and attributes whose value type is in another project (feature 018). The attribute rule
  takes its type lookup as a parameter so 018 can extend it.
- The approved-only export projection and the HTTP and MCP compile (feature 019), and the reviewed
  conversion of metric payloads at Ossie 0.3 adoption (019, decision E17).
- Governance for datasets, fields, joins and mappings.
- Enforcing classification as a read restriction (decision E17).
- A graph card that draws attributes as rows.
- Usage counts on attribute rows (feature 014 uses the row's place).
- Notifications about status changes.

## Decisions made while specifying

The owner has not been asked. Each choice is the most consistent with the decisions file.

1. **Attributes are relationships, `tessera_attributes` is order only.** Decision E18 forbids a second
   attributes collection, and 011 reserved the name. A reference-only list gives the name a job that
   adds no definitions. It costs one revision-2 property that the compiler drops.
2. **One revision for all three.** They ship together as revision 2, so documents need one step.
3. **Status vocabulary: proposed, approved, deprecated.** It is the metric vocabulary without `draft`,
   because decision E17 maps legacy draft to proposed and a new vocabulary should not start with a
   legacy value.
4. **Legacy `draft` is displayed, not converted.** Decision E17 says conversion happens only through the
   reviewed step at Ossie 0.3 adoption.
5. **Agent context is the one addition agents see.** The purpose of `tessera_ai_context` is agent use.
   Feature 011 FR-026 said no addition reaches agents; that stays true for notes and attribute order and is
   amended for agent context and the governance flag (see the gaps).
6. **Owner, steward and classification stay out of agent output.** They name people and declare levels
   that nothing enforces. The status, replacement and reason are what an agent needs to avoid a bad item.
7. **Description and notes are free on an approved item; agent context is not.** Agent context steers
   production agents, so it follows the metric rule that guards everything but the description.
8. **Classification reuses the data-contract rules.** One way is better than a second.
9. **Attribute presentation in details and catalog, not on graph cards.** The graph is a regression-gated
   screen; moving value-type edges into rows would change it for people who did not ask.
10. **Raising the revision needs consent.** Silent upgrades would stop older workbenches reading the file.
11. **Editor held back until guards exist.** Decision E17 requires it, so FR-027 makes it a rule.
12. **Report version 2.** Adding status counts changes the report's shape, and a digest must never
    mean two things.
13. **Value-type scope is the document.** Types in other documents arrive with imports (018).

## Gaps and contradictions found

- **E18 and 011's reserved list.** E18 says no second attributes collection; the reserved name
  `tessera_attributes` implies one. Resolved by decision 1.
- **E17 and E2 on where governance lives.** E17 asks for one canonical representation in the
  SEMANTIC_WORKBENCH payload; E2 and the reserved name put ontology governance in an added property.
  Ontology items have no vendor slot, so both hold: one representation per item, two storage places,
  one domain model.
- **011 FR-026 and E5 versus agent context.** FR-026 forbids any addition in agent output; an agent
  context that agents never see has no purpose. Amended here for two items only, and 011's test of
  that rule changes with it (listed in the plan).
- **E17 lists "every supported item" for guards,** but only metrics have governance today. This feature
  fixes the supported set at ontology concepts, relationships and metrics.
- **E18 says attributes are presented as attributes,** which could be read as graph cards. Decision 9.
- **E15 status counts for ontologies** were impossible before this feature; 011 FR-046 left the field out.
- **E1 names `sw_` examples.** 011 already resolved this as `tessera_`.
- **Approval of items the person cannot read** is not defined for ontology items; FR-026 reuses the
  metric rule.
