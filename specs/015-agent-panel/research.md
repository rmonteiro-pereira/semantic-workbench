# Research: Agent Panel

Each entry gives the decision, the evidence at the base commit, and what was rejected. The
governing decisions (M19, M1) are not reopened. Items marked **verify** are facts about the Agent
Client Protocol that this document cannot establish offline; task T001 checks each against the
published protocol schema and records the answer in `docs/agent-panel.md` ("Protocol record").

## R1. What must be verified about the protocol before code

**Verify** (from memory only; the Fable review marks them "not verified"):

1. The current protocol revision and whether it is stable enough to pin.
2. The transport the protocol defines (newline-delimited JSON-RPC 2.0 over an agent's standard
   input and output), and whether a network transport is defined. The plan assumes only the first.
3. The agent-to-client requests: reading a text file, writing a text file, asking the person's
   permission, and terminal requests. Their parameter names (path, line window, content) and
   whether the path is required to be absolute.
4. The client-to-agent calls: initialize with capability exchange, creating a session (with a
   working directory and an optional list of tool servers), sending a prompt, cancelling, and the
   notification of session updates (message pieces, reasoning pieces, tool activity, the agent's
   own task list).
5. Whether a write request carries a base version (the reviews say it does not).
6. The set of content kinds an agent may send, and how each is labelled.
7. Whether the protocol publishes a JSON Schema file, and its licence.

**Decision.** Until verified, requirements say "read a text file", "write a text file", "ask a
question", "session update". If verification disagrees with a plan assumption, the plan changes,
not the specification, unless item 5 differs (a write that carries a base version would let the
workbench use it; the conservative rule of FR-024 still stands).

### R1 verified record (2026-11-17)

Sources, all from the protocol's own repository `agentclientprotocol/agent-client-protocol`
(Apache-2.0) and its published documentation: the release `schema-v1.32.0` (published
2026-11-14, tag object `3d911e0c126ecc71e5872e38212e4a7345f36aed`) with its `schema.json` and
`meta.json`; the documentation pages under `docs/protocol/v1/` (`transports`, `file-system`,
`prompt-turn`, `cancellation`, `session-setup`, `security`).

1. **Revision.** Protocol version `1` is the stable line; its schema release is `1.32.0`. A
   `schema/v2` line exists as pre-release (`2.0.0-alpha.16`) and is not pinned. Pin: v1, release
   1.32.0, `schema.json` sha-256 `e747a7be...ae21` (full value in `docs/agent-panel.md`).
2. **Transport.** One transport is defined: stdio. The client launches the agent as a subprocess,
   messages are UTF-8 JSON-RPC, one per line, with no embedded newline; the agent must write only
   protocol messages to stdout. A Streamable HTTP transport is only an RFD. Custom transports are
   allowed if they keep the message format and lifecycle. So the workbench never launches
   anything; the person-run relay performs the launch and the stdio piping, and the workbench is
   the client at the other end of a custom (HTTP) transport carrying the same messages.
3. **Agent to client requests.** `fs/read_text_file` (`sessionId`, `path` absolute, optional
   `line` 1-based, optional `limit` in lines; answers `content`), `fs/write_text_file`
   (`sessionId`, `path` absolute, `content`; the client must create a missing file; answers
   empty), `session/request_permission` (`sessionId`, `toolCall`, `options` each with
   `optionId`, `name`, `kind`; answers `outcome` of `cancelled` or `selected` with `optionId`),
   `terminal/create`, `terminal/output`, `terminal/release`, `terminal/wait_for_exit`,
   `terminal/kill` and `elicitation/create` (all answered "method not found" here). The file
   methods exist only when the client advertised `fs.readTextFile` and `fs.writeTextFile`; the
   terminal only when `terminal` is true (default false).
