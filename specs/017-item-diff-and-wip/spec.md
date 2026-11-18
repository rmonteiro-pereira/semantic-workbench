# Feature Specification: Item Diff and Work-in-Progress Overlay

**Feature Branch**: `016-format-specs` (documents only; the implementation branch is created when the feature is taken up)

**Created**: 2026-11-17

**Status**: Draft

**Input**: Roadmap step 4 of decision R1. Today the workbench can show which files changed
(`DiffView`) and can show only one state of an ontology at a time. People who curate definitions
need to see what a change does to concepts, relationships and attributes, and to see their unpublished
work next to what production uses. Decisions E5, E6, E7 and E16 and the owner's requirements: item
diff by item address, an overlay of unpublished work shown greyed over production, a display aid and
not access control, agents never planning with unpublished definitions, the planner may show
non-approved metrics, and branching on entities, relationships and attributes using Git branches.

## Summary

- An **item diff** compares two states of a project item by item. An item is a concept, a
  relationship, an attribute (a relationship with one other role that points to a value type or a
  built-in, decision E18) or any other item that has an item address. Each item is reported as added,
  removed, changed or unchanged, by its item address.
- A rename or move that the workbench recorded as an address migration is reported as one changed
  item, not as a remove plus an add. A rename done outside the workbench is a remove plus an add
  (decision E6).
- The **overlay** shows, on the graph, the details panels and the lists, what the person's current
  branch changes against the published state. Added, changed and removed items are shown **greyed**
  over the published picture. Greyed items carry a text label and a dashed outline, so colour is never
  the only signal, and they stay readable.
- The overlay is a **display aid**. It does not hide anything from anyone, grants nothing and is not
  access control. What a person may read is decided as before.
- Unpublished definitions never reach an agent. No agent-facing answer, plan or context changes. The
  planner view in the browser may show published metrics that are not approved, flagged as such
  (decisions E5 and E16).
- A **branch control** on each entity, relationship and attribute lets a person start a branch from
  that item, see which branch they are on, and switch. It uses the existing Git branches and the
  existing branch operations. Nothing is pushed.
- The **publication review** uses the same diff to show, in the existing publish step, which items
  publishing would change.
- One new read operation, `items.diff`, serves all of this through the operation boundary. The review
  of shared proposals (feature 012) can use it instead of the file-level diff.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A person sees what a branch changes, item by item (Priority: P1)

An author has edited a Finance ontology on their branch: one concept added, one relationship
renamed through the workbench, one attribute changed, one concept removed. They open the change view
and read a list of items grouped by kind, each with its state and, for changed items, what changed
(description, type, roles, multiplicity, extends, governance and agent-context text, and so on).

**Why this priority**: it is the base of everything else. Without a reliable diff the overlay and the
publication review have nothing to show.

**Independent Test**: build two states of a fixture project, request the diff, and compare the list with
the expected one for every kind of change.

**Acceptance Scenarios**:

1. **Given** a branch that adds a concept, **When** the diff of `published` against `working` is read,
   **Then** the concept is listed as added with its item address.
2. **Given** a relationship renamed through the workbench, **Then** it is listed once, as changed, with
   its old and new address.
3. **Given** a rename made by editing the file outside the workbench, **Then** the old item is
   listed as removed and the new one as added.
4. **Given** an attribute whose target value type changed, **Then** it is listed as changed under the
   kind attribute, and the changed field is named.
5. **Given** two states that differ only in comments, key order or line endings, **Then** no item is
   listed as changed.
6. **Given** two states with no difference, **Then** the answer says there is nothing to compare, and
   the view says so in words.

---

### User Story 2 - The graph shows unpublished work greyed over production (Priority: P1)

A person on a branch opens the graph. Items that exist in production look as they always do. Items
that are new on the branch appear greyed with the label "Not published: added". Items changed on the
branch keep their place and show "Not published: changed". Items removed on the branch stay visible,
greyed and labelled "Not published: removed". The same marks appear in the details panel and in the
lists. A person can switch the overlay off.

**Why this priority**: it is the owner's main request for this feature.

**Independent Test**: a browser check with a fixture branch, in light and dark themes and at phone
width, compares the graph with the overlay off against the recorded screens of the last release, and
checks the overlay on.

**Acceptance Scenarios**:

1. **Given** the overlay is on and the branch adds a concept, **Then** the concept card is greyed, has a
   dashed outline and the text "Not published: added".
2. **Given** a removed concept, **Then** it is still drawn, labelled "Not published: removed", and its
   relationships to published items are drawn.
3. **Given** a changed relationship, **Then** its edge keeps its route, carries the label text and a
   dashed line style.
