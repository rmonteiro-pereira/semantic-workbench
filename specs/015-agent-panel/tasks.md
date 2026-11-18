# Tasks: Agent Panel

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: 010 (on this base). 006 for local mode and the guarded save (marked "needs 006").
013 for server mode (marked "needs 013"). Tasks that need neither can start now.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours and may run in parallel.

**Process (owner, 2026-11-17).** During implementation each task runs only its own tests,
`bun --bun run check` and `bun --bun run build`. The full gate (full unit suite, `bun run
test:mutation`, every browser suite, and the UI regression comparison against the last release) and
the architecture review run once, on the integrated batch, in the last task. Heavy runs go to the
dev server with `sw-midgard-run -- <command>`. Formatter on every changed file. No task edits a
test only to make it pass.

## Phase 1: Verify and pin the protocol (blocks every phase)

- [x] T001 Verify the protocol facts listed in `research.md` R1 against the published protocol
  schema and its documentation: revision, transport, the agent requests (read text file, write
  text file, ask permission, terminal), the client calls (initialize, new session, prompt, cancel),
  the update notifications, content kinds, whether a write carries a base version, whether a
  schema file and its licence exist. Write the answers, the source address and the date as the
  "Protocol record" section of `docs/agent-panel.md`. If a plan assumption fails, edit `plan.md`
  and the contracts first. Proof: every R1 item has an answer or the line "not published"; the
  record names the pinned revision.
- [ ] T002 Copy the pinned schema to `schemas/acp-<revision>.json` unmodified, record its source
  and revision in `docs/agent-panel.md`, and add `tests/acp/protocol-schema.test.ts` that checks
  the file hash and that the validators for the frames the plan uses compile. Proof: `bun test
  tests/acp/protocol-schema.test.ts`. If no schema file exists, stop and write the SDK
  justification in `plan.md` (research R2 gate).
- [ ] T003 [P] Write `scripts/acp-reference-agent.ts`: a scripted agent that speaks the verified
  subset over standard input and output and follows a JSON script (read, write, write stale, ask,
  send a task list, send a huge message, flood, exit). Add `tests/acp/reference-agent.test.ts`
  that drives it over pipes. Proof: the test passes; the agent uses only the advertised abilities.

## Phase 2: Origin `acp` (foundation)

- [ ] T004 Add `acp` to `CALLER_ORIGINS` in `src/shared/observability/operation.ts`. Proof:
  `bun --bun run check` fails nowhere; the type now includes `acp`.
- [ ] T005 [P] Accept and filter origin `acp` in `src/server/auth/audit.ts` and
  `src/server/routes/audit.ts`; the JSON export carries it, the CSV appends nothing new (the
  `origin` column exists from 010). Extend `tests/auth/audit-origin.test.ts` and
  `tests/auth/audit-compat.test.ts` (old months still verify). Proof: `bun test tests/auth/audit-origin.test.ts tests/auth/audit-compat.test.ts` and `bun run audit:verify tests/fixtures/audit-v1`.
- [ ] T006 [P] Check `src/server/auth/operation-boundary.ts`, `src/server/auth/operation-inventory.ts`
  and `src/server/observability/metrics.ts` for any test of the literal `'mcp'`; make each accept
  `acp` as an origin. Add `tests/auth/acp-origin.test.ts`: an `acp` caller gets the same decisions
  as an `mcp` caller for ten operations, and the metric label is `acp`. Proof: the test passes.
- [ ] T007 [P] Add the `acp` case to `tests/auth/replay-fixture.ts` consumers: a log of 50,000 `acp`
  reads and 300 writes keeps all 300 writes in the dry-run sample
  (`tests/auth/dry-run-strata.test.ts`). Proof: the test passes without a change to
  `src/server/auth/replay-sample.ts`; if it needs one, change it and say why.
- [ ] T008 [P] Add the `acp` option to the origin filter in `src/app/admin/AuditSection.tsx` and
  `src/app/admin/types.ts`; update `specs/003-authn-authz/contracts/audit-log.md` and
  `docs/audit-tamper-evidence.md` text. Proof: `bun test tests/admin-presentation.test.tsx`.

## Phase 3: Frames and sessions (pure code first)

- [ ] T009 [P] [US7] Create `src/server/acp/virtual-path.ts` with parse and format for
  `/workbench/<project>/<path>` and the refusals of FR-022. Add `tests/acp/virtual-path.test.ts`
  with generated hostile inputs (at least 500: `..`, `%2f`, `%5c`, backslash, drive letters,
  control characters, very long, non-ASCII, empty segments). Proof: the test passes; a result is
  always either the intended project and path or a refusal.
