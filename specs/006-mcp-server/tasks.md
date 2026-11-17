# Tasks: First MCP Release, Local Read, Validated Edit and Commit

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Prerequisites**: feature 010 (operation boundary) for every tool; feature 008 (published snapshot) for four tools; the constitution amendments named in the plan before merge.

**Tests**: required here. The constitution's verification gate makes tests, mutants and browser checks part of every change, so each task states its proof.

**Format**: `- [ ] [ID] [P?] [Story?] Description with file path`. `[P]` means a different file with no dependency on an unfinished task.

**Organization**: grouped by user story so each can be built and tested alone after the foundation. Tests are written first inside a story and must fail before the code they cover exists.


---

## Phase 1: Setup

**Purpose**: dependencies, scripts and the test harness every later phase uses.

- [x] T001 Add `@modelcontextprotocol/server` 2.4.0 as an exact dependency and `@modelcontextprotocol/client` 2.4.0 as an exact development dependency in `package.json`; commit `bun.lock`; record licence (Apache-2.0) and measured size in `docs/development.md`. Proof: `bun install --frozen-lockfile` and `bun test` pass unchanged.
- [x] T002 [P] Add `mcp:rotate`, `test:mcp` and `test:mcp:browser` to `package.json` and list them in `scripts/ci-validate.ts` and the constitution's gate list in `docs/development.md`. Proof: `bun run ci:validate` runs them.
- [x] T003 [P] Write the test harness in `tests/mcp/helpers/local-server.ts`: a local-mode server on a spare port with a temporary `DATA_DIR`, the shipped examples loaded, and a reference-client factory. Proof: a smoke test in `tests/mcp/harness.test.ts` starts and stops it twice without leaking a port.
- [x] T004 When features 010 and 008 are merged or their contracts are final, check them against the dependency table in `plan.md` and record the exact boundary signature and snapshot functions in the header comment of `src/server/mcp/twin-dispatch.ts`; update the table if they differ. Proof: the plan's dependency table matches the merged code.
- [x] T005 Check the amendments on `constitution-tessera` cover authenticated agent authoring and the local capability (Principle I), receipts (IV), the tool matrix and mutants (VI) and the model statement (VII); record the state in `plan.md`. Merging this feature is blocked until they merge.

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: the pieces every tool uses: registry shape, results, cursors, limits, twin dispatch, route rows, audit and dry-run changes.

- [x] T006 Add the `POST /api/mcp` transport row (unaudited, no blanket action, local only) and the `POST /api/projects/:slug/files/*/validate` row (action `edit`) to `src/server/auth/route-actions.ts`, and both to the authorization matrix in `tests/auth/matrix.test.ts` and `tests/auth/matrix-write.test.ts`. Proof: the matrix tests pass with the new cases.
- [x] T007 [P] Write `src/server/mcp/tool-definition.ts` and an empty `src/server/mcp/tool-registry.ts`, and `tests/mcp/tool-contract.test.ts`, which parses `contracts/mcp-tools.md` and fails when the registry's names, sort order, name length (at most 40), hints, retry classes or twin routes differ. Proof: the test fails against a deliberately wrong hint.
- [x] T008 [P] Write `src/server/mcp/tool-results.ts`: the success and failure shapes, the closed error-code set, the result cap and byte ranges that end on a character boundary and report `nextOffset`. Proof: `tests/mcp/tool-results.test.ts` reproduces a 2,000,000-byte multi-byte file exactly from ranges and rejects a range against a changed version.
- [x] T009 [P] Write `src/server/mcp/cursors.ts`: opaque cursors authenticated with a per-process key and bound to query, ordering, index generation, principal and a ten-minute expiry. Proof: `tests/mcp/cursors.test.ts` refuses a cursor from another query, generation, principal, or after expiry, and after a process restart.
- [x] T010 [P] Write `src/server/mcp/call-limits.ts`: calls per second, concurrent calls and a deadline per caller, answering `rate_limited` or `limit_exceeded`. Proof: `tests/mcp/limits.test.ts` covers the burst, the concurrency cap and the deadline with an injected clock.
- [x] T011 Write `src/server/mcp/twin-dispatch.ts`: build the twin request, call the operation boundary with the local principal and the `mcp` origin, and map status and JSON to the result shape (hidden to `not_found`, 409 to `conflict`, guard refusals to `guard_refused`, 5xx to a generic `internal`). Local-mode agent routes answer every error as 400 with a message; map those to `invalid_input` or `not_found` by the route's own classification. Proof: `tests/mcp/twin-dispatch.test.ts` covers each mapping and that no path or file text appears in an `internal` message.
- [x] T012 Extend `src/server/auth/audit.ts` so the serializer keeps `origin`, `method`, `tool`, `connection`, `clientLabel` and `result`, and pass the configured retention in `src/server/handler.ts`. Proof: `tests/auth/audit-mcp-fields.test.ts` fails when a written field is missing from the stored line, old fixture records still verify with `bun run audit:verify`, and `tests/auth/audit-retention.test.ts` shows the configured days applied.
- [ ] T013 (skipped, see evidence.md) Change `src/server/auth/dry-run.ts` to build the replay from a group of up to 600 writes and denials, a group of up to 300 de-duplicated reads and the configured cases. Proof: `tests/auth/dry-run-groups.test.ts` writes 5,000 reads and 20 writes and denials and finds all 20 in the sample; the existing `tests/auth/dry-run.test.ts` passes.
- [x] T014 [P] Write `tests/mcp/route-inventory.test.ts`, which reads `ROUTE_ACTIONS` and `contracts/mcp-inventory.md` and fails on a missing row, a stale row or a tool name outside the registry, and prints the counts. Proof: the test fails when a row is removed from either side.

