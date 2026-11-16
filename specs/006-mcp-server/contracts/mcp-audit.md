# Contract: audit of MCP calls

## What is recorded

One record per substantive MCP method call, written by the dispatched twin through the operation
boundary. The outer `POST /api/mcp` row is unaudited itself. `server/discover`, `tools/list` and
every other method that is not `tools/call` write one record per call, never per returned item. An
unknown tool, a malformed call and a call refused at the gate write a denial.

New fields on an audit record (all optional, absent on older records):

| Field | Value | Bound |
|-------|-------|-------|
| `origin` | `mcp` | fixed |
| `method` | the protocol method | fixed list |
| `tool` | the validated tool name | the 21 names |
| `connection` | the connection id: `local` in this release | fixed |
| `clientLabel` | the client name the client sent, as an untrusted label | 64 characters, control characters removed |
| `result` | one code of the closed set in [mcp-tools.md](./mcp-tools.md) or `ok` | closed set |

The record keeps the existing `action`, `resource` (the actual target: project, path, branch,
entry), `decision`, `rules` and `outcome`. Arguments, file text, findings, the capability and tokens
are never written.

## Outcome mapping

| `result` | `decision` | `outcome` |
|----------|-----------|-----------|
| `ok` | allow | ok |
| `conflict`, `guard_refused`, `precondition_failed`, `key_reused`, `refused`, `version_changed` | allow or deny as the boundary decided | refused |
| `not_found`, `invalid_input`, `cursor_expired`, `not_published`, `not_ready`, `unavailable`, `limit_exceeded`, `rate_limited` | allow, except a hidden target which records deny | refused |
| `uncertain`, `internal` | allow | failed |

## Compatibility

- The serializer lists the new fields; a test fails if a field written to the log is missing from the
  stored line.
- Records written before this release read and pass the chain verification (`bun run audit:verify`).
- The configured retention reaches the running log.

## Dry-run replay

The replay is built from three bounded groups instead of the newest 1,000 replayable records:
writes and denials (up to 600), de-duplicated reads (up to 300, one per principal, action and
resource) and the configured matrix cases. The limits are assumptions, see the plan. Reads of any
origin go into the third group, so browser reads cannot evict writes either.

## Telemetry

Local mode sends none. If a later mode sends metrics, labels come from the fixed list of tools and
protocol methods; arguments, paths, resource addresses, document content and raw library errors are
never labels or attributes.
