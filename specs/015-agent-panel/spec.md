# Feature Specification: Agent Panel (Agent Client Protocol)

**Feature Branch**: `015-agent-panel`

**Created**: 2026-11-17

**Status**: Draft

**Input**: A person should be able to talk to an external coding agent from inside the workbench.
The workbench is a client of the Agent Client Protocol (ACP). The person starts the agent on their
own machine and connects it; the workbench shows the conversation, the agent's work and its change
requests in a panel. The workbench never calls a model, never starts an agent, and offers no
terminal or raw file access. The agent works on definitions only through the workbench's own
operations, the same boundary the MCP tools use (decisions M19 and M1), and plans only from the
published snapshot (E5).

## Summary

- A closed-by-default **agent panel**. The person opens it from the person menu, sees what the
  connection allows and what the agent may do with the content, and starts a **panel session**.
- The person starts an agent on their own machine with a small **relay** program and the session
  code the panel shows. The relay hosts the agent and carries its protocol messages to the
  workbench over an authenticated outbound connection. The workbench never launches anything.
- The workbench answers the agent's file requests (read a text file, write a text file) by running
  the workbench's own operations through the operation boundary, as a caller whose origin is `acp`.
  A write names the version the agent last read in this session. A changed file is a conflict.
  Invalid text is never saved. Content guards, read filtering and audit apply exactly as they do
  for the browser and for MCP.
- There is no terminal, no raw file access, no commit, no push, no publish and no planning in the
  ACP surface. An agent that wants those uses its own, separately authorized MCP connection.
  Planning and context for agents stay published-only.
- The panel shows streamed messages, tool activity, the agent's own task list, every change as a
  diff, and permission questions from the agent. The person can cancel a turn, undo an accepted
  change through an ordinary save, or end the session at any time.
- A session ends when the panel is closed, the relay is lost, the agent exits, the person's
  browser session ends or the connection is revoked. Nothing resumes after an end.
- The conversation is not stored by the workbench. A bounded in-memory buffer lets a reloaded tab
  catch up while the session lives, and is dropped soon after it ends.
- `acp` becomes a fourth kind of caller origin next to `http` and `mcp` in audit, filters, export,
  metrics and the dry-run sample.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect an agent I started (Priority: P1)

A person in local mode opens the panel. It says what will happen: the agent they start can read the
definitions they may read, can change files they may edit, and may send what it reads to its own
model provider. It shows a session code and one command line to run in a terminal. They run it,
choosing their agent. The panel changes from "Waiting for your agent" to "Connected" and shows the
agent's name. In server mode the panel first creates a single-use credential in the browser, bound
to the person, the session and the scopes shown, and the relay consumes it once.

**Why this priority**: nothing else works without a connection that is authenticated, bound to one
person and honest about content leaving the workbench.

**Independent Test**: start the panel against a scripted reference agent through the relay; check
the states, the statement, the scopes and that no secret is visible anywhere.

**Acceptance Scenarios**:

1. **Given** the panel is closed, **When** the person opens it, **Then** it shows the statement
   about content reaching the agent's model provider and the scopes, before any agent connects.
2. **Given** a waiting session, **When** a relay with the right code and credential connects,
   **Then** the panel shows the agent's reported name and the state `connected`.
3. **Given** a relay with a wrong or reused code, **When** it connects, **Then** it is refused with
   the same answer as for an unknown session, and one denial record is written.
4. **Given** a session waiting for more than ten minutes, **When** the limit passes, **Then** the
   session ends with the reason `no-agent`.
5. **Given** a second person, **When** they ask for the first person's session, **Then** the answer
   is the one for a session that does not exist.
6. **Given** the panel was never opened, **Then** no panel request is made and no state is kept.

---

### User Story 2 - Talk to the agent and watch it work (Priority: P1)

The person types a request, optionally attaching links to files by workbench path. The agent's
reply streams in. The panel shows the agent's messages, the tools it uses, and its own task list as
it changes. Long messages and long paths wrap and are never cut. The person can cancel the turn.

**Why this priority**: the panel is a conversation first.

