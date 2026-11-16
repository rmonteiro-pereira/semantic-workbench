# Operation boundary evidence

## Completion status

All 51 tasks are complete. No task was skipped. The specified rate-limit/local-check order-swap
mutant is equivalent because the checks run in mutually exclusive server and local modes; it is
excluded with that reason, while all 16 registered feature mutants and every existing mutant are
killed. Earlier stop-point sections below are historical and have been resolved by the integrator
decisions and subsequent fixes.

The frozen HTTP fixture and original audit months remain byte-identical to their recording
commits. Constitution wording is handed over below; the constitution itself is unchanged.
Both performance findings are settled by the matched measurements below: listing meets the
unchanged 50 ms goal, and HTTP latency differs by less than 5% under interleaved comparisons.
No transport implementation or external deployment is included.

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

Dynamic connection-scope refusals now retain the enclosing operation's action and target in the
audit record. The scoped push-on-commit denial is recorded as `commit`, and the static publish
denial as `publish`. `bun test tests/auth/connection-scope.test.ts tests/auth/http-characterization.test.ts`:
`3 pass`, `0 fail`, `1558 expect() calls`, `Ran 3 tests across 2 files. [7.45s]`.


## Validation after resuming the extraction

Completed tasks are T001–T016, T037–T040 and T049. T017 blocks Phase 3 under FR-014 and Q5;
T018 and the later phases remain pending. No remaining task is marked complete or silently skipped.
The unobservable adjacent-check cases and equivalent swap-only mutant are described above.

- `bun test`: `2109 pass`, `0 fail`, `196733 expect() calls`, `Ran 2109 tests across 294 files. [436.37s]`.
  This full run preceded the final scoped-denial attribution correction; its affected entry-point
  tests and the frozen characterization were rerun afterward: `3 pass`, `0 fail`, `1558 expect() calls`.
- `bun --bun run check`: exit 0. `All matched files use the correct format.`;
  `Comments are free of specification and task IDs.` Theme, brand, TypeScript and lint checks pass.
- `bun --bun run build`: exit 0, `✓ built in 2.45s`. The existing large-chunk warning remains.
- `bun scripts/mutation-tests.ts`: exit 1, `error: Mutation anchors missing:`.
  The orphaned anchors are in the extracted authentication/execution functions and named draft
  limit. Retargeting the existing cases and registering the new mutants remain T044 work.
  No mutation kill-rate or completion claim is made.
- `bun run test:auth`: exit 0, 36 `PASS` lines; final summary line:
  `PASS Git history is refused for a person who cannot read every file`.
- `bun run test:admin`: exit 0. This script emits no overall summary line.
- `bun test tests/auth/http-characterization.test.ts`: `1 pass`, `0 fail`, `1548 expect() calls`,
  `Ran 1 test across 1 file. [7.17s]`. The later scope correction's combined run also passed.
- `bun run audit:verify tests/fixtures/audit-v1`: `Audit log intact: 9 records in 3 months.`
- `bun run test:terminology`: exit 0. `Terminology check passed: no "KPI" or "contract object" in 8 files' views, the metric detail, the wizard, README and docs (isolated data root /tmp/sw-010/workbench-browser-vAmD0t).`

Auth, Admin and terminology browser suites ran sequentially. The terminology frontend served only
this worktree's built files on assigned port 5311, with no API proxy. Its owned process was stopped.
Browser harnesses used their own dynamic listeners. No other process was signalled.

Later checks explicitly set `TMPDIR=/tmp/sw-010` and `DATA_DIR=/tmp/sw-010/data`. Earlier resumption
commands used the existing test harness's disposable OS temporary roots; no owner's data root or
other worktree was used. No shared temporary Git fixture file was removed.

The frozen HTTP fixture is byte-identical to `1ad23ed7`; the original audit months are byte-identical
to `66e51af5` (`git diff --exit-code` for each). No fixture was regenerated. The constitution is
unchanged. The two handover sentences above complete T049 under the integrator's clarification.

The readable-code checker passes for every changed TypeScript file. The full leak scanner reports
seven existing technical false positives: six `/tmp/` usage examples in `docs/development.md` and
the unchanged remote-credentials consent docstring referring to an authentication session. These
lines are outside this feature diff and are retained under the instruction to preserve commands
and public docstrings. Full scanning of all added deliverable content passes, and confidential-only
scanning of every changed file passes. Internal feature records use confidential-only mode.
The requested cadence checker remains unavailable: `scripts/commit_cadence.py` does not exist.