4. **Given** the overlay is off, **Then** every screen equals the screen without this feature.
5. **Given** the person is on the default branch with nothing unpublished, **Then** no mark appears and the
   overlay control says there is no unpublished work.
6. **Given** the dark theme, **Then** the greyed text and outline keep at least the contrast the design
   requires for text and for non-text parts.

---

### User Story 3 - A person starts a branch from an item and works on it (Priority: P1)

An author selects a concept and chooses "Start a branch for this item". They name the branch, and the
workbench creates it and switches their working copy to it, using the Git branch operations that exist.
The graph, the details panel and the item card name the current branch. They edit, see their changes as
the overlay, and switch back to another branch from the same place.

**Why this priority**: the owner asked for branching UI on entities, relationships and attributes.

**Independent Test**: through the browser, start a branch from an entity, a relationship and an attribute,
edit, see the overlay, and switch back.

**Acceptance Scenarios**:

1. **Given** a selected entity, relationship or attribute, **Then** the details panel offers "Start a
   branch for this item" and names the current branch.
2. **Given** a person who may not edit, **Then** the control is absent, and a read-only person still sees
   the current branch name.
3. **Given** a branch name that is invalid or already used, **Then** the dialog says why in words and
   keeps what was typed.
4. **Given** a branch held by another person's working copy, **Then** it is listed with who holds it and
   cannot be chosen (as in the existing branch list).
5. **Given** a switch, **Then** the overlay recomputes against the new current branch, and no branch is
   pushed.
6. **Given** unsaved edits that the switch would lose, **Then** the person is told and nothing is lost,
   as the existing switch already does.

---

### User Story 4 - A steward reviews what publishing will change (Priority: P2)

Before publishing, a person who may publish opens the publish step and reads the item diff of the
published state against what would be published: counts by kind, the list of items, and the changed
fields. They can still publish as before.

**Why this priority**: it turns the diff into a decision aid and prepares the shared-proposal review.

**Independent Test**: open the publish step on a fixture with unpublished changes and check the counts and
the list against the diff; open it with none.

**Acceptance Scenarios**:

1. **Given** unpublished changes, **Then** the publish step shows the counts and the list before the
   existing confirm control.
2. **Given** no unpublished changes, **Then** it says so and shows no list.
3. **Given** a change that the diff cannot compare (a file that does not parse), **Then** the step names the
   file and says that its items are not compared. Publishing is not blocked by this feature.
4. **Given** a very large change, **Then** the view shows a bounded part and says how much is not shown.

---

### User Story 5 - Agents never plan with unpublished definitions (Priority: P1)

An agent that asks for context, a plan or a metric explanation receives published definitions only,
with or without the overlay and the branch controls. The browser planner view may show published
metrics that are not approved, flagged as not approved.

**Why this priority**: it protects decision E5 while the overlay makes unpublished work visible.

**Independent Test**: run the existing agent-context and plan tests with a branch that has unpublished
definitions, before and after, and compare.

**Acceptance Scenarios**:

1. **Given** unpublished definitions on any branch, **Then** agent context, plans and metric
   explanations equal those for the published state, byte for byte.
2. **Given** a published metric whose status is not approved, **Then** the browser planner view shows it
   with the text "Not approved" and its status.
3. **Given** the item diff operation, **Then** it is not available to application (agent) callers on this
   base, and no answer to an application caller changes.
4. **Given** the documentation, **Then** it says the overlay is a display aid and that unpublished work is
   inside the workbench by application guarantee only.

---

### User Story 6 - Reviews of shared proposals can read the same diff (Priority: P3)

The review view of a shared proposal (feature 012) shows files and text differences today. It can ask
for the item diff by naming the sides, so reviewers see items. This feature provides the operation and
the side naming, and leaves the proposal side to the proposal feature.

**Why this priority**: it is a dependency for review quality, but proposals ship separately.

**Independent Test**: the diff operation accepts a named commit side that a proposal tip will use, and a
test fixture reads a branch that is not the person's current one.

**Acceptance Scenarios**:

1. **Given** two named commits readable by the person, **Then** the diff answers.
2. **Given** a side that names someone else's personal branch, **Then** the answer is the same as for a
   side that does not exist.
3. **Given** a side name the operation does not know, **Then** the answer is a refusal that lists the
   sides it knows.

---

### Edge Cases

- A file that does not parse in one state: its items are not compared. The answer lists the file as not
  compared and the view says so. Items of other files are still compared.
- A project with no published commit: there is nothing to compare against. The view says the project has
  no published state, and the overlay shows every item as "Not published: added" only when the person asks
  for it by switching on the overlay.