4. **Client to agent calls.** `initialize` (`protocolVersion: 1`, `clientCapabilities`,
   `clientInfo`), `authenticate` (only if the agent lists auth methods; not offered), `session/new`
   (`cwd` absolute, `mcpServers` required, may be empty), `session/prompt` (`sessionId`, `prompt`
   as a list of content blocks; answers `stopReason`: `end_turn`, `max_tokens`,
   `max_turn_requests`, `refusal`, `cancelled`), `session/cancel` (notification). Notifications
   from the agent: `session/update` with kinds `user_message_chunk`, `agent_message_chunk`,
   `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan` (entries with `content`,
   `priority`, `status`: the agent's task list), `available_commands_update`,
   `current_mode_update`, `config_option_update`, `session_info_update`, `usage_update`, `notice`,
   `compaction_update`, `compaction_summary_chunk`. Also `$/cancel_request`.
5. **Write base version.** `fs/write_text_file` carries no base version. The plan's rule stands:
   the workbench keeps the version the agent read.
6. **Content kinds.** `text`, `image`, `audio`, `resource_link`, `resource` (embedded text or
   blob). Tool call content adds `content`, `diff`, `terminal`. Only text is shown; the others
   become a notice naming the kind and size.
7. **Schema file and licence.** One JSON Schema (draft 2020-12) in the release and in the
   repository at `schema/v1/schema.json`, with `meta.json` listing method names. Licence
   Apache-2.0. It is one union document with 183 definitions; each frame is validated through a
   `$ref` to a definition. It uses `x-` keywords, so the validator runs with strict mode off,
   as `scripts/compile-schemas.ts` already does.
8. **Cancellation.** When the client sends `session/cancel` it must answer every pending
   permission request with `cancelled`; the agent then answers the prompt with stop reason
   `cancelled`. The plan's rule (cancel questions on turn cancel) is therefore required.
9. **Batches.** The protocol text mentions no JSON-RPC batch. Batches are refused.
10. **Trust.** The security page says ACP does not sandbox the agent, permission requests are
    advisory, `agentInfo` is self-reported, and agent text must be treated as untrusted and shown
    without running scripts or fetching links. This matches the plan.
11. **Size of the used subset.** Four calls, one notification family and two file requests plus
    the permission request: well under 15. The hand-written subset stands (R2 gate passes: a
    schema file exists).

Effect on the plan and contracts: method names are now fixed in the contract; the contract also
states the cancel rule, the answer for an agent that asks for authentication, and the handling of
`line` (1-based). No requirement changes.

## R2. SDK or a small hand-written subset

**Evidence.** The repository has no JSON-RPC or ACP library. The constitution requires new
runtime dependencies to be justified by bundle size, licence and maintenance (Technical
Constraints). `ajv` is already a dependency and validates the operation inventory.

**Decision.** Write a minimal JSON-RPC 2.0 subset in `src/server/acp/` and validate every frame
against a pinned copy of the protocol's published schema in `schemas/` (Principle V: a pinned
official schema with its source recorded). The subset is about 6 requests and 3 notifications.
This adds no dependency and keeps the server in control of limits and ordering.

**Gate.** If T001 finds the used subset is larger than 15 methods, or the schema file does not
exist, the plan switches to the official TypeScript SDK after a justification section is added to
`plan.md` (size, licence, maintenance, no network calls at runtime). The rest of the plan does not
change: the SDK would sit behind `src/server/acp/jsonrpc-connection.ts`.

**Rejected.** The SDK first: it would add a dependency before the need is shown and would bring
its own transport assumptions (child processes), which this feature must not use.

## R3. How the agent reaches the workbench

**Evidence.** A browser cannot start or talk to an agent process. The decisions say the person
starts the agent and the agent connects to the workbench (M19), and do not allow the workbench to
launch anything. Astra finding 14: "Do not assume the future agent is a child process or can
access server filesystem paths". The MCP release already ships a person-run bridge
(`scripts/mcp-stdio.ts`, from 006) that reads the local capability and forwards messages.

**Decision.** A person-run **relay** (`scripts/acp-relay.ts`) starts the agent command the person
gives it, speaks the protocol with it over standard input and output, and forwards each frame to
the workbench over HTTP. It never listens on a port, holds no workbench file, and sees every frame
(the person runs it, so this is their own machine).

**Rejected.**
- *The workbench spawns the agent* (Fable section 5): forbidden by M19 and by the "no agent launch"
  boundary.
- *The agent connects directly to the workbench over a network transport*: depends on a transport
  that item 2 of R1 may not provide and agents may not implement.
- *A browser extension or native messaging*: a new installable and a larger attack surface.

## R4. Transport between relay and workbench

**Evidence.** The server already serves server-sent events (`src/server/routes/events.ts`) and
reads bounded JSON bodies (`src/server/request.ts`). There is no WebSocket code anywhere
(`grep -ri websocket src` is empty). Server mode runs one instance per data root.

**Decision.** Two requests per direction: the relay posts numbered frames in batches
(`POST .../relay/frames`), and receives the workbench's numbered frames over a server-sent event
stream (`GET .../relay/stream`) with `Last-Event-ID` to resume. The panel in the browser uses the
same pair of shapes with its own session routes. Frames are acknowledged by number; a
retransmitted number is dropped.

**Rejected.**
- *WebSocket*: a new transport, new origin and upgrade handling, and a new place where the
  cross-site checks could be missed.
- *Long polling*: more requests, no benefit over server-sent events.

## R5. Where the client logic runs

**Decision.** On the server. The workbench's file operations must run through the boundary with a
minted caller, which only server code can hold. The browser panel is a view: it posts prompts and
answers, and receives events. The relay is a pipe.

**Rejected.** *Client logic in the browser*: it would need the browser to call file routes for the
agent, so the browser session would carry agent traffic, extend its idle time and mix the person's
own requests with the agent's in audit.

## R6. How a file request becomes operations