## Local commits

No push was performed. The following history includes the feature's specification commits:

```text
f8557cdb Attribute dynamic scope refusals to their enclosing operation
570715eb Wait for clone jobs before disposing parity workspaces
59ed7d2d Compare HTTP and twin authorization through real operation handlers
8c5bc527 Preserve asynchronous publication checks for scoped fetches
95c772bf Restrict static and dynamic operation effects by connection scope
d4ae3573 Use the attached caller session for delegated remote credentials
797f8cab Refuse non-dispatchable and mismatched twin operations
21b67e43 test(auth): generate hostile twin parameters for every route shape
3a4df028 feat(auth): build credential-free operation twin requests
0f0c68fc data: inventory administration and transport-owned operations
d78bb876 data: inventory source control and repository operations
c795e759 data: inventory workspace and definition operations
a6aa2a0e feat(auth): parse the reviewed operation inventory contract
3537fa62 refactor(http): name existing request byte limits
b1367dee test(auth): type refusal table headers explicitly
7f16b6d1 test(auth): prove reachable authentication refusal precedence
d650a81d refactor(auth): keep HTTP adaptation separate from operation decisions
7c2343e8 refactor(auth): move operation execution into the shared boundary
8e0810cd refactor(auth): attach handler identity in one place
1d840619 refactor(auth): extract network request authentication
086c013b test(auth): compare unordered audit rules without changing stored bytes
f063ba8d docs(auth): record original-code characterization blocker
a2e1aaad test(auth): compare replay fixture as serialized data
3c15f949 feat(auth): mint authenticated operation callers
3fdb78dd test(auth): record in-process boundary performance baseline
453463f1 test(auth): freeze administration audit replay baseline
66e51af5 test(audit): preserve original monthly chain fixtures
1ad23ed7 test(auth): freeze HTTP behavior before boundary extraction
ffac0dbe docs(spec): resolve analysis findings
6b89ff97 docs(spec): task list for the operation boundary
ce93abfd docs(spec): quickstart for the operation boundary
d6244715 docs(spec): contracts of the operation boundary
13cf2dd4 docs(spec): data model of the operation boundary
a24f4880 docs(spec): plan the operation boundary
5a501cf2 docs(spec): research the operation boundary design
2ad5dcb3 docs(spec): specify the operation boundary
```

## Hidden-resource clarification resolved

The integrator's 2026-11-16 decision supersedes the T017 blocker. The spec and task now separate
caller-visible equality from privileged audit outcomes. The dedicated twin test compares status,
headers and body, checks the bounded local refusal timing class, and asserts the hidden-trash denial
and missing-trash absence separately. Local missing-file text still matches HTTP. The audit writer
and all frozen fixtures are unchanged. `bun test tests/auth/operation-parity.test.ts -t 'hidden and missing twins'`: 1 pass, 0 fail.

## Response outcome review

Reviewed the dispatchable handlers in handler.ts and routes/projects, files, drafts, metrics, kpis,
git, clone, repos, trash, suggestions, export, people, admin and audit. Non-HTTP defaults select the
reviewed inventory classifier; HTTP retains its recorded outcome behavior. Explicit caller classifiers
remain supported. The response classifier accepts the routes' existing HTTP 200 success status;
other 2xx statuses are unsupported.

- git.commit: commit identifier and explicit non-commit reasons; a failed push after commit is degraded.
- git.fetch/pull/push/sync and default-ref pull/push: explicit boolean success, conflicts and supported follow results.
- repositories.clone: nonempty operation, name and slug mean job acceptance, not background completion.
- files.save, git.revert: nonempty saved path/hash, with governance demotions reported as degraded.
- files.save.batch and metric/KPI saves: atomic batch results, including governance demotions.
- files.import and projects.import: written identifiers plus the separate import commit outcome.
- Other handlers either throw/map failures to non-2xx responses, return bounded read data, or report
  intentional no-ops (already absent/cancelled, unchanged ignore pattern, already loaded example).
  Legacy document saves return the stored document rather than an explicit partial-effect result.

