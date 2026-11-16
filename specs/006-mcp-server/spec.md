# Feature Specification: First MCP Release, Local Read, Validated Edit and Commit

**Feature Branch**: `006-mcp-server`

**Created**: 2026-11-15, rewritten through Spec Kit 2026-11-16

**Status**: Clarified

**Input**: The owner wants an agent to work in the workbench the way a person works in the
browser: read definitions, change the YAML, get validation, commit. The workbench receives the
agent's requests over the Model Context Protocol (MCP); it never calls a language model. The
owner's decisions split the original scope: this feature is the **first MCP release**, local mode
only. Person sign-in, application-grant changes, remaining workspace and remote source-control
operations, resources and prompts, and administration are committed later increments, listed in
"Later increments" so the whole agreed scope stays visible.

## Glossary

- **Local capability**: a random secret created once per installation, kept in a file only its
  owner can read, and required on every request to the MCP endpoint. It identifies "a program on
  this machine that was set up by the installation's owner". It is not a person's identity and not
  a role.
- **Twin route**: the existing HTTP route that does what a tool does. A tool is dispatched as an
  in-process request to its twin through the operation boundary (feature 010).
- **Published**: the committed snapshot of a project's default branch (feature 008). Dirty files,
  personal branches and proposal branches are unpublished.
- **Version**: the SHA-256 hash of a file's bytes, the value the editor and the save API already
  call the base hash.
- **Bridge**: a small program started by an agent client that speaks MCP over standard input and
  output and forwards each message to the running workbench.
- **Tessera**: the working name of the extended authoring format (decision E24). To this feature
  such documents are ordinary files; no tool depends on the format.

## Clarifications

### Session 2026-11-16

- Q: Is the MCP endpoint available in server mode in this release? → A: No. It is mounted in local
  mode only; in server mode the path answers as an unknown route and nothing about server mode
  changes. Person sign-in is a separate feature, and the constitution accepts bearer tokens only on
  the agent API until it amends that rule. (M18, M2)
- Q: What may a default local connection do, and what happens to an effect that needs a wider
  scope such as push or publish? → A: Read, validate, edit and commit to the authoring branch.
  Tools for remote operations, publication and administration are absent, not refused. A commit that
  would advance the published branch is refused with an explanation, because advancing it needs the
  publication scope this release does not offer. (M9, E4, M18)
- Q: Which write tools need an idempotency key, and which are protected by a version check
  alone? → A: Saving and creating a file are protected by their version check. Deleting to trash,
  restoring and committing change state a retry cannot detect, so they require a key. A conflict
  answer says when the file already equals the proposed text. (M13)
- Q: What do the published-only tools return when a project has no published snapshot, or a branch
  is unpublished? → A: A defined "not published" result that names the reason. They never fall back
  to dirty files or a personal branch, for any caller including the author's own agent. (E4, E5)
- Q: How large may a request, a result and a page be? → A: Defaults are named in the success
  criteria and the tool contract: a global request cap before parsing, a per-tool cap chosen by tool
  name, a result cap, pages with cursors, and byte ranges pinned to a version. The existing
  2,000,000-byte document limit still applies to saves and validation. The numeric defaults are
  assumptions tagged with their source in the plan. (M17)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A person connects an agent to the local workbench safely (Priority: P1)

A person starts the workbench in local mode and adds it to their agent client, once through the
bridge for clients that run a command, or directly over HTTP for clients that take a URL and a
header. The client discovers what the server supports and lists its tools. No web page, other
user of the machine or program without the local capability can use the endpoint.

**Why this priority**: every other story gives an agent the power to change and commit files. The
connection must be closed to everything but the person's own programs before any tool exists.

**Independent Test**: start local mode, connect the protocol reference client and Codex CLI, then
run the refused cases in the scenarios below.

**Acceptance Scenarios**:

1. **Given** local mode has started once, **When** the person lists the data root's state folder,
   **Then** a capability file exists that only its owner can read, and no log line, audit record or
   error contains its value.
2. **Given** a request without the capability or with a wrong one, **When** it reaches the
   endpoint, **Then** it is refused with 401 and no information about tools, versions or files.
