# Tasks: Operation Boundary

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: none. The constitution amendments (task T049) are drafted in parallel on
`constitution-tessera`; this feature does not wait for them.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours and may run in parallel. Every task that changes code
ends with `bun test` of its area green and the formatter applied. No task edits a test only to make
it pass.

## Phase 1: Record the base (before any source change)

**Purpose**: capture what the unchanged code does, so every later phase is compared with it. These
three tasks are committed before the first change under `src/`.

- [x] T001 [US2] Write `scripts/record-http-characterization.ts` and run it on the unchanged code to produce `tests/fixtures/characterization/http-v1.json`: every entry of `routeExamples` (`tests/auth/route-actions.ts`) for local mode, each built-in role, one custom role, an application client, anonymous, deactivated, and a person without grants; allowed and refused. Record status, normalized body, `X-Request-Id` presence, `Content-Type`, `WWW-Authenticate`, `Retry-After`, and audit fields except time, request id and hash. Add `tests/auth/http-characterization.test.ts`. Proof: the test passes on the base commit; the fixture and test are committed alone.
- [x] T002 [P] [US3] Generate `tests/fixtures/audit-v1/2026-0*.jsonl` (at least three months, allow, deny, snapshot and anonymous records, one month boundary) by running the unchanged `createAuditLog` with a fixed clock, and add `tests/auth/audit-compat.test.ts` asserting `verifyAuditChain` passes and `bun run audit:verify tests/fixtures/audit-v1` exits 0. Proof: passes on the base commit and does not depend on today's date (fixed clock, no pruning of the fixture).
- [ ] T003 [P] [US4] Record the dry-run baseline: a fixture audit log (`tests/fixtures/dry-run/`) and the replay result of the unchanged `compare` as `tests/fixtures/dry-run/baseline.json`, with a test that reproduces it. Proof: passes on the base commit.
- [ ] T004 [P] [US2] Write `scripts/boundary-benchmark.ts` (in-process handler, 5,000 requests mixing allowed reads, denials and writes) and record its median and 95th percentile on the base commit in the pull request description. Proof: the script runs and prints both numbers.

## Phase 2: Split the middleware (blocks every story)

**Purpose**: relocate code without changing behaviour. After each task the characterization test and
the existing suite are green; each task is its own commit.

- [ ] T005 [US1] Create `src/server/auth/caller.ts` (`Caller`, `CallerOrigin`, `mintCaller`, `assertMinted` with a module-private `WeakSet`) and `tests/auth/operation-boundary.test.ts` cases: a minted caller is accepted; a structural copy, a spread copy and a caller literal are refused (FR-002). Proof: the new tests pass; nothing else imports `mintCaller` yet.
- [ ] T006 [US1] Extract the network authentication stage into `src/server/auth/request-authentication.ts`: `limitedResponse`, local check call, `bearerIdentity`, cross-site check, principal resolution and the anonymous audit gate (FR-001). `createAccessMiddleware` calls it in the original order. Proof: characterization and `tests/auth/middleware.test.ts`, `bearer.test.ts`, `rate-limit.test.ts`, `csrf*.test.ts` unchanged and green.
- [ ] T007 [US1] Add `attachIdentity(request, caller, ...)` to `src/server/auth/request-scope.ts`, setting `requestAccess`, `requestAuditId`, `requestSourceIp`, `requestRemote`, `requestAuditProjects` and the new `requestSession` in one place; replace the assignments in `middleware.ts` and `handler.ts` (FR-005). Proof: characterization green; a test lists every exported identity symbol and fails when `attachIdentity` does not set it.
- [ ] T008 [US1] Move `execute`, `routeDecision`, `refusal`, `refusedTarget`, `auditInput`, `trashLookup`, `trashResource`, `auditScope` and `outcome` into `src/server/auth/operation-boundary.ts` as `createOperationBoundary(...)` returning `operate`. The functions are relocated, not rewritten (FR-003, FR-004). Proof: characterization and the whole `tests/auth/` suite green; `git diff --color-moved` shows moved blocks only.
- [ ] T009 [US1] Shrink `src/server/auth/middleware.ts` to the HTTP adapter: request id, observability wrapper, route lookup for the anonymous action and page redirect, minting the HTTP caller, calling `operate`. Remove the dead helpers. Proof: file under 400 lines; characterization green; `bun --bun run check` passes.
- [ ] T010 [US2] Make the order of checks explicit in `tests/auth/middleware.test.ts`: one case per adjacent pair of steps (rate limit before local check, local check before bearer, bearer before cross-site check, cross-site before routing, client refusal before not-found, public before principal, principal before decision) showing the earlier refusal wins (FR-001). Proof: the cases pass on the refactored code and fail when the matching mutant of T044 is applied.

