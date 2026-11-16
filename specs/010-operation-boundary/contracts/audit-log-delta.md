# Contract delta: audit log

Changes to [the audit log contract](../../003-authn-authz/contracts/audit-log.md). Everything not
named here is unchanged.

## New optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `origin` | `"mcp"` or `"acp"` | Absent for HTTP. |
| `tool` | string | An inventory operation id. Never an argument. |
| `method` | string | A protocol method from the fixed list, for calls that are not operations. |
| `connection` | string | At most 64 characters of `A-Z a-z 0-9 _ -`. Opaque. |

Invalid values make the append fail; they are never stored. Records written before this change have
none of these fields and are read as HTTP.

## Semantics

- One record per operation. The outer request that carries a tool call writes none.
- For `mcp` and `acp` origins, an allowed operation is recorded even when it is a plain read.
- `outcome` is the semantic outcome: the caller's classifier when given, otherwise the status
  mapping (`2xx` ok; `409`, `412`, `428` refused; others failed).
- Protocol calls are recorded once per call: discovery, listing, resource and prompt access, and
  subscription open and close; denials always.

## Verification

The chain hashes stored lines. Months written by earlier versions verify alone and followed by new
records. `bun run audit:verify` and the mirror checks are unchanged.

## Query and export

- `GET /api/audit` and the export accept `origin` and `tool` filters. Visibility is unchanged.
- JSON Lines carries every stored field. CSV keeps its columns in order and appends `origin`,
  `tool`, `method`, `connection`.

## Retention

The administration setting `audit.retentionDays` applies to the log the server writes, which is
built once per data root.

## Dry-run sample

Stratum A: newest 1,000 replayable records that are not MCP or ACP reads. Stratum B: newest 500
distinct replayable MCP and ACP reads. Protocol-call records are not replayable.