**Checkpoint**: the registry shape, results, cursors, limits, dispatch, audit and dry-run changes pass their tests; no tool exists yet.

---

## Phase 3: User Story 1 - Connect an agent to the local workbench safely (Priority: P1)

**Goal**: a connectable endpoint, closed to everything except the person's own programs.

**Independent Test**: connect the reference client and Codex CLI; run every refused case in `tests/mcp/request-gate.test.ts`.

- [x] T015 [P] [US1] Write `tests/mcp/request-gate.test.ts`: no capability, wrong capability, any `Origin` including `null` and the development origins, a foreign `Host`, a rebinding name, a malformed `Host`, a form post, a non-JSON content type, `GET`, `DELETE`. Expected: the status in `contracts/mcp-local-access.md`, and no tool, version or file information in any refusal.
- [x] T016 [P] [US1] Write `tests/mcp/local-capability.test.ts`: first-start creation with owner-only mode, atomic write, re-read on modification, rotation invalidates the old value, constant-time comparison, refusal to mount when the mode cannot be set. Proof: the mode check runs on Linux and macOS, the access-list check runs where `process.platform` is `win32`, and the endpoint is not mounted when neither can be set.
- [x] T017 [P] [US1] Write `tests/mcp/conformance.test.ts` for rows C1 to C10, C16, C17 and C18 of `contracts/mcp-conformance.md` through the mounted route with the reference client and raw requests; and `tests/mcp/legacy-era.test.ts` for C14, and assert that no response sets or requires a session id. Expected: the statuses and error codes in the contract.
- [x] T018 [US1] Write `src/server/mcp/request-gate.ts`, a pure decision function over method, `Origin`, `Host`, content type and bearer value, in the order of `contracts/mcp-local-access.md`.
- [x] T019 [US1] Write `src/server/mcp/local-capability.ts` and `scripts/mcp-capability.ts` (`bun run mcp:rotate`): create on first start, read when the modification time changes, rotate, compare with `timingSafeEqual`, never log the value.
- [x] T020 [US1] Write `src/server/mcp/body-limits.ts`: stream the body under the global cap, choose the per-tool cap from `Mcp-Name`, check it again after parsing for clients without a name. Proof: `tests/mcp/body-caps.test.ts` for row C18, including a body that lies about its length.
- [x] T021 [US1] Write `src/server/mcp/server-factory.ts` (library `McpServer` from the registry, `fromJsonSchema` with the ajv validator, `legacy: 'stateless'`, `maxRequestBodySize` raised to the global cap) and `src/server/routes/mcp.ts` (gate, capability, caps, library). The factory filters the tool list by asking the boundary whether the caller holds each tool's action on at least one permissible target.
- [x] T022 [US1] Mount the route in `src/server/handler.ts` in local mode only. Proof: `tests/mcp/server-mode-absent.test.ts` shows server mode answers 404 on the path, serves no tool, and leaves every existing route's response unchanged.
- [x] T023 [US1] Write `scripts/mcp-stdio.ts`: read `DATA_DIR`, the port and the capability file, derive `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` from each message, post it, write the answer; clear errors when the workbench is not running or runs in server mode; re-read the capability file for every message so a rotation needs no reconfiguration; never print the capability; open no port. Proof: `tests/mcp/bridge.test.ts` covers header derivation, both error cases, a rotation between two messages and a scan of its output for the capability.
- [x] T024 [US1] Write `tests/mcp/cancellation.test.ts` for row C11: closing the response during a read stops it, and closing it during a write leaves the file either fully changed or untouched.
- [x] T025 [US1] Create `scripts/mcp-mutants.ts` with the access mutants (capability check removed, `Origin` check removed, `Host` check loosened, method check removed) and import it in `scripts/mutation-tests.ts`. Proof: `bun run test:mutation` kills each.
- [x] T026 [US1] Start `scripts/mcp-acceptance.ts` (`bun run test:mcp`): isolated server, discovery, tool list, and the refused cases of `quickstart.md` section 4. Proof: the script exits non-zero when a refused case is accepted.