3. **Given** a request that carries an `Origin` header (including `Origin: null`), a `Host` other
   than the server's own loopback address and port, or a non-JSON content type, **When** it carries
   a correct capability, **Then** it is refused before the body is parsed.
4. **Given** a client sends `server/discover`, **Then** it receives the supported revision and
   capabilities, and `tools/list` returns the first-release tools in a stable order, each with a
   description, an input schema and its four behaviour hints.
5. **Given** a request whose version, method or name headers are missing or disagree with the body,
   or name an unsupported revision, or name an unknown method, **Then** the answer uses the
   protocol's status and error code for that case.
6. **Given** a client of the earlier protocol era, **When** it calls tools, **Then** it is served
   request and response from the same tool definitions, and it is told that resources, prompts and
   change notices are not offered.
7. **Given** the capability is rotated, **When** a client uses the old one, **Then** it is refused,
   and the bridge uses the new one without reconfiguration.
8. **Given** the workbench runs in server mode, **When** a client calls the endpoint path, **Then**
   the path is unknown and the bridge explains that MCP is not available in server mode yet.

---

### User Story 2 - An agent reads definitions, findings, history and the published context (Priority: P1)

The agent lists projects and files, reads a definition in pieces, reads the located findings the
editor shows, inspects Git status, diff, log, branches and file versions, lists the trash, and asks
for the mapping catalog, context, query plan and metric explanation the agent API already gives.
The catalog, context, plan and explanation always describe the published snapshot.

**Why this priority**: the agent must see what it is about to change, and reading cannot damage
files.

**Independent Test**: connect to local mode with the shipped examples and call every read tool.

**Acceptance Scenarios**:

1. **Given** an example project, **When** the agent reads a file, **Then** it receives the saved
   bytes (or a byte range) and the version it needs to change the file later.
2. **Given** a file larger than one result may carry, **When** the agent reads it in ranges against
   one version, **Then** concatenating the ranges reproduces the file's bytes exactly, and a range
   requested against an older version is refused.
3. **Given** a file with a broken reference, **When** the agent asks for its findings, **Then** it
   receives the same located findings the editor shows, in pages.
4. **Given** a long list (files, findings, log entries), **Then** the answer is one page with a
   cursor, and a cursor made before a rescan is refused as expired.
5. **Given** the Mapped commerce example is published, **When** the agent asks for context and a
   plan, **Then** the results equal the agent HTTP API's and name the snapshot they came from.
6. **Given** the same project has an unpublished edit, **Then** the context, plan and explanation
   do not show it, whoever asks.
7. **Given** a project without a published snapshot, **Then** those four tools answer "not
   published" and say why, and nothing else about the project is blocked.
8. **Given** a project that is not under Git, or an index that is not ready, **Then** the Git tools
   and the readiness-dependent tools answer with a defined "unavailable" or "not ready" result.
9. **Given** a path that leaves the project, differs only by case from another, or is a symlink,
   **Then** it is refused as it is for the browser.

---

### User Story 3 - An agent validates and changes definitions (Priority: P1)

The agent proposes new text and asks what validation and the content guards would say, saves a
change as a patch or as full text against the version it read, creates a file under a name it
chooses, moves a file to the trash and restores it.

**Why this priority**: it is the first thing the owner asked for, and the place where byte
preservation, version checks, validation and guards must hold for an agent exactly as for a person.

**Independent Test**: in local mode, have a client change a metric's description, break a
reference, repair it, delete and restore a file, checking the files on disk after each step.

**Acceptance Scenarios**:

1. **Given** text the agent has not saved, **When** it asks for validation, **Then** it receives the
   findings and any guard outcome the save would give, and nothing on disk changes.
2. **Given** a valid patch against the current version, **When** the agent saves, **Then** the file
   is replaced atomically, bytes outside the patched ranges and line endings are unchanged, and the
   answer carries the new version and the findings.
3. **Given** a change against an old version, **When** the agent saves, **Then** the save is
   refused as a conflict, the answer carries the current version, and nothing is overwritten. If the
   file already equals the proposed text, the answer says so.
4. **Given** text that fails validation, **When** the agent saves, **Then** the definition is not
   replaced and the answer carries the findings.
5. **Given** a change a content guard rewrites (a demoted metric status) or forbids, **Then** the
   answer discloses the stored text that differs from the submitted text, or carries the guard's
   message.
