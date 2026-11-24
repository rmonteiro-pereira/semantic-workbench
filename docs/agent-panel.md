# Agent panel

The agent panel lets a person talk to a coding agent of their own choice from inside the workbench.
The workbench never calls a model and never starts an agent. A person starts a small relay program
on their own machine, the relay starts the agent, and the workbench acts as the client of the Agent
Client Protocol for that one conversation.

## Connect and work

Open **Person menu → Agent panel**. The panel is closed by default and makes no panel request
until opened. Read the connection statement and scopes, then choose **Start session**. Run the
shown command on your own machine, replacing `<your agent command>` with your chosen ACP agent:

```sh
bun scripts/acp-relay.ts --session <session-id>.<code> --url http://127.0.0.1:4310 -- <your agent command>
```

The relay reads the local installation capability from `DATA_DIR/state/mcp-capability`. It connects
outward and listens on no port. The workbench does not launch or supervise it. The relay launches
the chosen agent and removes `SW_ACP_CREDENTIAL` from its environment before doing so. No token,
capability or tool-server configuration is sent in the protocol session.

Send a message, optionally attaching virtual paths such as `/workbench/project/file.yaml`, one per
line. Attachments are links; the browser adds no file content to the prompt. The panel shows plain
text replies, tool activity, the agent's task list, guarded edit diffs and permission questions.
**Cancel turn** cancels pending questions too. **Undo** saves earlier text through the ordinary
save, using the agent's accepted version; a later edit causes a conflict instead of an overwrite.
Closing the panel ends the session. A new session cannot resume an ended conversation.

Only text-file read and write are offered. Existing files require a read in the same session
before a write. Saves retain validation, content guards, current grants and optimistic version
checks. Commit, push, publish, terminal, raw filesystem, planning and context operations are absent.
Those require a separately authorized connection of the agent's own where available.

## Server connections

Server-mode mounting uses the same person connection service as the MCP endpoint. An Admin must
register the public program `acp-relay`, permitting the named scopes `read` and `edit`. The latter
maps to the `localWrite` operation effect; `localWrite` is not a registration scope. The panel
requests origin `acp` and creates a single-use setup credential for the browser session. The relay
exchanges `SW_ACP_CREDENTIAL` at `/oauth/token` with setup grant
`urn:semantic-workbench:grant-type:setup`, client id `acp-relay` and resource `<workbench URL>/api/mcp`.
The relay keeps access and refresh tokens in memory only. Sign-out, expiry, deactivation or
revocation ends the bound panel session; relay traffic must not extend browser idle time.

In **Admin → Agent programs**, add client id `acp-relay`, name `ACP relay`, scopes `read` and
`edit`, and a valid redirect such as `http://127.0.0.1:8765/callback`. The relay uses the setup
grant and opens no callback listener; the redirect is required registration metadata. Review the
dry run and confirm the registration. No program is registered automatically.

Connection lists and revocation confirmations show `Origin: acp` or `Origin: mcp`. Relay routes
refuse MCP tokens, and the MCP endpoint refuses ACP tokens. A receipt remains bound to its
original person and connection and requires current authorization before replay.

Set `SW_ACP_CREDENTIAL` only for the relay process, using the one-time instructions from the panel.
Do not save real credentials in an environment file or share a command containing one. The
workbench server does not consume this variable.

## Lifetime and limits

One live session is allowed per person; replacing it requires confirmation. A session waiting
for an agent expires after ten minutes. A connected session with no conversation activity ends
after thirty minutes. A silent relay has a 45-second grace period. Ended transcripts remain in
the server's memory for ten minutes, then the buffer is cleared; a server restart clears all
sessions. The buffer retains up to 500 events and 4 MiB, with an explicit overflow notice.

Frames are capped at 1 MiB; two consecutive oversize frames end the session. File text is capped
at 2,000,000 bytes. Prompts allow 100,000 bytes and 20 attached paths. Permission questions offer
up to eight options, with at most five pending questions and a ten-minute answer deadline.

## Threat model

The relay and agent are the person's own processes. The panel is not a sandbox against them.
A locally running agent already has whatever filesystem and network access its operating-system
user grants; this protocol surface cannot remove that access. Treat both agent output and
permission questions as untrusted text. Permission choices do not widen workbench authority.

An agent can read draft text that it opens through an authorized file read. That text may include
unpublished or sensitive definitions and may reach the agent's model provider under its own
configuration and policies. The workbench adds no outbound service or model request. Planning and
context endpoints remain published-only; they are not part of this panel surface.

A hostile definition can steer the agent. Review edits and diffs before committing or publishing.
Conversation and file text are excluded from audit, operational logs and metrics. The transcript
is held in memory, not in a durable transcript store. Only the session id is kept in tab storage.
The one-time server setup credential may appear in the connection instructions until connection;
never share those instructions.

## Protocol record

The workbench relies on the following parts of the protocol's published
specification and schema.

| Item | Answer |
| --- | --- |
| Protocol | Agent Client Protocol, version 1 (the stable line) |
| Pinned schema | release `schema-v1.32.0` (published 2026-11-14), file `schema/v1/schema.json` |
| Source | https://github.com/agentclientprotocol/agent-client-protocol/releases/tag/schema-v1.32.0 |
| Local copy | `schemas/acp-1.32.0.json`, unmodified |
| Schema sha-256 | `e747a7bec3c02708b70885bf3cccac5c72fa421390dd7e85758fd61e33b1ae21` |
| Licence | Apache-2.0 |
| Newer line | `schema/v2` is a pre-release (2.0.0-alpha.16) and is not used |
| Transport | stdio only: the client launches the agent as a subprocess, one JSON-RPC message per line, UTF-8. A Streamable HTTP transport is a proposal, not published |
| Who starts the agent | the client, in the protocol. Here the person-run relay does it, and the workbench starts nothing |
| Calls to the agent | `initialize`, `session/new`, `session/prompt`, `session/cancel` |
| Requests from the agent | `fs/read_text_file`, `fs/write_text_file`, `session/request_permission`; `terminal/*` and `elicitation/create` are answered "method not found" |
| Updates from the agent | `session/update`: message, thought, tool activity, tool activity update, `plan` (the agent's task list) |
| File paths | absolute; `line` is 1-based; a write must create a missing file |
| Write base version | not carried; the workbench keeps the version the agent read |
| Cancel | the client must answer pending permission requests `cancelled` when it sends `session/cancel` |
| JSON-RPC batches | not mentioned by the protocol; refused here |
| Content kinds | `text`, `image`, `audio`, `resource_link`, `resource`; only text is shown |
| Sandbox | none in the protocol; permission requests are advisory |



Relay requests authenticate using the local capability or a server-mode connection token. Every
authenticated hello, frame post, stream and goodbye then enters the operation boundary with origin
`acp`; the credential grants no workspace access of its own. Every Origin header, a foreign
local-mode Host, invalid credentials, invalid session codes and replayed codes receive the same
empty 404 response.
Anonymous refusals use the shared audit rate gate. Unsupported methods are recorded by bounded
class, without method parameters or conversation content.

The browser keeps its transcript in memory. Only the session id survives a page reload; opening
the panel can catch up from the bounded server buffer. A missing known session ends locally as
server-restarted. Duplicate event numbers are ignored.


## Compatibility

The scripted `reference-agent` version **1.0.0** connects through the real relay, receives prompts,
reads and writes authorized text, asks permission, handles cancellation and exits cleanly when
the session ends. Its local-mode browser acceptance covers light and dark at 360, 768 and 1280 px.
No compatibility claim is made for another agent or for a server-mode external agent.