Classifier and boundary tests: 12 pass, 0 fail, including the frozen HTTP characterization.


## Stratified replay proof and performance

The durable test writes 300 ordinary write/denial snapshots before 50,000 transport reads, the
order that can evict older evidence. It retains all 300 and exactly 500 distinct reads, and excludes
protocol records. A second ordering is checked in memory. Removing the stratum split fails the
named test. The no-transport dry-run baseline remains unchanged.

`bun test tests/auth/dry-run-strata.test.ts tests/auth/replay-sample.test.ts tests/auth/dry-run-baseline.test.ts`:
`5 pass`, `0 fail`, `13 expect() calls`, `Ran 5 tests across 3 files. [4.77s]`.

50,300-record dry-run comparison: HTTP-only baseline 962.984258 ms (1,000 cases); with transport
reads 757.089097 ms (800 cases); ratio 0.7861905225453852. The 20% overhead goal is met without
changing the 1,000/500 bounds.

## Effective-permission operation listing

`bun test tests/auth/operation-listing.test.ts`: `4 pass`, `0 fail`, `37 expect() calls`,
`Ran 4 tests across 1 file. [5.59s]`. Fixtures cover built-in roles, an application client, no grant,
deactivation, one-project grants, path and document-type conditions, role renaming and connection
scope. A listed file-save operation is refused on a forbidden concrete target. Listing writes no
operation audit records; a transport records its protocol listing call separately.

Open performance finding: fresh listing across 20 projects returned 54 operations in 621.30286 ms,
missing the 50 ms goal. Earlier measurements were 747.415833 and 683.678139 ms. No permission
shortcut or stale cross-request cache was introduced to hide the cost. Invocation and listing use
real Cedar decisions and the existing per-scope decision cache. This cost must be considered by
the future transport's listing budget; it is a reported performance finding, not a passing 50 ms claim.

Body-targeted routes keep the existing project-level pass; file-target listing probes reuse the
dry-run samples. This preserves HTTP behavior instead of broadening body-route admission for
roles that can edit only a path but cannot pass that route's project gate.

Browser capability review: SHACL already uses the shared validator, but its invocation is browser-only (also documented in docs/agent-runtime.md). Editor diagnostics and graph layout are presentation concerns. Lineage asset search and path traversal have no reviewed HTTP operations. Each inventory capability names its implementation source; none claims protocol availability.

Inventory validation: 6 pass, 0 fail, 222 assertions. Synthetic deletion, unreviewed route and action changes fail with the route named. Handler vocabulary coverage reads the executable parity table without importing its test lifecycle. All request limits and classifiers resolve, capability sources exist, and the generated reference matches exactly. Regeneration produces identical bytes.

Mutation retargeting preserves existing fault intents in request-authentication.ts and operation-boundary.ts. Authentication candidates run in a copied auth folder so composed entry points execute the mutated siblings. Policy URL resolution remains rooted in the repository. The moved draft request cap is targeted at its named constant call. A read-only baseline of example-registry exceeded the old 10-second harness allowance on this shared machine; the case completes independently. The allowance is now 60 seconds, and timeouts fail the gate instead of counting as kills.

The focused operation harness passes its baseline and kills all 15 non-equivalent boundary mutants, each through a named assertion. The requested rate-limit/local-check order swap is equivalent: the checks run exclusively in server and local mode respectively, with no caller able to encounter both. It is excluded under the integrator decision, with the original order preserved. Full mutation gate remains pending.

Final inventory review corrected administration request metadata to the actual document fields and dryRunId receipt; no request behavior changed.

Boundary benchmark: base 5,000 requests median 2.5063719999998284 ms, p95 5.346923000000061 ms; extracted boundary median 4.1922039999990375 ms, p95 9.185389999999643 ms. The median is 67.26% above the base and misses the 5% goal. This remains an open performance finding for integration; the shared machine and additional boundary telemetry are possible contributors, not an established cause. No security shortcut or fixture update was used.

Documentation gate: bun --bun run check passed (TypeScript, format, lint, comments, theme and brand); SW_BASE_URL=http://127.0.0.1:5311 bun run test:terminology passed. README links the reviewed inventory and audit contract. Existing architecture ownership bullets now describe authentication, caller provenance, dispatch, effects, outcome classification and replay without a parallel guide. Audit field and method names agree with audit.ts and the inventory vocabulary; mixed-byte verification is linked to audit-compat.test.ts. The repository formatter excludes Markdown; changed prose was formatted manually. The documentation synchronization pointer to docs/operations.md was inspected against its generation test. Leak scanner: seven changed public documents clean.

