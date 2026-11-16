# Data Model: First MCP Release

The release adds two small durable files and one in-memory handle; everything else is existing
state. Nothing here is a cache that matters: deleting the receipts file loses only the ability to
answer a retry from before the deletion with the original result (it answers `uncertain`).

## Tool definition (code, not stored)

| Field | Meaning |
|-------|---------|
| `name` | one of the 21 names in [contracts/mcp-tools.md](./contracts/mcp-tools.md); at most 40 characters, lower case with underscores |
| `description` | server-written sentence; never contains file text |
| `inputSchema` | plain JSON Schema, `additionalProperties: false` |
| `annotations` | the four hints, set independently |
| `twin` | method and path template of the existing route the call is dispatched to |
| `retryClass` | `repeatable`, `precondition-protected` or `receipt-backed` |
| `requestCapBytes` | the per-tool request cap, taken from the twin route's own limit |
| `run` | builds the twin request from the arguments and maps the response to a tool result |

One test compares the registry with the contract table, the route inventory and the documentation.

## Local capability (file)

`<data root>/state/mcp-capability`: one line, 43 base64url characters (32 random bytes), mode 0600.
States: absent (created at start), present, rotated (replaced; the old value is gone, nothing keeps
a list of old values).

## Receipt (file)

`<data root>/state/mcp-receipts/<yyyy-mm>.json`, an object keyed by receipt id, written atomically
(temporary file, rename). Pruned by retention at start and when a month file is written.

| Field | Meaning |
|-------|---------|
| `id` | SHA-256 of `principalId`, `tool` and `idempotencyKey` |
| `principalId` | the local principal's id, so keys never collide across callers later |
| `tool` | `delete_file`, `restore_file` or `git_commit` |
| `argumentsHash` | SHA-256 of the arguments after normalization (sorted keys, the key itself removed) |
| `state` | `pending`, `done` or `uncertain` |
| `result` | the stored tool result, present when `done`; file text is never stored |
| `createdAt`, `expiresAt` | UTC; retention is a named default |

Transitions:

```text
(absent) --write before the effect--> pending --effect completes--> done
pending --restart, effect verifiable from the journal or Git--> done
pending --restart, effect not verifiable--> uncertain
```

A call with a known id and the same `argumentsHash` returns the stored result when `done`, and the
tool error `rate_limited` with a one-second delay while `pending` in this process. With a different
`argumentsHash` it fails with `key_reused`. An expired or unknown receipt is a new call, so a retry
after expiry is not deduplicated; the documentation says this and tells the agent to read state
(trash listing, Git log) before retrying a call whose answer was lost for longer than the retention.

How an effect is verified after a restart: a delete is done when the trash holds an entry for the
path whose bytes hash to `baseVersion` and the file is absent; a restore is done when the file exists
with the entry's bytes and the entry is gone; a commit is done when the branch contains a commit
whose parent is `expectedHead`, whose message equals the given message and whose files equal `files`.
Anything else is `uncertain`.

## Cursor (in memory)

An opaque base64url string: the position, the hash of the query, the ordering name, the index
generation, the principal id and an expiry, authenticated with a random key made at process start. A
restart therefore expires every cursor, and a cursor from another query, generation, principal or
time is refused as `cursor_expired`. A cursor grants nothing; each page is authorized again.

## Audit record additions

See [contracts/mcp-audit.md](./contracts/mcp-audit.md): `origin`, `method`, `tool`, `connection`,
`clientLabel`, `result`.

## What is not stored

Tool arguments, file text, findings, the capability's value in any log, and any per-client session.
