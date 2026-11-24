# Tasks: Person Sign-In for Agent Connections

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: none for phases 1 to 7 and 10. Tasks marked **needs 006** wait for feature 006
(`src/server/mcp/`, `routes/mcp.ts`, `scripts/mcp-stdio.ts`), which is not on this base.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours. During implementation this feature runs only its own
tests, `bun --bun run check` and `bun --bun run build`. The full gate (full unit suite, mutation
tests, every browser suite, the UI regression comparison against the last release) and the
architecture review run once on the integrated batch (last task). Heavy runs: `sw-midgard-run --
<command>`. Every task that changes code ends with the formatter applied and no ID in a comment.

## Phase 1: Pure parts (no I/O)

- [x] T001 [P] Create `src/server/connections/scopes.ts`: the vocabulary (`read, validate, edit, commit, remote, publish, administration`), the defaults, the effects of each (research R8), `effectsOf(scopes)`, and `offeredScopes()` that omits `administration`. Proof: `tests/connections/scopes.test.ts` covers every row of the table and that `destroy` is in no scope set.
- [x] T002 [P] Create `src/server/connections/pkce.ts` with `verifyS256(verifier, challenge)` (length and alphabet checks, constant-time compare). Proof: `tests/connections/pkce.test.ts` with the RFC test vector, wrong verifier, short and long values.
- [x] T003 [P] Create `src/server/connections/token-keys.ts`: HKDF key from `config.sessionKey` with label `sw-connection-tokens`, `newToken(prefix?)` (32 random bytes, base64url), `keyedHash(key, value)`, `sameHash(a, b)` constant time. Proof: `tests/connections/token-keys.test.ts`: lengths, determinism per key, different keys differ, prefix kept, compare is not short-circuit on equal-length input.
- [x] T004 [P] Create `src/server/connections/programs.ts`: typed parse of `programs.json` (fields and limits of `data-model.md`), `redirectIssue(address)` implementing FR-011, `findProgram(clientId)`. Proof: `tests/connections/programs.test.ts` with 40 accepted and rejected addresses (fragment, wildcard, userinfo, `http` non-loopback, missing port, 513 characters, custom scheme not allowed), duplicate ids, `administration` refused.
- [x] T005 Create `src/server/connections/pending-grants.ts`: memory store for pending requests, codes and setup credentials with the lifetimes and caps of the plan's defaults table, spent marks kept until natural expiry, an injected clock. Proof: `tests/connections/pending-grants.test.ts`: expiry, single use, spent code recognised on second use, cap evicts oldest, foreign session refused.
- [x] T006 Create `src/server/connections/connection-store.ts`: one JSON file per connection through `atomicWriteJson` (`src/server/projects/atomic.ts`) under `state/connections/`, in-memory index by access and refresh hash, retired hash list of 8, `ended` retention sweep, refusal to load an unknown `formatVersion`. Proof: `tests/connections/connection-store.test.ts` with an injected temp data root: write, reload after restart, retention, corrupt file ignored with a log line.

## Phase 2: Session seam and registrations store (foundation on this base)

- [x] T007 Add to `src/server/auth/sessions.ts` `getByReference(reference)` (no last-seen update, same expiry handling as `get`) and `onEnded(listener)` (called with the session reference and reason for every removal). Expose `sessions` and `principalFor` from `src/server/auth/authentication.ts` for the service. Proof: new cases in `tests/auth/admin-sessions.test.ts`: a lookup by reference leaves `lastSeenAt` unchanged; every removal path (sign-out, expiry, Admin end, front-channel logout) calls the listener once; existing session tests unchanged.
- [x] T008 Add the `programs` document: `$defs.programsFile` in `schemas/semantic-workbench-access-v1.json`, `'programs'` in `documents` of `src/server/auth/admin-repo.ts`, validation in `src/server/auth/access-config.ts` (`validateAccessDocument('programsFile', ...)`, `AccessConfig.programs`), the area and its dry-run discriminator in `src/server/auth/access-admin.ts`. Proof: `tests/auth/programs-schema.test.ts` (valid, each invalid field, round trip through the administration repository with one commit) and `tests/auth/access-fixture.ts` updated with an empty document; `tests/fixtures/characterization/http-v1.json` re-recorded only where the administration document list gains `programs.json`, with the diff reviewed and listed in the pull request.
- [x] T009 Add the preview computation: for a proposed `programs.json` against live connections, list added, changed and removed programs and the connections each removal or scope narrowing would end (`connection-service.preview`, stub store for now). Proof: `tests/auth/programs-admin.test.ts` cases for add, rename (ends nothing), remove (counts), redirect removal, scope narrowing.
- [x] T010 Create `src/server/connections/connection-service.ts`: `issueFromCode`, `issueFromSetup`, `refresh`, `end(connectionId, reason)`, `endForSession`, `sweep`, `resolve(accessToken)`, `createConnectionForSession` and `onConnectionEnded` (exported for 015). State changes are pure functions in the same file or `connection-transitions.ts`; I/O goes through the store, the session lookup and the audit log. Proof: `tests/connections/connection-service.test.ts` with fakes: every transition of `data-model.md`, replay (retired refresh, spent code), resource and program binding, expiry, scope intersection with the person's roles.

