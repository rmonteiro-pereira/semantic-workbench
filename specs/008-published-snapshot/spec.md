# Feature Specification: Published Snapshot

**Feature Branch**: `008-published-snapshot`

**Created**: 2026-11-16

**Status**: Draft

**Input**: Give "published" an explicit, enforceable meaning in both modes and one resolver that
every consumer of production definitions uses, independent of the editing Reader. The governing
decisions are E4 (published is an immutable default-branch snapshot in both modes), E5 (agents plan
only from the published snapshot, including a person's own agent), E11 (provider publication must
not change a consumer underneath it), the "Published only" blockers of both Ossie reviews, and the
MCP decisions that consumer reads use the published snapshot (M7, M16, M17, M18).

## Summary

Today "published" is a side effect of where files happen to be. In server mode a person who may edit
reads their own working copy, and so does their agent: `agentDocuments` reads
`ws.documentsFor(requestReader(request))` (`src/server/handler.ts:203-207`), `documentsFor` reads
`copies.readPlace(reader, slug)` (`src/server/projects/workspace.ts:224-227`), and `readPlace`
returns the person's copy when they have one (`src/server/projects/working-copies.ts:124-126` and
`:231-235`). In local mode there is no published checkout at all: `LOCAL_READER` has no copy
(`src/server/projects/reader.ts:22`), so every read, agent reads included, sees the checked-out
branch with its uncommitted and untracked files. Only application (bearer) agents are limited to
the published checkout, and only by accident.

This feature defines a **published snapshot** as the commit a recorded **published pointer** names
on each repository's default branch, read from immutable Git objects. A new **published-snapshot
resolver** reads that commit for every consumer of production definitions. The editing view stays
exactly as it is for the person's own editor. Agent routes move to the snapshot in both modes. Local
mode gains an authoring branch and an explicit Publish step. The default branch can no longer be
moved by anything except an authorized, checked publication, or an explicit adoption of an outside
Git change.

The resolver, its pin, its provenance rules and its access filtering are the contract that the MCP
read tools (006), the extended-format compiler (working name in the glossary) and the mesh later
consume. Those consumers are out of scope here.

## Clarifications

### Session 2026-11-16

These questions came up while writing the spec. Each was answered from the decisions document and the
code, the way the owner's decisions would answer it.