6. **Given** the agent creates a file under a name it chose, **When** that name exists, **Then**
   creation fails with a conflict; no tool picks a free name or keeps both files.
7. **Given** the agent deletes a file and the answer is lost, **When** it retries with the same
   key, **Then** it receives the original result and the file is in the trash once.
8. **Given** a deleted file, **When** the agent restores it, **Then** it returns with its content
   and never overwrites a file that appeared since.
9. **Given** the person has unsaved edits to the same file in the browser, **When** the agent saves
   it, **Then** the person's draft is kept and the editor shows the changed base as it does for any
   external change.
10. **Given** a saved change, **Then** open browsers refresh through the existing live events.

---

### User Story 4 - An agent commits selected files without taking anything else (Priority: P2)

The agent commits the files it changed, naming each file and the version it expects, and the branch
and head it expects. The commit contains exactly those files and nothing the person staged or
edited meanwhile.

**Why this priority**: an edit is not finished until it is committed, and a commit that picks up
another actor's work is the main new risk of sharing a working copy with a person.

**Independent Test**: after Story 3's change, commit it through the tool and read the log; then
repeat while the person stages an unrelated file and while another commit lands.

**Acceptance Scenarios**:

1. **Given** changed files, **When** the agent commits with their paths, versions, the expected
   branch and the expected head, **Then** a commit with exactly those files exists, authored by the
   person's identity with the agent's plain message and no agent marker.
2. **Given** the person staged an unrelated file, **Then** the commit does not include it and it
   stays staged.
3. **Given** the branch or head moved, or a listed file no longer has the listed version, **Then**
   the commit is refused with what changed, and nothing is committed.
4. **Given** the current branch is the published branch, **Then** the commit is refused with the
   instruction to publish from the browser, and nothing is committed.
5. **Given** a commit whose answer is lost, **When** the agent retries with the same key, **Then**
   it receives the original commit; with a different message under the same key it is refused.
6. **Given** the server stops between the commit and the receipt, **When** the agent retries after
   restart, **Then** it receives the original result or an explicit "uncertain, check the log"
   answer, never a second commit.
7. **Given** a commit request, **Then** no option to push exists; remote operations are absent.

---

### User Story 5 - A person can see what the agent did, and the log stays useful (Priority: P2)

Every call an agent makes is recorded once with the tool, the target, the connection and the
outcome. The access administration's dry run keeps working from a sample that reading agents cannot
crowd out.

**Why this priority**: an agent makes hundreds of reads per task; without separation they would
bury the writes and denials a person wants to review.

**Independent Test**: run a scripted agent session of reads and writes, open the audit log view and
the policy dry run.

**Acceptance Scenarios**:

1. **Given** any MCP call, **Then** exactly one audit record names the validated method or tool,
   the actual targets, the connection, that it came through MCP and the semantic outcome (done,
   denied, conflict, refused, error), and the outer request is not recorded a second time.
2. **Given** discovery or a list call, **Then** one record is written per call, not per item.
3. **Given** 5,000 reads followed by a few writes and denials, **When** an Admin runs a dry run,
   **Then** the replay sample still contains those writes and denials.
4. **Given** records written before this release, **Then** they still read and verify.
5. **Given** the configured audit retention, **Then** the running log applies it.
6. **Given** any record or log line, **Then** it contains no tool arguments, file text, capability
   or token.

---

### Edge Cases

- A request in a protocol revision the server does not support is refused with the supported list.
- A body over the global cap is refused before it is parsed; one over its tool's cap is refused as
  soon as the tool name is known.
- Two agents, or an agent and a person, save the same file: the second save is a version conflict.
- A tool is called during a rescan: it answers from the last complete index or says "not ready".
- A client disconnects mid-call: reads stop; a write either completed atomically or did not start.
- A bearer token from a person or application is sent to the endpoint in local mode: it is not the
  capability and is refused.
- A client that shows no confirmations still cannot skip a version check, a guard or the published
  branch refusal, because the server enforces them.
- A file's text contains instructions aimed at the agent. The server returns it in a content field
  that only carries file text and its server-written instructions never come from files. The protocol
  has no way to mark content untrusted, so the documentation states the residual risk: an agent that
  can read and commit can be steered by what it reads. Nothing server-side depends on file text.