- A file added, deleted or moved between states. A moved file with recorded address migrations keeps its
  items as changed; an unrecorded move is remove plus add.
- Two items with the same name in the same scope: ambiguous addresses are reported as ambiguous, never
  matched by guess.
- Items without a name (roles, mappings without a name) are compared by their position among siblings,
  as the item address grammar defines.
- A Tessera document (feature 011): its marker and additions are not items. A change that only touches
  an addition (a note, or later governance or agent context) is reported as a change to the item that
  carries it.
- A document in the deprecated consolidated layout with an embedded semantic model: embedded items are
  compared by their addresses.
- A branch deleted or force-changed while the overlay is on: the overlay recomputes and says the branch
  moved.
- Very long item names and descriptions: wrapped everywhere, never clipped or cut with an ellipsis.
- Very many changed items: the answer is bounded; the view says what is not shown and how to narrow it.
- The published state moves while the diff is being read: the answer names the published commit it used.
- A person without permission to read one side: the answer is the same as for a side that does not exist.
- Local mode and server mode: both work. In local mode the person's working copy is the project folder.

## Requirements *(mandatory)*

### Functional Requirements

**Comparison**

- **FR-001**: The workbench MUST compare two states of one project and report each item as added, removed,
  changed or unchanged, identified by its item address in each state.
- **FR-002**: The comparison MUST cover every kind of item that the item address grammar names, with the
  same rules for all of them. The graph, details and list display (FR-017 to FR-022) MUST cover entities,
  relationships and attributes; other kinds appear in the change list only.
- **FR-003**: An attribute MUST be reported under the kind "attribute" when it is a relationship with one
  other role whose target is a value type or a built-in, and under "relationship" otherwise. Both MUST use
  the relationship's own item address. No second collection exists.
- **FR-004**: Two items MUST be matched by item address. When the address migration records of the project
  show that an address moved from one to another between the two states, the pair MUST be reported as one
  changed item with both addresses.
- **FR-005**: Without such a record, an item that disappears from one address and one that appears at another
  MUST be reported as removed and added. The comparison MUST NOT match items by similarity or by equal names.
- **FR-006**: A changed item MUST name each field that changed, with its before and after values bounded in
  length, and MUST NOT report a change for comments, key order, whitespace or line endings.
- **FR-007**: For a Tessera document, a change to an addition MUST be reported as a change to the item
  that carries it, naming the addition. Additions MUST NOT be reported as items.
- **FR-008**: An ambiguous address in either state MUST be reported as ambiguous with the number of
  candidates and MUST NOT be matched.
- **FR-009**: A file that does not parse in either state MUST be listed as not compared, with the reason,
  and MUST NOT stop the comparison of other files.
- **FR-010**: The comparison MUST be deterministic. The same two states MUST give the same answer in the same
  order (by file path, then item kind, then address).
- **FR-011**: The answer MUST be bounded in items, in bytes and in the length of each value. When it is cut,
  it MUST say how many items are not shown.

**The operation and its limits**

- **FR-012**: There MUST be one new read operation, `items.diff`, in the operation inventory, served through
  the operation boundary with the existing authorization and audit, for the browser. It MUST NOT be available
  to application callers on this base.
- **FR-013**: A side MUST be named as `published`, `working` (the person's saved working copy on their current
  branch), `branch:<name>` or `commit:<id>`. The operation MUST refuse any other name and list the names it
  knows.
- **FR-014**: The caller MUST be allowed to read both sides. A side that is another person's personal branch,
  that is unreadable to the caller or that does not exist MUST give the same answer. The operation MUST NOT
  confirm that a hidden branch exists.
- **FR-015**: Items in files the caller cannot read MUST be left out of the answer on both sides, and the
  answer MUST NOT reveal that they were left out.
- **FR-016**: The answer MUST name the commit or version it used for each side, so that a later change of a
  branch is detectable.

**Overlay**

- **FR-017**: The workbench MUST offer an overlay, on by default when the current branch has unpublished
  changes and off otherwise, that compares `published` with `working`.
- **FR-018**: With the overlay on, every added, changed or removed item in the full graph, the neighbourhood
  graph, the details panels and the lists MUST be marked with a text label, a dashed outline and a grey
  treatment, and MUST remain fully readable.
- **FR-019**: A removed item MUST be drawn at the place it has in the published state, together with its
  edges to items that still exist.
- **FR-020**: The mark MUST NOT rely on colour alone, MUST meet the contrast the existing design requires for
  text and non-text parts in the light and the dark theme, and MUST NOT change the size of any card.
- **FR-021**: With the overlay off, or with no unpublished change, every screen MUST be unchanged by this
  feature in its rendered structure and in the recorded comparison.