**Checkpoint**: the server behaves as before and `operate` exists, called only by the adapter.

## Phase 3: User Story 1 - One boundary for both transports (P1)

**Goal**: a minted caller and a twin request give the same decision, handler run and audit as HTTP.

**Independent Test**: `bun test tests/auth/operation-parity.test.ts tests/auth/twin-request.test.ts`.

- [ ] T011 [US1] Create `src/server/auth/twin-request.ts` (`buildTwinRequest`) per the contract: encoded parameters and splat, sorted query, JSON body with the operation's byte limit, fixed internal host, only `Content-Type`, abort signal (FR-007, FR-010). Add `tests/auth/twin-request.test.ts` with header and encoding cases. Proof: tests pass; no `Cookie`, `Authorization`, `Origin` or `Host` is ever set.
- [ ] T012 [US1] Add the generated hostile-parameter test to `tests/auth/twin-request.test.ts`: for every parameterized row shape, at least 500 generated values (`../`, `%2f`, `?`, `#`, control characters, long and non-ASCII strings) either build a request that matches the intended row or fail to build (FR-011). Proof: the test passes; a mutant that skips encoding (T044) fails it.
- [ ] T013 [US1] In `operation-boundary.ts`, add the dispatch refusals: unminted caller, public rows, stream rows and rows whose inventory entry is not `dispatch: twin` answer as unmapped; a named operation must match the row's inventory entry (FR-006, FR-008, FR-009). Proof: `tests/auth/operation-boundary.test.ts` cases for each refusal, including scenario 5 and 6 of the spec.
- [ ] T014 [US1] Extend `src/server/auth/remote-credentials.ts` so `deps.session` reads `requestSession` first and never falls back to the cookie for a request that carries it; extend `tests/auth/remote-credentials.test.ts` with a twin that obtains the caller's GitHub and Azure DevOps credential without any cookie, and a request without a session that still gets "connect required" (FR-005, clarification Q10). Proof: both cases pass; the existing credential tests are unchanged.
- [ ] T015 [US1] Create `src/server/auth/connection-scope.ts` (effect vocabulary, `scopeAllows`, `requireEffect`) and call `requireEffect(request, 'remote')` in `src/server/routes/git.ts` where a commit asks for push, and the matching effect where a publish or default-ref push runs; the static check is in `operate` (FR-015). Add `tests/auth/connection-scope.test.ts`: a scoped caller cannot commit with push, cannot publish, a scope never grants beyond the role, and a caller without a scope behaves exactly as before. Proof: tests pass; characterization green.
- [ ] T016 [US1] Write `tests/auth/operation-parity.test.ts`: for each operation with handler checks (git stage, unstage, commit with and without push, revert, switch, publish, push-default, remote and folder set; file save, batch save, delete, move, import; document save; clone; trash restore and undo; suggestions accept; project create), run allowed, denied action, denied target, hidden target, missing target and, for body-targeted rows, one denied among several through HTTP and through `operate` with a twin, and compare status, normalized body and audit record (FR-012, FR-013, SC-002). Proof: the table passes; removing one handler check from `git.ts` fails the matching case.
- [ ] T017 [US1] Add twin-specific hidden-equals-missing cases to the parity test: a file the caller may not read, a project the caller may not see, a trash entry not readable, each against its missing twin, comparing status, body and audit reason (FR-014). Proof: passes in server mode; local mode keeps its own "not found" text as for HTTP.
- [ ] T018 [US1] Add `tests/auth/boundary-scan.test.ts`: scan `src/server/` and `scripts/` for calls to `forRequest` and for scope construction outside `operation-boundary.ts`, `request-authentication.ts`, `authorize.ts`, `dry-run.ts`, `access-admin.ts` and the listed policy modules; when `src/server/mcp/` exists, require that it imports only the public entry points (FR-037, SC-003). Proof: passes; adding a `forRequest` call in a route fails it.