- [ ] T010 [P] [US5] Create `src/server/acp/panel-session.ts`: the state machine of data-model with
  the 13 end reasons and the timers (wait 10 min, idle 30 min, ended retention 10 min) as pure
  functions over a passed-in clock. Add `tests/acp/panel-session.test.ts` with a table of every
  transition and every end reason. Proof: each of the 13 reasons is produced by a case; `ended`
  accepts no further transition (SC-005, partial).
- [ ] T011 [P] [US2] Create `src/server/acp/event-buffer.ts` (500 events, 4 MiB, overflow notice)
  and `src/server/acp/panel-events.ts` (event types, plain-text normalization, placeholder for
  unknown content kinds). Add `tests/acp/event-buffer.test.ts`. Proof: overflow drops the oldest
  and emits one notice; a 1,000,000-character message is kept whole when alone; markup stays text.
- [ ] T012 [US3] Create `src/server/acp/protocol-schema.ts` and `src/server/acp/jsonrpc-connection.ts`
  (requests, replies, notifications, id matching, size cap, schema refusal). Add
  `tests/acp/jsonrpc-connection.test.ts`: unmatched replies, duplicate ids, oversize frames, frames
  that fail the schema, batches (refused unless the record says allowed). Proof: the test passes.
- [ ] T013 [US5] Create `src/server/acp/frame-link.ts`: sequence numbers, acknowledgement, replay
  buffer (256 frames or 4 MiB), duplicate drop, heartbeat clock. Add `tests/acp/frame-link.test.ts`
  including a property run of 100 random drops and reconnects with no loss and no repeat (SC-006,
  link part). Proof: the test passes.
- [ ] T014 [US1] Create `src/server/acp/session-store.ts`: create (one per person, replace with
  confirmation), find by owner (foreign and unknown identical), end, expiry sweep, memory only.
  Add `tests/acp/session-store.test.ts`. Proof: another person's id behaves exactly as an unknown
  id in answer shape and timing class; a replaced session ends with `replaced`.
- [ ] T015 [P] [US7] Create `src/server/acp/flood-guard.ts`: per-person limits using 006's call
  limit settings (needs 006: import the settings type; until 006 lands use a local copy of the
  three constants marked for removal), the 5-second flood rule and the two-oversize rule. Add
  `tests/acp/flood-guard.test.ts`. Proof: bursts of 40 pass, the 41st is limited, a flood ends the
  session with `flood`.

## Phase 4: File requests through the boundary (User Stories 3 and 7)

- [ ] T016 [US3] Create `src/server/acp/connection-auth.ts` with `mintAcpCaller(principal,
  connection, scope, session)` using `mintCaller` with origin `acp`, and the scope narrowed to
  `read` and `localWrite`. Add `tests/acp/connection-auth.test.ts`: an unminted caller literal is
  refused by the boundary; the scope refuses a `commit` effect. Proof: the test passes.
- [ ] T017 [US3] Create `src/server/acp/file-requests.ts`: read and write exactly as
  `contracts/acp-client-surface.md` (two-step write, version record map with 2,000 entries, create
  semantics, applied-repeat rule, change cards, guard rewrite report). It builds requests with
  `src/server/auth/twin-request.ts` and calls `operate`; it never reads project files. Needs 006
  for the `validate` twin and save semantics; until 006 lands the tests use the 010 twins
  `files.read` and `files.save`. Proof: `bun test tests/acp/file-requests.test.ts` with the cases
  of User Story 3 (accepted, stale, unread, create, create race, invalid, hidden, draft kept,
  repeat).
- [ ] T018 [US3] Add `tests/acp/file-parity.test.ts`: at least 30 cases run through HTTP, through
  an `mcp` twin and through the ACP file request, and compare status class, normalized body and
  audit record ignoring request id, time, origin, tool and connection. Cases include a custom role
  limited by path, a guarded field, a protected branch, a read-only role and an application-free
  person. Proof: the table passes (SC-001).
- [ ] T019 [US7] Create `src/server/acp/client-surface.ts` mapping each agent request to a file
  request, a question, an update or "unsupported"; terminal and every unknown request answers
  unsupported and runs nothing. Add `tests/acp/hostile-requests.test.ts` with at least 40 cases
  (server paths, traversal, terminal, unknown methods, oversize, flood, plan or context requests,
  commit-like requests) and a before and after comparison of the data root, Git state and audit
  log. Proof: the test passes (SC-002).
