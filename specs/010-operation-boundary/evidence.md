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