- **FR-022**: The overlay MUST never hide, disable or block any item, action or answer. It MUST NOT change what
  anyone may read or do.
- **FR-023**: The overlay control MUST show the branch that the overlay follows, the published commit it is
  compared with, and the number of items per state, and MUST follow the current branch when it changes.

**Branching**

- **FR-024**: The details panel of an entity, relationship and attribute MUST show the current branch name
  and, to a person who may edit, the action "Start a branch for this item".
- **FR-025**: Starting a branch MUST use the existing branch creation and switching operations and their
  authorization, MUST record the item address in no file, and MUST NOT push anything.
- **FR-026**: The branch list MUST show who holds a branch that another working copy holds and MUST NOT allow
  choosing it, as the existing branch picker does.
- **FR-027**: The workbench MUST refuse, in both modes, to push a branch it manages for unpublished work
  from this control. Pushing remains where it is today.

**Publication review**

- **FR-028**: The publish step MUST show the counts by kind and the list of items that publishing would
  change, from the same comparison as FR-001, before its existing confirmation control.
- **FR-029**: The review MUST NOT block, delay or change publishing. A comparison failure MUST be shown as a
  notice with its reason, and publishing MUST continue to work as before.

**Agents and the planner**

- **FR-030**: No agent-facing answer (agent context, plans, metric explanations, any application-caller
  answer) MUST change because of this feature. Unpublished definitions MUST NOT appear in any of them.
- **FR-031**: The browser planner view MAY list published metrics whose status is not approved. Each MUST be
  labelled with the words "Not approved" and its status. A metric without a status MUST be labelled "Status
  not set" and never treated as approved.
- **FR-032**: Documentation MUST state that the overlay is a display aid and not access control, that
  unpublished work stays in the workbench by application guarantee, and that a repository administrator with
  Git access can read branches.

**Interface states**

- **FR-033**: Every new view (the change list, the overlay control, the branch action, the publication
  review) MUST have empty, loading, error with retry, and long-text states, MUST work at phone width and in
  the light and dark themes with the existing visual design (same tokens, components and layout language),
  and MUST NOT clip, cut or end any text with an ellipsis.
- **FR-034**: Loading and recomputing the overlay MUST keep the graph usable. A failure MUST show an error
  with retry and leave the graph as it is without the overlay.

**Extension points**

- **FR-035**: The set of sides MUST be extensible by one registration, so that feature 012 can add
  `proposal:<id>` without changing the comparison or the answer.
- **FR-036**: The graph and detail components MUST carry the overlay mark through one optional `change`
  field and one mark component, placed in the item annotation slot that also hosts other marks, so that
  features 014 and 016 and this one do not edit each other's components.

### Key Entities

- **Side**: a named state of a project: published, working, a branch or a commit.
- **Item diff**: the list of item changes between two sides, with the commits or versions used.
- **Item change**: one item, its kind, its state (added, removed, changed, unchanged), its addresses and the
  fields that changed.
- **Overlay**: the display of item changes of the current branch over the published state.
- **Mark**: the text label, the dashed outline and the grey treatment of an overlaid item.
- **Branch control**: the action and the label that start and show a branch from an item.
- **Publication review**: the item diff shown in the publish step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixture holding every kind of change in User Story 1, the diff lists each item exactly once
  with the right state. Zero missing and zero extra items.
- **SC-002**: For every rename and move recorded by the workbench in the fixture, 100% appear as one changed
  item, and for every unrecorded rename, 100% appear as remove plus add.
- **SC-003**: Two states that differ only in comments, key order, whitespace or line endings give zero
  changed items, for every ontology, model and contract under `public/examples/`.
- **SC-004**: With the overlay off, the recorded comparison against the last release shows zero differences on
  every screen of the full journey, including every stage of the graph.
- **SC-005**: With the overlay on, every mark has its text label, and a check of the rendered page finds no
  mark that depends on colour alone, no clipped text and no overlap, in light, dark and phone width.
- **SC-006**: Every pair of text and background used by the marks reaches contrast ratio 4.5 to 1 for text and
  3 to 1 for outlines (the WCAG 2.1 AA values), in both themes.
- **SC-007**: Agent context, plan and explanation answers for a fixture with unpublished definitions equal
  those without them. Zero differences.
- **SC-008**: A diff of 2,000 items on each side answers within 1 second on the development server, and the
  overlay on a 500-entity graph adds at most 10 percent to the time the graph needs to show. These numbers
  were chosen here, not measured; the task that implements the check records the measured values.
