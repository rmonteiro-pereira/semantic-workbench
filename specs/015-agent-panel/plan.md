# Implementation Plan: Agent Panel

**Branch**: `015-agent-panel` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-agent-panel/spec.md`

## Summary

The workbench server becomes the client of the Agent Client Protocol for one panel session per
person. A new server folder, `src/server/acp/`, holds the protocol frames, the session store, the
file requests and the relay endpoints. File requests become twin requests that run through the
010 operation boundary as a caller with origin `acp`; nothing else decides access. A person-run
relay script hosts the agent on the person's machine and carries numbered frames to the server over
HTTP and server-sent events. A new browser folder, `src/app/agent/`, shows the panel, opened from
the person menu, in the current visual design. Origin `acp` is added wherever `http` and `mcp` are.
No operation is added to the agent-facing surface: the plan, context and commit operations stay
with MCP.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server, relay script); React 19 (panel).

**Primary Dependencies**: none new. `ajv` (existing) validates frames against a pinned protocol
schema file added to `schemas/`. Gate in research R2: if the verified subset is larger than 15
methods or no schema file exists, the official SDK is considered and justified in this plan before
use.

**Storage**: none. Sessions, version records and the event buffer are in memory only (data-model).

**Testing**: `bun test tests/acp/` (frames, session, file parity, hostile requests, end reasons,
buffer), `tests/auth/audit-origin.test.ts` extended, `tests/auth/operation-parity.test.ts`
extended with the `acp` origin, component tests for the panel, one browser check
(`scripts/acp-browser-check.ts`, script `test:acp`), mutants (`scripts/acp-mutants.ts`).

**Target Platform**: local mode (needs 006) and server mode (needs 013). Single instance per data
root, as the constitution requires.

**Project Type**: web service plus single-page app plus one person-run script.

**Performance Goals** (chosen here, to be measured and recorded; not derived from a measurement):
a file read request answers within 50 ms plus the ordinary read on the test fixture; the panel
renders a 1,000,000-character message and stays interactive (no input delay over 100 ms) on the
dev server's browser run; a relay drop and reconnect costs no more than one second of agent output
delay.

**Constraints**: every file operation through the boundary; no new route decides access; no
content in audit, logs, telemetry; text never clipped; files of about 400 lines, functions of about
40; no protocol serialization imported from `src/server/mcp/`.

**Scale/Scope**: one session per person; tens of people; frames of at most 1 MiB.

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | The workbench makes no model call and starts no agent. The relay connects outward from the person's machine; the server adds no outbound call. Local mode: the relay authenticates with the per-installation capability, Host and Origin rules hold. Server mode: only a connection credential created in the browser and bound to the person, session and scopes; the relay routes answer without a principal only in the sense that they authenticate by credential (013 declares them in its list of unauthenticated-by-session endpoints; 015 adds none of its own). The content statement of M11 is shown in the panel and the README. Content given to the agent may reach its model provider; stated. Published-only planning holds: the surface has no plan or context request. **No amendment needed**; if 013 names the relay routes as a new class of endpoint, the amendment is 013's. |
| II. Byte-Exact Source Preservation | A write goes through the ordinary save, which keeps untouched bytes; a guard rewrite is reported, never hidden. The panel never rewrites a source. |
| III. One Validation Rule Set | Write validation is the save route's. No panel-side validation. |
| IV. Atomic, Hash-Checked File Persistence | Every write carries a base version; stale writes are refused. No new durable state. Idempotency: file writes are precondition-protected; commit is outside the surface. |
| V. Pinned Official Standards | The protocol schema is a pinned copy in `schemas/` with its source commit recorded and a hash test; labelled as an external protocol, not a definition standard. |
| VI. Verification Gate | New decision logic (path check, version check, state machine, flood rule, origin handling) gets mutants in `scripts/acp-mutants.ts`. The operation boundary parity table gains `acp` cases. UI work has geometry assertions in the browser check. The batch gate runs once, after integration. |
| VII. Honest Claims | The README says: no model call; the agent may forward content; the panel is not a sandbox against the person's own agent; only tested agents are named. |
| VIII. Readable Code | One module per concept in `src/server/acp/`; functions near 40 lines; comments say why; no IDs in comments. |
| Technical Constraints | Every operation goes through the one boundary; no transport decides access. No new runtime dependency. Single instance. 2,000,000-byte document limit applied to reads and writes. |
| Development Workflow | Per task: its own tests, `bun --bun run check`, `bun --bun run build`. The full gate and architecture review run once on the integrated batch. |

Complexity Tracking is empty: no pattern is added without its problem (see below).

## Design

### The server modules

| Module | Concept | Holds |
|---|---|---|
| `src/server/acp/protocol-schema.ts` | The pinned protocol | loads `schemas/acp-<revision>.json`, builds validators for each frame kind |
| `src/server/acp/jsonrpc-connection.ts` | One JSON-RPC conversation | request ids, pending replies, notifications, size cap, schema refusal |
| `src/server/acp/frame-link.ts` | Numbered, acknowledged delivery | sequence numbers, replay buffer, duplicate drop, heartbeat clock |
| `src/server/acp/panel-session.ts` | A session's state machine | states, end reasons, timers (pure transitions, clock passed in) |
| `src/server/acp/session-store.ts` | Who owns which session | create, find by owner, replace, end, expiry sweep, one per person |
| `src/server/acp/virtual-path.ts` | The agent's view of file names | parse and format `/workbench/<project>/<path>`; pure |
| `src/server/acp/file-requests.ts` | Reading and writing for the agent | builds twin requests, calls the boundary, version records, answers |
| `src/server/acp/client-surface.ts` | What the client answers | maps each agent request to a file request, a question, an update, or "unsupported" |
| `src/server/acp/event-buffer.ts` | Catch-up for a reloaded tab | bounded ring buffer of panel events |
| `src/server/acp/panel-events.ts` | What the browser receives | event types and the plain-text normalization of agent content |
| `src/server/acp/flood-guard.ts` | Bounding the agent | call limits (006 settings), oversize and flood rules |
| `src/server/acp/connection-auth.ts` | Turning a relay request into a caller | local capability check; server mode through 013's authenticator; mints the `acp` caller |
| `src/server/routes/acp-panel.ts` | Browser routes | create, events, prompt, cancel, answer, end |
| `src/server/routes/acp-relay.ts` | Relay routes | hello, frames, stream, bye |

`src/server/acp/` imports from `src/server/auth/` (`caller`, `operation-boundary`,
`twin-request`, `operation-inventory`) and, from 006, only `local-capability.ts` and the call-limit
settings. A scan test (extending 010's `tests/auth/boundary-scan.test.ts`) fails when `acp/`
imports any other `src/server/mcp/` module, or when code outside the boundary builds a scope.

### Flow of one file request

1. The agent's frame arrives at `acp-relay.ts` and is acknowledged by number.
2. `jsonrpc-connection.ts` validates it against the pinned schema. A bad frame is refused.
3. `client-surface.ts` selects the handler by method. An unknown method answers "unsupported".
4. `file-requests.ts` parses the virtual path, checks flood limits, then builds a twin request with
   `buildTwinRequest('files.read', ...)` and calls `boundary.operate({ caller, request })`. For a
   write it does the second read, the version comparison, then `files.save`.
5. The boundary authorizes, runs the handler, audits once with origin `acp` and the connection id.
6. The answer is translated to the protocol's result or error and returned through the link; a
   change card is added to the event buffer.

### Flow of the browser

1. Person menu: **Agent panel** opens `src/app/agent/AgentPanel.tsx`.
2. **Start session** posts to `/api/acp/sessions`; the panel shows the code and the command.
3. `useAgentSession` opens the event stream and reduces events with `agent-events.ts`.
4. Prompts, answers, cancel and end are posts. Undo posts the ordinary save from
   `src/app/projects/api.ts` with the card's version.

### Origin `acp`

Files to change (one task each): `src/shared/observability/operation.ts` (vocabulary),
`src/server/auth/audit.ts` (accepted origins, filter), `src/server/routes/audit.ts` (query
validation), `src/server/auth/operation-inventory.ts` (reads the vocabulary; check),
`src/server/auth/operation-boundary.ts` (origin passes through to audit and metrics; check no
`=== 'mcp'` test), `src/server/observability/metrics.ts` (label value), `src/server/auth/replay-sample.ts`
(already treats every non-`http` origin as a read stratum; add a test only),
`src/app/admin/AuditSection.tsx` and `src/app/admin/types.ts` (filter option), tests listed in
tasks, `specs/003-authn-authz/contracts/audit-log.md` and `docs/audit-tamper-evidence.md` (text).

### Patterns used

- **State machine** (`panel-session.ts`): problem, thirteen end reasons and timers must be tested
  without a network.
- **Adapter** (`client-surface.ts`): problem, protocol requests must reach operations without the
  operations knowing the protocol.
- **Ring buffer** (`event-buffer.ts`): problem, a bounded catch-up with a visible overflow notice.

No other pattern is introduced.

### The interface

The panel is a right-hand sheet beside the canvas on windows 1100 px and wider, and a full-height
sheet on narrower windows (`NARROW_SCREEN_PX` in `src/app/workspace/hooks/useNarrowScreen.ts`). It
uses theme tokens from `src/shared/theme/theme.css` only (`--color-surface`, `-border`, `-text`,
`-text-secondary`, `-accent`, `-accent-soft`, `-danger*`, `-warning*`, `-success`), the shared
`Modal` for the connect step, `MenuButton` for the person menu item and the existing diff
component (`src/app/scm/DiffView.tsx`) for change cards.

| State | What is shown |
|---|---|
| Closed | nothing; no request |
| Connect step | the statement, the scopes, **Start session**, **Cancel**; if a session is active, a confirmation to replace it |
| Waiting | the code, the command in a selectable block with **Copy**, a countdown in words ("expires in 9 minutes"), **End session** |
| Connecting | "Starting the conversation" with a status role |
| Connected, empty | the agent's name, a short note on what it can do, the prompt box |
| Working | messages stream; **Cancel turn** |
| Question | a card above the prompt box; focus moves to its first option |
| Error | a sentence naming what failed and what to do, with **Try again** or **Start a new session** |
| Ended | the reason in words, **Start a new session**, the transcript still readable until the panel closes |
| Long text | messages, paths, options, task entries and diffs wrap; the transcript scrolls; code blocks scroll horizontally inside their own box |

No text is clipped or shortened with an ellipsis (skill `text-never-clips`): no `text-overflow`,
no `line-clamp`, no fixed-width label. Paths break at separators with `overflow-wrap:anywhere`.
Phone width: 360 px, 16 px side gutters, the prompt box docked at the bottom above the keyboard,
buttons at least 44 px tall. Light and dark come from the tokens. Agent messages announce through a
polite live region once per completed message; a question uses an alert role and takes focus.

### Closed by default, and how it is proven

The only change visible without opening the panel is one more item in the person menu. The panel
module is loaded lazily on first open, so the main bundle and the default screens do not change.
`test:acp -- --closed-only` fails on any request to `/api/acp/`. The batch UI regression gate
compares every existing screen with the last release; the only permitted difference is the menu
item when the menu is open.

## Defaults and where they come from

None came from a measurement. "Existing" means the value equals a constant already in the
repository or in a decision; "assumed" means chosen here and changeable without changing a
requirement.

| Name | Default | Source |
|---|---|---|
| Waiting period for the agent | 10 minutes | assumed; long enough to open a terminal |
| Idle limit of a connected session | 30 minutes | assumed |
| Relay heartbeat / grace | 15 s / 45 s | assumed; three missed heartbeats |
| Ended-session buffer retention | 10 minutes | assumed |
| Event buffer | 500 events and 4 MiB | assumed |
| Frame cap | 1,048,576 bytes | assumed; far above 006's 32,768-byte result text, far below the document limit times two |
| Replay buffer to the relay | 256 frames or 4 MiB | assumed |
| Document read and write cap | 2,000,000 bytes | existing: the constitution's document limit |
| Prompt text | 100,000 bytes, 20 files | assumed |
| Pending questions | 5, answered or cancelled after 10 minutes | assumed |
| Options per question | 8 | assumed |
| Version records per session | 2,000 | assumed |
| Calls per second per person | 20, burst 40 | existing: 006's default call limits |
| Concurrent calls per person | 4 | existing: 006's default call limits |
| Call deadline | 30 seconds | existing: 006's default call limits |
| Flood end rule | 5 s above the burst limit; 2 oversize frames in a row | assumed |
| Active sessions per person | 1 | assumed; conservative |
| Session code | 8 characters, 31-letter alphabet without look-alikes, about 40 bits, single use, 10 minutes | assumed; the code is only a binding, the credential carries the authority |
| Server-mode credential lifetime | 10 minutes | assumed; 013 owns the final value |
| Virtual root | `/workbench` | assumed |
| Path length | 1,024 bytes | assumed |
| Agent name length | 200 characters | assumed |
| Message performance | 1,000,000 characters, 100 ms input delay | assumed; measured on the dev server and recorded |

## Project Structure

### Documentation (this feature)

```text
specs/015-agent-panel/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── acp-client-surface.md
│   ├── relay-connection.md
│   └── panel-api.md
├── checklists/requirements.md
├── checklists/analysis.md
└── tasks.md
```

### Source Code (repository root)

```text
schemas/acp-<revision>.json                  # new: pinned protocol schema (revision set by T001)
src/server/acp/                              # new folder, see the module table
src/server/routes/acp-panel.ts               # new
src/server/routes/acp-relay.ts               # new
scripts/acp-relay.ts                         # new: the person-run relay
scripts/acp-reference-agent.ts               # new: scripted test agent
scripts/acp-browser-check.ts                 # new
scripts/acp-mutants.ts, scripts/acp-mutation-cases.ts   # new
src/app/agent/                               # new: AgentPanel.tsx, AgentPanel.css, ConnectStep.tsx,
                                             #   WaitingStep.tsx, Transcript.tsx, MessageBlock.tsx,
                                             #   ChangeCard.tsx, QuestionCard.tsx, TaskList.tsx,
                                             #   PromptBox.tsx, SessionNotice.tsx,
                                             #   useAgentSession.ts, agent-events.ts, agent-api.ts