**Checkpoint**: US1 works and is testable on its own.

---

## Phase 4: User Story 2 - Read definitions, findings, history and the published context (Priority: P1)

**Goal**: every read tool, bounded, paged and authorized like its twin.

**Independent Test**: call each read tool against the shipped examples and compare with the twin routes.

- [x] T027 [P] [US2] Write `tests/mcp/read-parity.test.ts`: each read tool's normalized result equals its twin's on every shipped example project. Expected: 100 percent equal.
- [x] T028 [P] [US2] Write `tests/mcp/tool-matrix.test.ts`: every tool with every test role and scope through the same dispatcher, with hidden equal to missing, a tool list that matches the caller's effective permissions, and no unreadable byte in any answer; extend `tests/auth/access-fixture.ts` if a role is missing.
- [x] T029 [P] [US2] Write `tests/mcp/paging.test.ts` and `tests/mcp/ranges.test.ts`: pages end with a cursor, a rescan between pages gives `cursor_expired`, a 2,000,000-byte file is reproduced from ranges, a range against an old version gives `version_changed`.
- [x] T030 [P] [US2] Write `tests/mcp/tool-errors.test.ts` and `tests/mcp/header-body-agreement.test.ts` for rows C12, C13, C15 and C19: invalid input names the field; a header naming a read tool with a body naming a write tool is refused before dispatch; annotations equal the contract.
- [x] T031 [P] [US2] Write `tests/mcp/unavailable.test.ts`: Git absent, a project outside Git and a rebuilding index give `unavailable` or `not_ready`, and file tools keep working.
- [x] T032 [US2] Write `src/server/mcp/tools/projects-and-files.ts`: `list_projects`, `list_files`, `read_file`, `get_findings`, `list_trash`, each dispatched to its twin and registered in `tool-registry.ts`.
- [x] T033 [US2] Write the six inspection tools in `src/server/mcp/tools/source-control.ts`: `git_status`, `git_diff`, `git_log`, `git_branches`, `git_file_versions`, `git_show`, with the diff and show text paged by bytes and the log capped at 200 entries.
- [x] T034 [P] [US2] Write `tests/mcp/published-only.test.ts`: an unpublished edit never appears in `get_mapping_catalog`, `get_mapping_context`, `plan_query` or `explain_metric` for any caller; a project without a snapshot answers `not_published` with a reason; results equal the agent HTTP API's and carry the snapshot id; a plan with an expression or metric override is refused.
- [ ] T035 [US2] (skipped, see evidence.md) Write `src/server/mcp/tools/published-context.ts` and register the four tools only when feature 008's snapshot reader is present. Proof: `tests/mcp/published-registration.test.ts` shows they are absent without it and the other 17 tools are unaffected.
- [x] T036 [P] [US2] Write `tests/mcp/large-project.test.ts`: a generated project of 20,000 files and the largest example finish every read tool within the call deadline and under the result cap.
- [x] T037 [US2] Add the read mutants to `scripts/mcp-mutants.ts`: a tool's twin swapped for another route, a cursor accepted across principals, the result cap removed, an unpublished source returned by a published-only tool, a hidden path answering differently from a missing one. Proof: `bun run test:mutation` kills each.

**Checkpoint**: US2 works and is testable on its own.

---

## Phase 5: User Story 3 - Validate and change definitions (Priority: P1)

**Goal**: validate proposed text, save by patch or text, create, delete and restore, with the browser's guarantees.

**Independent Test**: change a metric description, break and repair a reference, delete and restore a file; compare bytes on disk after each step.