**Independent Test**: scripted agent sends messages, tool activity and a task list; compare the
rendered transcript, including very long and hostile text, with the expected structure.

**Acceptance Scenarios**:

1. **Given** a connected agent, **When** the person sends a prompt, **Then** the agent receives it
   with the attached file links and no file contents added by the workbench.
2. **Given** streamed message pieces, **When** they arrive, **Then** the panel shows them in order
   as one message that grows, and announces the completed message politely to assistive technology.
3. **Given** an agent message containing markup, links or script text, **Then** it is shown as
   plain text and nothing is fetched or run.
4. **Given** a running turn, **When** the person cancels, **Then** the agent is told, outstanding
   questions are answered as cancelled, and the panel shows the turn as cancelled.
5. **Given** a message of 200,000 characters on a phone-width screen, **Then** all of it can be
   read by scrolling, with no ellipsis and no horizontal page scroll.
6. **Given** more events than the buffer holds, **When** a tab reloads, **Then** the panel says
   plainly that earlier messages are not kept, and shows the rest.

---

### User Story 3 - The agent reads and edits through the guarded path (Priority: P1)

The agent asks to read a definition and later to write a changed version. The workbench reads what
the person may read, records the version, and on write checks that the file has not changed, saves
through the guarded save, and tells the panel. The panel shows the change as a diff.

**Why this priority**: this is the point of the feature, and the place where a shortcut would
bypass every guard.

**Independent Test**: scripted agent reads, writes, writes stale, writes invalid, writes unread,
creates, and asks for hidden files; compare with the same cases through HTTP and the boundary.

**Acceptance Scenarios**:

1. **Given** an agent that read a file, **When** it writes new valid text, **Then** the file is
   saved from the version it read, one audit record with origin `acp` is written, and the panel
   shows a diff card.
2. **Given** the file changed after the agent read it, **When** the agent writes, **Then** nothing
   is saved, the agent is told the file changed, and the panel shows a refused change.
3. **Given** an agent that never read an existing file, **When** it writes it, **Then** nothing is
   saved and the agent is told to read it first.
4. **Given** a path that does not exist and that the person may create, **When** the agent writes
   it, **Then** the file is created, or refused if it appeared meanwhile.
5. **Given** invalid text, **When** the agent writes it, **Then** nothing is saved and the findings
   are returned.
6. **Given** a file the person may not read, **When** the agent reads or writes it, **Then** the
   answer equals the answer for a file that does not exist.
7. **Given** a person's unsaved draft of the file, **When** the agent writes, **Then** the draft is
   not discarded.
8. **Given** an accepted change, **When** the person selects Undo, **Then** an ordinary save
   restores the earlier text from the version the agent wrote, or reports that the file has
   changed since.

---

### User Story 4 - Answer the agent's questions (Priority: P2)

The agent asks permission before something it considers risky and offers choices. The panel shows
the question and the choices as plain text and waits. The answer never gives the agent more than
the connection allows.

**Why this priority**: agents commonly ask; the person must be able to answer or refuse.

**Independent Test**: scripted agent asks with long text and unusual options; answer, ignore,
cancel and close.

**Acceptance Scenarios**:

1. **Given** a question with three options, **When** the person picks one, **Then** exactly that
   option is returned to the agent.
2. **Given** a question unanswered for ten minutes, **Then** it is answered as cancelled.
3. **Given** a question the person never sees because the panel was closed, **Then** the session
   has ended and the question was answered as cancelled.
4. **Given** the person allows "always" for an action the connection does not allow, **When** the
   agent then tries it, **Then** the workbench refuses it as before.

---

### User Story 5 - A connection ends when it should (Priority: P1)

The connection is bound to the person and, in server mode, to the browser session that authorized
it. Signing out, session expiry, deactivation or revocation ends it. Closing the panel ends it.
Losing the relay or the agent ends it. The person always sees why.

**Why this priority**: M5 and the constitution make bounded lifetime part of the promise.

**Independent Test**: end each way in turn and check the state, the reason, the agent's last
answers and that no later request is served.

**Acceptance Scenarios**:

1. **Given** a connected session, **When** the person closes the panel, **Then** the session ends
   with reason `closed` and the relay is told to stop.
2. **Given** a connected session, **When** the relay stops heartbeating for 45 seconds, **Then**
   the session ends with reason `relay-lost`.
3. **Given** server mode and a connected session, **When** the person signs out or the session
   expires, **Then** the session ends with reason `sign-out` or `expired` before the next agent
   request is served.
4. **Given** a connected session, **When** an Admin deactivates the person or revokes the
   connection, **Then** the session ends and an in-flight write that has not started is not run.
5. **Given** agent traffic only, **Then** the browser session's idle time is not extended.
6. **Given** an ended session, **When** the relay sends anything, **Then** it is refused.

---

### User Story 6 - The record says what the agent did (Priority: P2)

An Admin filters the audit log by origin `acp` and sees session starts and ends, file reads and
writes, denials and the connection they came from. No message text or file text is in the record.

**Why this priority**: M10 replaces Git markers with audit attribution.

**Independent Test**: run a session, then query and export the audit log by origin.

**Acceptance Scenarios**:

1. **Given** a session with reads, a write and a refused write, **When** the Admin filters by origin
   `acp`, **Then** they see one record per operation, each with the connection id.
2. **Given** audit months written before this feature, **Then** they still verify.
3. **Given** a Steward, **Then** they see only what they could already see.
4. **Given** the CSV export, **Then** existing columns keep their order.

---

### User Story 7 - The panel cannot become a shortcut (Priority: P1)

A hostile or buggy agent tries to read a server path, write outside a project, open a terminal,
commit, push, plan with unpublished work, or flood the workbench. Every attempt is refused or
bounded, and none of them changes state.

**Why this priority**: M19 forbids an unrestricted editor shortcut beside the guarded MCP path.

**Independent Test**: a table of hostile requests against a scripted agent; the state of data root,
Git and audit is compared before and after.

**Acceptance Scenarios**:

1. **Given** a read of `/etc/passwd`, `..` segments, a Windows drive path or a path of another
   shape, **Then** it is refused and nothing is read.
2. **Given** a request to create a terminal, **Then** it is answered as unsupported.
3. **Given** any request that is not in the advertised set, **Then** it is answered as unsupported
   and nothing runs.
4. **Given** the agent sends 10,000 requests in a second, **Then** most are answered as rate
   limited, and a sustained flood ends the session.
5. **Given** an agent that asks the panel for a plan or context, **Then** nothing is returned: the
   surface has no such request.

---

### Edge Cases

- The agent sends a frame larger than the cap: the frame is refused with an error and counted; two
  in a row end the session.
- Two tabs of the same person open the same session: the second can watch but a prompt in either is
  sent once; the session shows who sent it only by tab, not by identity.
- The person starts a second session while one is active: the first is ended with reason
  `replaced` after a confirmation.
- The relay reconnects within the grace period: frames missed in either direction are replayed from
  the last acknowledged number and none is applied twice, including a write.
- A write answer is lost on the way back to the agent: a repeated write with the same text from the
  version already saved is answered as already applied, not as a conflict.
- The agent writes a file whose path differs from an existing one only by letter case: refused as
  the ordinary save is.
- A rename or move of a file the agent read: the recorded version no longer matches; the write is
  refused as unread.
- A path contains very long segments, control characters or non-ASCII text: refused or handled as
  the ordinary file routes do; the panel shows the path fully.
- Local mode and a browser that is not the loopback origin: the panel's routes refuse as all
  browser routes do.
- The server restarts: sessions are gone; the relay's next call is refused as unknown; the panel
  shows `server-restarted`.
- A guard rewrites text on save: the agent is told what was stored and the panel shows the stored
  text in the diff.
- The agent reports an unknown content kind: the panel shows a labelled placeholder with its type
  and size, never raw bytes.
- The agent's task list has 500 entries or a 5,000-character entry: shown in full, wrapped.
- A file read that the guard system marks protected: the read is allowed as for the browser; a
  write to a protected field is refused as for the browser.