- [ ] T020 [P] [US4] Add the question handling to `client-surface.ts`: forward to the panel, one
  answer from the offered ids, cancel on timeout, on turn cancel and on end; at most 5 pending.
  Add `tests/acp/questions.test.ts`. Proof: the test passes; an "always allow" answer does not
  change what the boundary decides afterwards (a refused write stays refused).
- [ ] T021 [US7] Extend `tests/auth/boundary-scan.test.ts` to fail when `src/server/acp/` imports a
  `src/server/mcp/` module other than the capability reader and call-limit settings, or builds a
  scope. Proof: the test passes and a deliberately added import makes it fail locally.

## Phase 5: Routes and the relay

- [ ] T022 [US1] Create `src/server/routes/acp-relay.ts` (hello, frames, stream, bye per
  `contracts/relay-connection.md`): `Origin` refused, bounded body, same 404 for every failure,
  `Last-Event-ID` resume, comment keep-alive every 15 seconds. Local mode authentication through
  `connection-auth.ts` and 006's capability reader. Needs 006. Proof: `bun test
  tests/acp/relay-routes.test.ts` (wrong code, reused code, expired code, foreign session, ended
  session, oversize body, browser Origin all answer as specified).
- [ ] T023 [US1] Create `src/server/routes/acp-panel.ts` (create, events, prompt, cancel, answer,
  end per `contracts/panel-api.md`) with the cross-site checks of browser routes and the owner
  check on every route. Proof: `bun test tests/acp/panel-routes.test.ts` including another person's
  session id, a missing `X-SW-Request` header, two tabs posting one prompt (sent once), and
  attached file paths that are refused by the virtual-path check without saying whether they exist.
- [ ] T024 [US1] Add route rows for the ten routes in one contiguous block in
  `src/server/auth/route-actions.ts`, entries in `policies/operation-inventory.json` (exposure
  `never`; dispatch `no: browser-only` for the six panel routes and `no: public` for the four relay
  routes, which authenticate by their own credential; check
  `schemas/semantic-workbench-operations-v1.json` and add a reason only if none fits), cases in `policies/matrix-cases.json`, and regenerate
  `docs/operations.md` with `bun scripts/operation-inventory-table.ts`. Proof: `bun test
  tests/auth/operation-inventory.test.ts tests/auth/route-actions.test.ts` and the matrix test.
- [ ] T025 [US1] Mount the stores and route groups in `src/server/handler.ts` (local mode when the
  MCP capability exists; server mode when 013's authenticator exists), and pass the 013 or 006
  session-end signal to `session-store.ts`. Proof: `bun test tests/acp/mount.test.ts`: absent
  prerequisites mean no routes (404) and no menu item flag in `/api/me`.
- [ ] T026 [US1] Write `scripts/acp-relay.ts`: argument parsing, child process hosting the agent,
  frame forwarding both ways with numbering, resume on reconnect, heartbeat, exit rules, capability
  read per request (local) and credential exchange from `SW_ACP_CREDENTIAL` (server). Add
  `tests/acp/relay-script.test.ts` driving it against an in-process server and the reference agent.
  Proof: the test passes; the credential never appears in the process arguments or in any output
  captured by the test (SC-007); a port scan during the run finds the relay listening on none
  (FR-014).
- [ ] T027 [US5] Wire the end reasons: browser end and close, relay loss, agent exit (`bye`), idle,
  replace, flood, protocol error, server restart message on the next relay call. Add
  `tests/acp/end-reasons.test.ts` producing all 13 reasons end to end and checking that the next
  agent request is refused after each. Proof: the test passes (SC-005).
- [ ] T028 [US5] Needs 013: connect the revocation signal (sign-out, expiry, deactivation,
  revocation) to the session store, and the credential creation to the create route; the agent
  traffic never calls the session touch. Add `tests/acp/server-mode.test.ts`. Proof: the test
  passes for sign-out, expiry, deactivation and revoke; a recorded count of session "touch" calls
  during a run of 1,000 agent requests is zero.
- [ ] T029 [US6] Write session start and end audit records and the refused-attempt records through
  the anonymous gate. Add `tests/acp/audit-records.test.ts`: one record per operation, none
  containing message or file text (a canary string in prompts and files is searched for in the audit
  log, logs and metrics output). Proof: the test passes (SC-007, SC-011).

## Phase 6: The panel (User Stories 1, 2, 3, 4, 5)

- [ ] T030 [US1] Create `src/app/agent/agent-api.ts` and `src/app/agent/agent-events.ts` (the pure
  reducer from events to panel state). Add `tests/agent-events.test.ts`. Proof: the test passes,
  including overflow notice, reconnect catch-up and a message arriving after cancel.
- [ ] T031 [US1] Create `src/app/agent/useAgentSession.ts`, `AgentPanel.tsx`, `ConnectStep.tsx`,
  `WaitingStep.tsx`, `SessionNotice.tsx` and `AgentPanel.css` in the existing visual design (tokens
  only, no literal colours; the Modal for the connect step). The statement text is the fixed text
  of FR-003. Add `tests/agent-panel-connect.test.tsx`. Proof: the test passes for connect, waiting,
  error and ended states; `bun scripts/check-theme.ts` finds no literal colour.
- [ ] T032 [US2] Create `Transcript.tsx`, `MessageBlock.tsx`, `TaskList.tsx` and `PromptBox.tsx`:
  plain-text rendering, wrapping, scroll, a polite live region, the label "the agent's task list".
  Add `tests/agent-panel-transcript.test.tsx` with a 1,000,000-character message, a 5,000-character
  task entry, a 600-character path, markup and script text. Proof: the test passes; no element
  has `text-overflow`, `line-clamp` or a fixed-width label (a scan in the test).
- [ ] T033 [US3] Create `ChangeCard.tsx` using `src/app/scm/DiffView.tsx` for the diff, with
  accepted and refused variants and **Undo** as the ordinary save from the card's version. Add
  `tests/agent-panel-change.test.tsx`. Proof: undo reports a conflict when the file changed since;
  the saved text equals the earlier text otherwise.
- [ ] T034 [US4] Create `QuestionCard.tsx`: options as plain text, focus moves to the first option,
  alert role, answer and cancel. Add `tests/agent-panel-question.test.tsx`. Proof: the test passes
  with eight long options.
- [ ] T035 [US1] Add the person-menu item in `src/app/auth/PersonMenu.tsx`, the lazy mount in
  `src/app/main.tsx`, and the sheet placement in `src/app/workspace/WorkspaceCanvas.tsx`; width
  rules at `NARROW_SCREEN_PX` and `PHONE_SCREEN_PX`. Add `tests/agent-panel-layout.test.tsx` with
  geometry assertions (no overlap, contained) at 360, 768 and 1280 px, light and dark tokens.
  Proof: the test passes; the canvas outside the sheet keeps its geometry when the panel is
  closed again (FR-040); the main bundle size is unchanged by more than the menu item (build
  output compared in the test).
- [ ] T036 [US1] Write `scripts/acp-browser-check.ts` and the script `test:acp` in `package.json`:
  against an isolated in-memory store and the reference agent, run connect, converse, write,
  conflict, question, cancel and every end reason in light and dark at 360, 768 and 1280 px with the
  geometry assertions; `--closed-only` opens the application, never opens the panel and fails on
  any request to `/api/acp/`. Run on the dev server: `sw-midgard-run -- bun run test:acp`. Proof:
  the run passes and writes its screenshots to the scratch folder.
- [ ] T037 [US1] Screenshots for review: hand the capture to Codex using the screenshots brief
  (fresh worktree of the current main with this branch applied, temporary `DATA_DIR`, a spare port,
  light and dark, 360, 768 and 1280 px, every state in the plan's table, long-text variants).
  Judge the screenshots here and fix what is wrong. Proof: a folder with an index and the findings
  file; every state has a screenshot; no clipped text found.

## Phase 7: Mutants, documents and the hand-off

- [ ] T038 [US7] Write `scripts/acp-mutants.ts` and `scripts/acp-mutation-cases.ts` and register
  them in `scripts/mutation-tests.ts` and `scripts/mutation-case.ts`. Mutants: path check skipped;
  `..` allowed; version comparison dropped; base taken from the current version; unread write
  allowed; the second read skipped; hidden answered differently from missing; terminal
  advertised; unknown method runs; wrong owner accepted; reused code accepted; expired code
  accepted; end reason not applied; revoked session still served; flood rule off; frame cap off;
  duplicate frame applied twice; question answer outside the offered ids; content written to
  audit; origin recorded as `http`. Proof: the mutants run alone through `scripts/mutation-case.ts` (the way the
  other mutant files are run) and each is detected; run on the dev server. The full suite runs in
  T044.
- [ ] T039 [P] Write `docs/agent-panel.md` (what it does, what it does not, the content statement,
  scopes, lifetime, the relay command, the protocol record, tested agents, limits, threat model:
  the relay and agent are the person's own processes; the panel is not a sandbox against them).
  Add a link from `README.md` and update the README sentence on content reaching a model, the
  list of outbound calls (none added) and the roles section. Proof: `bun scripts/check-comments.ts`
  and the docs sync check pass; every number in the doc comes from a constant that a test reads.
- [ ] T040 [P] Update `ARCHITECTURE.md` (code map: `src/server/acp/`, `src/app/agent/`; where to
  change a behaviour; invariants), `docs/server-mode.md` (the panel and the sign-out effect),
  `docs/user-guide.md` (how to use the panel), `docs/development.md` (the `test:acp` suite and the
  reference agent), `CHANGELOG.md`. Proof: the docs sync check passes.
- [ ] T041 [P] Register `test:acp` in `scripts/gate-suites.ts` and `scripts/ci-validate.ts` and
  add the `acp:relay` script to `package.json`. Proof: `bun test tests/pipeline/ci-validate.test.ts`.
- [ ] T042 Acceptance run by hand with real agents the person chooses (needs 006; server mode needs
  013): record exact agent names and versions that connected, read, wrote and ended cleanly in
  `docs/agent-panel.md`. Claim compatibility only for those. Proof: the record exists; the README
  names no untested agent.
- [ ] T043 Run the readable-code checker and `scripts/check-comments.ts` on every changed file;
  confirm no spec, task or requirement ID is in a code comment. Proof: both clean.
- [ ] T044 Hand off to the batch gate. This feature does not run the full gate alone. On the
  integrated batch with 012, 013 and 014 the owner of the batch runs: the full unit suite, `bun run
  test:mutation`, every browser suite including `test:acp`, `test:auth` and `test:admin`, the UI
  regression comparison of every existing screen against the last release (the only permitted
  difference is the person-menu item while the menu is open), then the `architecture-reviewer`,
  then records it with the skill's `review_marker.py mark`. Proof: the batch record lists these
  results; this task is closed when the batch gate is green.

## Dependencies and order

- Phase 1 first. T002 and T003 follow T001.
- Phase 2 is independent of Phase 1 except that T006 needs nothing from it; do it first when
  waiting for the protocol verification.
- Phase 3 follows T002 for T012 and T013; T009, T010, T011, T014 and T015 can start now.
- Phase 4 follows Phase 3 and needs 006 for the full guarded save.
- Phase 5: T022 needs 006; T028 needs 013; T023 to T025 can start after Phase 3.
- Phase 6 can start in parallel with Phase 4 against a mocked API (T030 to T035).
- T036 and T037 follow Phase 5 and Phase 6.
- Phase 7 last; T038 can start once Phases 3 to 5 have code to mutate. T044 is last.

## Implementation strategy

**MVP**: Phases 1 to 5 in local mode with T030 to T032 (connect, converse, read and guarded
write) and the origin changes. Then questions, undo, server mode (013) and the screenshots.

## Traceability

| Decision or finding | Requirements | Tasks |
| --- | --- | --- |
| M19 (separate inbound integration, no model call, no launch, no shell, guarded save) | FR-002, FR-013, FR-014, FR-021 to FR-030 | T016 to T021, T026 |
| M1 last sentence (reuse the dispatcher, no protocol serialization from MCP) | FR-032, SC-003 | T017, T021 |
| M10 (origin and connection in audit, no Git marker) | FR-033, FR-034 | T004 to T008, T029 |
| E5 (published-only planning for every agent) | FR-030, FR-013, User Story 7 | T019, T038 |
| M9 (scopes narrow authority) | FR-012, FR-032 | T016, T028 |
| M11 (content statement) | FR-003, FR-041 | T031, T039 |
| M12, M13 (preconditions, repeat safety) | FR-024 to FR-027 | T017, T018 |
| M5 (lifetime) | FR-006 to FR-009 | T010, T027, T028 |
| M4 (single-use credential) | FR-010, FR-011 | T022, T026, T028 |
| Fable review section 5 and Astra finding 14 (read first; no assumed child process; explicit boundary) | FR-022, FR-024, FR-025 | T009, T017, T019 |
| R1 row 11 (ACP after stable connections) | Dependencies | T025, T028 |
| R2 (documentation and gates) | FR-041, SC-010, SC-012 | T038 to T044 |
| Constitution VI (mutants, matrix, geometry) | FR-038, SC-008, SC-010 | T024, T035, T036, T038 |
