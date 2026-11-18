# Contract: the two MCP tools

Both follow `src/server/mcp/tool-definition.ts` of feature 006: plain JSON Schema, four hints, one
inventory operation, a retry class, a request cap and a `run` function. Both are read-only,
idempotent, not destructive and closed-world. Retry class `repeatable`. Request cap: 64,000 bytes.

| Tool | Twin operation | Action | Notes |
|------|----------------|--------|-------|
| `check_standard` | `compile.check` | read | arguments `project`, `source` (`published` or `working`, default `published`), optional `lossPolicy` |
| `compile_standard` | `compile.run` | export | arguments `project`, optional `acceptDigest`, `commit`, `path`, `offset` |

## `check_standard` answer

`{ result, source, base, findings (bounded, with findingCount), report (summary: counts and digest, entries paged by cursor), files }`. For `source: working` the answer says `unpublished: true`.

## `compile_standard` answer

- No `acceptDigest` and a loss: `{ result: "loss-needs-acceptance", source, report summary, digest }`.
- Findings: `{ result: "refused", findings }`.
- Accepted: `{ result: "released", source, manifest, files }`. With `path`: `{ part: { path, version, offset, nextOffset, text } }`, at most 32,768 bytes of text.
- A changed published commit between calls: `version_changed` (existing code). No snapshot: `not_published`.

No new result code. A hidden file in the unit answers `not_found`.

## Rows to add to `docs/mcp-contract.md`

Tool table: both tools as above. Disposition table:

| Row | Disposition |
|-----|-------------|
| `POST /api/projects/:slug/compile/check` | tool: check_standard |
| `POST /api/projects/:slug/compile` | tool: compile_standard |
| `GET /api/projects/:slug/compile/bundle` | not an agent operation: a binary download for the browser; agents page `compile_standard` |
| `POST /api/projects/:slug/compile/convert` | later: Remaining workspace and source-control operations |
