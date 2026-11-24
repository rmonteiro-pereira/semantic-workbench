# Evidence: first MCP release

What was built, where it departs from the plan because the merged code differed, which tasks were skipped and why, and what was measured.

## Adjustments to the plan

| Plan said | What the merged code has | What was done |
|-----------|--------------------------|---------------|
| `src/server/mcp/dispatch.ts` adapts to 010's signature (dependency table) | `handler.boundary.operate({ caller, request, operationId })` and `availableOperations(caller)` in `src/server/auth/operation-boundary.ts`; requests are built by `buildTwinRequest(operationId, input)` in `src/server/auth/twin-request.ts`; callers come from `mintCaller({ principal, origin: 'mcp', connection })` | The dispatcher is `src/server/mcp/twin-dispatch.ts`; its header comment records the real signature. The plan's dependency table matches the code, with the file names above. The boundary now exports the type `OperationBoundary`. |
| Transport row is "unaudited, no blanket action" | `RouteAction.unaudited` exists; every row needs an `action` | `POST /api/mcp` is a `read` workspace row with `unaudited` and a new `localOnly` flag, so `routeFor` skips it in server mode. It lists `GET`, `DELETE`, `PUT` and `PATCH` too, so those reach the route and answer 405 instead of the middleware's 404. Its inventory entry uses dispatch reason `stream`, exposure `never`. |
| Audit fields `origin`, `method`, `tool`, `connection`, `clientLabel`, `result` are all new (T012) | 010 already stores `origin`, `tool` (an inventory id) and `connection`, validates them, and passes the configured retention (`tests/auth/audit-retention.test.ts`) | Only `method`, `clientLabel` and `result` were added, with validation and tests. `tool` stays the inventory id of the twin (`files.save`), not the protocol tool name, because 010 validates it against the inventory; the protocol tool name is not recorded. The CSV export keeps its columns. |
| Dry-run built from groups of 600 writes and 300 reads (T013) | 010 shipped its own stratified sample: up to 1,000 ordinary records and up to 500 distinct non-HTTP reads (`src/server/auth/replay-sample.ts`, `tests/auth/dry-run-strata.test.ts`) | T013 skipped: the stated goal (reads cannot crowd out writes and denials) already holds and is tested by 010. The 600/300 numbers were assumptions. |
| `list_files` twin is `GET /api/documents` | That route returns every document of every project with its full text | Added an optional `project` query: it lists that project's files without their text (`documentIndexFor`), so listing a 20,000 file project does not read 20,000 files. Without the query the route is unchanged. |
| Delete takes a base version | `DELETE .../files/*` checked nothing but the confirmation | Added an optional `baseHash` to the route body, checked inside the trash lock; a changed file answers the existing stale conflict. |
| Commit preconditions checked "inside the repository serialization" | Git commands queue one by one; no way to hold the queue for several | `createGit` gained `exclusive(cwd, work)`, which holds one turn of the repository queue and lets the work run its own commands inside it (`AsyncLocalStorage`). `scm.commit` runs the checks and the commit in that turn when `expected` is given. | The turn is an object that is closed when the turn ends, so work that was started inside it and finishes later queues like any other command instead of skipping the queue.
| "A commit on the published branch answers refused" | A browser commit on the default branch is moved to `work/local` by `prepareLocalCommit`, so a commit never advances the published ref, and what is read follows the published pointer, not a branch tip | The tool's own refusal (a separate `git.status` call outside the repository queue) was removed, because no tool may decide access. Both transports now share the one rule that already runs inside the commit: the default branch is left for the authoring branch, and the answer reports `movedFrom`. |
| Receipts verified "from the journal and the trash" at start-up | Receipts do not store arguments, only a hash | Verification happens when a retry arrives for a receipt left pending by an earlier process: delete from the trash entry, restore from a note taken before the effect, commit from the Git log (a commit with the same message directly above the expected head). The files of a commit are not re-verified. Anything unprovable answers `uncertain`. |
| Receipt store as first written | It never pruned, `find` ignored expiry, two calls with one key both passed `find` while `prepare` ran, and a refusal could delete the winner's receipt | The in-flight check now comes first, a refusal removes only the receipt with its own creation time, expired receipts are absent, the store prunes when it opens, and an unreadable month file is moved aside and answered `uncertain`. |
| Tests read the contract tables from `specs/` and carry contract ids in their names | A test that needs a table should not depend on a planning folder, and a name should describe behaviour | The tool table and the route dispositions live in `docs/mcp-contract.md`, test names describe the behaviour, `scripts/mcp-capability.ts` is `scripts/mcp-rotate.ts`, and the bridge gives up on a call after 35 seconds. |
| Tool failure codes chosen from the text of an answer | The legacy agent and document routes answer a missing project, document or model as 400, and git failures as 500, so a tool had to read the sentence | Those routes keep their statuses and bodies, because older clients and the frozen HTTP characterization depend on them, and add an `X-Workbench-Failure` header (`not-found`, `git-unavailable`, `git-refused`) from typed errors (`BadRequestError` with a code, `GitUnavailableError`, `GitRefusalError`). The classifier reads status, that header and body fields, never a sentence. |
| Person's draft kept (FR-036) | Every save clears the person's draft of that path | A save from a protocol caller passes `keepDrafts`, derived from the caller's origin (`callerOriginOf`); the browser path is unchanged. |
| `GET` and `DELETE` 405 from the library | The access middleware answered 404 for a method with no row | See the transport row above. |
| `subscriptions/listen` answers 404 | The library serves it as a stream | The route answers 404 with -32601 before the library. The library advertised `tools.listChanged` in discovery although no change notice is ever sent, so the server now declares `tools: { listChanged: false }` and the conformance test asserts exactly that. |
| Reference client speaks the 2026-07-28 revision | `@modelcontextprotocol/client` 2.4.0 opens with `initialize` (the earlier era) | Tests that use the client run through the legacy stateless path; every current-era row is exercised with raw requests (`server.raw`). |
| Codex CLI acceptance run | Needs a real model session and the owner's configuration | Not run; recorded in `docs/mcp-acceptance.md` as the remaining step. |