- [x] T038 [P] [US3] Write `tests/mcp/validate-twin.test.ts`: the findings and guard outcome equal what the save would produce, nothing is written, the right to edit the file is required, and text over 2,000,000 bytes is refused.
- [x] T039 [P] [US3] Write `tests/mcp/save-safety.test.ts`: patches change only the patched ranges and keep line endings; full text equals the submitted text except a disclosed guard rewrite; a stale version gives `conflict` with the current version and `unchanged` when equal; invalid text is not saved; creating an existing path gives `conflict`; path escape, case variants and symlinks are refused; the person's unsaved draft is kept.
- [x] T040 [P] [US3] Write `tests/mcp/receipts.test.ts`: write before, complete after, same key and arguments returns the original, different arguments give `key_reused`, an in-flight call gives `rate_limited`, retention prunes, the stored result holds no file text.
- [x] T041 [P] [US3] Write `tests/mcp/receipt-recovery.test.ts`: stop the server at every journaled step of delete and restore, restart, retry with the same key; expected: the original result or `uncertain`, and never a second effect.
- [x] T042 [US3] Extract the validate-without-write step of the save pipeline into a shared function in `src/server/projects/workspace/document-save.ts` so save and validation share it, and add `src/server/routes/validate.ts`. Proof: the existing save tests pass unchanged.
- [x] T043 [US3] Write `src/server/mcp/tools/validation.ts` (`validate_text`) with source or patches, paged findings and the guard outcome.
- [x] T044 [US3] Write `save_file` and `create_file` in `src/server/mcp/tools/editing.ts`, adding the `unchanged` flag and the stored-source disclosure to the twin's answer.
- [x] T045 [US3] Write `src/server/mcp/receipts.ts` under `<data root>/state/mcp-receipts` with atomic writes, argument normalization, retention and start-up verification from the journal and the trash.
- [x] T046 [US3] Write `delete_file` and `restore_file` in `src/server/mcp/tools/editing.ts`, receipt-backed, with `restore_file` refusing to overwrite.
- [x] T047 [US3] Write `scripts/mcp-browser-check.ts` (`bun run test:mcp:browser`): open a file in the editor against a mocked or isolated store, let an agent save it through the endpoint, and assert the editor refreshes and an unsaved draft is kept. Proof: the check passes and its capture is stored with the other browser captures.
- [x] T048 [US3] Add the write mutants: the base-version check skipped, the receipt lookup skipped, the argument hash ignored, an invalid text saved, a guard rewrite not disclosed. Proof: `bun run test:mutation` kills each.

**Checkpoint**: US3 works and is testable on its own.

---

## Phase 6: User Story 4 - Commit selected files (Priority: P2)

**Goal**: a commit of exactly the listed files, safe beside a person's own work.

**Independent Test**: after Phase 5, commit through the tool, then repeat with an unrelated staged file and with a moved head.

- [x] T049 [P] [US4] Write `tests/mcp/commit-preconditions.test.ts`: exactly the listed paths at the listed versions are committed; unrelated staged work stays staged; a moved branch, a moved head or a changed version gives `precondition_failed` naming what changed; the published branch gives `refused` with the browser instruction; there is no `push` or `all` argument; the author is the configured identity and the message has no agent marker.
- [x] T050 [P] [US4] Write `tests/mcp/commit-races.test.ts`: 200 randomized interleavings of staging, committing and switching branches between a person and an agent; expected: no commit contains a path or version the agent did not list and no staged change is lost or committed.
- [x] T051 [US4] Add the optional keys `files`, `expectedBranch` and `expectedHead` to the commit route in `src/server/routes/git.ts` and check them inside the repository serialization in `src/server/projects/scm.ts`, together with the commit. Proof: the existing commit tests and `tests/auth/` Git tests pass unchanged, and the new keys are covered in `tests/scm-commit-preconditions.test.ts`.
- [x] T052 [US4] Write `git_commit` in `src/server/mcp/tools/source-control.ts`, receipt-backed, never sending `push`, and refusing a commit that would advance the published ref using feature 008's check.
- [x] T053 [US4] Extend `tests/mcp/receipt-recovery.test.ts` to stop between the commit and the receipt and verify the commit from Git after restart.
- [x] T054 [US4] Add the commit mutants: `push` forwarded, the published-branch refusal removed, the head check removed, a path outside `files` committed. Proof: `bun run test:mutation` kills each.

**Checkpoint**: US4 works and is testable on its own.

---

## Phase 7: User Story 5 - See what the agent did (Priority: P2)

**Goal**: one record per call, a replay sample reading cannot crowd out, and no secret in any log.