- **SC-009**: Every refusal case (unknown side, hidden branch, unreadable side, application caller) has a test
  that fails when the check is removed, and the hidden-branch answer equals the missing-branch answer byte
  for byte.
- **SC-010**: The mutation suite detects every mutant of side selection, address matching, migration handling and
  the authorization of sides.
- **SC-011**: The documentation passes the repository checks, and each claim names behaviour covered by a test.

## Assumptions

- **Working side.** The person's saved working copy on their current branch is the editing state they see in
  the workbench. Unsaved editor text and kept drafts are not part of it.
- **Published side.** The published state is the committed snapshot of the default branch (decision E4). A
  project without one has no published side.
- **Same repository, same tools.** Comparison reads Git objects and working copies through the helpers that
  exist; no new dependency is added.
- **Default limits** (tagged in the plan with their sources): the answer size, the item count and the value
  length use the limits of the existing source-control diff where one exists, otherwise they are assumed.
- **Item addresses and migrations** (feature 009) are stable and are the only identity used.
- **Tessera (feature 011)** is on the base of this work. Without it the comparison treats every document as
  standard Ossie.
- **No agent surface.** An agent-facing item diff is a later increment. The plan lists what it would need.
- **Constitution 4.0.1.** No amendment is needed: nothing leaves the workbench, no state is added.

## Out of Scope

- Shared proposal lifecycle and the review view of proposals (feature 012). This feature only offers the
  operation and the side naming it will use.
- A `proposal:<id>` side (added by 012 or its follow-up).
- Impact analysis of a change on consumers and readiness findings (roadmap row 4's later parts, decision E27).
- Planning, SQL or context from unpublished definitions for anyone, including the author's own agent.
- Pushing or sharing unpublished branches outside the workbench (decision E7).
- A merge or conflict resolution view. This is a read-only comparison.
- Selected-item publication (roadmap row 12).
- An MCP or agent tool for the item diff.
- Traffic display (feature 014). It shares the cards but not the data.

## Decisions made while specifying

The owner has not been asked. Each choice is the one most consistent with the decisions file.

1. **The overlay compares `published` with `working`.** Reason: the person sees their saved copy in the
   workbench; decision E5 says unpublished is everything but the default-branch snapshot.
2. **One comparison for every item kind, display for three.** Reason: item addresses make the comparison
   generic; the owner asked for entities, relationships and attributes on screen.
3. **Attributes are relationships (E18).** Reason: E18 forbids a second collection; they are reported under
   their own kind only for display.
4. **Recorded migrations decide renames.** Reason: decision E6 says unrecorded changes are remove plus add.
5. **Hidden branch equals missing branch.** Reason: decision E10 style, no disclosure about unreadable things.
6. **The operation is browser-only on this base.** Reason: decision E5 limits agent tools to the published
   state, and the roadmap does not list an item diff tool.
7. **Removed items are drawn greyed, not hidden.** Reason: a diff that hides removals misleads a reviewer.
8. **The publication review never blocks.** Reason: decision R1 row 4 lists readiness findings as a separate
   advisory item, and the owner prefers publishing to stay as it is.
9. **Branch start has no new operation.** Reason: the existing create-and-switch operation already has its
   authorization and audit; a second one would duplicate rules.
10. **Overlay on by default only with unpublished changes.** Reason: it keeps every other screen as it was.
11. **Non-approved published metrics are shown with a flag in the browser planner.** Reason: decision E16 and
    the owner's statement that the planner may show them.
12. **Numbers are chosen, not measured** (SC-008 and the limits in the plan).

## Gaps and contradictions found

- E5 says "authoring tools may read and edit authorized WIP and return validation findings". The item diff
  of WIP is such a read, but no decision places it in an agent tool. Resolved by Decision 6.
- R1 row 4 puts "item diff, WIP overlay, and publication review" together with A8 readiness findings and
  A4 impact view. The brief for this feature lists only the first three. A8 and A4 are left out.
- E7 forbids pushing unpublished branches, but the existing branch operations can push a branch the person
  named. Feature 012 adds the refusal for managed branches. This feature adds no push and relies on 012 for
  the refusal in remote actions; until 012 merges the guarantee is "this control never pushes".
- The decisions say "branch" without saying whether a branch started from an item carries the item's
  address. This feature records none (FR-025); the branch is an ordinary branch.
- Feature 012's review shows a file-level diff and says item diff "will read proposal tips through the same
  read operation". This feature honours that by naming sides (FR-013, FR-035).
- Feature 014 says attribute presentation is not built on its base. Attribute rows belong to feature 016;
  this feature's attribute marks depend on that row component (see the plan).
- E1 uses `sw_` names while the format uses `tessera_`; irrelevant here beyond FR-007.
