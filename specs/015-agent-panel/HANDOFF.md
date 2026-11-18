# Hand-off: agent panel

State at the hand-off: every change is committed, nothing is running on the dev server, nothing
was pushed. Tasks T001 to T026 are ticked in `tasks.md`; T027 onward remain.

## What T001 verified

Source: the protocol's own repository and published pages, 2026-11-17. Pinned revision: protocol
version 1, schema release `schema-v1.32.0` (published 2026-11-14), Apache-2.0, `schema.json` sha-256
`e747a7be...ae21`. Version 2 exists only as an alpha and is not used. Stdio is the only published
transport (the client launches the agent; one JSON-RPC message per line). The methods used:
`initialize`, `session/new` (`cwd` absolute, `mcpServers` required), `session/prompt`,
`session/cancel`, `session/update` (including `plan`), `session/request_permission`,
`fs/read_text_file` (absolute path, 1-based `line`, `limit`), `fs/write_text_file` (no base version;
the client must create a missing file). Terminal and elicitation are not advertised. Cancel rule:
the client must answer every pending permission request `cancelled`. No JSON-RPC batch is
defined. The full record is in `research.md` (R1 verified record) and `docs/agent-panel.md`
(Protocol record). No plan assumption failed. Documents changed: `research.md` (record added),
`contracts/acp-client-surface.md` (verified method names, terminal answer, cancel rule,
authentication-required rule, `cwd` and `mcpServers`), then `docs/agent-panel.md` and
`schemas/acp-1.32.0.json` (T001 and T002).

## Done and remaining

Done: T001 to T026, including T003 (reference agent), T008 (partly, see departures), T021, T022 to
T026.

Remaining, in order: T027 end reasons, T028 server mode, T029 audit records, T030 to T037 the
panel UI and its checks, T038 mutants, T039 to T043 documents and acceptance, T044 batch gate.

- T027: only some reasons are produced end to end today (closed, replaced, no-agent, agent-exited,
  relay-lost through the clock, protocol-error, flood, and the connection reasons through
  `panel-service` mapping). Write `tests/acp/end-reasons.test.ts` for all 13 and check that the
  next agent request is refused after each. `server-restarted` is the browser's inference when the
  events route answers 404 for a session it knew; the panel code (T030) must implement it.
- T028 (needs 013, unticked): the wiring exists against `ConnectionDirectory`
  (`src/server/acp/connection-directory.ts`, mirrors 013's `createConnectionForSession`, `resolve`,
  `onConnectionEnded`) and a test double (`tests/acp/helpers/connection-double.ts`). Still to do:
  `tests/acp/server-mode.test.ts` (sign-out, expiry, deactivation, revoke end the session; zero
  session "touch" calls over 1,000 agent requests), then pass the real service from 013 as
  `options.acp.connections` where the server is assembled (013's exports: `createConnectionService`,
  token path `/oauth/token`, setup grant type, program id `acp-relay` which an Admin must
  register; document that in `docs/agent-panel.md`).
- T029: start and end records already exist (`recordSession` in `panel-service.ts`, tool ids
  `agentPanel.start` and `agentPanel.end`). Still to do: refused-attempt records through the
  anonymous gate for the relay routes, records for unsupported methods by method class, and
  `tests/acp/audit-records.test.ts` with a canary string searched in audit, logs and metrics.
- Screenshots (T037) go to Codex per the owner's rule; `test:acp` (T036) runs on the dev server.

## Departures from plan.md so far

- Added modules: `conversation.ts` (handshake, prompts, cancel, rules for bad frames),
  `live-session.ts`, `panel-service.ts`, `mount.ts`, `permission-questions.ts`,
  `update-events.ts`, `version-records.ts`, `event-stream.ts`, `bounded-body.ts`,
  `relay-authentication.ts`, `connection-directory.ts`; `src/shared/agent-panel/statement.ts`;
  relay helpers `scripts/acp-relay-link.ts`, `acp-relay-token.ts`, `acp-event-parser.ts`.
- The relay's `--session` value is `<session id>.<code>`, because the routes are addressed by id.
- `protocol-schema.ts` was written in T002, not T012.
- Questions live in `permission-questions.ts`, not in `client-surface.ts`; the session record has
  no `pending` map.
- New named request limit `AGENT_PANEL_REQUEST_LIMIT` in `src/server/request.ts` and the
  operations schema enum.
- Extra shared-file edits: `src/server/routes/files.ts` (keeps drafts for origin `acp` too),
  `src/server/routes/me.ts` (`agentPanel` flag), `src/server/auth/middleware.ts` (options `acp`
  and `agentPanel`), `tests/auth/guard-cases.ts` (exemptions), `tests/auth/route-actions.ts` and
  `.test.ts` (examples; panel paths skipped where the panel is not mounted).
- The statement is built by `connectionStatement(productName)` so the brand check passes; the
  server fills in the brand name (the test gets "This workbench" when no brand is loaded).
- T008: the Admin audit view has no origin filter, so nothing was added there (see `evidence.md`).
- A relay request carrying a foreign `Origin` or Host answers 403 from the handler's own local check
  before the route; every other relay failure answers 404 with an empty body.
- Panel routes and the relay's public rows are `unaudited` rows; start and end are written by the
  service with origin `acp`.

## Proofs run (summary lines)

- `bun test tests/acp/`: 222 pass, 0 fail (run before the statement change).
- `bun test tests/acp/panel-routes.test.ts` after the statement change: 7 pass, 0 fail.
- `bun test tests/auth/operation-inventory.test.ts tests/auth/route-actions.test.ts
  tests/auth/matrix.test.ts tests/auth/guard-inventory.test.ts`: 38 pass, 0 fail.
- `tests/auth/audit-origin`, `audit-compat`, `audit`, `acp-origin` (11), `dry-run-strata`,
  `boundary-scan` pass; `bun run audit:verify tests/fixtures/audit-v1`: intact, 9 records.
- `bun --bun run check`: clean after the statement fix. `bun --bun run build`: built.
- Not run: the full unit suite, mutants, browser suites (batch gate).

## Half-designed

- `mintAcpCaller` is refreshed on every relay request (`relayCallers`), so a server-mode token
  refresh is picked up. The sweeper timer starts at mount (unref'd) and is stopped by
  `service.stopSweeper()` in tests.
- The browser must send `X-SW-Request: 1` on panel writes; check `src/app` fetch helpers when
  writing `agent-api.ts`.
- Docs not yet written: README, ARCHITECTURE.md (code map for `src/server/acp`, `src/app/agent`,
  `src/shared/agent-panel`), CHANGELOG, `docs/development.md`, `docs/server-mode.md`,
  `docs/user-guide.md`; `docs/agent-panel.md` has only the protocol record. The environment
  variable `SW_ACP_CREDENTIAL` must go in the README configuration table.

## Exact next task

T027: write `tests/acp/end-reasons.test.ts` producing all 13 end reasons end to end through
`startPanelServer` and `PanelService`, and check that the next relay request and the next file
request are refused after each end.