**Independent Test**: run a scripted session and read the audit view and the dry run.

- [x] T055 [P] [US5] Write `tests/mcp/audit-calls.test.ts`: one record per call, one per discovery or list call, a denial for an unknown tool or a gate refusal, the outcome mapping of `contracts/mcp-audit.md`, no tool arguments or file text in any record, and a scan of logs, audit and errors for the capability value.
- [x] T056 [US5] Extend `scripts/mcp-browser-check.ts` to open the audit view in the Admin panel and assert the MCP records show their tool, and that the dry run's sample still lists the writes after many reads.
- [x] T057 [US5] Show the tool beside the action in `src/app/admin/AuditSection.tsx` when a record has one, and nothing else. Proof: the audit browser check in `scripts/mcp-browser-check.ts` and the existing admin checks pass; the audit view before and after is captured from a fresh worktree by Codex and compared by the UI regression gate, and records of the browser look as before.
- [x] T058 [US5] Add the audit mutants: a field dropped by the serializer, the outer request recorded as a second success, the retention not passed. Proof: `bun run test:mutation` kills each.

**Checkpoint**: US5 works and is testable on its own.

---

## Phase 8: Documentation, acceptance and gate

**Purpose**: claims that match the code, the acceptance run, and the full gate.

- [x] T059 [P] Write `docs/mcp.md`: connect Codex CLI and the reference client through the bridge and directly, the tool list with effects, the limits, the threat model, the residual injection risk, the model statement, the later increments with their decisions, and what the earlier protocol era does not get. The exact client registration syntax is copied from the acceptance run.
- [x] T060 [P] Update `README.md`: local-mode MCP section, the constitution's required statements for both modes, the new files under `data/state/`, the model statement, and the explicit absence of MCP in server mode.
- [x] T061 [P] Update `ARCHITECTURE.md` with the `src/server/mcp/` area and the request flow; update `docs/agent-runtime.md` to point at the tools and to correct any statement about outbound calls; update `docs/configuration.md` with the capability file and `mcp:rotate`.
- [x] T062 [P] Add the unreleased entry to `CHANGELOG.md` listing the tools, the fixes (audit retention, audit fields, dry-run groups) and the commit route's optional keys.
- [x] T063 [P] Write `tests/mcp/no-outbound-calls.test.ts`: run start-up and the acceptance flows with every non-loopback connection and `fetch` to a non-loopback address blocked, and fail on any attempt; assert no tool executes a plan, contacts a warehouse or calls a model. Proof: the test fails when a deliberate outbound call is added to a tool.
- [x] T064 Write `tests/mcp/docs-claims.test.ts`: the tool names and counts in `docs/mcp.md`, `README.md` and the spec equal the registry; the later-increment list equals the spec's; no document claims results are marked untrusted; the model statement is present word for word. Proof: the test fails when a tool is added without its documentation.
- [ ] T065 (reference client done; Codex CLI run left to the owner, see evidence.md) Finish `scripts/mcp-acceptance.ts` with the ten steps of `quickstart.md`; run it with the reference client and with Codex CLI; write the exact client versions and configuration in `docs/mcp-acceptance.md`. Proof: both runs pass and the record is committed.
- [x] T066 Run `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:mutation`, `bun run test:mcp`, `bun run test:mcp:browser`, `test:ui` and the suites the constitution lists; fix every failure at its cause. Proof: all pass; the output is attached to the release acceptance record.
- [x] T067 Run `bun run check:comments` and read every new file's comments for plain English with no feature, task or decision ids (Principle VIII); confirm the formatter ran on every changed file. Proof: the check passes.

---

## Dependencies and execution order

- Phase 1 has no dependency. T004 waits for features 010 and 008 and T005 for the
  constitution amendments; neither blocks development against the plan's assumed signatures.
- Phase 2 blocks every user story.
- US1 (connect) has no dependency on another story. US2 needs US1's endpoint. US3 needs US2's
  registry and paging helpers. US4 needs US3's receipts. US5 needs the audit work of Phase 2 and the
  tools of US2 to US4 to exercise it.
- Merging waits for the constitution amendments (T005) and, for the four published-only tools, for
  feature 008.
- Within a story: tests first, then modules, then the browser check or acceptance step, then the
  mutants.

### Parallel opportunities

```text
Phase 2:  T007 T008 T009 T010 T014 can run together (separate files)
US1:      the three test files (gate, capability, conformance) can run together
US2:      parity, matrix, paging, errors, unavailable, large-project tests together
US3:      validate, save-safety, receipt and recovery tests together
```

