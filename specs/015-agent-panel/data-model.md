# Data Model: Agent Panel

Nothing here is written to disk. Every record lives in the memory of the server process (single
instance per data root) and is lost on restart. Types are described by what they hold.

## PanelSession

| Field | Meaning |
| --- | --- |
| `id` | Opaque random identifier, 16 bytes, base64url. Names the session in routes. |
| `code` | The session code the relay presents once; 8 characters from an unambiguous alphabet. Cleared when used. |
| `owner` | The person's principal id. Every access compares it. |
| `connection` | Connection id, `[A-Za-z0-9_-]{1,64}`. Local mode: `acp-` plus 12 random characters. Server mode: the id issued by 013. |
| `scope` | The connection's effects: a subset of `read`, `localWrite`. Never more. |
| `state` | `waiting`, `connected`, `working`, `ended`. |
| `endReason` | One of 13 values (FR-006) when ended. |
| `agentName` | The name the agent reported, plain text, at most 200 characters, shown in full. |
| `createdAt`, `lastActivityAt` | Milliseconds. `lastActivityAt` moves on a prompt, an update or an answer. |
| `versions` | Map of project path to the version last read or written by this session. At most 2,000 entries; the least recently used entry is dropped, so the next write of that path needs a read first. |
| `pending` | Pending questions, at most 5. |
| `turn` | The running turn, if any: id, start time, cancelled flag. |

State transitions: `waiting` to `connected` when the relay is accepted and the protocol handshake
completes; `connected` to `working` when a prompt is sent and back when the turn ends; any state to
`ended`. `ended` is final.

## RelayLink

| Field | Meaning |
| --- | --- |
| `sessionId` | The session it serves. At most one live link per session. |
| `toAgentSeq`, `fromAgentSeq` | Last frame numbers sent and received, from 1. |
| `acknowledged` | Highest number the relay confirmed. Unacknowledged frames are kept for replay, at most 256 frames or 4 MiB. |
| `lastHeartbeatAt` | Last request or ping from the relay. |

## Frame

| Field | Meaning |
| --- | --- |
| `seq` | Number in its direction. A repeated number is ignored. A gap is an error that ends the link, not the session, until the grace period passes. |
| `payload` | One JSON-RPC message, at most 1,048,576 bytes, validated against the pinned protocol schema before use. |

## FileVersionRecord

`path` (project slug and path inside it), `version` (the content hash the operations return),
`at`. Created by a read or an accepted write.

## ChangeCard

| Field | Meaning |
| --- | --- |
| `id` | Increasing number in the session. |
| `path` | Project and path, shown in full. |
| `outcome` | `accepted` or `refused`. |
| `reason` | For refused: `changed`, `unread`, `invalid`, `not-available`, `guard`, `rate-limited`. |
| `before`, `after` | For accepted: the texts, each at most 2,000,000 bytes, kept only in the event buffer. |
| `findings` | For `invalid`: the findings returned by validation. |
| `undone` | Whether the person undid it. |

## PendingQuestion

`id`, `text` (plain, any length up to the frame cap), `options` (each an id and a plain label, at
most 8), `askedAt`, `answer` (an option id, `cancelled` or none).

## PanelEvent (what the browser receives)

A numbered event: `session`, `message`, `reasoning`, `tool`, `tasks`, `change`, `question`,
`notice`, `turn`, `ended`. Each carries only what the panel shows. The buffer keeps at most 500
events and 4 MiB; older ones are dropped and one `notice` says so.

## Origin and audit additions

`CallerOrigin` gains `acp`. Audit records of the origin carry `connection` and, for session start
and end, the reason code as the outcome reason. No record contains message, prompt or file text.

## Invariants

1. A session has one owner and one connection id for its life.
2. A version record exists only for a path the agent was allowed to read or write.
3. A write is saved only when its recorded version equals the current authorized version at the
   moment of the check, and the save carries that version as its base.
4. No field holds a credential after use; the code is cleared when consumed.
5. After `ended`, no request of the session changes any state except the buffer's expiry.