**Checkpoint**: 006 can dispatch a twin with full parity.

## Phase 4: User Story 3 - Audit says where an operation came from (P1)

**Goal**: origin, tool, method, connection and semantic outcome in the record; old months verify.

**Independent Test**: `bun test tests/auth/audit-origin.test.ts tests/auth/audit-compat.test.ts` and `bun run audit:verify tests/fixtures/audit-v1`.

- [ ] T019 [US3] Add `origin`, `tool`, `method` and `connection` to `AuditInput` and `record()` in `src/server/auth/audit.ts` with validators (origin set, inventory ids, method list, connection pattern); invalid values throw and nothing is written (FR-020). Proof: `tests/auth/audit-origin.test.ts` writes valid records and rejects each invalid class.
- [ ] T020 [US3] Add the serializer-completeness test to `tests/auth/audit-origin.test.ts`: every key of `AuditInput` is serialized or on an explicit "intentionally not stored" list (FR-021). Proof: removing `tool` from `record()` fails it.
- [ ] T021 [US3] Extend `tests/auth/audit-compat.test.ts`: old months alone, old months followed by new-shape records in the same month and across a month boundary, `parseMirror` and mirror checks with mixed lines, and `audit:verify` exit codes (FR-022, SC-004). Proof: passes; the fixture files from T002 are byte-identical to their creation commit.
- [ ] T022 [P] [US3] Add `origin` and `tool` filters to `queryAudit` and `src/server/routes/audit.ts`, append the new CSV columns in `exportAudit`, and test Admin and Steward visibility with the new filters (FR-023). Proof: `tests/auth/audit.test.ts` cases; the existing export tests pass unchanged.
- [ ] T023 [US3] In `operation-boundary.ts`, make `shouldAudit` consider the caller's origin so non-HTTP origins audit allowed reads once per operation, and write `origin`, `tool` and `connection` into every record the boundary appends; HTTP callers produce byte-identical records (FR-024, FR-027). Proof: characterization green; new cases show one record per twin call and none for HTTP reads.
- [ ] T024 [US3] Implement the outcome classifier in `operate`: bounded, non-stream responses are cloned after the hidden-response check; the classifier result becomes the record's outcome; failure to classify records `failed` (FR-026). Proof: `operation-boundary.test.ts` cases for a 200 body reporting failure, a stream, an oversized body and a hidden response (the hidden mark must still win).
- [ ] T025 [US3] Add `recordProtocolCall` to `operation-boundary.ts` and a test that discovery, listing and subscription open and close write one record each, a list of 100 items writes one, and a denial is always recorded (FR-025). Proof: tests pass.
- [ ] T026 [P] [US3] Add `recordOperation(origin, operation, outcome, durationMs)` to `src/server/observability/metrics.ts` and span naming by operation id; extend `tests/observability/` with a test that no label, log field or span attribute contains an argument, path or resource name (FR-028). Proof: tests pass; the redaction suite is unchanged.
- [ ] T027 [US3] Confirm in `src/server/index.ts`, `handler.ts` and `authentication.ts` how many audit logs production constructs, build exactly one per data root with the mirror and the configured retention (`audit.retentionDays` from the administration settings), and pass it down (FR-029). Add a test that the configured retention reaches the log and that two constructions are not possible. Proof: test passes; `audit:verify` on a server-mode run passes.
- [ ] T028 [US3] Review every dispatchable route for a 2xx body that reports a failed or partial effect (commit with a failed push, clone job start, batch saves, remote operations); record each in the inventory as `outcomeClassifier` and implement the classifier next to the handler's response type (FR-026 assumption). Proof: a test per classifier; the review's list of examined routes is in the pull request description.