## Implementation strategy

1. Phases 1 and 2, then US1: a connectable endpoint with no tools. Stop and run the refused cases
   and the conformance rows. This is releasable only as a development milestone.
2. US2: reading. The first useful state; usable with every agent that can read files.
3. US3: validation and saving. After it the owner's core task (change the YAML and get validation)
   works.
4. US4: commit. After it the release is complete: read, validated edit, commit.
5. US5 proof and Phase 8: audit view, documentation, acceptance with Codex CLI, full gate.

Each step ends with the gate green and its documentation written.

## Success criteria coverage

| Criterion | Tasks |
|-----------|-------|
| SC-001 | T065, T059 |
| SC-002 | T027 |
| SC-003 | T028, T006 |
| SC-004 | T039, T048 |
| SC-005 | T050, T049 |
| SC-006 | T041, T053 |
| SC-007 | T017, T030 |
| SC-008 | T015, T016, T055, T025 |
| SC-009 | T029, T036, T008, T010 |
| SC-010 | T013, T055, T056, T057 |
| SC-011 | T066, T022 |
| SC-012 | T025, T037, T048, T054, T058 |
| SC-013 | T064, T014, T007 |

## Traceability

Decision and finding ids are those of the decisions document and the four reviews. "Fable" and
"Astra" are the two MCP reviews; their numbering is theirs (Fable B1, B2, M1 to M11, m1 to m7;
Astra 1 to 14).

| Source | Requirements | Tasks |
|--------|--------------|-------|
| E4, E5 published-only reads | FR-025, FR-040 | T034, T035, T052 |
| E23 constitution amendments | plan.md Constitution Check | T005, T064 |
| M1 twin dispatch; Fable B1, Astra 1; Fable m3 | FR-019, FR-020, FR-021, FR-022 | T006, T011, T007, T014, T028, T030 |
| M8 local capability; Fable M9, Astra 10; old R3 | FR-004 to FR-009 | T015, T016, T018, T019, T023, T025 |
| M9 default scopes | FR-002, FR-040 | T052, T049 |
| M10 no agent marker in Git | FR-038 | T049 |
| M11 content statement; Fable M11; Astra 13 | FR-048, FR-049 | T059, T060, T064 |
| M12 shared copy; Astra 6 | FR-036, FR-038, FR-039 | T049, T050, T051, T039, T047 |
| M13 retry safety; Fable M5, Astra 5 | FR-032 to FR-035, FR-041, FR-042 | T040, T041, T045, T046, T044, T048, T053 |
| M14 audit; Fable M8, Astra 11 | FR-043 to FR-046 | T012, T013, T055, T056, T057, T058 |
| M15 protocol; Fable M1, Astra 7, 4; Fable fact 19 | FR-010 to FR-017 | T017, T021, T030, T024, T064, T065 |
| M16 state and cursors; Astra 8 | FR-018, FR-028 | T009, T029 |
| M17 inventory and bounds; Fable M10, M6, Astra 12 | FR-022, FR-024, FR-026 to FR-031 | T014, T008, T010, T020, T029, T036, T031, T042 |
| M18 first release split; Fable M10 split; Astra 14 | FR-001 to FR-003 | T022, T032, T033, T060 |
| R2 authorization matrix; Astra 12 | FR-023 | T028, T006 |
| Principles II and III: path rules and content guards | FR-037 | T039, T038 |
| Principle I: no outbound call, no plan execution, no model call | FR-047 | T063, T034 |
| Technical Constraints: new dependency justified; Principle VI gate; Fable M11 dependency note | FR-015, FR-050 | T001, T002, T003, T004, T005, T062 |
| Fable M10 testable success criteria | FR-031, SC-002, SC-012 | T026, T027, T037, T043, T054 |
| R1 order, R2 increment gates | FR-050, SC-011, SC-012 | T066, T064, T067 |
| Later increments M2 to M7, M16, M19 | Later increments table; FR-003 | T059, T064 |
| Fixed errors: settings without dry run, sessions, outbound calls, discover, untrusted marker, Host and Origin checks | Later increments; FR-009, FR-010, FR-049, FR-047 | T059, T061, T064 |
| Fable m1 reusable registry; m2; m7 agent API error shape | Structure Decision; FR-021 | T007, T011 |
| Fable M7 older clients; M4 administration; M3 sign-in | FR-014; later increments | T017, T059 |