Architecture review correction: agent query planning and both metric preview aliases are read effects; merging the local published default branch is localWrite without remote. Inventory metadata and the generated table now match the handlers. Entry-point tests prove those four calls are listed and admitted under their minimal scope, while an actual network pull remains excluded from a localWrite-only connection. Targeted scope/inventory suite: 9 pass, 0 fail, 242 assertions.

Architecture inventory review also separated lineage projection from asset search and added mapping projection, paged graph neighborhoods and bounded graph closure. These browser derivations have named source files and no reviewed operation; the inventory makes that limitation explicit. Inventory suite: 6 pass, 0 fail, 226 assertions.

Full mutation gate encountered an expensive unchanged example-registry baseline. The original runner and registry from 655df09, copied into the assigned temporary area without modifying the working tree, pass in 70.725425 seconds; the current runner passes in 141.178232 seconds during a competing test run. Registry assertions are unchanged. Its category now receives 180 seconds; other cases retain 60 seconds, and timeout is a gate failure, never a kill. Boundary cases now load only for their category. A concurrently running low-priority full unit attempt hit the existing cache test default 5-second limit and was stopped; isolated cache tests pass (2 pass, 0 fail, 14 assertions, 1.63 seconds). The full unit gate is being rerun alone at normal priority.

A complete isolated unit run reported 2,140 pass, 1 fail, 197,138 assertions across 301 files (834.99 seconds). Its sole failure was an unchanged deployment fixture assertion hard-coding /tmp/sw-deploy-registry- even though the implementation honors TMPDIR. The original test from 655df09 reproduced that exact failure against the byte-identical deployment adapter (4 pass, 1 fail). The assertion now checks join(tmpdir(), prefix), retaining the credential-isolation guarantee and keeping scratch files in the assigned root. Targeted proof: 5 pass, 0 fail, 20 assertions. No production deployment behavior changed. A fresh full run follows.

The requested readability checker was also applied to the complete branch-added line set relative to 655df09, rather than only uncommitted lines: zero findings.

A final typed-caller seam check found a newly reachable hiding regression: an Alice MCP caller with read-only scope received 403 for hidden trash but 404 for missing trash. The entry-point test failed with Expected 404 / Received 403 before the fix. Static connection effects now only narrow allowed policy decisions, preserving existing hidden denials and missing-entry behavior. No audit writer changed. Characterization plus scope tests: 5 pass, 0 fail, 1,573 assertions. The focused harness now kills 16/16 boundary mutants, including removal of this denial-precedence guard. The in-flight full unit run was stopped because it predated the fix; the final gate will use this version.

Final full unit gate on 0f0e39b5: 2,142 pass, 0 fail, 197,145 assertions across 301 files (810.24 seconds). The mutation run then killed all module and askpass mutants (670 reported kills) but its source-intercepting browser mutant survived because the frontend was a built static preview. No browser mutation had been injected. The frontend now runs the existing Vite configuration on 5311 with its API proxy restricted to assigned port 5312; the live development module contains the original anchor. The existing UI test source is unchanged from 655df09. A positive UI run had one canceled Chromium download; an unchanged repeat passed all 20 UI checks, including that download, without runtime errors. The complete mutation gate is rerun against the development frontend; no mutant or assertion was weakened.

Full mutation gate on the committed implementation and Vite development frontend: `679/679 targeted mutants killed; all unmodified module baselines passed.` This includes all 16 operation-boundary mutants and every existing authorization, audit, export, observability and browser mutant. No registered mutant survived or timed out. The one specified order-swap mutant remains excluded as documented equivalent. The separate positive browser baseline passed all 20 UI checks.

## Final completion gate

All commands ran in this worktree with isolated data and the assigned frontend port. Browser
suites ran one at a time. The final implementation commit is `0f0e39b5`; subsequent commits record
documentation and validation only.

