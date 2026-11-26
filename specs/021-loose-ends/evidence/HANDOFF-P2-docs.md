# Handoff: code and documentation tasks (T007, T008, T009)

Branch `021-docs`, based on `021-loose-ends` at `18883877`. Ready to merge in order.

## Commits

| Commit | Task | Source task | Status |
| --- | --- | --- | --- |
| `d170f07a` | T007 | 018 T045 | done |
| `ba1a4200` | T008 | 016 T033 | done, no leak |
| `6d4c43bf` | T009 | 018 T061 | done, with one gap noted below |

## Tests

| Command | Exit | Result |
| --- | --- | --- |
| `bun test ./tests/mesh/importer-visibility.test.ts` | 0 | 4 pass |
| `bun test ./tests/mcp/agent-context-tools.test.ts` | 0 | 4 pass |
| `bun test ./tests/mcp/docs-claims.test.ts ./tests/mcp/route-inventory.test.ts ./tests/mcp/tool-contract.test.ts ./tests/docs-agent-connections.test.ts` | 0 | 12 pass |
| `bun --bun run check` (after each commit) | 0 | clean |

The importer-visibility scan was shown to fail on injected sources: a usage module that imports
`src/server/mesh/` (static or dynamic), reads `layout.mesh` or names `state/mesh`, and a mesh module that
imports `src/server/usage/` or reads `layout.usage`. Nothing under `src/` was changed.

## Open

- `validate_text` on a part returns single-file findings and nothing about the set. The "set not checked"
  notice that the 018 plan expected for it does not exist in any tool: only the browser's file read
  (`GET /api/projects/:slug/files/*`) returns `unitValidation.setNotChecked`. `docs/mcp-contract.md` now
  says this and warns agents not to read an empty answer for a part as a passing set. Adding the notice
  to the tool means changing `src/server/mcp/tools/validation.ts` and the `files.validate` route, which
  this branch does not own.
- The explanation answer keeps the metric extension's own `owner` (a team name such as Finance). That is a
  public metric field, not the item governance owner, so the tool test checks the `owner` key only
  inside governance flags and checks the governance owner's value everywhere.