- A tool result would exceed the cap: the answer is a page, a range or a `limit_exceeded` error with
  how to narrow the request; it is never silently shortened.
- The capability file is missing at start: it is created. It is unreadable by others on a platform
  that cannot set file permissions: local mode refuses to start the endpoint and says why.
- The same person works in the browser while an agent commits: operations on one repository are
  serialized across the check and the execution.
- Git is not installed: Git tools answer "unavailable"; file tools keep working.

## Requirements *(mandatory)*

### Functional Requirements

**Scope and availability**

- **FR-001**: The workbench MUST mount one MCP endpoint, `POST /api/mcp`, in local mode only. In
  server mode the path MUST be an unknown route, and no server-mode route, response or permission
  changes. (M18)
- **FR-002**: The tool list MUST contain exactly the tools of this release, listed in the tool
  contract. Resources, prompts and subscriptions MUST NOT be advertised, and no tool of a later
  increment appears, disabled or refused. (M18, M15)
- **FR-003**: Documentation and the discovery response MUST describe this as the first release, not
  the whole workbench, and list the later increments. (M18)

**Local access**

- **FR-004**: Local mode MUST create a random per-installation local capability on first start,
  with at least 256 bits of randomness, stored under the data root's state folder readable only by
  its owner. It MUST NOT appear in tool arguments, document content, logs, audit records, errors or
  telemetry. (M8)
- **FR-005**: Every request to the endpoint MUST present the local capability in an authentication
  header; the comparison MUST NOT leak its value through timing. A missing or wrong capability MUST
  be refused with 401 and no other detail, and repeated failures MUST be rate limited. (M8)
- **FR-006**: The endpoint MUST refuse, before parsing the body, any request that carries an
  `Origin` header, any `Host` other than the server's own loopback names and port, a content type
  that is not JSON, and any method other than `POST`. (M8, M15)
- **FR-007**: A rotate command MUST replace the capability; the next request with the old value MUST
  be refused and the bridge MUST read the new value. (M8)
- **FR-008**: The bridge MUST read the capability and the server address from the installation,
  add the headers the protocol requires from each message, forward it, never print the capability,
  and answer with a clear error when the workbench is not running or runs in server mode. (M8, M15)
- **FR-009**: Documentation MUST give the header form for direct HTTP clients and state the threat
  model: no isolation from a malicious process running as the same operating-system user, and no
  repair of other local routes. (M8)

**Protocol conformance**

- **FR-010**: The server MUST implement protocol revision 2026-07-28 including `server/discover`,
  with the supported revisions and capabilities in its answer. (M15)
- **FR-011**: A request whose version, method or name header is absent or disagrees with the body
  MUST be refused with status 400 and error code -32020; an unsupported revision with 400 and
  -32022 and the supported list; an unknown method with 404 and -32601. (M15)
- **FR-012**: Every result MUST carry its result type; list results MUST carry a cache lifetime and
  private cache scope, because the list depends on the caller; tool lists MUST be in a fixed order.
  (M15)
- **FR-013**: A notification MUST be answered with 202, and closing a response MUST cancel the
  work, leaving no half-applied write. (M15)
- **FR-014**: Requests of the earlier protocol era MUST be served request and response from the
  same definitions; the documentation MUST say what that era does not get (no change notices in this
  release because none are offered). (M15)
- **FR-015**: The exact versions of the MCP library packages MUST be pinned, and each release
  acceptance record MUST name the tested client versions: Codex CLI and the protocol reference
  client. No other client is promised. (M15)
- **FR-016**: Tool inputs MUST be plain JSON Schema checked before the tool runs, so application
  code needs no second schema library; an invalid input MUST be a tool error naming the field.
  (M15)
- **FR-017**: Each tool MUST declare read-only, destructive, idempotent and open-world hints
  independently, with values taken from the tool contract; the server MUST NOT depend on a client
  honouring them. (M15)
- **FR-018**: The endpoint MUST NOT depend on a transport session. Durable receipts, cursors and
  versions travel as tool arguments and are checked on every use. (M16)

**Authorization**

