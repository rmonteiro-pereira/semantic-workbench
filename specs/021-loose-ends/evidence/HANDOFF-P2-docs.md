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

- Closed after the first merge: `validate_text` on a root or part now returns `setNotChecked`. The validate route
  computes it with the same function as the file read and the tool passes it on, with no second call or audited read. `tests/mcp/validate-set-notice.test.ts`
  (3 pass) fails without the change. The notice describes the saved set; a file not saved yet has none.
- The explanation answer keeps the metric extension's own `owner` (a team name such as Finance). That is a
  public metric field, not the item governance owner, so the tool test checks the `owner` key only
  inside governance flags and checks the governance owner's value everywhere.

## Codex CLI acceptance (T010)

Commit `d6298790`. Local stdio bridge: pass, every step, with Codex CLI 0.169.1
(`specs/006-mcp-server/evidence/codex-cli/RESULT.md`). Server sign-in: stopped at the browser sign-in as expected,
with discovery path, callback port, client id and resource indicator recorded
(`specs/013-person-sign-in/evidence/codex-cli/RESULT.md`). `docs/mcp-acceptance.md`, `docs/agent-connections.md` and
`docs/mcp.md` updated; `bun test ./tests/docs-agent-connections.test.ts ./tests/mcp/docs-claims.test.ts` and
`bun --bun run check` exit 0. The token exchange of the server sign-in was not run and stays open.