| Command | Actual summary |
| --- | --- |
| `bun test` | `2142 pass`, `0 fail`, `197145 expect() calls`; `Ran 2142 tests across 301 files. [810.24s]` |
| `bun --bun run check` | Exit 0; format, lint, comments, theme and brand checks passed after TypeScript. |
| `bun --bun run build` | `✓ built in 2.37s`; existing large-chunk warning remains. |
| `bun scripts/mutation-tests.ts` | `679/679 targeted mutants killed; all unmodified module baselines passed.` |
| `bun run test:auth` | Exit 0; 36 `PASS` checks; last: `PASS Git history is refused for a person who cannot read every file`. |
| `bun run test:admin` | Exit 0; this script emits no success summary line. |
| `bun run test:terminology` | `Terminology check passed: no "KPI" or "contract object" in 8 files' views, the metric detail, the wizard, README and docs`. |
| `bun test tests/auth/http-characterization.test.ts` | `1 pass`, `0 fail`, `1548 expect() calls`; `Ran 1 test across 1 file. [7.49s]` |
| `bun run audit:verify tests/fixtures/audit-v1` | `Audit log intact: 9 records in 3 months.` |
| `bun run test:ui` | `20 UI checks passed`. |

The final full-suite performance observations were: 50,300-record ordinary replay 1303.972244 ms,
replay with reads 1419.208974 ms (ratio 1.088374); effective listing over 20 projects and 54
operations 623.204103 ms against 50 ms. The HTTP benchmark remains 4.192204 ms median and
9.185390 ms p95 against the recorded base 2.506372 ms median and 5.346923 ms p95. Listing and HTTP
latency are open integration findings; no permission shortcut or stale cache was introduced.

Architecture review resolved the four incorrect effect declarations and omitted browser graph
derivations. The final denial-precedence correction was reviewed with no blocking findings.
Exactly-once refers to the boundary decision; existing administration `adminChange` business
records remain separate and unchanged. The final review marker is recorded for the completed
committed tree with the skill's `review_marker.py mark --head`.

Readability: the requested checker examined all branch-added lines across 68 changed code files
relative to `655df09`, with zero findings. The global comment check passed. Confidential-content
scanning passed for all 97 changed files; all public documentation additions passed the full
scanner. Previously documented unchanged technical examples and session terminology are retained.
The requested repository `scripts/commit_cadence.py` is absent; the attempted command reports
`[Errno 2] No such file or directory`. No push, deployment, tag, merge or constitution edit was
performed. Owned frontend and gate processes are stopped after validation.

## Implementation and validation commits

The following commits precede this final evidence commit, in chronological order:

- `2ad5dcb3` docs(spec): specify the operation boundary
- `5a501cf2` docs(spec): research the operation boundary design
- `a24f4880` docs(spec): plan the operation boundary
- `13cf2dd4` docs(spec): data model of the operation boundary
- `d6244715` docs(spec): contracts of the operation boundary
- `ce93abfd` docs(spec): quickstart for the operation boundary
- `6b89ff97` docs(spec): task list for the operation boundary
- `ffac0dbe` docs(spec): resolve analysis findings
- `1ad23ed7` test(auth): freeze HTTP behavior before boundary extraction
- `66e51af5` test(audit): preserve original monthly chain fixtures
- `453463f1` test(auth): freeze administration audit replay baseline
- `3fdb78dd` test(auth): record in-process boundary performance baseline
- `3c15f949` feat(auth): mint authenticated operation callers
- `a2e1aaad` test(auth): compare replay fixture as serialized data
- `f063ba8d` docs(auth): record original-code characterization blocker
- `086c013b` test(auth): compare unordered audit rules without changing stored bytes
- `1d840619` refactor(auth): extract network request authentication
- `8e0810cd` refactor(auth): attach handler identity in one place
- `7c2343e8` refactor(auth): move operation execution into the shared boundary
- `d650a81d` refactor(auth): keep HTTP adaptation separate from operation decisions
- `7f16b6d1` test(auth): prove reachable authentication refusal precedence
- `b1367dee` test(auth): type refusal table headers explicitly
- `3537fa62` refactor(http): name existing request byte limits
- `a6aa2a0e` feat(auth): parse the reviewed operation inventory contract
- `c795e759` data: inventory workspace and definition operations
- `d78bb876` data: inventory source control and repository operations
- `0f0c68fc` data: inventory administration and transport-owned operations
- `3a4df028` feat(auth): build credential-free operation twin requests
- `21b67e43` test(auth): generate hostile twin parameters for every route shape
- `797f8cab` Refuse non-dispatchable and mismatched twin operations
- `d4ae3573` Use the attached caller session for delegated remote credentials
- `95c772bf` Restrict static and dynamic operation effects by connection scope
- `8c5bc527` Preserve asynchronous publication checks for scoped fetches
- `59ed7d2d` Compare HTTP and twin authorization through real operation handlers
- `570715eb` Wait for clone jobs before disposing parity workspaces
- `f8557cdb` Attribute dynamic scope refusals to their enclosing operation
- `aae6aae5` Record parity blocker and validation results for the extracted boundary
- `191bc8bb` Distinguish unchanged technical scanner matches from added content
- `fb166c71` Clarify caller-visible hiding while preserving privileged trash auditing
- `459ae8bc` Guard request scope construction and future transport imports
- `c99602b4` Validate and serialize optional audit attribution without changing HTTP bytes
- `fbc33243` Check completeness of the audit serializer against its declared input
- `37c33b72` Verify mixed legacy and attributed audit chains and mirror failures
- `aa60972b` Filter audit attribution after visibility and append CSV attribution columns
- `2d35b6fe` Attribute every non-HTTP operation while preserving HTTP audit selection
- `5d29a491` Classify bounded operation responses after existence hiding
- `a655a664` Record protocol interactions once without replay snapshots
- `d75d17ff` Measure operation outcomes with fixed inventory labels and non-HTTP spans
- `16487fcd` Keep operation telemetry documentation in the established observability guide
- `5ad87c7d` Apply configured retention to the shared production and standalone audit logs
- `284729b7` Classify reported partial effects beside their response owners
- `1d6dd58b` Bound ordinary replay evidence separately from distinct transport reads
- `95d5866d` Use stratified snapshots for administrative comparison and decision replay
- `bdac188f` Prove replay bounds under a durable read flood and measure dry-run cost
- `3c751750` Share route pass logic and dry-run resource probes for operation discovery
- `4a093ef0` List operations by effective route permissions and connection effects
- `f0d2c44c` docs: inventory browser capabilities and their exposure limits
- `3b4cd0b3` feat: validate and publish the complete operation inventory
- `b72bdac9` fix: satisfy boundary lint checks
- `f69cb05d` test: retarget authorization mutants and exercise shared operation guards
- `3ac0c30a` fix: align administration inventory inputs with request validation
- `6f8cb6b7` docs: explain operation ownership audit attribution and replay limits
- `8c613745` fix: scope computation and local merge operations by their actual effects
- `7706ca8a` docs: inventory browser graph and lineage derivations
- `d2dea3bd` test: type scoped operation fixtures as validated parameter maps
- `273b7456` test: isolate boundary case loading and budget the unchanged registry baseline
- `4afd4bc0` test: preserve registry credential isolation under a configured temporary root
- `0f0e39b5` fix: retain existence-hiding denials when narrowing connection effects
- `d9baec68` docs: state the development frontend requirement for browser mutants
- `e234c7d7` test: record the complete operation boundary mutation gate

## Performance follow-up: matched measurements

The HTTP comparison uses a detached temporary worktree of `origin/main` (`655df094`) and the
unchanged `scripts/boundary-benchmark.ts` copied into it. Its imported fixture and workspace
helpers are identical on both revisions. Each fresh process warms 150 requests, then measures
5,000 requests with the same 200/403/400 response mix, consumes every response and asserts its
status. Runs alternate base then branch, five rounds each, without concurrent work from this
feature. Shared machine load is not assumed constant across hours.

| Round | Base median (ms) | Branch median (ms) | Base p95 (ms) | Branch p95 (ms) |
| --- | --- | --- | --- | --- |
| 1 | 2.533263 | 2.577054 | 5.170348 | 5.402725 |
| 2 | 2.628995 | 2.654446 | 6.017790 | 6.142043 |
| 3 | 2.559604 | 2.555854 | 5.660251 | 5.655181 |
| 4 | 2.620984 | 2.585494 | 5.560039 | 5.328331 |
| 5 | 2.507203 | 2.537583 | 5.118427 | 5.117718 |