- **FR-019**: Every tool call MUST be dispatched as an in-process twin request through the operation
  boundary (feature 010) with the resolved local principal and an MCP origin tag, so route
  selection, target checks, guards, refusals and the audit outcome come from the code the browser
  already uses. A tool MUST NOT read or write project files or decide access itself. (M1)
- **FR-020**: The tool that runs MUST be the one named in the parsed body; a header MUST NOT choose
  the action while the body names another. (M15, M1)
- **FR-021**: A tool MUST be listed when the caller holds its action on at least one permissible
  target, and every invocation MUST recheck its actual targets. A hidden project, path or reference
  MUST be indistinguishable from a missing one in every answer. (M17, M1)
- **FR-022**: Each tool MUST name its twin route. A tool with no twin today (validation of proposed
  text, findings paging) MUST first gain a shared operation, a route inventory row and an
  authorization-matrix case. (M1, M17)
- **FR-023**: The authorization test matrix MUST call every tool with every test role and scope
  and compare the decision with the twin route's; no byte of an unreadable file may appear in any
  answer. (R2)

**Reading**

- **FR-024**: Read tools MUST cover: projects, files, file source by byte range with its version,
  located findings for a file, the trash listing, Git status, diff, log, branches, file versions
  and a file at a commit. (M18)
- **FR-025**: The mapping catalog, mapping context, query plan and metric explanation tools MUST
  read the published snapshot only, return its identity, accept no expression or metric override in a
  plan, and answer "not published" with a reason when no snapshot exists. They MUST NOT fall back
  to dirty files, personal or proposal branches. (E4, E5)
- **FR-026**: When Git is absent, the repository is unreadable or the index is incomplete, tools
  MUST answer with a defined "unavailable" or "not ready" result and not an unexplained failure.
  (M17)

**Bounds**

- **FR-027**: A request body MUST be capped while it is read, before parsing, by a per-tool cap
  chosen from the tool name when the name is known and by one global maximum otherwise. (M17)
- **FR-028**: A tool result MUST NOT exceed the result cap. Lists MUST be paged with cursors bound
  to the query, the ordering, the index generation, an expiry and the caller's authorization; a
  stale or foreign cursor MUST be refused; every page MUST be authorized again. (M16, M17)
- **FR-029**: Byte ranges MUST carry the version they were read from, end on a character boundary,
  report where the next range starts, and be refused when the file changed. Output MUST NOT be
  truncated silently. The 2,000,000-byte document limit MUST still bound validation and saves.
  (M17, Principle II)
- **FR-030**: Each caller MUST be limited in tool calls per second, in concurrent calls and in
  aggregate work per call; an excess MUST answer `rate_limited` with a retry delay, and a call past
  its deadline MUST stop and answer `limit_exceeded`. (M17, M15)

**Editing**

- **FR-031**: The validation tool MUST return the located findings and the guard outcome that
  saving the proposed text would give, MUST write nothing, and MUST require the same right as saving
  that file. (M18, M17)
- **FR-032**: The save tool MUST accept either exact patches or full text, each with the version
  the edit started from. It MUST replace the file atomically, preserve untouched bytes and line
  endings, return the new version and findings, and reject invalid text before any write. (M13,
  Principles II to IV)
- **FR-033**: When the stored text differs from the submitted text because a content guard
  rewrote it, the answer MUST say so and return the stored source. A stale version MUST answer with
  the current version and whether the current text already equals the proposed text. (M13)
- **FR-034**: The create tool MUST take the path from the caller and fail when it exists. No tool
  MUST choose a free name or keep both files. (M13)
- **FR-035**: Delete MUST move the file to the trash; restore MUST return a trash entry without
  overwriting a file that appeared since; both MUST need an idempotency key. (M18, M13)
- **FR-036**: A saved change MUST reach open browsers through the existing live events, and a
  person's unsaved draft of the same file MUST be kept. (M12)
- **FR-037**: Path rules (escape from the project, case variants, symlinks) and content guards
  MUST be those of the browser, with the guard's own message in the refusal. (Principle III)

**Commit**

- **FR-038**: The commit tool MUST require the file paths, the version expected for each, the
  expected branch and the expected head, MUST commit exactly those files and leave every other
  staged or unstaged change untouched, and MUST use the person's author identity and the given plain
  message with no agent marker. (M12, M10)