**Checkpoint**: the domain works without HTTP.

## Phase 3: User Story 1 - A person connects in the browser (P1)

**Goal**: the flow of Story 1 end to end through HTTP on this base, with a test client.

**Independent Test**: `bun test tests/auth/connection-flow.test.ts tests/auth/oauth-public-surface.test.ts`.

- [x] T011 [US1] Create `src/server/connections/server-metadata.ts`: the two documents and the challenge header from `SW_PUBLIC_URL` only (FR-006). Proof: `tests/connections/server-metadata.test.ts`: fields of `oauth-endpoints.md`, no request header changes any address.
- [x] T012 [US1] Create `src/server/connections/consent-pages.ts`: consent, setup, setup-result and error pages, headers of `consent-and-scopes.md`, no script, escaping of every dynamic value, the exact sentence of FR-063. Proof: `tests/auth/consent-pages.test.ts`: escaping (a program name with markup), header set, sentence present verbatim, no request parameter echoed on the error page.
- [x] T013 [US1] Create `src/server/routes/oauth.ts`: `GET /oauth/authorize`, `POST /oauth/consent`, `POST /oauth/token`, the two metadata routes, bounded body reading with the existing request-limit helpers in `src/server/request.ts`. Include the limit of 10 live connections per person (FR-024) and token responses with no-store headers and no person or role fields (FR-033). Proof: `tests/auth/connection-flow.test.ts` covers scenarios 1 to 6 of Story 1, the limit and the response shape with the mock identity provider helpers of `tests/auth/`.
- [x] T014 [US1] Add rows to `src/server/auth/route-actions.ts` (a contiguous block: four public rows, authorize, consent, setup, own-connection and Admin rows), entries in `policies/operation-inventory.json` (dispatch `{ no: 'public' }` or `{ no: 'page' }` and increment `team-sign-in`), add `/oauth/token` and the two metadata paths to `SIGN_IN_PATHS` in `src/server/auth/rate-limit.ts`, regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts`. Proof: `tests/auth/route-actions.test.ts` and `tests/auth/operation-inventory.test.ts` pass; `tests/auth/oauth-public-surface.test.ts` walks every row and finds exactly the four unauthenticated answers (SC-006).
- [x] T015 [US1] Register the routes and build the service in `src/server/handler.ts` (server mode only) with the data root, audit log, session store and clock injected. Proof: `tests/auth/oauth-public-surface.test.ts` and local-mode check that none of the new paths exist (404) in `tests/auth/connection-flow.test.ts`.
- [x] T016 [P] [US1] Matrix and parity: add cases to `policies/matrix-cases.json` for every new route with each test role, and parity cases in `tests/auth/` for the browser operations. Proof: `bun test tests/auth/authorize.test.ts tests/auth/access-boundary.test.ts` pass with the new cases.
- [x] T017 [US1] Audit: write the connection events of `contracts/connection-management.md` from the service and routes, with the connection id in the existing field, bounded anonymous denials at the unauthenticated endpoints. Add `recordConnectionEvent(endpoint, grant, outcome)` to `src/server/observability/metrics.ts` with only those three labels (FR-064). Proof: `tests/auth/connection-secrets.test.ts`, which also asserts the metric labels, and: after a complete flow (consent, issue, refresh, replay, revoke) no audit line, log line, metric output or state file contains a token, code, setup credential, verifier or hash (SC-005, FR-074).

## Phase 4: User Story 2 - Lifetime follows the browser session (P1)

**Independent Test**: `bun test tests/auth/connection-lifetime.test.ts`.

- [x] T018 [US2] Subscribe the service to `sessions.onEnded` in `src/server/handler.ts` or `src/server/auth/authentication.ts`, end connections with the right reason, and add the one-minute sweep for deactivation, removed grants, removed programs and ended records older than 7 days. Proof: `tests/auth/connection-lifetime.test.ts` scenarios 1 to 6 of Story 2, including restart with surviving and missing sessions.
- [x] T019 [US2] In `resolve`, rebuild the person with `access.principalFor`, refuse and end on deactivation or no grants, and never touch last-seen time or the provider. Proof: the same test file: a thousand simulated agent calls across an idle window leave `lastSeenAt` unchanged; a grant change reduces the next call; the provider fake receives no request (FR-042, FR-048).
- [x] T020 [US2] Person's and Admin's list and revoke routes in `src/server/routes/connections.ts` and `src/server/routes/admin-connections.ts`. Proof: `tests/auth/connection-lifetime.test.ts` scenario 6, plus 404 for another person's id, plus an Admin list that holds no token or hash.

## Phase 5: User Story 3 - Admin controls programs (P1)

**Independent Test**: `bun test tests/auth/programs-admin.test.ts` and the Admin browser check.

- [x] T021 [US3] `GET`, `PUT` and `POST .../preview` for programs in `src/server/routes/admin-connections.ts` using the existing receipt and one-commit flow of `src/server/auth/access-admin.ts`; effects of confirmed removals call `connection-service.end`. Proof: `tests/auth/programs-admin.test.ts` scenarios 1 to 5 of Story 3, including the byte-identical unknown and invalid client answers.
- [x] T022 [P] [US3] Documented configurations: `docs/agent-connections.md` section per program from the registration contract, with "not tested" for programs without a run. Proof: `tests/docs-agent-connections.test.ts` checks that every program named has a status line and that no program is called supported without an acceptance record.

## Phase 6: User Story 4 - Headless setup (P2)

**Independent Test**: `bun test tests/auth/connection-flow.test.ts -t setup` and `bun test tests/mcp/bridge-server-mode.test.ts` (needs 006).

- [x] T023 [US4] `GET/POST /oauth/setup` in `src/server/routes/oauth.ts` and the setup grant in the token endpoint. Proof: scenarios 1, 2, 3 and 5 of Story 4: same connection kind, identical failures for spent, expired, foreign and ended-session credentials, shown once, never in an address.
- [x] T024 [US4] **needs 006** Extend `scripts/mcp-stdio.ts` (and a small `scripts/mcp-credential-file.ts` shared with the local capability's file protection) for `SW_SERVER_URL`, `SW_SETUP_CREDENTIAL` and `--setup-credential-file`: exchange, owner-only file, refresh before expiry, reconnect message on `invalid_grant`, no secret on any output stream. Proof: `tests/mcp/bridge-server-mode.test.ts` against a test server: file mode 0600, nothing printed, refresh, ended connection message; Windows access-list code path covered by the existing fake-platform test style of 006.

## Phase 7: User Story 5 - Scopes (P2)

**Independent Test**: `bun test tests/connections/scopes.test.ts tests/auth/connection-scopes.test.ts`.

- [x] T025 [US5] Intersect requested scopes with the person's roles at consent (disabled rows with reason) and with the program's allowed scopes; pass `effectsOf(scopes)` to the caller. Proof: `tests/auth/connection-scopes.test.ts` scenarios 1 to 5 of Story 5 on the operation inventory, with `administration` refused as unknown.
- [x] T026 [US5] Inventory walk: for each operation in `policies/operation-inventory.json`, the set of scope combinations that can reach it equals the table; no operation reachable with its effects missing; `destroy` reachable by none. Proof: `tests/auth/connection-scopes.test.ts` generated cases (SC-004).

## Phase 8: User Story 6 - Replay ends the connection (P2)

- [x] T027 [US6] Replay and code-reuse paths in `connection-service` and the token endpoint, including the rate-limited flood case. Proof: `tests/auth/connection-flow.test.ts` scenarios 1 to 4 of Story 6.

## Phase 9: MCP endpoint in server mode (needs 006)

- [x] T028 **needs 006** Create `src/server/mcp/server-mode-gate.ts` (method, Origin, content type, bearer, connection state in that order) and select the gate by mode in `src/server/routes/mcp.ts`; mint the caller per request with origin `mcp`, connection id, effects and the owning session; mount the route in server mode in `src/server/handler.ts`. Proof: `tests/mcp/server-mode-gate.test.ts`: order of checks (one case per adjacent pair), cookie ignored, invalid bearer never falls back, identity-provider JWT refused, connection token refused on `/api/agent/`, challenge shape, no reason leaked.
- [x] T029 **needs 006** `tests/mcp/connection-parity.test.ts`: tool list and a direct call of every tool for each scope combination and role fixture; a delegated Git credential found through the caller's session with no cookie; hidden equals missing. Proof: test passes; `tests/auth/boundary-scan.test.ts` still passes.
- [x] T030 **needs 006** Ending a connection stops work opened through it: expose the end signal to 006's call limits and cursors (`AbortSignal` per connection). Proof: a test that ends a connection during a slow tool call and sees the call aborted.
- [x] T031 [P] **needs 006** Acceptance run: `scripts/mcp-acceptance.ts` extended for server mode with the reference client; record versions and date in `docs/mcp-acceptance.md`. Proof: the recorded run; a failure leaves the program "not tested".

## Phase 10: Interface and browser checks

- [x] T032 [P] [US1] Add layout rules (scope rows, code box, stacked buttons at narrow width) to `src/server/routes/auth-stylesheet.ts`; no literal colours. Proof: `bun run check:theme` and `tests/auth-pages.test.ts` style assertions pass.
- [x] T033 [P] [US2] `src/app/auth/AgentConnectionsDialog.tsx` and the menu item in `src/app/auth/PersonMenu.tsx` (server mode only): list, revoke with confirmation naming the connection, link to the setup page, empty, loading, error and long-text states. Proof: component tests `tests/agent-connections-dialog.test.tsx` including geometry and no `text-overflow`.
- [x] T034 [P] [US3] `AgentProgramsSection.tsx` and `AgentConnectionsSection.tsx`, entries in `src/app/admin/admin-sections.ts` and `AdminPage.tsx`, API calls in `src/app/admin/api.ts`, types, styles in `src/app/admin/admin.css`; review flow through `ReviewChange.tsx`. Proof: `tests/admin-agent-programs.test.tsx` including empty, error and long-text states and the removal confirmation text.
- [x] T035 Add terms to `scripts/terminology-check.ts` word list so "agent program" and "connection" are used consistently. Proof: `bun run test:terminology`.
- [x] T036 Write `scripts/connections-browser-check.ts` and the `test:connections` script in `package.json`: consent, setup, error pages, dialog and both Admin sections, light and dark, 320, 768 and 1280 pixel widths, all states, no clipped text, plus the `form-action` redirect check of research R7 in the browsers the suites use. Proof: the script passes on the dev server (`sw-midgard-run -- bun run test:connections`).
- [ ] T037 Hand the screenshot capture to Codex through the screenshots brief: a fresh worktree of current `main` plus this branch, temporary `DATA_DIR`, spare port, output folder, manifest, forbidden: owner's data, running ports, commits, pushes. Proof: the manifest lists every screen and state of FR-075; findings are judged here and fixed.

## Phase 11: Research checks, documentation, mutants, hand-off

- [x] T038 Compare `contracts/oauth-endpoints.md` with the 2026-07-28 authorization text and the metadata standards it references (research R6, R14); record each difference in `research.md` and change the contract and tests before T013 is considered done. Proof: a "Verified" section in `research.md` with the source versions read.
- [ ] T039 **needs 006** Run Codex CLI against a test server (research R2): callback port, client id, resource indicator, discovery path. Record the result in `docs/mcp-acceptance.md`. Proof: the recorded result; the supported list in `docs/agent-connections.md` follows it.
- [x] T040 Targeted mutants in `scripts/connections-mutation-cases.ts` wired into `scripts/mutation-tests.ts` and `scripts/mutation-case.ts`: skip code single use, skip PKCE check, loosen redirect comparison, drop resource binding, drop program binding, accept a retired refresh token, skip session binding, widen scope past roles, accept an expired token, accept a cookie on the MCP endpoint. Proof: `bun run test:mutation -- connections` (own cases only) detects every mutant; the full mutation run is part of the batch gate.
- [x] T041 Documentation in the same change: `docs/agent-connections.md`, `README.md` (agent connections, scopes, lifetime, onward use sentence, supported programs), `docs/server-mode.md`, `docs/configuration.md` (only if a setting was added), `docs/mcp.md` (from 006: server mode now mounts the endpoint), `ARCHITECTURE.md` (the connections folder and the flow), `docs/user-guide.md`, `CHANGELOG.md`, `schemas/README.md` (the `programs` document). Proof: `bun --bun run check` (comments and docs checks) passes; every limit in the spec's SC-010 appears on the consent page or in the guide.
- [x] T042 Add `test:connections` to `scripts/gate-suites.ts` and the pipeline lists in `scripts/ci-validate.ts` so the batch gate runs it. Proof: `bun test tests/pipeline/ci-validate.test.ts` passes.
- [x] T043 Run this feature's own proof: `bun test tests/connections tests/auth/connection-flow.test.ts tests/auth/connection-lifetime.test.ts tests/auth/connection-scopes.test.ts tests/auth/connection-secrets.test.ts tests/auth/oauth-public-surface.test.ts tests/auth/programs-admin.test.ts tests/auth/programs-schema.test.ts tests/auth/consent-pages.test.ts`, `bun --bun run check`, `bun --bun run build`. Proof: all pass; output kept for the batch.
- [ ] T044 Hand off to the batch gate: report to the integrator the files changed, the shared-file overlaps of the plan, the re-recorded characterization field, and the open items (T038, T039 if not done). The full unit suite, `bun run test:mutation`, every browser suite (`test:auth`, `test:admin`, `test:connections`, the responsive and clipping suites), the UI regression comparison against the last release, and the `architecture-reviewer` run once on the integrated batch, followed by `review_marker.py mark`. Proof: the batch gate report names this feature green.

## Dependencies and order

- Phase 1 tasks T001 to T004 are independent; T005 and T006 follow T003.
- T007 and T008 are independent of Phase 1 and of each other; T009 follows T008 and T010 (stub).
- T010 follows T001 to T007.
- Phase 3 follows T010; T011 and T012 can start earlier; T014 before T013's route tests can pass; T017 last in the phase.
- Phase 4 follows T010 and T013. Phase 5 follows T008, T009 and T014. Phase 6 T023 follows T013; T024 needs 006.
- Phases 7 and 8 follow T013.
- Phase 9 needs 006 merged and T018 to T020.
- Phase 10: T032 to T034 are parallel after T013, T020 and T021; T036 after them; T037 after T036.
- T038 starts first of all research tasks, and before T013 is final. T039 after T028.
- T040 after Phases 3 to 9 have code. T041 and T042 after T040. T043 and T044 last.

## Parallel examples

- After T010: T011, T012 and T016 together; then T013 and T014.
- After T013: T018, T023, T025 and T027 touch different test files and can run in parallel.
- T032, T033 and T034 touch different UI files.

## Implementation strategy

MVP is Stories 1 and 2 plus the registration store: phases 1 to 5 deliver the flow, lifetime and
control on this base with a test client. Phase 9 connects it to the real endpoint when 006 lands.
Setup credentials, scope refinements and replay hardening follow in the order above. Every phase
ends with its own targeted proof; the full gate runs once, on the integrated batch.

## Traceability

| Decision or finding | Requirements | Tasks |
| --- | --- | --- |
| M2 authorization server, tokens, PKCE, redirect, rotation, replay | FR-001 to FR-008, FR-015 to FR-033 | T001 to T006, T010 to T015, T027, T038 |
| M3 administered registrations | FR-004, FR-009 to FR-014, FR-067 | T004, T008, T009, T021, T022, T034 |
| M4 headless credential | FR-034 to FR-040 | T023, T024 |
| M5 lifetime | FR-026, FR-041 to FR-049 | T007, T018 to T020, T030 |
| M9 scopes | FR-052, FR-056 to FR-060 | T001, T025, T026, T029 |
| M11 sentence | FR-018, FR-063, FR-065 | T012, T041 |
| M1, M14 boundary and audit | FR-051, FR-055, FR-061, FR-062 | T017, T028, T029 |
| Principle I and IV | FR-002, FR-031, FR-032, FR-050 | T006, T014, T028 |
| R2 gates, UI rules | FR-066 to FR-075, SC-009 | T032 to T037, T040 to T044 |

## Joined relay connections

- [x] Connect the real service to the panel; list and confirm revocation with origin; refuse cross-transport tokens; prove revocation and browser lifetime endings stop the panel and 1,000 relay requests cause zero session touches (`tests/acp/server-mode.test.ts`).
- [x] Prove ACP receipt ownership and current authorization through the operation boundary.
