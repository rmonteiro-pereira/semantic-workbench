# Feature Specification: Shared Proposals

**Feature Branch**: `012-independent-specs` (documents only; the feature's own branch is created when implementation starts)

**Created**: 2026-11-17

**Status**: Draft

**Input**: Several people must be able to work on one change that is not published yet, without
anyone outside the workbench seeing it and without one person's unrelated work travelling with it
(decisions E7, E8 and E9, and the owner's requirement for shared proposal branches). Today every
person has one working copy on one personal branch. That branch cannot safely carry unrelated work
into several shared changes, only the default branch can be merged into it, and the workbench will
push a personal branch to a remote when asked. This feature adds the **proposal**: a named, shared
line of work inside the workbench with a declared set of projects, a private contribution branch per
person and proposal, a compare-and-swap contribution step, and one atomic promotion to the default
branch with the safeguards of publication. It does not add item-level diff or overlay (a separate
increment), and it does not depend on the new Tessera format.

## Summary

- A **proposal** belongs to one repository and declares the projects it may change. It lives as a
  Git ref inside the workbench's own repository folder. It is never pushed, never part of an export,
  never read by an agent and never part of the published snapshot.
- Each contributor works on a **contribution branch** that the workbench creates for them from the
  proposal. They synchronize from the proposal, resolve conflicts on their branch, and **contribute**
  by moving the proposal forward with a compare-and-swap against the proposal tip they reviewed.
  Their personal branch and its unrelated work are never involved.
- A contribution that changes a file outside the declared projects is refused. A contribution is
  judged like the contributor's own changes: every changed file needs the contributor's authority
  and passes the content guards.
- **Promotion** moves the default branch to the proposal tip in one atomic repository operation. It
  needs publication authority over every project that shares the repository, authorization and
  guards for every changed file, validation of the whole candidate, and a proposal that already
  contains the published tip. Either every project moves or none does.
- Creating, contributing and reading follow what Editors and Viewers already may do. Promoting,
  closing and restoring follow publication authority (Stewards and Admins by default). No new
  permission is added.
- The workbench refuses to push any branch it manages for work in progress (personal branches and
  proposals), in both modes. This is an application guarantee, not an operating-system boundary.
- Closing a proposal is recoverable and leaves a record. Nothing in this feature erases history.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An Editor starts a proposal and contributes (Priority: P1)

An Editor on a shared server wants to prepare a change to the Finance ontology that other people will
help with, without publishing it. They create a proposal named "Loyalty tiers", choose the projects it
may change, switch their working copy to their contribution branch for it, edit and commit as usual,
and contribute. The proposal now holds their commits. Nobody else's working copy moved, and the
published snapshot did not change.

**Why this priority**: it is the owner's requirement for shared proposal branches. Without it there
is nothing to share.

**Independent Test**: with two people on a test server, one creates a proposal and contributes a
commit; the proposal tip equals that commit and the default branch and published snapshot are unchanged.

**Acceptance Scenarios**:

1. **Given** an Editor who may edit the projects it will name, **When** they create a proposal with a
   name and two projects of one repository, **Then** the proposal exists with their name, those
   projects, the published tip as its base and status open.
2. **Given** an open proposal, **When** the Editor chooses to work on it and their working copy is
   clean, **Then** their copy is on a contribution branch holding the proposal tip, and their personal
   branch is unchanged.
3. **Given** commits on the contribution branch that change files only in declared projects, **When**
   the Editor contributes with the proposal tip they last saw, **Then** the proposal tip becomes their
   branch tip, one audit record names the proposal and the projects, and nothing is pushed.
4. **Given** a Viewer, **When** they try to create a proposal, contribute or work on one, **Then** each
   is refused as other edit operations are.
5. **Given** a working copy with uncommitted or unsaved work, **When** the Editor asks to work on a
   proposal, **Then** the request is refused with the reason and nothing moves.

---

### User Story 2 - A second contributor joins without carrying unrelated work (Priority: P1)

A second Editor opens the same proposal. Their working copy has private commits for something else.
They work on the proposal from a contribution branch of their own that starts at the proposal tip. They
make a change and contribute. Their private commits are not in the proposal, and they can work on a
second proposal the same way.

**Why this priority**: the reviews showed that a single personal branch cannot do this safely; this is
the core of E9.

**Independent Test**: two contributors with diverging contributions; the second must synchronize before
contributing, and the proposal never contains commits from either person's personal branch.

**Acceptance Scenarios**:

1. **Given** a proposal that moved after the second Editor last looked, **When** they contribute with the
   old tip, **Then** the contribution is refused as stale and the proposal does not change.
2. **Given** that refusal, **When** they synchronize from the proposal, **Then** the proposal tip is
   merged into their contribution branch, and a conflict leaves the merge visible on their branch for
   them to resolve there.
3. **Given** a synchronized contribution branch with the resolution committed, **When** they contribute
   with the new tip, **Then** the proposal advances to their tip.
4. **Given** one Editor with contribution branches for two proposals, **When** they switch between
   them, **Then** each proposal contains only its own contributions and their personal branch contains
   neither.
5. **Given** a contribution branch, **When** another person lists branches, **Then** they do not see it.

---

### User Story 3 - Proposal work never leaves the workbench (Priority: P1)

An Admin audits what outsiders could see. With open proposals, the published exports, the agent
endpoints, the published snapshot and every remote operation show no proposal content. Pushing from the
workbench is limited to published history.

**Why this priority**: E7 is a guarantee about the product, and a leak is a security failure.

**Independent Test**: a repository with open proposals and a configured remote; run every export, agent
read, snapshot read and remote action and search the results and the remote for any byte unique to the
proposals.

**Acceptance Scenarios**:

1. **Given** an open proposal with a new definition, **When** the project is exported and an
   application client reads agent context and plans, **Then** the definition appears in none of them.
2. **Given** a configured remote, **When** a person pushes or syncs while on a contribution branch,
   a personal branch or a proposal, **Then** the workbench refuses with a message that says to publish
   first, and no ref reaches the remote.
3. **Given** a proposal ref and closed-proposal refs in the repository, **When** fetch, pull, push
   of the default branch or sync run, **Then** the remote receives only the default branch's history.
4. **Given** a remote that has a branch named like a proposal, **When** the workbench fetches, **Then**
   it is not shown as a proposal and is not used as one.
5. **Given** the documentation, **Then** it states that this is an application guarantee and that a
   repository administrator with Git or filesystem access can copy proposal content.

---

### User Story 4 - A Steward reviews and promotes a proposal atomically (Priority: P1)

A Steward opens a proposal, reads the changed files per project and their text differences, runs a
promotion check that shows what promotion would do and what would stop it, and promotes. Every project
that shares the repository moves to the new published state together. If any check fails, nothing moves
and the Steward is told why.

**Why this priority**: promotion is how proposed work reaches consumers; it must keep every guarantee
of publication and be all-or-nothing.

**Independent Test**: a repository shared by two projects; promote with the right authority and with
authority over only one project; promote a proposal that violates a content guard.

**Acceptance Scenarios**:

1. **Given** a proposal that contains the published tip and passes every check, **When** a person with
   publication authority over every project in the repository promotes it with the tip they reviewed,
   **Then** the default branch moves to that tip once, the published snapshot of every project in the
   repository refreshes together, one audit record names the proposal and the commits, and the
   proposal is marked promoted.
2. **Given** a person with publication authority over only some of the projects sharing the repository,
   **When** they promote, **Then** it is refused before anything is checked out or moved.
3. **Given** a changed file the promoter may not change, or a change a content guard refuses (for
   example approving a metric without the authority), **When** they promote, **Then** nothing moves and
   the refusal names the file and the guard without revealing files the person cannot read.
4. **Given** a candidate that fails validation or whose files exceed the snapshot limits, **When** they
   promote, **Then** nothing moves.
5. **Given** a proposal that does not contain the current published tip, **When** they promote,
   **Then** it is refused with the instruction to synchronize with the default branch first.
6. **Given** two people promoting at once, or a promotion racing a publication, **Then** exactly one
   wins and the other is refused with a stale-state answer.
7. **Given** the check action, **Then** it runs the same checks as promotion without moving anything
   and returns the same refusal reasons.
8. **Given** a crash between the steps of promotion, **When** the server restarts, **Then** the
   interrupted promotion is completed or dropped by the existing publication recovery and the proposal
   is marked promoted only if the default branch moved.

---

### User Story 5 - A proposal cannot change more than it declared (Priority: P2)

A proposal declares that it may change two projects. A contribution that touches a third project of the
same repository, a file in no project, or a repository-level file is refused as a whole. In a repository
that holds one project, the declared set is that project.

**Why this priority**: E8 defines the scope of a proposal in both repository shapes.

**Independent Test**: contributions touching declared, undeclared and project-less paths, including a
rename that moves a file across the boundary.

**Acceptance Scenarios**:

1. **Given** a contribution whose changes are all inside declared projects, **Then** it is accepted if
   authorized.
2. **Given** a contribution that also changes a file of an undeclared project, **Then** the whole
   contribution is refused, naming the project, and the proposal does not move.
3. **Given** a rename that moves a file from a declared to an undeclared project, **Then** it is refused.
4. **Given** a repository that holds several departments' projects, **When** a proposal declares one of
   them, **Then** only that department's folder can change, while promotion still needs authority over
   every project in the repository (E8).
5. **Given** a person who cannot read an undeclared project, **When** their contribution is refused
   because of it, **Then** the refusal does not reveal that project's name or contents.

---

### User Story 6 - A proposal is closed and restored, never erased (Priority: P2)

A Steward closes a proposal that is no longer wanted. The proposal disappears from lists of open
proposals, keeps a record of who closed it and when, and keeps its commits so it can be restored. After
promotion a proposal is also closed as promoted.

**Why this priority**: E9 requires recoverable deletion with an audit record.

**Independent Test**: close, list, restore, and check the recorded history and that no commit was lost.

**Acceptance Scenarios**:

1. **Given** an open proposal, **When** a person with publication authority over every project in the
   repository closes it, **Then** it leaves the open list, its commits stay reachable, and a record
   keeps who closed it, when, its declared projects and its last tip.
2. **Given** a closed proposal, **When** someone with the same authority restores it, **Then** it is open
   again at its last tip, unless its name or limit now conflicts, in which case the refusal says so.
3. **Given** a closed proposal, **Then** contributing, synchronizing and promoting it are refused.
4. **Given** any person, **Then** no operation in this feature permanently erases proposal history.
5. **Given** the contribution branches of people on a closed or promoted proposal, **Then** they remain
   as personal branches and are not deleted.

---

### User Story 7 - People find and read proposals in the interface (Priority: P2)

In Source Control, a person who can read a project sees the proposals that declare it: a list with name,
status, declared projects, who contributed and when it last moved; a detail view with changed files per
project, text differences using the existing diff view, the promotion check and the actions their role
allows. The views work on a phone, in light and dark, with long names and in every empty or failing state.

**Why this priority**: without a view, proposals can only be driven by requests.

**Independent Test**: browser check with mocked API data for each state at desktop and phone widths in
both themes; geometry assertions; screenshots reviewed.

**Acceptance Scenarios**:

1. **Given** no proposals, **Then** the list shows an explanation and, for an Editor, the create action.
2. **Given** a proposal with a very long name and many projects, **Then** all text is visible, wrapped,
   with no cut-off text and no horizontal page scroll at phone width.
3. **Given** a request in progress, **Then** the view shows a loading state, and a failed request shows
   a plain message with a retry action.
4. **Given** a person who may not promote, **Then** promote, close and restore are absent, not disabled
   with a hint that names the missing role.
5. **Given** a proposal that moved while the detail was open, **Then** the next action reports the stale
   state and the view refreshes.

---

### Edge Cases

- Two proposals with the same name: the second gets a distinct identifier and both display their names
  with their identifiers.
- A person whose working copy is on a contribution branch asks to work on another proposal: the
  existing switch rules apply (clean copy, expected branch and HEAD).
- A contribution branch exists but the proposal was closed: it stays; contributing is refused.
- The proposal's base is far behind the default branch: promotion is refused until synchronized; the
  check names how many published commits it lacks.
- A person leaves or is deactivated: their contributions stay; they can no longer contribute. Their
  contribution branches remain unseen by others.
- A project is removed from the workspace while a proposal declares it: the proposal shows the project
  as missing, cannot contribute to it and cannot be promoted until it is closed or the project returns.
- The repository has no published commit yet: proposals cannot be created (nothing to base on).
- Case-variant names of branches follow the workbench's existing case rules.
- A person without read access to any declared project: the proposal does not exist for them (hidden
  equals missing) in lists, details and errors.
- An import of an external Git change onto the default branch while proposals are open: proposals
  keep their base; promotion then needs synchronization.
- The proposal registry and the refs disagree after a crash or manual Git work: listing shows the
  proposal as damaged to people who may promote and hides it from others; nothing is deleted.
- Very large diffs: bounded as other diff views are; the view says that the rest is not shown.

## Requirements *(mandatory)*

### Functional Requirements

**Proposals and their scope**

- **FR-001**: A proposal MUST belong to exactly one repository, have a person-chosen name of 1 to 80
  characters and a unique identifier, and declare a non-empty set of projects of that repository that it
  may change. The declared set MUST NOT change after creation.
- **FR-002**: Creating a proposal MUST require that the creator may read every declared project and may
  create branches and edit in each of them. It MUST be refused when the repository has no published
  commit or when the repository already has the maximum number of open proposals.
- **FR-003**: A new proposal MUST start at the published tip of the repository's default branch at the
  moment of creation, never at a person's branch, and record that base.
- **FR-004**: A proposal MUST be in one status: open, promoted or closed. Only open proposals accept
  contributions, synchronization and promotion.
- **FR-005**: A person MUST see a proposal in lists, details and errors only if they may read at least
  one declared project. For anyone else the proposal MUST be indistinguishable from one that does not
  exist, in status, headers, body and timing class.
- **FR-006**: Proposal content MUST be readable only through proposal operations and only for files the
  reader may read, with the same file-level filtering as every other reading operation.

**Contribution branches**

- **FR-007**: Working on a proposal MUST give the person a private contribution branch that starts at
  the proposal tip, or reuses their existing contribution branch for that proposal, and switch their
  working copy to it under the existing branch-switch rules (clean copy, expected branch and HEAD).
- **FR-008**: A contribution branch MUST be visible only to its owner, under the same rule as personal
  branches. A person MUST be able to hold one contribution branch per proposal and use several proposals
  without mixing them.
- **FR-009**: The workbench MUST NOT contribute an arbitrary personal branch. Only the contribution
  branch of that proposal and person MAY move the proposal.
- **FR-010**: Synchronizing MUST merge the proposal tip into the person's contribution branch with the
  same guards as pulling the default branch. A conflict MUST leave the merge state on that branch for
  the person to resolve; the proposal MUST NOT change.
- **FR-011**: Pulling the default branch into a contribution branch MUST use the existing pull action
  with its existing guards.

**Contribution**

- **FR-012**: A contribution request MUST name the proposal and the proposal tip the person reviewed.
  It MUST be accepted only if the proposal tip still equals that value and the contribution branch tip
  descends from it (a fast-forward). Otherwise it MUST be refused as stale and nothing changes.
- **FR-013**: The compare-and-swap in FR-012 MUST be one atomic ref update serialized with every other
  operation on the repository, so two simultaneous contributions cannot both succeed.
- **FR-014**: Every file changed between the old and the new proposal tip MUST belong to a declared
  project. One undeclared or project-less path MUST refuse the whole contribution before the ref moves.
- **FR-015**: Every changed file MUST be authorized for the contributor as an edit of that file and
  MUST pass the content guards as the contributor's own change. One refusal MUST refuse the whole
  contribution.
- **FR-016**: A refusal MUST NOT reveal the name or content of a project or file the contributor may
  not read.
- **FR-017**: A contribution MUST NOT move the default branch, the published pointer, any personal
  branch or any other person's branch, and MUST NOT change the published snapshot.

**Promotion**

- **FR-018**: Promotion MUST require the person's current authority to publish on the default branch
  for every project that shares the repository, whether or not the proposal declares it. It MUST be
  refused before any other work when that authority is missing.
- **FR-019**: Promotion MUST require the proposal tip to descend from the current published tip, MUST
  read the whole candidate tree within the existing snapshot limits, MUST validate it as publication
  does, and MUST judge every changed file with authorization and content guards as the promoter's change.
- **FR-020**: Promotion MUST name the proposal tip the promoter reviewed and be refused as stale if
  the tip moved.
- **FR-021**: Promotion MUST move the default branch to the proposal tip with one compare-and-swap
  through the same publication path that records intent, updates the durable published pointer and
  refreshes every project of the repository together. Either every project moves or none does.
- **FR-022**: A promotion that is interrupted MUST be completed or dropped at the next start by the
  existing publication recovery, and the proposal MUST be marked promoted only when the default branch
  actually moved.
- **FR-023**: A **promotion check** MUST run the same authority, ancestry, validation and guard checks
  without moving anything and MUST return the same reasons promotion would.
- **FR-024**: After promotion the proposal MUST become promoted, MUST accept no further contribution,
  and its record MUST keep the promoter, time, previous published commit and new published commit.
- **FR-025**: Promotion MUST NOT push, contact a remote or change any person's working copy or draft.

**Closing, restoring and records**

- **FR-026**: Closing and restoring a proposal MUST require publication authority over every project
  sharing the repository (the same authority as promotion).
- **FR-027**: Closing MUST keep every commit reachable, MUST remove the proposal from open lists, and MUST
  keep a record of who closed it, when, its declared projects, its base and its last tip.
- **FR-028**: Restoring MUST reopen a closed proposal at its last tip, and MUST be refused with a reason
  when the name, limit or repository state no longer allows it.
- **FR-029**: No operation of this feature MUST permanently remove proposal history. Permanent erasure
  belongs to the later administration increment and its separate browser approval.
- **FR-030**: Every create, work, synchronize, contribute, check, promote, close and restore MUST write
  one audit record naming the proposal identifier, the declared projects, the commits involved and the
  outcome, and MUST NOT write file content or the proposal's free-text name beyond its identifier.

**Never leaving the workbench**

- **FR-031**: Proposal refs, closed-proposal refs and contribution branches MUST NOT be pushed by any
  workbench operation, MUST NOT be served by any export, agent endpoint, published snapshot, consumer
  API or derived view, and MUST NOT be reachable through the published ref.
- **FR-032**: Every workbench push or sync MUST refuse a branch that the workbench manages for work in
  progress (a personal branch, a contribution branch or a proposal), in both modes, with a message that
  says to publish first. Pushing the default branch and other branches keeps working as today.
- **FR-033**: Fetch, pull and sync MUST NOT create proposals from remote branches. A remote branch that
  has the name of a workbench-managed branch MUST be ignored for proposals and MUST NOT be shown as one.
- **FR-034**: The documentation and the interface MUST state that the guarantee is enforced by the
  application, and that a repository administrator with Git or filesystem access can copy proposal
  content.

**Recovery and concurrency**

- **FR-035**: The proposal record MUST be durable, written atomically, and MUST survive restarts. The
  proposal tip MUST be read from the ref, never copied into the record, so the two cannot drift.
- **FR-036**: At start, a proposal whose ref is missing or whose record is unreadable MUST be reported as
  damaged to people who may promote and hidden from everyone else. Nothing MUST be deleted or rewritten.
- **FR-037**: All proposal operations MUST be serialized per repository with the existing repository
  queue and MUST carry the expected branch, HEAD and tip so that no operation includes another person's
  staged or draft work.
- **FR-038**: A proposal MUST NOT move another person's working copy, index, branch or drafts.

**Interface**

- **FR-039**: The interface MUST list proposals for a project, show a proposal's status, declared
  projects, contributors, last movement, changed files per project and text differences, offer the
  promotion check, and offer only the actions the person's authority allows.
- **FR-040**: Every proposal view MUST have empty, loading, error and long-text states, work at phone
  width and in light and dark themes with the existing visual design, and MUST NOT clip, cut or
  ellipsize text.
- **FR-041**: Proposal changes MUST reach other open browsers through the existing live events, filtered
  by what each person may read.

**Authorization, inventory and gates**

- **FR-042**: Every new operation MUST go through the operation boundary, MUST have an entry in the
  operation inventory with its handler checks, limits and effects, a row in the access-matrix, and a
  parity case. No new permission is added to the policy model.
- **FR-043**: Proposal operations MUST NOT be offered to agents in this release. Their inventory
  exposure names the later increment that may add them.
- **FR-044**: Existing browsers, scripts and agent clients MUST see no change in any existing route's
  behaviour except FR-032.
- **FR-045**: The change MUST add targeted mutants for the decisions of FR-012, FR-014, FR-015, FR-018,
  FR-019, FR-021, FR-031 and FR-032, and tests for restart recovery and concurrent operations.
- **FR-046**: README, ARCHITECTURE, the server-mode and user guides, the configuration guide and the
  operation reference MUST describe proposals, their limits and the push change in the same change.

### Key Entities

- **Proposal**: a named shared line of work in one repository. Has an identifier, a name, the declared
  project set, a status, a base commit, a creator and a creation time, and, once finished, a record of
  its outcome. Its tip is the commit its ref points to.
- **Declared project set**: the projects of the repository whose files the proposal may change.
- **Contribution branch**: a person's private branch for one proposal, started at the proposal tip.
- **Proposal tip**: the commit the proposal currently points to; the value every contribution and
  promotion names.
- **Promotion check**: a read-only report of what promotion would do and what would stop it.
- **Outcome record**: promoter or closer, time, and the commits before and after, kept as the tombstone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With open proposals present, an export, an agent context and plan, a snapshot read and every
  remote action never contain a byte unique to a proposal, in a test over every exposed reading
  operation of the operation inventory.
- **SC-002**: In a race of N contributions to one proposal from the same tip (N at least 8), exactly one
  succeeds and the others are refused as stale, in 200 randomized runs.
- **SC-003**: Promotion with authority over only some of the projects of a shared repository never moves
  the default branch; promotion with full authority moves every project's published snapshot together,
  in a test with at least three projects in one repository.
- **SC-004**: A contribution containing one undeclared path never moves the proposal, for each case in
  FR-014 including a rename across the boundary.
- **SC-005**: Interrupting promotion at each step (intent, ref, pointer) and restarting leaves the proposal
  promoted if and only if the default branch moved.
- **SC-006**: A person who cannot read a declared project gets identical caller-visible answers for that
  proposal and for a nonexistent one, in every operation.
- **SC-007**: Every mutant of FR-045 is detected by the mutation suite.
- **SC-008**: The two-editor browser check completes a create, contribute, synchronize, contribute and
  promote journey; the proposal views pass geometry checks and screenshot review at desktop and phone
  width in both themes.
- **SC-009**: The documentation names every limit in this specification and no claim in it exceeds a
  tested behaviour.

## Assumptions

- **Server mode only.** Local mode has one person and one working tree, so a shared proposal has no
  meaning there. Local mode shows no proposal views and exposes no proposal operation. The push rule in
  FR-032 applies in both modes.
- **Item-level comparison is separate.** The review shows changed files and the existing text diff.
  The item diff, graph overlay and publication review are a separate increment that will read proposal
  tips through the same read operation.
- **Defaults** (assumed here, changeable without changing a requirement): at most 50 open proposals per
  repository; a name of at most 80 characters; no automatic expiry of proposals.
- **Repository shapes.** A repository with one project and a repository shared by several departments'
  projects both work; promotion authority always covers every project in the repository.
- **Existing publication** is reused: the repository queue, the compare-and-swap, the durable intent and
  pointer, the candidate validation and the content guards.
- **Agents.** An agent edits the person's own working copy as before. If the copy is on a contribution
  branch, the agent's commits land there; contributing and promoting remain browser actions.

## Decisions made while specifying

Each entry names the choice, the reason and the decision it follows. None reopens a recorded decision.

1. **No new permission.** Creating a proposal uses branch creation, contributing uses commit on the
   proposal's branch, and promoting, closing and restoring use publication authority. Reason: E9 says
   Editors contribute and Stewards or Admins promote or delete, and the roles already say that; a new
   permission would change the policy model, the role matrix and every custom role. Follows E9.
2. **Declared set fixed at creation.** To change it, close the proposal and create another. Reason: the
   most conservative reading of E8, since widening the set changes what a contribution may do after
   people reviewed it.
3. **Closing needs the promotion authority.** E9 lets only Stewards or Admins with the required
   repository-wide authority delete. The author of a proposal therefore cannot close their own unless
   they hold that authority. Reason: literal reading of E9 and E8.
4. **Closing is a move to a hidden ref, not a deletion.** The ref leaves the branch namespace and is
   kept with a record. Reason: E9 says deletion is recoverable and permanent erasure follows M6.
5. **Both modes refuse to push work-in-progress branches.** Reason: E7 says the workbench must not push
   personal or shared proposal branches, so a rule that held only for proposals would leave the
   personal-branch leak the reviews found. Other branches, and the default branch, push as before.
6. **Proposals are browser operations for now.** Agents cannot create, contribute or promote. Reason:
   M19 and E5 keep agent authority narrow, and the later workspace operations increment of the MCP
   server lists branch operations separately.
7. **Contribution is judged as the contributor's own change; promotion as the promoter's.** Reason: the
   existing publication path judges what moves the default branch as the mover's change, so approval
   reaches the default branch only through someone who may make it; contribution needs the same
   principle at the proposal.
8. **Hidden equals missing for proposals.** Names are free text and could reveal confidential plans.
   Reason: the constitution's rule that the server never discloses a resource the person may not read.
9. **No automatic merge at promotion.** If the default branch moved, the proposal must be synchronized
   first through a contribution branch. Reason: E9 puts conflict resolution on the contributor's branch;
   a merge made by the promoter would be an unreviewed commit.
10. **Remote branches never become proposals.** Reason: E7 treats a remote as a surface outside the
    workbench; adopting a branch from it would invert the guarantee.
11. **Contribution branch names use a separator that Git allows.** A personal branch is named
    `work/<handle>`, and Git cannot hold `work/<handle>/<proposal>` beside it. The plan chooses the
    name; the specification only requires that a contribution branch is private (FR-008).
12. **Defaults of 50 open proposals and 80 characters** are assumed and listed above.

### Gaps and contradictions found in the decisions file

- **E7 against current behaviour.** The documentation and the code let a person push their personal
  branch, and the reviews noted it. E7 forbids it, but neither E4, M18 nor R1 lists this as a change to
  existing behaviour. FR-032 makes it explicit and the release notes must state it. "Approved release
  refs", the other thing E7 allows pushing, is not defined until the release feature (A9); until then
  only the default branch and non-managed branches push.
- **E9 and the review's branch name.** The review suggests `work/<handle>/<proposal>`, which Git cannot
  store next to `work/<handle>`. E9 gives no name, so there is no contradiction in the decisions
  themselves; the name is a plan choice (Decision 11).
- **E9 deletion by Stewards or Admins** leaves no way for a proposal's author to withdraw it. Kept as
  written (Decision 3).
- **R1 orders item diff before proposals**, but item diff is not on this base. The review view is
  file-level until it arrives (Assumptions).
- **E9 mentions "recovery"** as part of the lifecycle without defining it. This specification defines
  recovery as restart reconciliation (FR-022, FR-036) and restore of a closed proposal (FR-028).

## Dependencies

- **Feature 006 (MCP server)**: none. Proposal operations are not tools. Feature 006's edits to the
  Git routes and source-control service touch the same files; the plan lists them.
- **Tessera format types**: none. Proposals carry files, not formats.
- **Features 008, 009 and 010 (on this base)**: the published snapshot, the item addresses and the
  operation boundary are used as they are.
- **Feature 013 (person sign-in)**: none.
- **Feature 014 (usage counters)**: none. Proposal content is never an agent request, so it is never
  counted.
- **Feature 015 (agent panel)**: an agent working through the panel edits the person's current branch,
  which may be a contribution branch; it cannot contribute or promote.

## Out of Scope

- Item-level diff, graph overlay of a proposal and the publication review of item changes.
- Pushing, hosting or reviewing proposals on an external Git host (E7).
- Cross-repository proposals and atomic promotion across repositories (E8).
- Permanent erasure of proposal history (M6, administration increment).
- Offering proposal operations to agents or MCP tools.
- Selected-item publication and conflict display at item level (R1 row 12).
- Comments, approvals and review assignments on proposals.
- Local-mode proposals.

## Traceability

| Decision or finding | Requirements | Stories |
| --- | --- | --- |
| E7 (proposals never leave the workbench) | FR-031 to FR-034, SC-001 | 3 |
| E8 (scope, repository-wide atomic promotion) | FR-001, FR-014, FR-018 to FR-021, SC-003, SC-004 | 4, 5 |
| E9 (roles, private branch per proposal, CAS, recoverable deletion) | FR-007 to FR-013, FR-026 to FR-030 | 1, 2, 6 |
| Owner requirement: shared proposal branches | FR-001 to FR-006, FR-039 to FR-041 | 1, 7 |
| Fable review M4 and Astra finding 6 (lifecycle, personal branch cannot carry unrelated work) | FR-007 to FR-011, FR-037, FR-038 | 2 |
| Constitution Principle I (hidden equals missing, published is immutable) | FR-005, FR-006, FR-016, FR-017 | 3, 5 |
| R2 (mutation, recovery and concurrency gates) | FR-022, FR-035 to FR-037, FR-045, SC-002, SC-005, SC-007 | 4 |
| Constitution Principle VI (inventory, matrix, parity) | FR-042 to FR-044 | all |
