# Agent panel

The agent panel lets a person talk to a coding agent of their own choice from inside the workbench.
The workbench never calls a model and never starts an agent. A person starts a small relay program
on their own machine, the relay starts the agent, and the workbench acts as the client of the Agent
Client Protocol for that one conversation.

This page grows with the feature. The sections below are filled in as each part lands.

## Protocol record

The workbench relies on the following parts of the protocol's published
specification and schema, not against memory.

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

The full reasoning is in `specs/015-agent-panel/research.md` (R1).

Relay requests authenticate using the local capability or a server-mode connection token. Every
authenticated hello, frame post, stream and goodbye then enters the operation boundary with origin
`acp`; the credential grants no workspace access of its own. Foreign Origin or Host headers,
invalid credentials, invalid session codes and replayed codes receive the same empty 404 response.
Anonymous refusals use the shared audit rate gate. Unsupported methods are recorded by bounded
class, without method parameters or conversation content.

The browser keeps its transcript in memory. Only the session id survives a page reload; opening
the panel can catch up from the bounded server buffer. A missing known session ends locally as
server-restarted. Duplicate event numbers are ignored.
