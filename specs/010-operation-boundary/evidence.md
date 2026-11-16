# Operation boundary evidence

## Scope

- Existing HTTP middleware owns authentication order, authorization, handler execution and audit; concrete-target checks remain in handlers.
- HTTP responses, selected headers, refusals and audit records must retain their existing behavior.
- The new boundary adds authenticated callers, operation-bound twins and narrowing effect scopes.
- Entry-point comparisons use disposable fixtures; event streams are aborted and cancelled before fixture disposal.

## HTTP baseline

The characterization covers every `routeExamples` entry for local mode, all fixture people, anonymous access, a deactivated Editor and an application client. The fixture includes Viewer, Editor, Steward, Admin, a custom role and people without grants. Git author and committer dates and audit time are fixed. Import timestamps, request identifiers and temporary data roots are normalized. Stream bodies are represented by a marker after cancellation.

`bun test tests/auth/http-characterization.test.ts`: 1 pass, 0 fail, 1548 expect() calls. Production sources remain unchanged.

## Old audit fixture

The unchanged audit writer produced January, February and March records at fixed dates, including the January/February boundary. Each month holds an allowed snapshot, a denied snapshot and an anonymous denial.

`bun test tests/auth/audit-compat.test.ts`: 2 pass, 0 fail, 8 expect() calls.

`bun run audit:verify tests/fixtures/audit-v1`: Audit log intact: 9 records in 3 months.

## Dry-run baseline

The unchanged administration comparison replays six fixed-clock read/edit snapshots for an Editor, custom-role holder and Admin, against removal of the custom-role grant.

`bun test tests/auth/dry-run-baseline.test.ts`: 1 pass, 0 fail, 1 expect() call.

## HTTP performance baseline

`TMPDIR` and `DATA_DIR` point to the assigned temporary area. The in-process benchmark uses 150 warm-up requests followed by 5,000 measured requests, alternating an allowed read, a no-grant denial and an authorized write with invalid input. Every response status is checked. No network listener is opened.

`bun scripts/boundary-benchmark.ts`: requests=5000, medianMs=2.5063719999998284, p95Ms=5.346923000000061.

## Caller provenance

`bun test tests/auth/operation-boundary.test.ts`: 1 pass, 0 fail, 6 expect() calls. The caller module has no production importers yet.

## Blocking finding: audit rule order varies on original code

Phase 2 stops at T006. The proposed extraction was discarded. The production middleware, handler and Cedar evaluator are byte-identical to their original versions. Only the unused caller module from T005 was added.

The frozen characterization initially passed on unchanged code, including a repeat before its commit. When run with the existing authorization tests it fails on the original middleware:

```sh
bun test tests/auth/http-characterization.test.ts tests/auth/middleware.test.ts tests/auth/bearer.test.ts tests/auth/rate-limit.test.ts tests/auth/csrf.test.ts tests/auth/csrf-body-limit.test.ts
```

Summary: `35 pass`, `1 fail`, `319 expect() calls`, `Ran 36 tests across 6 files.`

Case: local `GET /api/agent/catalog`. Expected audit rules are `["B1-workspace-lists", "role:admin:1"]`; actual rules are `["role:admin:1", "B1-workspace-lists"]`. The Cedar evaluator returns `diagnostics.reason` directly as `rules`, and the audit serializer stores that array unchanged. The extraction and the restored original middleware fail on the same difference.

The requirement that every audit field except time, request id and chain hash remain identical cannot produce a stable whole-suite characterization when the original evaluator changes rule order. Sorting stored rules would change existing audit bytes. Sorting only the comparison would require changing the frozen test/fixture contract. Neither change is made here. Recommendation: explicitly permit canonicalization of the audit rule list, then repeat and commit the baseline against the original middleware before resuming extraction.

The characterization recorder, test and fixture remain byte-identical to commit `1ad23ed7`. The three old audit month files remain byte-identical to commit `66e51af5`. T006 through T051 remain unchecked; the dependency order prevents implementing the later phases while the phase-2 characterization gate is blocked. No task was silently omitted or marked complete without its proof.

## Validation at the stop point

