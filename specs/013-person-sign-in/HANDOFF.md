# Hand-off: person sign-in (013)

Worktree `/home/rodrigo/projetos/semantic-workbench-wt/013-person-sign-in`, branch `013-person-sign-in`. Clean tree at hand-off. `bunx tsc --noEmit` is clean. Nothing is running on the dev server.

## Research (done, recorded in research.md "Verified")
T038 read the MCP authorization specification revision 2026-07-28 (four pages) on 2026-11-17. Findings: discovery and PKCE design confirmed; custom redirect schemes contradict the specification (not implemented, report to owner); `iss` in the authorization response added; consent shows the redirect host; no `scope` in the challenge (deliberate). T039 (Codex CLI run) not done.

## Tasks done
T001-T021, T023, T027, T032, T038. T023 and T027 are covered by `tests/auth/connection-flow.test.ts` and `oauth-public-surface.test.ts`.

## Remaining, in order
1. T022 `docs/agent-connections.md` and `tests/docs-agent-connections.test.ts`.
2. T028 MCP gate for server mode (design below), T029, T030 (service already offers `endSignal(connectionId)`), T024 bridge, T025/T026 scope tests (`scopeAvailability` exists and is used; write `tests/auth/connection-scopes.test.ts` including the inventory walk), T031, T039.
3. T033 dialog, T034 Admin sections, T035 terminology, T036 browser check, T037 (leave for Codex), T040 mutants, T041 docs (README, `.env.server.example` untouched so far, docs/server-mode.md, docs/mcp.md, ARCHITECTURE.md, CHANGELOG, threat model; none written yet), T042, T043, T044.

## Where createConnectionForSession / onConnectionEnded exist
Commit `4d08c749`, `src/server/connections/connection-service.ts`. `createConnectionForSession({ session, clientId, scopes, origin? })` returns `{ ok, credential, expiresAt }`: a single-use setup credential that is exchanged at the token endpoint (grant `urn:semantic-workbench:grant-type:setup`) and yields a connection carrying the origin (`mcp` default or `acp`). `resolve(accessToken)` returns a minted caller with that origin. `onConnectionEnded(listener)` hears `{ connectionId, reason, origin, person, clientId }`. Tell feature 015: it gets the credential, not tokens.

## Departures
See `evidence.md`.

## Proofs run (summary lines)
- `bun test tests/connections tests/auth/consent-pages.test.ts tests/auth/programs-schema.test.ts tests/auth/oauth-public-surface.test.ts tests/auth/connection-secrets.test.ts`: 88 pass, 0 fail.
- `tests/auth/connection-flow.test.ts`: 20 pass. `connection-lifetime.test.ts`: 10 pass. `programs-admin.test.ts`: 8 pass (server tests need a 30000 ms timeout).
- `tests/auth/route-actions.test.ts`, `operation-inventory.test.ts`, `matrix-write.test.ts`, `write-regressions.test.ts`, `http-characterization.test.ts`, `admin-api`, `admin-repo`, `dry-run`, `authorize`, `access-boundary`: pass at last run.
- `bun --bun run check` and `bun --bun run build` have not been run yet (T043).

## Shared-file blocks added
`route-actions.ts` (one block before the MCP row), `operation-inventory.json` (15 entries before `POST /api/mcp`), `docs/operations.md` and `policies/matrix-cases.json` (regenerated), `tests/auth/route-actions.ts` (15 examples), operations schema (one enum value), `request.ts` (one constant), `handler.ts` (one block plus a header exception), `rate-limit.ts`, `request-authentication.ts`, `static.ts`, `metrics.ts`, `sessions.ts`, `admin.ts` (two `export`s).

## Half-designed: T028 (next task)
- Make the `POST /api/mcp` row `public` and not `localOnly` (single row; a second row breaks the example-index tests). Local mode then skips the boundary for that row; check `tests/mcp` still pass.
- In `request-authentication.ts` add `/api/mcp` to the set that skips bearer and CSRF handling in server mode (`GRANT_ENDPOINT_PATHS`), and key its rate limit by address, not by cookie person.
- New `src/server/mcp/server-mode-gate.ts`: pure order method, any Origin, content type, bearer shape; then `service.resolve(token)`. 401 carries `bearerChallenge(publicUrl)`, empty body, no cookie. Refusals audited through the anonymous gate as the local route does.
- `routes/mcp.ts`: choose the gate by mode; mint the per-request caller from the resolved one (`principal, origin, connection, session, scope` plus attribution); `signal` = `AbortSignal.any([request.signal, service.endSignal(connection)])`. `handler.ts`: mount it in server mode with `join(ws.layout.state, 'mcp-receipts')`, `TOOLS`, `options.connections.service`.
- Tests: `tests/mcp/server-mode-gate.test.ts` (one case per adjacent pair of checks, cookie ignored, invalid bearer never falls back, identity-provider JWT refused, connection token refused on `/api/agent/`). Extend `oauth-public-surface.test.ts` so the public rows include `POST /api/mcp`. `tests/mcp/server-mode-absent.test.ts` and `docs/mcp.md` currently say MCP is not available in server mode and must change.

## Exact next task
T022, then T028 as above.