- Q: Does the browser's Mappings view (catalog, context, plan preview) also move to the snapshot? →
  A: No. The decisions allow browser-only author previews (E5: "Browser-only author previews ...
  remain possible inside the workbench"). The browser keeps the editing view through dedicated
  preview routes that refuse non-browser credentials, and the view says it is a preview. The
  `/api/agent/*` routes always read the snapshot.
- Q: In local mode, what happens to commits already on the default branch when this ships? → A: The
  existing tip of the default branch becomes the first snapshot, and the person is told once.
  Nothing committed is lost or hidden. Uncommitted and untracked files, and commits on any other
  branch, stay unpublished. This is the smallest reading of E4 that does not strand existing local
  users.
- Q: What does "validation" mean before an outside Git change is served (E4 cost)? → A: Three
  checks: the move is a fast-forward of the recorded snapshot, every definition file of every
  registered project at the new commit is readable and within the existing size limit, and, in
  server mode, the same content-guard judgement a publication gets. Invalid documents are not a
  blocker, because Principle III already shows files that arrive by Git as invalid. Set-level
  validity belongs to E10 and plugs into the same check list later.
- Q: Who adopts an outside move of the default branch? → A: A caller who holds the publication
  right on the repository, through the existing publish authorization (server mode), or the local
  person by explicit action (local mode). Adoption is never automatic, because "agents never plan
  with unpublished definitions" has to hold even when someone commits to the default branch from a
  terminal.
- Q: What if the default branch moved outside the workbench and is not a fast-forward (a force
  push, a reset)? → A: Never adopted by this feature. The last recorded snapshot keeps being served,
  and the state is reported with the fix: make the branch a descendant of the recorded commit. A
  pointer-reset operation is not specified here; the workbench does not rewrite published history
  (E27).
- Q: What identifies a snapshot to a consumer? → A: The repository's default branch name and the
  full commit id. The commit id is the snapshot version that later cursors, resources and compiler
  provenance bind to (M16). Abbreviated ids are never accepted.
- Q: Which historical inputs may a consumer name? → A: A full commit id in published history, or a
  tag that resolves to one (E11, Astra B3). Published history means the recorded snapshot commit and
  its ancestors. This feature defines and tests the check; it does not create release tags (A9
  does).
- Q: Do people's own history reads need the same rule? → A: Yes, in a narrower form. Today
  `scm.show` and `scm.versions` accept any commit id (`src/server/projects/scm.ts:297-303`), and
  personal branches share one object store in server mode. A commit is readable only when it is
  reachable from the person's current head or from published history; anything else answers as a
  missing commit.
- Q: Does the existing zip export move to the snapshot? → A: No, its default stays the person's
  files, drafts included, because Principle II requires recoverable exports. A `source=published`
  option returns the snapshot, which is the shape the later standard release export takes (E16:
  never branch-only WIP).
- Q: What does an agent get for a project with no snapshot (no Git, no commit on the default
  branch, missing objects)? → A: A distinct "no published snapshot" answer to callers who can read
  the project, and the same answer as an unknown project for everyone else. No fallback to files.
- Q: How is a browser told apart from an agent for routes both can call? → A: By credential.
  A signed-in session cookie is the browser; application bearer tokens, and the connection tokens
  006 adds, are agents. In local mode there is no credential, so a request counts as the browser
  only when it carries the local frontend's origin. That is a guardrail against accidental
  unpublished planning, not a security boundary against a deliberate local script, and the docs say
  so.
- Q: After an interrupted publication, does the ref or the pointer decide what is served? → A: The
  pointer decides, and it records the intended commit before the ref moves. At the next start, an
  intent that equals the ref is completed, an intent the ref never reached is dropped, and a ref
  that differs from both is an outside move. A stop therefore never serves a commit nobody
  published and never loses a completed publication.
- Q: What bounds a snapshot build? → A: The existing 2,000,000-byte document limit, a 64,000,000
  byte aggregate (the ceiling export and import already use), 10,000 files per project and the
  30-second Git command timeout that exists today. The file count is a default chosen in this spec
  because no per-project count limit exists yet; the aggregate and time limits are existing values.
  Exceeding a limit gives the "no published snapshot" answer, never a partial one.
- Q: How long is a superseded snapshot kept? → A: While a pin or retained read holds it, plus the
  previous one so a request that began just before a publication can finish. Everything else is
  dropped, and Git still holds the objects for an on-demand rebuild.
- Q: Does the response tell the agent which commit it read? → A: Yes, in a response header, so
  existing clients that parse the body see no change (M7: existing grants keep their exact meaning).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent plans only from published definitions (Priority: P1)

A Steward edits a metric in their working copy and asks their own agent for a plan. The agent
answers from what was published, not from the Steward's unpublished edit. An application agent gets
the same answer for the same published state. After the Steward publishes, both see the new metric.

**Why this priority**: This is the owner's fixed rule (E5) and the Fable and Astra blockers. Every
later consumer depends on it.

**Independent Test**: In server mode, give a person an unpublished edit that adds a metric and
changes another. Call the four agent routes as that person and as an application. Compare. Publish
and compare again.

**Acceptance Scenarios**:

1. **Given** a signed-in editor with an unpublished edit to a mapping, **When** they call the agent
   catalog, context and plan routes, **Then** the responses are byte-identical to an application's
   responses for the same project, and none of them contains the unpublished text.
2. **Given** the same editor, **When** they publish, **Then** the next agent call reflects the
   published commit and carries its id in the snapshot header.
3. **Given** a mapping that exists only in the editor's unpublished work, **When** the agent asks
   for its context, **Then** the answer is the one for an unknown mapping.
4. **Given** local mode with an uncommitted edit and an untracked new file, **When** an agent asks
   for the catalog, **Then** neither appears.

---

### User Story 2 - Local mode has a published snapshot and an explicit Publish step (Priority: P1)

A person using the workbench on their laptop edits and commits as before. Commits go to an
authoring branch, so the default branch only moves when they press Publish. Source Control says
which commit is published and whether their authoring branch is ahead. After the upgrade, what was
already committed on the default branch is the first snapshot.

**Why this priority**: Without it, "agents never plan with unpublished definitions" cannot hold in
local mode, and the first MCP release is local mode (M18).

**Independent Test**: Upgrade a fixture repository that has commits on `main`, uncommitted edits
and a feature branch. Check the first snapshot, commit an edit, check that agents do not see it,
publish, check that they do.

**Acceptance Scenarios**:

1. **Given** local mode on the default branch with an uncommitted edit, **When** the person commits,
   **Then** the checkout moves to the authoring branch carrying the edit, the commit lands there,
   the default branch does not move, and the person is told which branch they are on.
2. **Given** an authoring branch that is a descendant of the default branch, **When** the person
   publishes, **Then** the default branch fast-forwards to the authoring head, the snapshot
   changes to that commit and the working files do not change.
3. **Given** a default branch that moved on (a pull, a terminal commit) so the authoring branch no
   longer descends from it, **When** the person publishes, **Then** the workbench refuses, names the
   fix (merge the default branch into the authoring branch first) and changes nothing.
4. **Given** a repository whose default branch has no commit, **When** the person publishes after
   committing on the authoring branch, **Then** the default branch is created at that commit and
   becomes the first snapshot.
5. **Given** a project without Git, **When** an agent asks for it, **Then** it receives the "no
   published snapshot" answer and the editor still works.

---

### User Story 3 - A consumer is never changed underneath its own request (Priority: P1)

An agent asks for a context and then a plan while someone publishes. Every answer, and every
document inside one answer, comes from one commit. A later feature that holds a cursor or a
dependency pin can ask for the exact commit again, as long as it is in published history, and gets
either that commit or a clear "no longer available", never a mix.

**Why this priority**: E11 and M16 require reproducible reads. The pin is the unit that 006 and the
compiler build on.

**Independent Test**: Run many interleaved agent calls and publications and assert that each
response's documents all come from the commit in its header.

**Acceptance Scenarios**:

1. **Given** a request that reads several projects of one repository, **When** a publication lands
   mid-request, **Then** every project is read at the commit pinned at the start.
2. **Given** a caller that names a full commit id inside published history, **When** it reads, **Then**
   it gets that commit's files through the same access filtering.
3. **Given** a commit id that exists in the object store but only on someone's personal or proposal
   branch, or an abbreviated id, or a tag that resolves outside published history, **When** a
   consumer names it, **Then** the answer is identical to the answer for an id that does not exist.
4. **Given** a snapshot the server has already dropped from memory, **When** a consumer asks for
   that commit, **Then** it is rebuilt from Git on demand, or refused if its objects are gone; it is
   never answered from a different commit.

---

### User Story 4 - The author's preview stays in the workbench (Priority: P2)

A person looks at a plan for the mapping they are editing, in the Mappings view, before publishing.
They see their working files, the view says it is a preview of unpublished work, and the same plan
is not available to any agent credential.

**Why this priority**: E5 keeps browser previews. Moving the Mappings view with the agents would
silently remove a feature people use.

**Independent Test**: Sign in as an editor, open the Mappings view with an unpublished edit, see the
edit reflected and the preview label. Call the preview routes with an application token and a
local request without the browser origin and see them refused.

**Acceptance Scenarios**:

1. **Given** a signed-in editor with an unpublished edit, **When** the Mappings view requests its
   catalog, context and plan, **Then** the answers include the edit and the view shows the preview
   label with the published commit it differs from.
2. **Given** an application bearer token, **When** it calls a preview route, **Then** it is refused
   as an unknown route would be refused for that credential.
3. **Given** the metrics list and metric explanation routes, **When** the browser calls them,
   **Then** they answer from the editing view as today; **When** any non-browser credential reaches
   them, **Then** they answer from the snapshot.

---

### User Story 5 - Outside Git changes need adoption before they are served (Priority: P2)

An operator, or a person with a terminal, commits to the default branch directly. Agents keep
getting the last published snapshot. Source Control shows the pending move, a person who may publish
adopts it after the checks pass, and from then on agents see it.

**Why this priority**: E4 says external changes require snapshot validation before serving. Without
this a terminal commit publishes silently.

**Independent Test**: Advance the default branch of a fixture repository with plain Git, then with a
non-fast-forward reset, and verify what is served and what is reported.

**Acceptance Scenarios**:

1. **Given** the default branch fast-forwarded by plain Git, **When** an agent reads, **Then** it
   still gets the recorded snapshot and the status reports a pending move with its commit count.
2. **Given** that pending move and a caller with the publication right, **When** they adopt it and
   the checks pass, **Then** the pointer moves, the `published` event is sent and an audit record
   names the previous and new commits.
3. **Given** a caller without the publication right, **When** they try to adopt, **Then** the
   refusal is the same as for a refused publish.
4. **Given** a non-fast-forward move, **When** anyone tries to adopt, **Then** it is refused and
   the recorded snapshot keeps being served.
5. **Given** a stop between moving the default branch and recording the pointer, **When** the server
   starts again, **Then** a workbench publication is completed or rolled back, and an outside move
   is reported as pending, never served.

---

### User Story 6 - History reads cannot reach other people's unpublished commits (Priority: P2)

A person asks the history view for a file at a commit id they were given. If the commit is not in
their own branch's history or in published history, the answer is the same as for a commit that does
not exist.

**Why this priority**: Personal branches share one object store in server mode, so any known commit
id would otherwise be readable (Astra B3, Principle IV).

**Independent Test**: Two editors with different personal branches; one asks for the other's commit
id through show and versions.

**Acceptance Scenarios**:

1. **Given** editor B's unpublished commit, **When** editor A asks for a file at that id, **Then**
   the response is identical to one for an unknown id.
2. **Given** a commit in published history, **When** any reader of the file asks, **Then** it is
   served as today.

---

### User Story 7 - A person downloads exactly what is published (Priority: P3)

A person exports a project and chooses "published" to get the snapshot's files, without drafts or
working changes. The default export is unchanged.

**Why this priority**: It gives the later standard release export its source, and shows the
resolver working for bytes, not only parsed documents.

**Independent Test**: Export both ways for a project with an unpublished edit and compare file
contents with the snapshot and with the working files.

**Acceptance Scenarios**:

1. **Given** an unpublished edit, **When** the person exports with `source=published`, **Then** the
   zip holds the snapshot's bytes for every file they may read and no draft.
2. **Given** no `source` parameter, **When** the person exports, **Then** the zip is what it is today.

---

### Edge Cases

- A repository hosts several projects. The snapshot is per repository, so all of its projects share
  one commit; a project registered after the commit has no files in it and reports an empty
  snapshot rather than reading files from the working tree.
- A project's folder moves, or a project is removed from the registry, between two pins. The older
  pin keeps the folder it was taken with; the next pin uses the new one.
- Sparse checkouts omit folders that the snapshot still holds in its tree; the snapshot reads from
  objects, so unregistered folders are simply not read.
- A tracked file that an ignore pattern now matches is still in the snapshot, as it is in Git.
- A case-variant path pair in the tree is refused for that project like a scan refuses it today.
- A partial clone is missing a blob. The project answers "no published snapshot" for that commit;
  no partial answer is returned.
- The default branch name changes (a remote renames it). The recorded name is kept until an
  adoption with the new name passes; the snapshot stays at its commit meanwhile.
- A detached HEAD in local mode: the person can read and edit; committing asks them to pick or create
  an authoring branch. The snapshot is unaffected.
- A person may edit but not publish. Their agent still reads the snapshot; they cannot adopt.
- The recorded pointer file is missing or damaged. It is rebuilt only by the first-start rule
  (server: the default branch tip of a clean base; local: the tip of the default branch with the
  notice), never from a working tree.
- A request arrives while the first snapshot of a repository is being built. It waits for the same
  build, bounded in time, and fails closed on timeout.
- A mapping is deleted by a publication while a consumer holds the old commit. The old commit answers
  as before while it is retained; a new pin does not see the mapping.
- Two people publish at once. The existing compare-and-swap lets one succeed; the other is refused
  as today, and the pointer follows the successful one only.
- Local mode on a repository with a remote whose default branch is ahead: Source Control reports it;
  the person pulls into the authoring branch and publishes. Nothing fetches in the background.

## Requirements *(mandatory)*

### Functional Requirements

#### The snapshot contract

- **FR-001**: A published snapshot MUST be identified by the repository, the default branch name and
  the full commit id the repository's published pointer names. The commit id is the version of
  everything served from that snapshot. Abbreviated ids MUST never be accepted or returned.
- **FR-002**: Snapshot content MUST be read only from Git objects of that commit. Working-tree files,
  the index, untracked files, drafts, personal branches, proposal branches and the checked-out
  branch MUST NOT contribute a byte.
- **FR-003**: A project's snapshot files MUST be the tracked files under the project's folder in the
  commit's tree, using the same project-folder mapping as the registry, the same supported-format
  rules and the same 2,000,000-byte document limit as indexing today. A case-variant pair is
  refused as the scan refuses it.
- **FR-004**: Each repository MUST have one durable published pointer recording the default branch
  name and the commit currently served. It MUST survive restart and be written atomically with the
  application state files.
- **FR-005**: The pointer MUST move only by (a) a publication, (b) the remote-follow publication that
  already uses the publication path, or (c) the adoption of an outside move (FR-016). Every move
  MUST require the publication authorization that exists today and the publication checks of FR-017,
  MUST be recorded in the audit log with the previous and new commit, and MUST send the existing
  `published` event.
- **FR-006**: A repository with no commit on its default branch, a project without Git, a missing
  default branch name, or missing objects has no snapshot. Consumers MUST receive a distinct "no
  published snapshot" answer, and MUST NOT fall back to working files. The answer MUST be given only
  to callers who can read the project (FR-023).

#### Publication in server and local mode

- **FR-007**: In server mode, the pointer MUST move inside the same operation that moves the default
  branch, with an intent recorded before the branch moves, so that a stop at any point is completed
  or rolled back at the next start and the pointer never names a commit outside default-branch
  history.
- **FR-008**: In server mode, the first start after the upgrade MUST record each repository's
  default-branch tip as the pointer when the base checkout is clean, which is the state it already
  holds. No reader sees a change from this step.
- **FR-009**: In local mode the default branch MUST be determined by the same rule as in server mode
  (the recorded name, then the remote's default, then the branch checked out when first adopted),
  and the name MUST be recorded the first time it is determined.
- **FR-010**: In local mode, a commit made while the default branch is checked out MUST first move
  the checkout to an authoring branch, carrying staged and unstaged changes, and then commit there.
  A person already on any other branch commits on it as today. A detached HEAD MUST ask for a branch.
- **FR-011**: Local mode MUST offer Publish: it fast-forwards the default branch to the authoring
  branch head by compare-and-swap, without changing the working files, through the same
  authorization and checks as server mode (the local principal is allowed by the boundary as it is
  today). It MUST be refused, with the fix named, when the authoring head does not descend from the
  default branch, when there is nothing new, or when changes are uncommitted and nothing is
  committed on the authoring branch.
- **FR-012**: When the default branch has no commit, publishing MUST create it at the authoring head
  and make that the first snapshot.
- **FR-013**: In local mode, the first start after the upgrade MUST record the default branch's
  existing tip as the first snapshot, and the person MUST see one notice that explains what changed
  and where their uncommitted work is.
- **FR-014**: Source Control MUST show the published branch and short commit, whether the person's
  branch is ahead of or behind it, and, in local mode, the Publish action. It MUST show the pending
  outside move of FR-015 when there is one.

#### Outside changes to the default branch

- **FR-015**: When the default branch ref differs from the recorded pointer and the workbench did not
  make the move, the resolver MUST keep serving the recorded snapshot, and the status MUST report a
  pending move with its new commit, the number of commits and whether it is a fast-forward.
- **FR-016**: A pending fast-forward move MUST be adoptable by a caller who holds the publication
  right (server mode) or by the local person's explicit action (local mode), and only after the
  checks of FR-017. A pending move that is not a fast-forward MUST NOT be adoptable by this
  feature; the status names the fix.
- **FR-017**: The publication checks MUST be an ordered list with these members: the move is a
  fast-forward of the recorded commit (or the first commit); every definition file of every
  registered project at the new commit is readable and within the document limit; and, in server
  mode, the content guards accept the change as they judge a publication today. Later features add
  members (set validity, dependency manifests) without changing callers. A refused check MUST name
  its reason and leave the pointer unchanged.

#### The resolver

- **FR-018**: There MUST be one published-snapshot resolver, independent of the editing Reader and of
  working copies, that returns a snapshot's documents, file bytes and facts for a pin. Its
  documents MUST have the same shape as the editing view's, so the planner, the context builder and
  the explainers are unchanged.
- **FR-019**: A **pin** MUST be taken once at the start of a request or operation and name one commit
  per repository. Every read in that request MUST use the pin, so a publication that lands
  meanwhile cannot mix commits. A pin over all repositories MUST be consistent as of one instant.
- **FR-020**: A holder of a commit id MAY ask the resolver to read that exact commit again if it is
  in published history. The resolver MUST rebuild it from Git on demand within bounds, or answer
  "no longer available". It MUST NOT answer from a different commit.
- **FR-021**: Responses of the agent routes MUST carry the snapshot's commit id in a response header.
  Bodies of existing responses MUST NOT change shape.

#### Access filtering

- **FR-022**: Access filtering MUST be applied on top of the snapshot, per request, with the same
  rules as today: project readable, path readable, documents the caller cannot read are absent. The
  snapshot index and any cache of it MUST NOT contain or depend on a caller's permissions.
- **FR-023**: A project the caller cannot read, an unknown project and a project that has no snapshot
  but is unreadable MUST answer identically, including status and body. Only a caller who can read
  the project learns that it has no snapshot.
- **FR-024**: A file's bytes are served whole or not at all; the snapshot never redacts a document.

#### Which consumers move and which stay

- **FR-025**: The agent routes (`/api/agent/catalog`, `/api/agent/context`, `/api/agent/plan`) MUST
  read the snapshot for every principal kind, in both modes. A mapping that exists only in
  unpublished work MUST answer as an unknown mapping. `/api/agent/projects` MUST keep listing the
  projects the caller may read.
- **FR-026**: Every route that can return a context, a plan or a metric explanation MUST declare its
  read source in the route inventory: `published`, `editing`, or `by-surface`. A `by-surface` route
  MUST read the editing view for the browser and the snapshot for every other credential. A test
  MUST fail when a route in the inventory has no declared source, or when a route declared
  `published` resolves the editing view.
- **FR-027**: The editing view MUST stay in place for the person's own editor, the graph and
  overview, the history and diff views, the Source Control panel, suggestions, KPI-save planning,
  delete-impact analysis, drafts and the default zip export.
- **FR-028**: The browser's catalog, context and plan preview MUST move to dedicated preview routes
  that read the editing view and accept only a browser credential. The Mappings view MUST label its
  results as a preview from working files and show the published commit it can be compared with.
- **FR-029**: The metrics list and metric explanation routes MUST be `by-surface`.
- **FR-030**: The browser credential MUST be a signed-in session in server mode. In local mode,
  where there is no credential, a request is the browser only when it carries the local frontend's
  origin; a request without it MUST be treated as an agent. The documentation MUST describe this as
  a guardrail and not as a security boundary.
- **FR-031**: Authoring operations available to agents MAY read and edit authorized work in
  progress and return validation findings, and MUST NOT return an unpublished plan, context or
  explanation (E5). This is the contract that the MCP adapter implements; the HTTP routes of this
  feature already comply.

#### Provenance of historical inputs

- **FR-032**: The resolver MUST accept a historical revision from a consumer only when it is a full
  commit id in published history, or a tag whose peeled commit is in published history. Everything
  else, including branch names, abbreviated ids, ids only on personal or proposal branches and
  non-commit objects, MUST answer exactly as an unknown revision.
- **FR-033**: A person's history reads (`show`, `versions`) MUST accept a commit only when it is
  reachable from the person's current head or from published history; otherwise they MUST answer as
  a missing commit. History listing and diff behaviour is unchanged.

#### Caching and invalidation

- **FR-034**: A snapshot's index MUST be keyed by repository, commit and the project folders it was
  built with, and MUST be immutable. It MUST be superseded by a pointer move, never edited, and MUST
  NOT be invalidated by edits, drafts, working-copy activity, access changes or authentication.
- **FR-035**: The resolver MUST retain the current snapshot, the previous one and any snapshot held
  by an in-flight pin or retained read, and MUST drop the rest. Memory MUST be bounded by that
  rule and by the per-snapshot limits of FR-036.
- **FR-036**: Building a snapshot MUST be bounded by the 2,000,000-byte document limit, a
  64,000,000-byte aggregate, 10,000 files per project and the 30-second Git timeout, and MUST fail
  closed with "no published snapshot" when any is exceeded. Concurrent first requests for one
  snapshot MUST share one build.
- **FR-037**: Parse results MUST reuse the content-hash cache already shared between copies, so a
  file that is identical in the snapshot and in a working copy is parsed once. A change to the
  cache version MUST rebuild snapshots lazily after restart.
- **FR-038**: Registry changes (project added, removed or moved) MUST take effect for the next pin
  without a restart.

#### Export

- **FR-039**: The zip export MUST accept `source=published`, which returns the snapshot's bytes for
  the files the caller may read, with no drafts. It MUST refuse `history=1` together with it. The
  default source MUST stay the editing view with unchanged output.

#### Observability and operations

- **FR-040**: Agent reads MUST log the snapshot commit with the existing structured request log. The
  log MUST NOT contain document content, paths or project names beyond what it holds today.
- **FR-041**: A publication, an adoption and a refused adoption MUST each leave one audit record with
  actor, previous commit, new commit and, for a refusal, the reason.
- **FR-042**: The `published` event MUST be sent in local mode as well, so the browser refreshes its
  published indicators.

#### Documentation

- **FR-043**: README, ARCHITECTURE.md, `docs/server-mode.md`, `docs/agent-runtime.md`,
  `docs/user-guide.md`, `docs/configuration.md` where relevant, and CHANGELOG MUST describe the
  contract, the migration and every user-visible change in this feature, and MUST state what is not
  covered (set validity, dependency manifests, release tags, non-fast-forward adoption).

### Key Entities

- **Published pointer**: per repository, the default branch name, the commit currently served and,
  while a publication is running, the commit it intends to serve.
- **Published snapshot**: the contents of every registered project of a repository at the pointer's
  commit; immutable.
- **Pin**: the commit chosen per repository for the duration of one request or operation.
- **Read source**: `editing` (the Reader's view, as today) or `published` (the resolver).
- **Surface**: how a request authenticated: `browser` or `agent`.
- **Published history**: the pointer commit and its ancestors on the default branch.
- **Pending move**: a default-branch tip that differs from the pointer and that the workbench did not
  make, with its fast-forward status and commit count.
- **Authoring branch**: the branch a local person commits on while the default branch stays
  untouched.
- **Publication check**: one member of the ordered list that every pointer move must pass.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a person who has unpublished edits, the four agent routes answer byte-identically
  to an application's answers in 100% of the cases of a test that covers three roles, both modes and
  every route, and no response contains any byte that exists only in unpublished work.
- **SC-002**: Every route in the route inventory has a declared read source, and a test fails when
  one is missing or when a `published` route resolves the editing view. The targeted mutants that
  force the editing view into the resolver, ignore the pin, skip a publication check or skip the
  history provenance check are all detected.
- **SC-003**: In a test with at least 200 agent calls interleaved with at least 20 publications, no
  response contains documents from two commits, and every header commit equals the commit all of
  its documents came from.
- **SC-004**: After the upgrade of a local fixture, the agent catalog, context and plan for committed
  default-branch content equal what they were before it, byte for byte, and an uncommitted edit, an
  untracked file and a commit on another branch do not appear.
- **SC-005**: An unknown project, an unreadable project and an unreadable project without a snapshot
  produce identical status and body in all of the authorization-matrix roles.
- **SC-006**: For every default-branch move not made by the workbench, 0 bytes of the new commit are
  served before adoption, in tests of a fast-forward, a non-fast-forward and an interrupted
  publication.
- **SC-007**: A commit id that is on another person's personal branch, an abbreviated id and a tag
  outside published history are each refused identically to an unknown id, through the resolver and
  through the history reads, in tests for both modes.
- **SC-008**: Warm agent catalog, context and plan requests on the example workspaces have a 95th
  percentile no more than 10% above the same requests read from the working index before the
  change. The 10% figure is a default chosen in this spec, not an owner figure; the task measures it and records the
  numbers with the fixture and command in the docs before any speed claim is made.
- **SC-009**: After 50 publications, the resolver retains at most the current snapshot, the previous
  one and snapshots held by live pins, measured by an exposed count in a test.
- **SC-010**: Mappings view shows the preview label with the published commit, local Source Control
  shows Publish and the pending-move message, and a before-and-after capture of every other screen
  in both modes shows no unrequested change; the browser check passes against a mocked API.
- **SC-011**: README, ARCHITECTURE.md, the listed docs and CHANGELOG describe every user-visible
  change in the migration table of the plan, and the docs-sync check passes.
- **SC-012**: A project with no snapshot answers "no published snapshot" to its readers in 100% of
  tests that cover no Git, no commit on the default branch and a missing blob.

## Assumptions

- The recorded default branch name is the one E4 calls "configured". The existing
  `workbench.defaultBranch` setting is reused rather than adding a user-facing option. Changing it
  later is a separate feature.
- The published pointer is durable application state, kept in the same atomic state-file mechanism
  as the registry, and is rebuildable only by the first-start rule. The Git ref is the source of
  truth for history; the pointer is the source of truth for what is served.
- Authoring branch naming in local mode follows the personal-branch convention of server mode, with a
  fixed local identity (the plan names it). No setting is added.
- Invalid documents may be published, as they are today. This feature adds no rule that a snapshot
  must be free of findings; E10 owns set validity and joins the publication check list.
- The response header name and the preview route names are fixed in the plan's contract and are not
  part of any decision.
- Agent traffic through application tokens in server mode keeps the exact meaning of its existing
  grant (M7); the only differences are the added header, the "no published snapshot" answer and the
  commit-based content, which equals the published checkout it read before.
- Out of scope: the extended-format compiler, the mesh, dependency manifests, release tags and their
  creation, MCP tools and resources, set-validity checks, proposal branches (E7-E9), a pointer-reset
  operation, and any change to what a person's own editor reads.
- Dependencies: constitution amendments drafted on branch `constitution-tessera` (the principle on
  honest claims and on served-only-to-that-person content may be amended to name the snapshot);
  006 MCP consumes the resolver and the read-source declaration; 009 item addresses may name a
  snapshot commit; 010 operation boundary carries the request surface.

## Traceability

| Source | Requirement | Success criterion |
|---|---|---|
| E4 immutable default-branch snapshot in both modes | FR-001-FR-006, FR-009-FR-014 | SC-004, SC-012 |
| E4 publication needs authorization and validation | FR-005, FR-007, FR-016, FR-017 | SC-006 |
| E4 external Git changes need validation before serving | FR-015-FR-017 | SC-006 |
| E5 agents plan only from the snapshot, own agent included | FR-025-FR-031 | SC-001, SC-002 |
| E5 browser previews remain | FR-027, FR-028, FR-030 | SC-010 |
| E11 consumer not changed underneath; fail closed | FR-019, FR-020, FR-034, FR-036 | SC-003 |
| E11 pins only to published history or release tags | FR-032 | SC-007 |
| Ossie review Fable B1 (agent routes read the copy; local has no published checkout) | FR-018, FR-025, FR-009-FR-013 | SC-001, SC-004 |
| Ossie review Astra B3 (resolver independent of Reader; historical provenance) | FR-018, FR-032, FR-033 | SC-007 |
| M7 existing grants keep their meaning; history is separate | FR-021, FR-025 | SC-001 |
| M16 snapshot versions in resource identity | FR-001, FR-020, FR-021 | SC-003 |
| M17 defined unavailable result | FR-006, FR-023 | SC-005, SC-012 |
| M18 published context and plans in the first MCP release | FR-018, FR-026, FR-031 | SC-002 |
| E10 cache by snapshot and authorization version | FR-022, FR-034 | SC-005 |
| E16 never branch-only WIP in exports | FR-039 | SC-001 |
| Principle VII honest claims | FR-030, FR-043 | SC-011 |