Median of medians: base **2.559604 ms**, branch **2.577054 ms** (+0.68%).
Base round medians range from 2.507 to 2.629 ms; branch rounds range from 2.538 to 2.654 ms.
The difference is within run-to-run noise and below the 5% threshold. The earlier 4.19 ms
comparison with an hours-old 2.51 ms baseline is superseded. No HTTP cost removal is needed.

Listing profiling measured 1,055 explicit authorization calls and 81 readable-view builds per
20-project listing. A representative warmed sample took 356.603 ms: 334.816 ms inside explicit
authorization calls and 20.589 ms building readable views. Cedar already uses the compiled policy
set; repeated project/action probes, rather than policy compilation, dominated.

Listing now probes each action and file-probe kind once per call. The access scope supplies one
representative per identical project metadata and effective role set, retaining exact project
probes for clients and arbitrary administrator rules. The baseline and role-compiled policies
inspect those attributes and role-holder membership; their only project-name predicate is client
membership, which is not coalesced. File probes retain the same role-condition resources and
metadata. Invocation continues to inspect actual targets and does not use the representatives.
No cache survives a listing call.

The listing comparison alternates the pre-optimization implementation from `12060136` and the
optimized implementation, five rounds each. Main has no listing boundary, so it cannot be the
listing baseline. Original boundary and authorizer sources are copied to temporary paths with
relative imports resolved back to their dependencies; neither original source is changed. Each
process uses the same 20 Sales-project fixture and Alice caller, discards two warm-up listings,
then measures five fresh request scopes and reports their median. Policy loading and fixture
creation are excluded equally on both sides. All samples return the same 54 operations.

| Round | Before median (ms) | Optimized median (ms) |
| --- | --- | --- |
| 1 | 310.032989 | 49.976465 |
| 2 | 322.515310 | 47.473352 |
| 3 | 327.391251 | 46.589231 |
| 4 | 323.900780 | 47.176555 |
| 5 | 325.753547 | 47.435513 |

Median of medians: **323.900780 → 47.435513 ms**, a **85.35% reduction** (6.83× faster).
Explicit authorization calls fall from 1,055 to 58. The measured median meets the original 50 ms
goal, which remains unchanged. Cold calls and shared-load outliers can exceed that goal; it is
not a response-time SLA. The old 623 ms observation is superseded by this matched comparison.

Before production edits, the exact sorted operation ids were recorded for all nine fixture
people with unrestricted and read-only effects, both fixture clients, a deactivated caller,
and both conditional-role fixtures. The unchanged implementation passed the comparison
(5 tests, 38 assertions), and the optimized implementation preserves it. Additional tests exercise
distinct grants, project-name administrator rules, grant revocation and restoration. Two added
mutants remove the project-role distinction and the administrator-rule exception respectively.

Performance scope: HTTP response and audit bytes stay frozen; listing answers remain exact;
reuse is confined to one synchronous listing and cannot retain revoked grants.

### Final-code HTTP repeat

After the listing optimization and shared role-selection extraction, the same five-round
interleaved HTTP comparison was repeated on `4c370fca`, before starting the release tests.

| Round | Base median (ms) | Final branch median (ms) | Base p95 (ms) | Final branch p95 (ms) |
| --- | --- | --- | --- | --- |
| 1 | 2.510712 | 2.579164 | 5.277382 | 5.483216 |
| 2 | 2.521223 | 2.447281 | 5.092136 | 4.865721 |
| 3 | 2.391060 | 2.365829 | 4.695597 | 4.616646 |
| 4 | 2.429291 | 2.361978 | 5.142489 | 4.553113 |
| 5 | 2.354639 | 2.404410 | 4.487453 | 4.700047 |

Final median of medians: base **2.429291 ms**, branch **2.404410 ms** (-1.02%).
The remaining difference is within run-to-run noise; there is no measured HTTP regression above
5%. The temporary main worktree was removed after the final comparison.

The independent architecture review found no blocking correctness issue. It confirmed scope
equivalence, domainless explicit grants, exact administrator/client probing and request-local
cache lifetimes. `bun test tests/auth`: 727 pass, 0 fail, 113238 assertions, 119 files.
`bun --bun run check`: TypeScript, formatting, lint, comments, theme and brand checks pass.
Branch readability: 69 files, 0 findings.