## Tasks

Done: T001 to T012, T014 to T034, T036 to T055, T057 to T064, T066 (gate below), T067. T065 is done for the reference client.

Skipped or reduced, with reasons:

- T013: see the table. 010 already protects the replay sample.
- T035: the four published-only tools are always registered. Feature 008 is merged, so a registration condition has nothing to test.
- T031: Git absent, an unknown project and file tools staying available are tested (`tests/mcp/bounds.test.ts`). A "rebuilding index" state does not exist in the code, so `not_ready` is a reserved code that no tool returns yet.
- T056: the browser check covers the editor refresh, the kept draft and the tool in the audit view. "The dry run's sample still lists the writes after many reads" is covered at the server by 010's `dry-run-strata` test and not repeated in a browser.
- T057: the Admin audit view shows the tool beside the action when a record has one, as asked. The comparison of the audit view before and after through Codex captures was not run; the change adds nothing to records without a tool, which covers every browser record.
- T065 (Codex CLI half): see the table.
- T005: the constitution amendments (`655df094`, version 4.0.0, and the 4.0.1 wording) are already ancestors of `origin/main`, so merging is not blocked by them. Principle I's local capability, IV's receipts, VI's tool matrix and VII's model statement are all in the merged text.

## Measurements

Project listing latency (`bun scripts/project-listing-latency.ts 10 100 120 200`, on the development server, 30 runs after a warm-up, small projects of one file each):

| Projects | HTTP median / p95 (ms) | Boundary median / p95 (ms) | `list_projects` tool median / p95 (ms) |
|----------|------------------------|----------------------------|-----------------------------------------|
| 10 | 14.5 / 20.5 | 15.8 / 23.2 | 15.5 / 22.2 |
| 100 | 99.0 / 111.6 | 107.5 / 120.5 | 107.8 / 131.1 |
| 120 | 126.9 / 144.4 | 130.7 / 145.2 | 132.7 / 153.3 |
| 200 | 231.3 / 256.6 | 231.2 / 301.1 | 233.4 / 255.7 |

Listing grows about 1 ms per project and the boundary and the tool add nothing measurable on top of the route. At 120 projects a listing takes 127 ms over HTTP against the 63.6 ms 010 measured at its smaller size. The cost is the route's own work (each project lists its files and Git state), so a lighter listing would be a change to `GET /api/projects`, not to the tool.

A project of 20,000 files: `list_files` answers in about 5 s (one call, 200 items) and `git_status`, `list_projects` and `list_trash` stay inside the 30 s deadline (`tests/mcp/bounds.test.ts`).

Commit races: 200 randomized interleavings of a person staging, saving, committing and the agent committing: about 150 commits and 50 refusals, none containing an unlisted path or version (`tests/mcp/commit-tool.test.ts`).

## Gate

Run on the development server after the last source change (only test files changed afterwards):

| Step | Result |
|------|--------|
| `bun --bun run check` | passed (types, format, lint, comment ids, theme, brand) |
| `bun test` (full, includes the frozen HTTP characterization) | 2,489 passed; the 2 failures of that run were this feature's own tests (a start-up hook that timed out under load and a keep-alive reset in the race test). Both were fixed in the test harness and `bun test tests/mcp tests/scm-commit-preconditions.test.ts` then passed (81 tests). A full run before the audit and inventory fixes had also failed the operation parity, boundary scan, guard inventory, dry-run baseline and capability rotation tests; each was fixed at its cause. |
| `bun run test:mcp` | passed, 10 steps |
| `bun --bun run build` | passed |
| `bun scripts/ci-validate.ts --step mutation` | passed: 776 of 776 targeted mutants killed, including the 21 added in `scripts/mcp-mutants.ts` |
| `test:mcp:browser` | passed |
| `test:responsive` | failed on the inherited canvas-height check (481 against more than 504), not touched |
| `test:admin` | failed in the first dry-run review step (`Dry-run result` region not shown). The same failure occurs on `origin/main` without this feature, so it is inherited; the cause was not investigated. |
