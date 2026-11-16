# Feature Specification: MCP Server for the Whole Workbench

**Feature Branch**: `006-mcp-server`

**Created**: 2026-11-15

**Status**: Draft

**Input**: The owner wants an agent to work in the workbench through the Model Context Protocol
(MCP) the way a person works in the browser: read everything, change the YAML definitions, get
validation, commit, use source control and administer access. The server also offers MCP
resources and prompts, and people sign in so an agent acts with their identity on a team server.
The workbench receives the agent's requests; it does not call a language model. An agent panel
over the Agent Client Protocol follows as a separate feature (007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent reads the whole workspace (Priority: P1)

A person adds a local workbench to their agent as an MCP server. The agent lists projects and
files, reads a definition's source, asks for the parsed model (entities, relationships, metrics),
searches it, follows column lineage, reads validation findings, and uses the mapping context,
query plan and metric explanation the agent API already gives.

**Why this priority**: every later story needs the agent to see what it is about to change, and
reading carries no risk to the files.

**Independent Test**: start local mode with the shipped examples, connect an MCP client and call
each read tool.

**Acceptance Scenarios**:

1. **Given** local mode, **When** a client lists tools, **Then** the read tools are present, each
   with a description, an input schema and a marker that it changes nothing.
2. **Given** an example project, **When** the agent reads a file, **Then** it receives the saved
   bytes and the version needed to change it later.
3. **Given** a file with a broken reference, **When** the agent asks for its findings, **Then** it
   receives the same located findings the editor shows.
4. **Given** a contract with declared column dependencies, **When** the agent asks for the lineage
   of a column, **Then** it receives the same upstream and downstream columns the Lineage view
   draws.
5. **Given** the Mapped commerce example, **When** the agent asks for context and a plan, **Then**
   the results equal the agent HTTP API's.
6. **Given** a tool that answers with a long list, **Then** the answer is paged and says how to
   get the next page; no tool returns an unbounded result.

---

### User Story 2 - An agent changes definitions and gets validation (Priority: P1)

The agent edits a YAML definition: it proposes new text, asks what validation says about it
before saving, saves it against the version it read, and reads the findings afterwards. It can
create a file, a metric or a KPI, move or delete a file (to the trash) and restore it.

**Why this priority**: it is what the owner asked for first, and it is where the workbench's
guarantees (byte preservation, version checks, validation, content guards) must hold for an agent
exactly as for a person.

**Independent Test**: in local mode, have a client change a metric's description, break a
reference, and repair it, checking the files on disk after each step.

**Acceptance Scenarios**:

1. **Given** text the agent has not saved, **When** it asks for validation of that text, **Then**
   it receives the findings and nothing on disk changes.
2. **Given** a valid change against the current version, **When** the agent saves, **Then** the
   file is replaced atomically, untouched bytes and line endings are unchanged, and the answer
   carries the new version.
3. **Given** a change made against an old version, **When** the agent saves, **Then** the save is
   refused as a conflict and the answer carries the current version; nothing is overwritten.
4. **Given** text that fails validation, **When** the agent saves, **Then** the definition is not
   replaced; the answer carries the findings, and the text is kept only as a draft if the agent
   asked for that.
5. **Given** a change a content guard forbids for this caller (a metric status or classification
   rule), **Then** it is refused with the guard's message.
6. **Given** a saved change, **Then** open browsers refresh through the existing live events.
7. **Given** a deleted file, **When** the agent restores it from the trash, **Then** it returns
   with its content.

---

### User Story 3 - An agent commits and uses source control (Priority: P2)

The agent reads the project's Git status and diff, stages files, commits with a message, lists and
switches branches, reverts a file, and runs fetch, pull, push and publish when asked.

**Why this priority**: an edit is not finished until it is committed, but committing only makes
sense after editing works.

**Independent Test**: after Story 2's change, commit it through MCP and read the log.

**Acceptance Scenarios**:

1. **Given** changed files, **When** the agent stages and commits, **Then** the commit exists with
   the caller's identity as author and the log tool shows it.
2. **Given** a remote action that needs a credential the caller has not provided, **Then** it is
   refused with the same explanation the Source Control view gives; the agent is never shown or
   asked for a secret.
3. **Given** a push the remote rejects, **Then** the answer explains the rejection and what to do
   next, as the view does.
4. **Given** a long remote action, **Then** the agent can follow its progress and cancel it.

---

### User Story 4 - A person connects an agent to a team server (Priority: P2)

On a shared server a person adds the workbench to their agent, is sent to the organisation's
sign-in, and comes back connected. The agent then reads and writes with that person's roles: its
edits and commits land in the person's working copy and branch, and publishing is the same
separate step it is in the browser. Agent applications with a bearer token stay read-only.

**Why this priority**: without it, writes exist only on one machine. It depends on Stories 1–3.

**Independent Test**: run server mode against the mock identity provider, connect as an Editor,
an Admin and a Reader, and repeat Stories 1–3.

**Acceptance Scenarios**:

1. **Given** no credentials, **When** a client calls the endpoint, **Then** it is told where to
   sign in, in the way the protocol defines.
2. **Given** a signed-in Reader, **When** the agent calls a write tool, **Then** it is refused,
   and the tool list it sees marks which tools its role allows.
3. **Given** a signed-in Editor, **When** the agent saves for the first time, **Then** the
   person's working copy is created and the change is not visible to other readers until
   published.
4. **Given** a project or path the person cannot read, **Then** every tool answers as if it did
   not exist.
5. **Given** an agent application's bearer token, **Then** it can call the read tools inside its
   granted projects and no write, source-control or administration tool.
6. **Given** a person whose session is ended or whose grant is removed, **Then** the agent's next
   call is refused.
7. **Given** any tool call, **Then** the audit log records the person or client, the tool, the
   target and that it came through MCP.

---

### User Story 5 - Resources and prompts (Priority: P3)

Definition files and resolved mapping contexts appear as resources the person can attach in their
agent client, and the client is told when one changes. The server offers prompts, shown by the
client as commands, for the common jobs: define a metric, map a concept to fields, explain a
column's lineage, review a project's validation findings, prepare a commit.

**Why this priority**: it makes the tools easier to use well, but nothing depends on it.

**Independent Test**: list resources and prompts in a client, attach a file, save it elsewhere
and observe the change notice; run each prompt against an example project.

**Acceptance Scenarios**:

1. **Given** a readable project, **When** the client lists resources, **Then** each definition
   file appears once with a stable address, and unreadable files are absent.
2. **Given** a client subscribed to a file, **When** the file is saved, **Then** the client is
   notified, and never about a file its caller cannot read.
3. **Given** a prompt, **Then** its text tells the agent to use stored metrics and fields, to
   validate before saving and to explain refusals; it contains no instruction that overrides
   access or governance.

---

### User Story 6 - An Admin administers access through an agent (Priority: P3)

An Admin asks their agent to inspect or change access: who can read a project, what a role
allows, a new grant, a policy edit, the audit log. Changes follow the reviewed path: a proposal,
a dry run whose result the Admin sees, then a confirmation bound to that dry run.

**Why this priority**: it completes the surface, and it is the most sensitive part, so it comes
last and behind every existing safeguard.

**Independent Test**: as an Admin on a test server, add a grant through MCP and read it back; try
the refused cases below.

**Acceptance Scenarios**:

1. **Given** a non-Admin, **Then** no administration tool is listed or callable.
2. **Given** an agent application's bearer token, **Then** no administration tool is callable,
   whatever its grant.
3. **Given** a proposal, **When** the agent confirms without a dry run of that exact proposal and
   base version, **Then** it is refused.
4. **Given** a change that would remove the last Admin, **Then** it is refused.
5. **Given** a confirmed change, **Then** it is a versioned commit by that Admin, affected
   sessions are closed as today, and the audit record says it came through MCP.

---

### Edge Cases

- A request in a protocol revision the server does not support is refused with the list of
  supported revisions.
- A body over the size limit is refused before it is parsed; a file over the editor's size limit
  is read in ranges.
- Two agents, or an agent and a person, save the same file: the second save is a version
  conflict, never a silent overwrite.
- A tool is called during a workspace rescan: it answers from the last complete index or says the
  workspace is not ready.
- A path that leaves the project, differs only by case from another, or is a symlink is refused
  as it is for the browser.
- A bearer token sent beside a valid cookie is judged alone.
- A client that cannot show confirmations still cannot skip the dry run, the version check or a
  guard, because the server enforces them.
- An agent retries a write after a lost answer: the version check makes the retry a conflict or a
  no-op, never a second change.
- A file's text contains instructions aimed at the agent: the server returns it as data and marks
  tool results as untrusted content; no server behaviour depends on file text.

## Requirements *(mandatory)*

### Functional Requirements

**Protocol and transport**

- **FR-001**: The workbench MUST expose one MCP endpoint, in local and server mode, over the
  protocol's HTTP transport, and ship a bridge for clients that speak MCP over standard input and
  output.
- **FR-002**: The endpoint MUST hold no per-client session state; anything a later call needs
  (a version, a dry-run receipt, a page cursor, an operation id) travels as a tool argument.
- **FR-003**: The endpoint MUST NOT execute a query plan, contact a warehouse, call a language
  model or fetch a remote document. Remote Git actions stay the only outbound calls, as today.

**Tools**

- **FR-004**: Read tools MUST cover: projects and files; file source and version; the parsed
  model and search over it; lineage; validation findings for a file and for a project; metrics
  and their explanations; mapping catalog, context and query plan; drafts; trash; Git status,
  diff, log, branches and file versions.
- **FR-005**: Edit tools MUST cover: validate proposed text without saving; save a file against a
  version; create, move and delete (to trash) a file; restore from trash; create and preview
  metrics and KPIs; save and discard a draft; create a project, load an example and import files.
- **FR-006**: Source-control tools MUST cover: stage and unstage; commit; revert; create and
  switch branches; fetch, pull, sync, push and publish; follow and cancel a running action.
- **FR-007**: Administration tools MUST cover what the Admin panel does: read users, roles,
  grants, project access, agent clients, settings, policies, versions and the audit log; check
  who can do what; propose, dry-run and confirm a change; roll back to a version.
- **FR-008**: Every tool MUST call the same service the matching browser action calls. No tool
  may have its own write path, validation rule or access rule.
- **FR-009**: Every tool MUST declare whether it only reads, changes files, or is destructive or
  outward-facing (delete, purge, push, publish, administration), so a client can ask its user.
- **FR-010**: A caller MUST be shown only the tools its mode and roles allow, and a hidden tool
  MUST also be refused if called by name.
- **FR-011**: Tools MUST NOT return or accept secrets: remote credentials, session tokens and
  provider tokens stay server-side. Clearing the workspace and purging the trash MUST require an
  explicit confirmation argument naming what will be lost.

**Access and identity**

- **FR-012**: Every call MUST pass the existing access boundary with the caller's identity: the
  implicit Admin in local mode, a signed-in person, or a granted agent application.
- **FR-013**: In server mode a person MUST be able to connect an agent by signing in through the
  organisation's provider, following the protocol's authorization rules, without pasting a
  token. The agent's access MUST end when the person's session or grant ends.
- **FR-014**: An agent application (bearer token) MUST stay read-only and MUST NOT administer.
  Its read tools are limited to its granted projects and domains.
- **FR-015**: Hidden projects, paths and references MUST stay indistinguishable from missing ones
  in every tool, resource and notification.
- **FR-016**: Every call MUST be audited with caller, tool, target and the MCP origin. Refused
  tokens MUST NOT be written to any log.

**Resources and prompts**

- **FR-017**: Readable definition files and resolved mapping contexts MUST be listed and readable
  as resources with stable addresses, and a subscribed client MUST be notified of changes it may
  see.
- **FR-018**: The server MUST offer prompts for: defining a metric, mapping a concept, explaining
  lineage, reviewing findings and preparing a commit. Prompt text MUST NOT weaken access,
  validation or the stored-formula rule.

**Documentation**

- **FR-019**: The documentation MUST show how to connect a common agent in each mode, list tools,
  resources and prompts with their effects, and state the limits above.

### Key Entities

- **Tool**: a named operation with an input schema, an effect class (read, change, destructive)
  and the access action it needs; mapped to one existing service operation.
- **Resource**: a definition file or resolved context with a stable address and a version.
- **Prompt**: a named workflow text with arguments.
- **Caller**: the local Admin, a signed-in person or an agent application; no new grant type.
- **Agent connection of a person**: the link between a person's sign-in and the token their agent
  holds; listed and revocable beside the person's sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Following only the documentation, a person connects an agent to a local workbench
  and has it change a metric's description, fix a broken reference found by validation and
  commit both, without opening the browser.
- **SC-002**: For every tool with a browser or HTTP twin, the result for the same caller and
  input is equal, on every shipped example project.
- **SC-003**: Every access test that exists for a route passes unchanged when run through the
  tool that maps to it; no tool reaches a route action the caller lacks.
- **SC-004**: After any sequence of agent writes, files differ from their previous version only
  in the bytes the agent changed.
- **SC-005**: On a team server, a Reader's agent completes no write, and an agent application
  completes no write and no administration call, across the whole tool list.
- **SC-006**: No existing route, response or permission of the browser application changes; the
  full quality gate passes.
- **SC-007**: Mutation tests on tool dispatch, argument checks and effect classes leave no
  surviving mutant that widens access, skips a version check, skips a dry run or accepts a
  caller-supplied formula.

## Assumptions

- Delivery follows the story order: reading, editing and validation first; source control and
  team-server sign-in next; resources, prompts and administration last. Each step is usable
  alone.
- A granted agent application gains the wider read tools inside its granted projects. Today its
  grant covers only the four agent operations, so this widens what that grant means; the Admin
  panel and documentation must say so. Git history is included in that read.
- The agent decides nothing about access. A person's agent can do what the person can do, and an
  Admin's agent can administer; the safeguard is the existing dry run, last-Admin guard, audit
  and the client's own confirmation, not a second permission model.
- The constitution permits answering a caller. The amendment this feature may need is narrower:
  whether the workbench may issue its own access tokens for agent connections, decided in the
  plan's research.
- The agent panel (007) is separate. There the agent also comes to the workbench: the person
  starts it and it connects in.