**Checkpoint**: the audit tells where each record came from and verifies old data.

## Phase 5: User Story 4 - Reads cannot evict dry-run evidence (P2)

**Goal**: strata in the replay sample.

**Independent Test**: `bun test tests/auth/dry-run-strata.test.ts`.

- [ ] T029 [US4] Create `src/server/auth/replay-sample.ts` with `MAX_AUDIT_SNAPSHOTS` (moved from `dry-run.ts`, same value), `MAX_READ_SNAPSHOTS` (500), the dedup key and `replaySample(audit)`; extend `audit.recent` or add `recentStrata` so one backward scan fills both strata (FR-030, FR-031). Proof: unit tests for each stratum, dedup and early stop.
- [ ] T030 [US4] Wire `replaySample` into `access-admin.ts` `compare` and `dry-run.ts` `replayDecisions`; protocol-call records are not replayable (`isReplayable`) (FR-030, FR-032). Proof: `tests/auth/dry-run.test.ts` unchanged and green; the baseline test of T003 passes with no MCP records.
- [ ] T031 [US4] Write `tests/auth/dry-run-strata.test.ts`: 50,000 MCP read records followed by 300 write and denial records yield all 300 and at most 500 reads; identical reads appear once; no MCP records equals the baseline of T003; protocol-call records never appear (spec scenarios 1 to 3, SC-005). Proof: the test passes, and with the stratum split removed (T044) it fails.
- [ ] T032 [US4] Measure a dry run over the 50,300-record log against a 50,300-record log without MCP records and record both times in the pull request description (plan performance goal). Proof: numbers recorded; if the goal is missed, a finding is opened and the strata constants or scan are revisited before release.

## Phase 6: User Story 5 - Tool lists by effective permission (P2)

**Goal**: `availableOperations` from the same logic as invocation.

**Independent Test**: `bun test tests/auth/operation-listing.test.ts`.

- [ ] T033 [US5] Factor the pass logic of `routeDecision` into `permittedSomewhere(scope, row)` inside `operation-boundary.ts`, used by both invocation and listing; export the dry run's sample-resource builder from `dry-run.ts` unchanged (FR-016, FR-019). Proof: characterization green.
- [ ] T034 [US5] Implement `availableOperations(caller)`: dispatchable operations whose action (or client action) is allowed on at least one target, in id order, within the connection scope, with no resource names in the result (FR-016 to FR-018). Proof: implemented with T035.
- [ ] T035 [US5] Write `tests/auth/operation-listing.test.ts` with fixtures: built-in roles, a role limited to `docs/**`, a role limited to one document type, a role on one project, an application client, a person without grants, a deactivated person, a scoped connection; equal permissions under different role names give equal lists; a listed operation on a forbidden target is refused (SC-008). Proof: tests pass.
- [ ] T036 [US5] Measure listing time for 20 projects and every operation on the fixture and record it in the pull request description (plan performance goal). Proof: number recorded against the 50 ms goal; a finding is opened if missed.

## Phase 7: User Story 6 - The operation inventory (P2)

**Goal**: the checked-in contract and the test that every route is listed.

**Independent Test**: `bun test tests/auth/operation-inventory.test.ts`.