**Evidence (006, not on this base).** `createTwinCall(boundary, caller, signal)` in
`src/server/mcp/twin-dispatch.ts` turns an inventory operation id and input into a twin request
and maps failures; `src/server/mcp/tools/editing.ts` implements `save_file` (needs the read
version), `create_file`; `validate_text` is a twin route added by 006. The boundary is
`handler.boundary.operate({ caller, request })` (010, on this base:
`src/server/auth/operation-boundary.ts`, `twin-request.ts`, `caller.ts`).

**Decision.** `src/server/acp/file-requests.ts` builds twin requests with `buildTwinRequest` and
calls `boundary.operate` directly with an `acp` caller. It does not import `src/server/mcp/`
modules that serialize protocol results. It reuses the same inventory operation ids
(`files.read`, `files.save`) so authorization, guards and audit are identical. It imports from 006
only non-protocol pieces: the call-limit settings and the local capability reader.

**Rejected.** *Calling workspace methods directly*: bypasses handler checks (M1). *Importing the
MCP tool definitions*: couples ACP to MCP's result shape.

## R7. Write semantics

**Evidence.** The save operation needs the base version of the file. Fable section 5: the
protocol's write request carries no base version (not verified); the panel must read through the
workbench first. M19: "must first obtain the current authorized version and then use guarded
save."

**Decision.** Per session, a map of path to the version the agent last read or wrote. A write:
(1) reads the current authorized version through the boundary (also decides hidden equals missing),
(2) refuses if it differs from the recorded one, (3) saves with the recorded one as base. A path
that does not exist uses create semantics. A repeat of the same text from the version this
session just saved is answered as applied (needed because a lost answer must not turn into a
spurious conflict).

**Rejected.** *Base = current version*: silently overwrites changes made after the agent read.
*Refuse every write*: makes the feature useless.

## R8. Permission questions

**Decision.** The agent's question is shown to the person; the answer is the id of one offered
option or "cancelled". The workbench never inspects option meaning, and the answer cannot widen
authority because every later request is authorized again by the boundary and the connection
scope. "Always allow" options offered by an agent are shown but only affect the agent's own
memory.

## R9. Where the conversation lives

**Decision.** Not stored. A per-session ring buffer in memory (500 events, 4 MiB) serves a
reloaded tab and is dropped ten minutes after the end. Reason: the text contains definitions; the
audit, logs, telemetry and counters must carry no content; a durable store would need retention,
access rules and migration that nothing asks for.

**Rejected.** *Durable transcripts*: new durable state kind and amendment without a demand.

## R10. Audit shape

**Evidence.** `src/shared/observability/operation.ts` lists `CALLER_ORIGINS = ['http', 'mcp']`;
`src/server/auth/audit.ts`, `src/server/routes/audit.ts` and the Admin audit section filter by
origin; `src/server/auth/replay-sample.ts` already treats every non-`http` origin as a read
stratum. 010's spec: "ACP support is deferred until its first transport caller."

**Decision.** Add `acp`. Each operation writes the one record the boundary writes. Session start
and end write two further records through the existing audit append, with the connection id and
the end reason as the reason code, no content. Method classes (not method text from the agent) are
recorded for unsupported requests.

## R11. Server-mode credential

**Evidence.** Decisions M4 (single-use bootstrap credential, browser-created, bound to person,
registered client, scopes and owning session) and M5 (bound to the browser session) are owned by
013.

**Decision.** 015 consumes 013's mechanism and adds none. It needs: a way for the browser to ask
013 for a bootstrap credential naming the relay as the client and the panel's scopes; a bearer
authenticator that turns the relay's connection token into a minted caller; a signal when a
connection ends. The contract is in `contracts/relay-connection.md`. This needs a registered
client of the relay kind; whether 013 ships one built in or an Admin registers it is for 013 to
decide (listed in the plan's cross-feature items).

## R12. Interface placement

**Evidence.** The person menu (`src/app/auth/PersonMenu.tsx`) shows in local and server mode and
already lists Admin and Connected accounts. The workbench has a details panel on the right and a
drawer layout under 1100 px (`src/app/workspace/hooks/useNarrowScreen.ts`), a phone header under
651 px. Dialogs use `src/app/projects/Modal.tsx`.

**Decision.** The entry is a person-menu item "Agent panel". The panel is a right-hand sheet
beside the canvas on wide screens (like the details panel), and a full-height sheet over the page
under 1100 px. The connect step uses the Modal pattern. Nothing is added to the header, so default
screens do not change.

## R13. Reference agent for tests

**Decision.** `scripts/acp-reference-agent.ts`, a scripted program that speaks the verified
subset over standard input and output and does what a test script tells it (read, write, ask,
flood, send huge text). It is a test fixture, not a supported agent. Real agents are tried by hand
in an acceptance run that records versions (as 006 does in `docs/mcp-acceptance.md`).

## R14. Limits

Calls per second and concurrency reuse 006's settings. Frame and event limits are in the plan's
defaults table. A sustained flood is defined as 5 consecutive seconds above the burst limit.