- `bun test tests/auth/dry-run-baseline.test.ts tests/auth/audit-compat.test.ts tests/auth/operation-boundary.test.ts`: `4 pass`, `0 fail`, `15 expect() calls`, `Ran 4 tests across 3 files.`
- `bun test tests/auth/http-characterization.test.ts tests/auth/audit-compat.test.ts tests/auth/dry-run-baseline.test.ts tests/auth/operation-boundary.test.ts`: `4 pass`, `1 fail`, `89 expect() calls`, `Ran 5 tests across 4 files.` The original middleware has the same audit-rule ordering difference.
- `bun --bun run check`: exit 0. Formatting, lint, comments, theme and brand checks pass.
- `bun --bun run build`: exit 0, `built in 2.92s`. The build reports its existing large-chunk warning.
- `bun run audit:verify tests/fixtures/audit-v1`: `Audit log intact: 9 records in 3 months.`
- `bun run test:terminology`: exit 1, `net::ERR_CONNECTION_REFUSED` at the script's default frontend. No frontend was started. Further browser checks were stopped after inspecting their port allocation.
- Readability checker: exit 0 on the changed TypeScript files.
- Leak scanner: exit 0 on all 15 added code/fixture files.
- Full `bun test`, `bun scripts/mutation-tests.ts`, `bun run test:auth` and `bun run test:admin` were not run. Their current harnesses allocate listeners with port 0 or launch servers on dynamically chosen ports; the authorization browser suite needs the main API, remote-credential API and identity provider concurrently. They do not expose a configuration that confines all listeners to the two assigned ports. The full release gate remains pending; it is not reported as passing.
- The requested `scripts/commit_cadence.py` does not exist in this worktree.

## Constitution wording handover

The constitution is unchanged. Its current version is 4.0.0; the plan's reference to 3.2.0 is stale. The existing technical constraints already require MCP twins through the shared path, and Principle VI already mentions MCP tools beside HTTP twins, but the matrix sentence does not yet mention the operation inventory.

Proposed Technical Constraints sentence: “Every operation, whatever transport it arrives by, MUST go through the operation boundary for route selection, authorization, handler execution, refusal mapping and audit; no transport, adapter or tool decides access.”

Proposed Principle VI sentence: “Every new route, and every MCP tool beside its HTTP twin, MUST be added to the authorization matrix and operation inventory, including its parity case.”

These are handover text only. Their inclusion on the constitution amendment branch has not been established, so T049 remains unchecked.

## Integrator decisions and resumed baseline

The integrator defines audit rules as a set and permits comparison of sorted copies only. The characterization comparison applies that normalization to audit entries; the frozen fixture was not regenerated or edited, and audit serialization is unchanged. The comparison has a one-sentence explanation of the unordered Cedar result.

The characterization now explicitly uses an empty isolated static root. Its original recording was made without a built frontend; allowing the handler to discover a later `dist/` build made public fallback responses depend on the build directory. This fixture-lifetime correction reproduces the recording without changing its expected values.

Original middleware confirmation: `bun test tests/auth/http-characterization.test.ts tests/auth/middleware.test.ts tests/auth/bearer.test.ts tests/auth/rate-limit.test.ts tests/auth/csrf.test.ts tests/auth/csrf-body-limit.test.ts`: `36 pass`, `0 fail`, `1792 expect() calls`, `Ran 36 tests across 6 files.` No extraction was present for this run.

The integrator permits OS-assigned ephemeral listeners and dynamic harness allocation. The full browser and mutation gates can therefore run; the fixed reserved ports remain forbidden. The constitution wording handover above completes T049; the integrator applies it, and the constitution file remains unchanged.

Original full authorization suite: `bun test tests/auth/`: `659 pass`, `0 fail`, `48430 expect() calls`, `Ran 659 tests across 107 files.`

T006 extraction: the same six-file characterization/authentication command reports `36 pass`, `0 fail`, `1792 expect() calls`. Rate limiting, local checks, bearer validation, cross-site checks, principal resolution and anonymous audit gating moved to `request-authentication.ts` without changing their order.

T007: `bun test tests/auth/http-characterization.test.ts tests/auth/request-identity.test.ts tests/auth/middleware.test.ts`: `9 pass`, `0 fail`, `1601 expect() calls`. Identity attachment covers every exported identity symbol and preserves Reader/copy derivation. Session lookup reuses authentication's request cache.

T008: `bun test tests/auth/`: `660 pass`, `0 fail`, `48443 expect() calls`, `Ran 660 tests across 108 files.` The execution and decision blocks were moved together; the new wrapper supplies a minted caller and selects the existing route. The moved-code diff was inspected. `tsc --noEmit`, formatting, lint and readability checks pass.

T009: characterization and middleware tests: `8 pass`, `0 fail`, `1588 expect() calls`. `bun --bun run check`: exit 0. The adapter is below 400 lines and its `boundary` property exposes the existing handler path to trusted in-process callers without constructing a second router.

T010: `bun test tests/auth/middleware.test.ts`: `10 pass`, `0 fail`, `56 expect() calls`. Cases establish rate limit before bearer, local check before routing, bearer before cross-site, cross-site before routing, client refusal before plain not-found, public before operation principal resolution, and principal before policy decision.