- [ ] T037 [US6] Create `src/server/auth/operation-inventory.ts`: types, the typed parser with clear errors, lookups by row path and operation id, vocabulary constants (FR-033). Export the request limit constants the inventory names (for example `FILE_SAVE_REQUEST_LIMIT` beside `routes/files.ts`). Proof: parser unit tests accept a valid file and reject one error class each.
- [ ] T038 [P] [US6] Write the inventory entries for the workspace, project, file, draft, metric, KPI, export, document and suggestion rows of `ROUTE_ACTIONS` in `policies/operation-inventory.json`, reading each handler for its checks, inputs and limits. Proof: parser accepts them; handler checks match the code read.
- [ ] T039 [P] [US6] Write the entries for the Git, clone, repository and remote rows (`routes/git.ts`, `routes/clone.ts`, `routes/repos.ts`), including `handlerChecks` for every `authorizeGit*`, `authorizeRepository`, `authorizeCheckout` and `authorizePublish` call, and the effects `commit`, `remote`, `publish`. Proof: the parity cases of T016 cover every named check.
- [ ] T040 [P] [US6] Write the entries for the trash, administration, audit, session, event, telemetry, identity and credential-helper rows, and for every row that is not dispatchable with its reason (`public`, `stream`, `page`, `redirect`, `browser-only`). Proof: parser accepts them.
- [ ] T041 [US6] Read `src/app/`, `README.md` and `docs/` for browser-only derivations behind the whole-workbench claim (SHACL validation is verified in `docs/agent-runtime.md`; check search, lineage, graph derivations, validation layers) and list each in `browserCapabilities` with status, reason and increment (FR-034). Proof: each entry names the source file or document that shows it is browser-only.
- [ ] T042 [US6] Write `tests/auth/operation-inventory.test.ts` with the checks listed in `contracts/operation-inventory.md`: bijection with `ROUTE_ACTIONS`, agreement on action, client action and target kind, unique ids, vocabularies and reasons, limit constants resolve, every handler check is in a parity case, generated table equals file (FR-035, SC-006). Proof: passes; deleting an entry, adding a row without an entry and changing a row's action each fail it with the row named.
- [ ] T043 [US6] Write `scripts/operation-inventory-table.ts`, generate `docs/operations.md`, add the link to `docs/README.md`, and add the drift check to the inventory test (FR-036). Proof: regeneration produces no diff; editing the markdown by hand fails the test.

## Phase 8: Mutation, documentation and release gate