- An agent that continues to talk after the person cancelled: updates for the cancelled turn are
  shown under it, marked as arriving after cancel.

## Requirements *(mandatory)*

### Functional Requirements

**Panel and session**

- **FR-001**: The panel MUST be closed by default. Until the person opens it, no panel request is
  made, no session exists and no screen, route or response that existed before changes.
- **FR-002**: The workbench MUST act only as the client of the protocol. It MUST NOT start, stop
  or supervise an agent, MUST NOT call a language model, and MUST NOT offer a terminal, a shell or
  raw access to any file on the server or on the person's machine.
- **FR-003**: Before a session starts, the panel MUST show the connection statement ("Semantic
  Workbench does not call a language model. When you connect an external agent, that agent can
  receive definitions you authorize and may send them to its model provider; its configuration and
  policies govern that onward use.") and the scopes the connection will have, in plain words.
- **FR-004**: A session MUST be created by the signed-in browser for one person. Another person
  MUST NOT be able to read it, send to it, answer its questions or end it, and every such attempt
  MUST be answered as for a session that does not exist.
- **FR-005**: Each person MUST have at most one active session. Starting another MUST end the first
  with reason `replaced`, after the person confirms.
- **FR-006**: A session MUST be in one state: `waiting`, `connected`, `working` or `ended`. An
  ended session MUST carry one reason from a closed list: `closed`, `replaced`, `no-agent`,
  `agent-exited`, `relay-lost`, `idle`, `sign-out`, `expired`, `deactivated`, `revoked`,
  `server-restarted`, `protocol-error` or `flood`.
- **FR-007**: A waiting session MUST end with `no-agent` after ten minutes. A connected session
  with no prompt, update or answer for thirty minutes MUST end with `idle`.
- **FR-008**: A session MUST end, before the next agent request is served, when the person closes
  the panel, ends it, signs out, the browser session expires, the person is deactivated, the
  connection is revoked, the relay is lost for longer than the grace period, or the agent exits.
  Nothing MUST resume after an end; a new session is needed.
- **FR-009**: Agent traffic MUST NOT extend the idle time of the person's browser session.

**Connection**

- **FR-010**: In local mode, the relay MUST authenticate with the installation's local capability
  and the session code. In server mode, it MUST authenticate with a connection credential that is
  created in the browser, is single use, expires, and is bound to the person, the session and the
  scopes shown. A credential or capability MUST NOT appear in a URL, a transcript, a log, an audit
  record, a panel text or a message to the agent.
- **FR-011**: A session code MUST be single use and expire with its waiting period. A wrong,
  reused or expired code and an unknown session MUST give the same answer.
- **FR-012**: The connection MUST carry the person's identity and the scopes of the connection. It
  MUST narrow what the person's roles allow and never widen it. Current grants MUST be checked on
  every request.
- **FR-013**: The workbench MUST NOT pass a credential, a token or the capability to the agent, and
  by default MUST NOT name any tool server in the session it creates for the agent. An agent may
  use its own connection to the workbench's MCP endpoint, authorized separately.
- **FR-014**: The relay MUST be a program the person runs. It MUST connect outward to the
  workbench and MUST NOT listen on any port.

**Conversation**

- **FR-015**: The person MUST be able to send a prompt of up to 100,000 bytes with attached links
  to files by workbench path. The workbench MUST NOT add file contents to a prompt.
- **FR-016**: The panel MUST show the agent's messages as they stream, the agent's reasoning text
  when it supplies it (labelled), the tools it reports using and the agent's own task list, in
  order. The task list MUST be named "the agent's task list" and never "plan".
- **FR-017**: All text from the agent MUST be shown as plain text. The panel MUST NOT interpret
  markup, load images or links, or run anything the agent sends.
- **FR-018**: The person MUST be able to cancel a running turn. Cancelling MUST answer every
  outstanding question as cancelled and tell the agent.
- **FR-019**: The workbench MUST NOT store the conversation. While a session lives, a bounded
  in-memory buffer MAY hold recent events so a reloaded tab can catch up; it MUST be dropped ten
  minutes after the session ends. When the buffer overflows, the panel MUST say that earlier
  messages are not kept.
- **FR-020**: Message text, prompt text and file text MUST NOT appear in the audit log, logs,
  telemetry or counters.

**Files**

- **FR-021**: The workbench MUST advertise to the agent exactly two client abilities: reading a
  text file and writing a text file. Any other request MUST be answered as unsupported and run
  nothing.
- **FR-022**: The agent MUST see files only under one virtual root, as `<root>/<project>/<path>`.
  A path of any other shape, with a `..` segment, a drive letter, a backslash, a control character
  or an encoded separator MUST be refused. A server or client file system path MUST NOT appear in
  any message to the agent.
- **FR-023**: A read MUST run the workbench's own read operation through the operation boundary as
  a caller with origin `acp`, return the authorized authoring bytes (limited by any requested
  line window and by the document size limit), and record the version returned in the session. A
  file the person may not read MUST answer as a file that does not exist.
- **FR-024**: A write MUST run in two steps through the boundary: obtain the current authorized
  version, then save through the guarded save with the version the agent last read in this
  session as its base. If the two differ, nothing MUST be saved.
- **FR-025**: A write to an existing file the agent has not read in this session MUST be refused
  with a message saying to read it first. A write to a path that does not exist MUST create it and
  MUST be refused if it exists by then.
- **FR-026**: Invalid text MUST NOT be saved; the findings MUST be returned. Content guards, base
  version checks and the person's unsaved drafts MUST behave as for the browser and for MCP. When
  a guard changes the saved text, the agent and the panel MUST be told the stored text.
- **FR-027**: A write repeated with the same text from the version already saved by this session
  MUST be answered as applied, and MUST NOT be saved twice or audited as a second change.
- **FR-028**: Each accepted or refused change MUST appear in the panel with its path, time and
  reason when refused, and for an accepted change a diff of before and after.
- **FR-029**: The person MUST be able to undo an accepted change. Undo MUST be an ordinary save
  from the version the agent wrote, and MUST report a conflict if the file has changed since.
- **FR-030**: The ACP surface MUST NOT offer commit, push, publish, delete, move, import, remote,
  administration or any plan, context or explanation operation.

**Questions from the agent**

- **FR-031**: A question from the agent MUST be shown with its options as plain text. The answer
  MUST be one of the options offered, or cancelled. A question unanswered for ten minutes, or open
  when the session ends or the turn is cancelled, MUST be answered as cancelled. No answer MUST
  widen the connection's authority.

**Authorization, audit and limits**

- **FR-032**: Every file operation MUST go through the operation boundary with a caller created
  only by authentication code, with origin `acp`, the connection id and the connection scope.
  There MUST be no second path that decides access.
- **FR-033**: The origin `acp` MUST be accepted wherever `http` and `mcp` are: the audit record,
  its filters, the JSON and CSV export (existing columns keep their order), operation metrics labels, the dry-run
  sample and the operation inventory. Old records MUST remain valid and verifiable.
- **FR-034**: Session start, session end with its reason, each operation and each refusal MUST be
  audited once, with the connection id and without content. Refused connection attempts MUST be
  audited through the existing rate-limited anonymous gate.
- **FR-035**: The workbench MUST bound the agent: calls per second and calls at once per person, a
  frame size cap, a file size cap, a cap on pending questions, and an end of the session for
  sustained flooding or repeated oversize frames.
- **FR-036**: Frames MUST be numbered in each direction and acknowledged, so that a brief loss of
  the relay connection loses nothing and repeats nothing. A frame that does not parse, or that
  does not match the pinned protocol schema, MUST be refused without effect.

**Interface**

- **FR-037**: The panel MUST use the workbench's present visual design: its colour tokens, type,
  spacing, panels, buttons and dialogs, in light and dark, at desktop, tablet and phone width.
- **FR-038**: The panel MUST have designed empty, waiting, connecting, loading, error, ended,
  permission and long-text states. No text MUST be clipped, cut or ended with an ellipsis. Long
  paths, messages, options and diffs MUST wrap or scroll within their container.
- **FR-039**: All controls MUST be reachable and named for keyboard and assistive technology.
  New agent messages MUST be announced politely; a question MUST take focus.
- **FR-040**: Opening the panel MUST NOT change anything outside the panel's own area except the
  width given to it, and closing it MUST restore the earlier layout exactly.

**Documentation and honesty**

- **FR-041**: The README, the configuration guide, the architecture map and a new panel guide MUST
  state what the panel does and does not do, the content statement, the lifetime rules and which
  agents were tested. Compatibility MUST be claimed only for agents that were tested.

### Key Entities

- **Panel session**: one conversation connection of one person. State, reason, agent name,
  scopes, connection id, creation and last activity times. Never stored on disk.
- **Relay link**: the authenticated channel between one relay and one session, with frame numbers
  in both directions.
- **Frame**: one protocol message in either direction.
- **File version record**: for one path in one session, the version the agent last read or wrote.
- **Change card**: one accepted or refused write, with before and after text for accepted ones.
- **Pending question**: a permission question from the agent, with options, age and answer.
- **Event buffer**: the bounded in-memory list of panel events for catch-up.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every file case in User Story 3 and FR-022 to FR-027, the answer through the
  panel equals the answer of the ordinary operation for the same person and file, in a table of
  at least 30 cases, except for the translation into the protocol's error form.
- **SC-002**: 100% of hostile requests in User Story 7 (at least 40 cases) leave the data
  root, Git and the audit log unchanged except for the denial records.
- **SC-003**: A search of the source finds no code that decides file access for an ACP request
  outside the operation boundary, and no import of MCP protocol serialization by the panel code.
- **SC-004**: With the panel never opened, the characterization and screenshot comparison of every
  existing screen shows zero differences, and a network log shows zero panel requests.
- **SC-005**: Every one of the thirteen session end reasons is produced by a test, and after each
  the next agent request is refused.
- **SC-006**: A relay that drops and reconnects 100 times in a run loses no frame and repeats no
  write (checked by counting saved versions).
- **SC-007**: No secret (capability, credential, session code after use) is found in any panel
  text, URL, log line, audit record or transcript across the whole test run.
- **SC-008**: Every state of the panel at 360, 768 and 1280 pixels width, light and dark, shows no
  clipped text, no ellipsis and no horizontal page scroll in the geometry assertions.
- **SC-009**: A message of 1,000,000 characters is readable in full and scrolls without blocking
  typing for more than 100 ms in the browser check (chosen here; measured on the dev server).
- **SC-010**: Every mutant in the plan's list is detected by the mutation suite.
- **SC-011**: The audit log with the origin filter `acp` returns exactly the records of a recorded
  session, and months written before this feature verify unchanged.
- **SC-012**: The new documentation passes the repository's checks and names no behaviour that is
  not covered by a test.

## Assumptions

- The protocol revision, the exact names of its methods and fields and its published schema are
  verified in the first research task and pinned there. This specification is written in
  protocol-neutral words so that the verification can change names, not requirements.
- The agent speaks the protocol over the standard input and output of a program the relay runs.
  Agents that only offer a network transport are not covered by this feature.
- The features that supply connections in server mode (013) and the MCP server in local mode (006)
  exist when the panel is released. Without them the panel is not offered.
- Item addresses and Tessera types are not needed: the panel works on files and paths.
- The agent's reasoning text and task list are agent-supplied and are not workbench plans.
- Reads show authoring content (the person's working copy), exactly like the browser editor.
- One reference agent that is scripted for tests is the only agent whose behaviour is promised.
  Named real agents are listed only after an acceptance run records their exact versions.

## Decisions made while specifying

Each follows the decisions file and chooses the most conservative reading where it is silent.

1. **The ACP surface has only file read and file write.** Choice: no commit, push, publish, plan
   or context request exists in it. Reason: M19 forbids an unrestricted editor shortcut; commits
   and plans already have guarded paths in MCP, which a person-authorized agent can use. Follows
   M19, M1, E5.
2. **The agent's own MCP connection is separate.** Choice: the workbench passes no credential and
   no tool server to the agent. Reason: handing a token through the protocol would create a
   second way to obtain a connection and would put it in the agent's configuration. Follows M2,
   M4.
3. **Write base is the version read in this session.** Choice: a write needs a prior read; a new
   file uses create semantics. Reason: the protocol's write request carries no base version, and
   M19 says the panel must first obtain the current version and then use guarded save. Using the
   current version as the base would silently overwrite a change made after the agent read. Follows
   M19, M12, Fable review section 5.
4. **Virtual file paths.** Choice: one virtual root and `<project>/<path>`. Reason: Astra finding
   14 forbids assuming the agent shares the server's file system. Follows M19.
5. **Transcript not stored.** Choice: a bounded in-memory buffer for catch-up only, dropped ten
   minutes after the end. Reason: messages contain definitions; the constitution keeps content out
   of audit and logs and says unpublished work stays in the workbench. The decisions are silent
   on storage.
6. **One active session per person.** Reason: simplest to bound and to revoke; the decisions are
   silent. Easy to raise later.
7. **Origin `acp` is a new origin, and each session has its own connection id.** Reason: M10
   records origin and connection in audit; 010 deferred `acp` until its first caller.
8. **Panel entry is the person menu.** Reason: leaves every default screen unchanged (R2, UI
   regression gate).
9. **No separate on/off switch.** The panel is offered when its prerequisites (006 locally, 013 on
   a server) exist. Reason: fewer settings; the closed default already keeps it off.
10. **Undo is an ordinary save, not a new operation.** Reason: one guarded path (M1).
11. **Relay carries frames; the workbench is the only protocol client.** Reason: a browser cannot
    reach an agent process and the workbench must not launch one (M19).
12. **No commit button in the panel.** The person commits with the existing commit dialog.

### Gaps and contradictions found in the decisions file

- **Gap**: no decision names the ACP revision, transport, or how the agent reaches the workbench.
  The evaluation documents do not discuss ACP; the Fable review marks its protocol details "not
  verified". Handled by the research task and the relay.
- **Tension**: M19 says "the person starts an external agent, which connects to the workbench" and
  also that the panel is a client of the protocol. In the protocol the client normally starts the
  agent. The relay resolves it: the person starts the agent through the relay.
- **Gap**: E5 forbids unpublished plans for every agent. An agent that reads a draft file and
  reasons about it itself is outside the workbench's control; the README must say so (consistent
  with M11).
- **Gap**: M5 says traffic does not extend browser idle time, but M13 requires idempotency keys
  for nonrepeatable operations. The panel's writes are precondition-protected (repeatable), so no
  key is needed; this holds only while commit stays out of the surface.
- **Gap**: M3 requires registered clients. A relay is a client; whether it needs a registration
  entry is not stated (see Dependencies).

## Dependencies

- **006 (MCP server, not on this base).** Needed: the twin dispatcher, the guarded save semantics
  and `validate_text`, the local capability file, and the call limits. ACP does not import MCP
  protocol code. Local mode needs 006 only.
- **013 (person sign-in).** Needed for server mode: the browser-created single-use credential,
  connection tokens bound to the browser session, connection scopes, revocation signals. Without
  013 the panel is local mode only.
- **Tessera format types (011).** None. The panel handles files, not items.
- **012 (shared proposals).** None required. A person's authoring branch may be a proposal
  contribution branch; the panel reads and writes what the ordinary operations do.
- **014 (usage counters).** None required. Counters may count operations from origin `acp` once
  both exist; 014 owns that.
- **010 (operation boundary, on this base).** Used as is, plus the new origin.

## Out of Scope

- Starting or supervising an agent from the workbench; a terminal; any raw file access.
- Commit, push, publish, delete, move, import, administration and remote operations through the
  protocol.
- Planning, context and explanation through the protocol.
- Storing, searching or exporting conversations; sharing a session between people.
- Agents that offer only a network transport; several agents at once; resuming an agent after the
  relay is lost.
- Passing the workbench's MCP endpoint to an agent automatically.
- Terminal, image, audio and embedded-resource content from the agent (shown as placeholders).
- Counters, importing query counts and anything about Tessera.