- **FR-039**: The commit MUST be refused, with what changed, when the branch, the head or any
  listed version differs, and MUST NOT broaden its content. The check and the execution MUST run
  under one repository serialization. (M12)
- **FR-040**: A commit that would advance the published branch MUST be refused with the instruction
  to publish from the browser. No tool MUST push, fetch, pull, publish or change a remote. (M9, E4)

**Retry**

- **FR-041**: Each mutation MUST be classified in the tool contract as precondition-protected or
  receipt-backed. A receipt-backed call MUST carry an idempotency key bound to the caller; the same
  key with different normalized arguments MUST be refused; the same key with the same arguments MUST
  return the original result. (M13)
- **FR-042**: A receipt MUST be durable, written with the local effect so a restart never yields a
  second effect, kept for its retention, and MUST answer `uncertain` with how to check when the
  outcome cannot be established. No exactly-once claim is made. (M13, Principle IV)

**Audit**

- **FR-043**: Every substantive MCP method MUST be audited once with the validated method or tool,
  the actual targets, the connection, the MCP origin and the semantic outcome, and the outer request
  MUST NOT be recorded as a second success. Discovery and list calls are one record per call.
  (M14)
- **FR-044**: The audit record format MUST gain these fields without breaking the reading or the
  tamper-evidence check of older records, and the configured retention MUST reach the running log.
  (M14)
- **FR-045**: The dry-run replay MUST be built from separately bounded groups of writes and denials
  and of de-duplicated reads, alongside the configured cases, so read volume cannot evict the
  meaningful sample. (M14)
- **FR-046**: Tool arguments, file text, the capability and tokens MUST NOT be written to the audit
  log, application log or any metric label; metric labels MUST come from the fixed tool list. (M14)

**Honest claims**

- **FR-047**: The release MUST NOT execute a query plan, contact a warehouse, call a language model
  or fetch a remote document, and MUST add no outbound network call. (Principle I)
- **FR-048**: The README and `docs/mcp.md` MUST state: "Semantic Workbench does not call a language
  model. When you connect an external agent, that agent can receive definitions you authorize and
  may send them to its model provider; its configuration and policies govern that onward use." The
  local-mode promise and the connection instructions MUST say it too. (M11)
- **FR-049**: Documentation MUST describe the residual prompt-injection risk in plain words and MUST
  NOT claim that results are marked as untrusted. (M15 and the protocol)
- **FR-050**: The README, ARCHITECTURE.md, `docs/` and the changelog MUST describe only what ships,
  with the tool list and counts produced by code and checked by a test, and with each later
  increment named as not yet available. (Principle VII, R2)

### Key Entities

- **Tool**: a named operation with a JSON Schema input, an effect class (read, change), four
  behaviour hints, its twin route, its retry class and its limits.
- **Local capability**: the per-installation secret and its state (present, rotated).
- **Connection**: the local capability as an audit identity, plus the client name the client sent,
  recorded as an untrusted label.
- **Receipt**: the stored outcome of a receipt-backed call, keyed by caller, tool and key, with the
  normalized arguments' hash, the result, the state (pending, done, uncertain) and an expiry.
- **Cursor**: an opaque handle for the next page, bound to a query, ordering, index generation,
  expiry and caller.
- **Result page and byte range**: the bounded forms in which large results are returned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scripted run by Codex CLI against local mode, following only `docs/mcp.md`, changes
  a metric's description in the Mapped commerce example, fixes a broken reference that validation
  reports, and commits both files without the browser. It passes on every release candidate.
- **SC-002**: For every tool with a twin route, the normalized result (without envelope, timestamps,
  ids and paging) equals the twin's for the same input on every shipped example project: 100 percent.
- **SC-003**: The authorization matrix has one case per tool, role and scope and passes with zero
  unexpected decisions and zero bytes of an unreadable file in any answer.
- **SC-004**: After any sequence of patch saves, a file differs from its previous bytes only inside
  the patched ranges; after a full-text save it equals the submitted text except disclosed guard
  rewrites.
- **SC-005**: In 200 randomized interleavings of staging, committing and switching branches between
  a person and an agent, no commit contains a path or version the agent did not list, and no
  unrelated staged change is lost or committed. (200 is an assumed size, see the plan.)