- [ ] T044 [US2] Write `scripts/operation-boundary-mutants.ts` and `scripts/operation-boundary-mutation-cases.ts` and wire them in `scripts/mutation-tests.ts` and `scripts/mutation-case.ts`. Mutants: remove the no-grant refusal; skip trash target resolution; skip the client action substitution; remove the Steward audit scope; remove the local-only identity rule; drop the body-target pass; remove `WriteAccessError` conversion; remove the hidden-response audit; remove 404 normalisation; skip `assertMinted`; skip the row match; skip path encoding in the builder; swap rate limit and local check; ignore the connection scope; collapse the replay strata; drop `tool` in the serializer (FR-040, SC-007). Proof: `bun run test:mutation` kills every one of them, each by a named test.
- [ ] T045 [US2] Run the benchmark of T004 on the refactored code and record median and 95th percentile beside the base numbers in the pull request description (plan performance goal). Proof: within 5% of the base median, or a finding is opened.
- [ ] T046 [P] Update `ARCHITECTURE.md`: the authentication stage, the operation boundary, the caller, the twin builder, the inventory and the code map rows; refresh the access diagram text if it names `middleware.ts` as the decision point. Proof: `bun run test:terminology` and `bun --bun run check` pass; every module named exists.
- [ ] T047 [P] Update the audit documentation: `specs/003-authn-authz/contracts/audit-log.md` (fields, MCP audit rule, outcome semantics), `docs/audit-tamper-evidence.md` (old and new records verify together), `specs/003-authn-authz/contracts/policy-model.md` and `contracts/http-api.md` where they name the boundary. Proof: each new field in the docs exists in `audit.ts`; the compat test is cited.
- [ ] T048 [P] Update `README.md`: the audit-log description (new fields, one record per operation, what MCP reads record), and the access-boundary paragraph; no claim of MCP availability. Add `CHANGELOG.md` entries under Unreleased: Changed (middleware split, no HTTP change), Added (audit fields and filters, operation inventory), Fixed (audit retention setting now applies). Proof: a developer reading only these files can find the boundary, the inventory and the audit fields.
- [ ] T049 Coordinate the constitution wording with `constitution-tessera`: the Technical Constraints sentence on the single authorization boundary and Principle VI's route-matrix sentence (see the plan's Constitution Check). Record the exact sentences in the pull request description; this feature does not edit the constitution file on its own branch. Proof: the amendment on `constitution-tessera` contains both sentences.
- [ ] T050 Run the release gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:mutation`, `bun run test:auth`, `bun run test:admin`, `bun test tests/auth/http-characterization.test.ts`, `bun run audit:verify tests/fixtures/audit-v1`. Proof: all pass; output pasted in the pull request description.
- [ ] T051 Run the `architecture-reviewer` on the branch diff before the pull request, fix its findings, and record the review with the skill's `review_marker.py mark`. Run `scripts/check-comments.ts` and the readable-code checker on every changed file. Proof: marker recorded; checks clean.

## Dependencies and order

- Phase 1 first, committed before any `src/` change. T002 to T004 are independent of T001.
- Phase 2 is sequential (T005 to T010); it blocks Phases 3 to 7.
- The inventory parser and entries (T037 to T040) are done directly after Phase 2 and before T011,
  because the twin builder, the dispatch refusals and the audit `tool` validator read the
  inventory. T041 to T043 stay in Phase 7.
- Phase 3 follows that; T016 needs the Git and file entries of T038 and T039 for its handler-check
  coverage.
- Phase 4 follows Phase 2 and can run beside Phase 3 after T023; T028 needs the inventory (T037).
- Phase 5 follows T019 and T023 (it needs records with origins).
- Phase 6 follows T033 and T037.
- T042 runs after T038 to T041 and T016.
- Phase 8 last; T044 can start once Phases 3 to 5 have code to mutate.

## Traceability

| Decision or finding | Requirements | Tasks |
| --- | --- | --- |
| M1: twin request through shared boundary | FR-001 to FR-011 | T005 to T015 |
| MCP review (Fable) B1: `routeFor` before body; `execute` holds eleven behaviours | FR-003, FR-004, FR-008, FR-040 | T008, T009, T013, T044 |
| MCP review (Fable) B1: target checks in handlers | FR-012 to FR-014 | T016, T017 |
| MCP review (Fable) B1: identity read by symbol | FR-005, FR-006 | T007, T013, T014 |
| MCP review (Fable) B1: tool-supplied values must not choose the row (hostile parameters) | FR-007 to FR-011, SC-009 | T011, T012, T013 |
| MCP review (Astra) 2: authentication separate from authorization; action equality proves nothing | FR-001, FR-003, FR-013 | T006, T010, T016 |
| M9: scopes narrow, effects not names | FR-015 | T015 |
| M14 and reviews (Fable M8, Astra 11): audit fields and semantic outcome | FR-020 to FR-028 | T019 to T028 |
| M14: retention plumbing | FR-029 | T027 |
| M14: replay strata | FR-030 to FR-032 | T029 to T032 |
| M17: tool lists by effective permission | FR-016 to FR-019 | T033 to T036 |
| M17 and reviews (Astra 12, Fable inventory): operation inventory | FR-033 to FR-037 | T037 to T043, T018 |
| R2: no change to existing behaviour; mutation and compatibility gates | FR-038 to FR-040, SC-001, SC-004, SC-007 | T001 to T004, T010, T021, T044, T045, T050 |
| E23 and documentation rules | FR-041, FR-042, SC-010 | T046 to T049, T051 |