Two requested adjacent-pair proofs are inapplicable: rate limiting runs only in server mode, while local checks run only in local mode; bearer validation is also a no-op in local mode. Merely swapping those mutually exclusive checks is observationally equivalent for every configured mode. Those two pairwise assertions and the corresponding swap-only mutant cannot demonstrate a changed result and are omitted rather than claiming a kill. The reachable rate-limit/bearer and local-check/routing cases cover the actual ordering constraints.

T037: existing body limits are now named and shared by HTTP parsers and inventory validation. Characterization/body-limit tests report `5 pass`, `0 fail`, `1558 expect() calls`; inventory parser tests report `2 pass`, `0 fail`, `15 expect() calls`. Parser metadata has no dependency on route implementations. Entries are populated in the following inventory steps.

T038: reviewed workspace/project/file/draft/metric/KPI/export/document/suggestion route inputs, targets, effects and existing checks against their handlers. Checked-in entries parse successfully: inventory parser suite `2 pass`, `0 fail`, `15 expect() calls`. File save authorization is the route decision and governance guard, not a fictitious direct `authorizeWrite` call; its parity coverage remains required.

T039: Git, clone and repository registration entries name the existing Git path/push/repository/checkout/publication checks and credential-host checks. Commit's remote effect remains dynamic when `push` is requested. Parser suite: `2 pass`, `0 fail`, `15 expect() calls`. Per-check execution coverage is completed by T016 before the inventory coverage gate.

T040: all 119 route rows now have reviewed metadata, including public, stream, page and browser-only dispatch refusals. Trash entry and whole-trash purge use distinct ids. Parser suite: `2 pass`, `0 fail`, `15 expect() calls`.

T011–T012: twin builder tests cover credential-free headers, exact path encoding, sorted query serialization, abort propagation, body byte limits and generated hostile values. Every parameterized dispatchable row receives at least 500 generated values per parameter. Successful builds preserve both the intended row and the encoded value; failures are confined to the builder, never swallowed assertions.

## Additional parity finding: hidden and missing trash audit selection

T017 blocks the remainder of Phase 3 pending clarification. The original middleware at `655df09`
returns identical `404 {"error":"Not found."}` bodies for a hidden trash restore and a missing trash
restore, but their audit histories differ. A hidden HR file restored by Alice appends one denial
with `reason: not-readable`; the missing entry `00000000000000000000000000` appends nothing.
The extracted boundary reproduces both outcomes. Requiring equal audit reasons contradicts the
frozen HTTP audit behavior and T016's HTTP/twin audit parity. Neither production behavior nor the
frozen fixture has been changed to hide that difference.

The original middleware was obtained with `git show 655df09:src/server/auth/middleware.ts` into
`/tmp/sw-010/original-middleware.ts`; only relative import specifiers were resolved to absolute
module paths so it could run from the temporary folder. The probe used the real fixture, Alice's
resolved grants, a real HR trash entry and the same durable audit implementation. Its two results:

- hidden: status 404, body `{"error":"Not found."}`, audit `[{"reason":"not-readable","decision":"deny","rules":[]}]`.
- missing: status 404, body `{"error":"Not found."}`, audit `[]`.

An asynchronous clarification asks whether the trash comparison should preserve these separate
audit behaviors, or whether twins may deliberately depart from HTTP auditing for missing entries.

## Transport parity proof

The parity table has 21 operation cases and runs each through HTTP and the actual handler's
boundary in six authorization/target scenarios. Fresh fixture workspaces isolate the two
transports. It compares normalized status, body and complete audit records, permitting the
existing no-record result for missing trash. Git stage, unstage, commit and revert additionally
assert that a restricted target is refused, so two equally broken transports cannot pass.

`bun test tests/auth/operation-parity.test.ts`: `21 pass`, `0 fail`, `283 expect() calls`,
`Ran 21 tests across 1 file. [72.53s]`.
Removing the stage handler's `authorizeGitPaths` call caused the named `git.stage` parity test to
fail with status 200 where 404 was required (`0 pass`, `1 fail`). The original source was restored
in a `finally` block. After extracting the parameter builder for readability, the same named test
passed (`1 pass`, `0 fail`, `15 expect() calls`).

The clone parity case now waits for the accepted background job's terminal event before disposing
its fixture. `bun test tests/auth/operation-parity.test.ts -t 'repositories.clone preserves'`:
`1 pass`, `0 fail`, `13 expect() calls`, `Ran 1 test across 1 file. [3.27s]`.