- **SC-006**: Stopping the server at every journaled step of delete, restore and commit and retrying
  with the same key yields the original result or `uncertain` in every case, and never a second
  effect.
- **SC-007**: Every protocol requirement in the conformance contract passes through the mounted
  route with Codex CLI and the protocol reference client: 100 percent.
- **SC-008**: Requests with no capability, a wrong capability, any `Origin` (including `null`), a
  foreign or malformed `Host`, a rebinding name, or a simple browser form post are all refused, none
  reveals a tool, and a scan of logs, audit and error output finds no capability value.
- **SC-009**: No tool result exceeds the result cap; a 2,000,000-byte file read in ranges is
  reproduced byte for byte; every call ends within its deadline on the largest example and on a
  generated project of 20,000 files.
- **SC-010**: After 5,000 MCP reads and 20 writes and denials, the dry-run sample contains all 20.
  Every call produces exactly one audit record.
- **SC-011**: The existing test suite, browser suites and mutation tests pass; the only changes to
  existing behaviour are the listed fixes (audit retention, audit fields, dry-run strata, and the
  publication, guard, concurrency and security changes the boundary features make).
- **SC-012**: Every targeted mutant listed in the plan is detected.
- **SC-013**: The tool names, counts and later-increment list in the documentation equal what the
  code and the spec declare, checked by a test.

## Later increments

The whole agreed scope stays committed. Each item below is a separately specified feature or
increment, absent from this release's tool list, and listed here with its governing decision.

| Increment | What it adds | Governing decisions |
|-----------|--------------|---------------------|
| Person sign-in on a team server | Workbench-issued tokens behind the organisation sign-in, registered clients, consent, headless bootstrap, connections tied to browser sessions, MCP in server mode | M2, M3, M4, M5 |
| Application grants | Wider published source, model and findings reads for applications only by explicit Admin-reviewed change; history as a separate opt-in | M7 |
| Remaining workspace and source-control operations | Metrics and KPIs, move and rename, import, projects, examples, drafts, gitignore, suggestions, grouping, export, purge and clear, revert, stage and unstage, branch switching, fetch, pull, sync, push, publish, clone and remote settings, with scopes for remote and publication, and follow and cancel for long operations | M9, M12, M13, M16, M17 |
| Search, lineage and parsed model | Shared server implementations of what the browser derives today, then tools | M17 |
| Resources and prompts | Definition files and contexts as resources with snapshot identity, change notices, prompts, and the subscription interoperability gate | M15, M16 |
| Administration | An explicitly delegated administration scope with strengthened receipts, dry-run and proposal contracts for settings, deactivation, session ending and rollback, and a browser approval for irreversible deletion | M6 |
| Agent panel (separate feature) | Inbound ACP integration reusing the same connections and guarded operations | M19 |

Facts the old specification got wrong and this one corrects: settings are saved without a dry run;
an access change notifies affected sessions and ends only the sessions of deactivated people;
outbound calls already include the identity provider, its directory, token endpoints, Git hosts and
opt-in telemetry, not only Git; `server/discover` is mandatory for servers; the protocol has no
untrusted-content marker; and the Host and Origin checks already exist in `src/server/handler.ts`
and are kept, not added.

## Assumptions

- Features 008 (published snapshot) and 010 (operation boundary) land before the tools that depend
  on them. The four published-only tools and the dispatch of every tool are blocked on them; if 008
  is late, those four tools are not exposed. Feature 009 (item addresses) is not required; tools
  take a project and a path until locators exist.
- The constitution amendments drafted on `constitution-tessera` cover authenticated agent
  authoring and the local capability (Principle I), receipts (IV), the tool matrix and mutants
  (VI) and the content statement (VII). Tasks that mount write tools wait for them.
- In local mode the single implicit principal holds the Admin role, so every tool of this release
  is listed. The authorization tests still run each tool with the server-mode test roles through the
  same dispatcher, so the later increments inherit a tested path.
- The commit author is the identity Git is configured with, as for a browser commit; the audit log,
  not Git history, records that a commit came through MCP. (M10)
- The default numbers (caps, rates, receipt retention, test sizes) are proposals tagged with their
  source in the plan and can be changed without changing a requirement.
- An agent client that is a web page cannot connect, because any `Origin` header is refused. This is
  intended.