tests/acp/                                   # new: see tasks
docs/agent-panel.md                          # new guide
```

**Structure Decision**: all protocol and session code sits in one new folder, `src/server/acp/`,
one module per concept; the browser code sits in `src/app/agent/`. Existing folders change only
where a vocabulary or a route table must learn `acp`.

## Files this feature owns

`src/server/acp/*`, `src/server/routes/acp-panel.ts`, `src/server/routes/acp-relay.ts`,
`src/app/agent/*`, `schemas/acp-*.json`, `scripts/acp-*.ts`, `tests/acp/*`, `docs/agent-panel.md`,
`specs/015-agent-panel/*`.

## Shared files it touches

| File | Change | Also touched by |
|---|---|---|
| `src/shared/observability/operation.ts` | add `acp` to `CALLER_ORIGINS` | none expected; 013 and 014 read it |
| `src/server/auth/audit.ts`, `src/server/routes/audit.ts` | accept and filter origin `acp` | 013 (connection fields) |
| `src/app/admin/AuditSection.tsx`, `src/app/admin/types.ts` | filter option `acp` | 013 (connections list in Admin) |
| `src/server/auth/operation-boundary.ts` | only if a literal `mcp` test exists; a test, no behaviour | 014 (counter hook) |
| `src/server/observability/metrics.ts` | origin label | 014 (maybe) |
| `src/server/auth/route-actions.ts` | rows for 10 acp routes, one contiguous block | 012, 013, 014 |
| `policies/operation-inventory.json`, `schemas/semantic-workbench-operations-v1.json` | 10 entries (exposure `never`); schema unchanged unless a dispatch reason is needed | 012, 013, 014 |
| `policies/matrix-cases.json` | cases for the acp routes | 012, 013, 014 |
| `docs/operations.md` | regenerated | all |
| `src/server/handler.ts` | mount the two route groups and the session store | 013, 014, 006, 012 |
| `src/server/config.ts` + `docs/configuration.md` | none planned (no setting) | 013, 014 |
| `src/server/auth/request-authentication.ts`, `middleware.ts` | the relay paths carry their own authentication; one path rule | 013 (owner) |
| `src/server/mcp/` (006) | read-only use of the capability reader and call limits | 006, 013 |
| `src/app/auth/PersonMenu.tsx` | one menu item | 013 (connections item), 012 maybe |
| `src/app/main.tsx` | mount the lazy panel | 012, 014 (UI shell) |
| `src/app/workspace/WorkspaceCanvas.tsx` | place for the sheet | 012, 014 |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/development.md`, `docs/server-mode.md`, `docs/user-guide.md` | sections for the panel | all |
| `package.json` | scripts `test:acp`, `acp:relay` | all |
| `scripts/gate-suites.ts`, `scripts/ci-validate.ts`, `scripts/mutation-tests.ts`, `scripts/mutation-case.ts` | register suite and mutants | all |
| `tests/auth/boundary-scan.test.ts`, `tests/auth/operation-parity.test.ts`, `tests/auth/audit-origin.test.ts` | `acp` cases | 006, 013 |
| `specs/003-authn-authz/contracts/audit-log.md`, `docs/audit-tamper-evidence.md` | origin list text | none |

## Overlaps with the other features

- **013 sign-in.** Largest overlap. 013 owns connections, credentials, scopes, revocation, the
  Admin connection list and the bearer path rules in the request stage. 015 only consumes them
  through `contracts/relay-connection.md`. Both add routes to `route-actions.ts` and entries to the
  inventory: each appends one contiguous block. The relay needs a registered client (013's M3);
  the two plans must agree on whether it is built in.
- **014 usage counters.** 014 hooks `operation-boundary.ts` and counts by origin; 015 adds the
  origin. If 014 merges first and keeps an origin list, it must accept `acp`.
- **012 shared proposals.** Both touch `main.tsx`/`WorkspaceCanvas.tsx` and `PersonMenu.tsx`
  nowhere in the same lines; they conflict only in the shared inventory files and docs.
- **006.** Not on this base. Local mode and the guarded save need it. 015 reads 006's capability
  reader and call limits but changes none of its files.
- **010 (on this base).** `tests/auth/boundary-scan.test.ts` and the parity test are extended.

## Agreement with 013

013 keeps its connection record transport-neutral: it carries an origin, `mcp` or `acp`, set by the
creator. The relay is an ordinary registered program (013, M3); the Admin registers it from the
configuration this feature documents, and no program is built in. 015 calls `createConnectionForSession`
with the relay program, the named scopes `read` and `edit` (effects `read` and `localWrite`) and the origin `acp`, resolves the relay's
credential through 013's `resolve`, and subscribes with `onConnectionEnded`. If 013's names differ at
implementation, the contract in `contracts/relay-connection.md` is what 013 must provide.

The joined contract uses `createConnectionForSession({ session, clientId, scopes, origin })`
with named scopes `read` and `edit`, not effect names or a panel session id. The relay exchanges
the returned setup credential at the token endpoint, then `resolve` preserves origin `acp`.
The panel binds the connection at authenticated hello and subscribes to `onConnectionEnded`.
Both transports reject tokens of the other origin; receipts keep person/connection ownership
and current authorization. The MCP route contract classifies browser panel and ACP transport
rows without exposing new MCP tools. This reconciles the older relay contract’s panel-id/effect wording
with the transport-neutral service instead of adding a second connection API.

## Buildable now, needs 006, needs 013

| Part | Needs |
|---|---|
| Origin `acp` everywhere, audit, filters, metrics | this base |
| Virtual paths, frame link, JSON-RPC subset, schema, session state machine, event buffer, flood guard | this base |
| Panel UI against a mocked API; reference agent | this base |
| File requests through the boundary with `files.read` and `files.save` twins | this base (010 twins); `validate` twin and the exact guarded-save semantics from 006 |
| Relay and routes in local mode | 006 (capability file) |
| Relay and routes in server mode | 013 (credential, authenticator, revocation) |

## Delivery phases (tasks.md splits them)

1. **Verify and pin** the protocol; write the schema file and the reference agent.
2. **Origin** `acp` in vocabulary, audit and metrics.
3. **Frames and sessions**: link, connection, state machine, store, buffer.
4. **File requests** and the client surface.
5. **Relay and routes** in local mode; then server mode when 013 exists.
6. **Panel**: components, states, browser check.
7. **Docs, mutants, hand-off to the batch gate.**

## Complexity Tracking

No violations.
