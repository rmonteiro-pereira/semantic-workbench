# Published snapshot verification

## Restart recovery

`TMPDIR=/tmp/sw-008 bun test tests/publishing.test.ts tests/published-initialization.test.ts`: 19 pass, 0 fail, 107 assertions.

SC-006 recovery matrix: 9 of 9 scenarios passed (100%). Stops after intent, ref and pointer were
exercised without an outside move and with outside fast-forward and diverged moves. An outside
move leaves the settled pointer served, the external ref unchanged and the pending move visible.

## Agent performance

The fixture loads the shipped UBL, commerce, mapped-commerce and mall examples, commits them and reopens the
same copied data root for both revisions. The three measured requests address mapped-commerce; its plan
selects the governed `gross_revenue` metric. Cold means the first request after opening a workspace with an
empty in-memory snapshot index; the SQLite parsing cache remains populated. Warm measurements use 100
subsequent calls per opening, with 12 openings per endpoint. Requests include response serialization and
consume the full body. This is a shared host measurement, not a load test.

```sh
TMPDIR=/tmp/sw-008 bun scripts/published-snapshot-performance-fixture.ts
mkdir -p out/008-main-source
git archive 655df094 | tar -x -C out/008-main-source
ln -sfn "$PWD/node_modules" out/008-main-source/node_modules
TMPDIR=/tmp/sw-008 bun scripts/published-snapshot-performance.ts "$PWD/out/008-main-source"
TMPDIR=/tmp/sw-008 bun scripts/published-snapshot-performance.ts "$PWD"
```

| Endpoint | Base cold p95 ms | Snapshot cold p95 ms | Base warm p95 ms | Snapshot warm p95 ms | Warm change |
|---|---:|---:|---:|---:|---:|
| catalog | 81.69 | 150.96 | 29.81 | 29.28 | -1.78% |
| context | 36.85 | 85.58 | 32.72 | 34.38 | +5.06% |
| plan | 26.81 | 92.44 | 35.37 | 32.18 | -9.01% |

Archived baseline test entry points are removed from the ignored source copy after extraction so subsequent
`bun test` runs discover only this branch's tests. The fixture reset affects only its dedicated temporary
root.

All three warm p95 changes satisfy the 10% budget. Cold p95 is reported separately and includes Git object
validation; the success criterion sets no cold-time budget. Each warm row contains 1,200 calls; each cold row
contains 12 calls.

## Mutation gate

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/mutation-tests.ts`

```text
695/695 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.
```

The snapshot predicates, provenance, publication/adoption checks, request surfaces and pinned export mutants
are registered in the shared harness. The full run also detected all nine visual mutants. No mutant was
excluded or treated as equivalent. Earlier baseline failures exposed stale fixture expectations and were
corrected; the final run passed each unmodified baseline before executing mutants.

## Broad checks

| Command | Observed result |
|---|---|
| `bun test` | 2,187 pass, 0 fail; 134,686 assertions; 304 files; 401.57 s |
| `bun --bun run check` | Exit 0; formatter, TypeScript, lint, comments, theme and brand checks passed |
| `bun --bun run build` | `✓ built in 5.92s`; exit 0 |
| `bun scripts/published-snapshot-browser-check.ts` | `2 published snapshot browser checks passed.` |

The test run used `DATA_DIR=/tmp/sw-008/unit-gate-final`. Browser runs use `TMPDIR=/tmp/sw-008` and the assigned frontend on port 5321; API/mock listeners allocate their own dynamic ports.

## Browser completion checks

All browser suites ran serially with `TMPDIR=/tmp/sw-008` and `SW_BASE_URL=http://127.0.0.1:5321`.
The package commands used `bun --bun run`; responsive follow-ups used the same script with
`RESPONSIVE_ONLY` selecting groups after the inherited failure.

| Command | Summary | Exit |
|---|---|---:|
| `test:ui` | `20 UI checks passed` | 0 |
| `test:edges` | `6 edge attachment UI checks passed` | 0 |
| `test:grouping-validation` | `8 grouping and validation UI checks passed` | 0 |
| `test:examples:ui` | `19 example UI checks passed; no browser runtime errors.` | 0 |
| `test:scm` | `18 source-control checks passed` | 0 |
| `test:mappings-layout` | `7 mapping layout checks passed` | 0 |
| `test:projects` | `8 project checks passed` | 0 |
| `test:published-snapshot` | `2 published snapshot browser checks passed.` | 0 |
| `test:auth` | Final assertion: `PASS Git history is refused for a person who cannot read every file` | 0 |
| `test:responsive` | `mall.odcs.yaml canvas height`: expected >= 421 px, received 407 px | 1 |

The responsive failure was reproduced unchanged in a temporary worktree from freshly fetched
`origin/main` (`655df094`), then that worktree and its frontend were removed. The user assigned the
lineage-toolbar fix to the UI branch and instructed that neither canvas nor assertion change here.
This is an explicit inherited failure, not a passing full responsive run. Focused follow-ups passed:
dark theme 5 checks, graph controls 5, shell 5, examples at 1440 px 2, loading 2 and examples at 2560 px 2.
The full run passed its preceding groups before reaching the known assertion.

An initial frontend transport interruption invalidated later browser attempts. A fresh frontend and
serial reruns supplied the successful results above; those interrupted attempts are not acceptance proof.

## Native visual comparison

[Comparison index](comparison-index.md), [findings](visual-findings.md) and
[hashed manifest](capture-manifest.json) cover 464 pairs: 928 PNGs, both modes, 58 states and four native
viewports. Each complete journey produced 232 zero-problem measurements and exited 0. All pairs are
classified; no unrequested product regression remains. The sidebar's asynchronous background and duplicate
filename selector were corrected in the capture preparation, with focused proof on both revisions.

```sh
TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/polish-capture.ts <local-output>
TMPDIR=/tmp/sw-008 bun scripts/polish-capture-server.ts <server-output>
```

Both commands ran on v0.6.1 and the feature source. Each log ends with
`MEASURE admin-access-check 2560 problems=0`; all 232 measurements in each log report zero problems.
Focused sidebar recaptures report four `MEASURE sidebar-projects ... problems=0` lines per revision/mode.
Server commands ran in isolated subprocess sessions with their actual return codes recorded in files,
confirming zero after earlier direct-launcher signal statuses. The inherited 407/421 responsive failure
remains documented separately and is not described as a passing assertion.

## Remote completion protocol

After the shared desktop was externally stopped for memory exhaustion, heavy completion runs moved to the
user-supplied capped wrapper. The remote unit command uses `bun test --timeout 30000` because the slower
shared machine exceeded Bun's five-second default in unrelated KPI and refresh cases. Assertions and
explicit per-test deadlines are unchanged. Final results are recorded below when each run completes.

```sh
sw-midgard-run -- bun test --timeout 30000
sw-midgard-run --pull out/008-remote-gate -- bun scripts/published-snapshot-remote-gate.ts
```

The versioned support driver starts its own frontend on 5481, points the API proxy at 5482, and runs the
snapshot browser baseline, full UI baseline and full mutation suite serially. Browser harnesses own their
isolated dynamic API listeners. The frontend is stopped in `finally`; logs and exit files are pulled from
the dedicated output directory. No production source, dependencies or public environment settings change.

## Final remote unit result

`sw-midgard-run -- bun test --timeout 30000` exited 0:

```text
2187 pass
0 fail
134686 expect() calls
Ran 2187 tests across 304 files. [1168.81s]
```

All prior host-identity and temporary-directory fixture failures now pass, including the recovery matrix,
agent source equivalence and legacy restore. The two default-deadline failures also pass. The final local
`bun --bun run check` exited 0, and `bun --bun run build` exited 0 with `✓ built in 5.92s`.

## Final remote mutation and review result

`sw-midgard-run --pull out/008-remote-gate -- bun
scripts/published-snapshot-remote-gate.ts` exited 0 at source revision `c73807e4`.
The driver ran these commands serially with `SW_BASE_URL=http://127.0.0.1:5481`:

| Command | Summary | Exit |
|---|---|---:|
| `bun scripts/published-snapshot-browser-check.ts` | `2 published snapshot browser checks passed.` | 0 |
| `bun scripts/ui-tests.ts` | `20 UI checks passed` | 0 |
| `bun scripts/mutation-tests.ts` | `695/695 targeted mutants killed; all unmodified module baselines passed.` | 0 |

All nine visual mutants were detected. No mutant was excluded or classified as equivalent. The measured
remote example baseline needs 17.234 s; only its category receives a 30 s deadline for original and mutated
candidates. Other mutation deadlines and every assertion remain unchanged. The frontend and its descendants
were stopped by the existing CI process-group cleanup before the wrapper returned zero.

The architecture reviewer returned PASS at `c73807e4`, with no actionable issue. The documentation reviewer
also returned PASS at that revision. Production source at that original completion gate remained identical to the captured `bab84471` tree.
The subsequent architecture corrections and their fresh gate are recorded below.
At that original gate, all tasks were complete, with the explicit inherited responsive exception above;
no full responsive pass was claimed. The correction gate status below supersedes that historical status.

## Architecture correction gate status

The production corrections are complete and the architecture review returned PASS at `5a5a64e5`.
The ten requested corrections and their focused proofs are recorded in `evidence.md`.
The latest gate is incomplete; the original completion results above do not stand in for this rerun.

| Command | Latest verified result | Exit |
| --- | --- | --- |
| `sw-midgard-run -- bun test --timeout 30000` | 2198 pass, 0 fail, 134740 assertions, 305 files, 1221.61 s | 0 |
| `bun --bun run check` | TypeScript, formatting, lint, comments, theme and brand checks pass | 0 |
| `bun --bun run build` | `✓ built in 1.13s` | 0 |
| `test:published-snapshot` through remote driver | 2 published snapshot browser checks passed | 0 |
| `test:ui` through remote driver | 20 UI checks passed | 0 |
| `test:edges` through remote driver | 6 edge attachment UI checks passed | 0 |
| `test:grouping-validation` through remote driver | 8 grouping and validation UI checks passed | 0 |
| `test:examples:ui` through remote driver | The mall import had not selected its model within the title assertion's five-second window | 1 |

The examples check now awaits the mall import response and requires status 200 before the unchanged
model-title assertion. This harness correction passes `check` but has not yet been verified in a browser.
Three consecutive wrapper retries could not start the tests because SSH or rsync connections timed out
(exit 255, 128, 255). No heavy local fallback was run.

Remaining gate work: rerun the remote driver, including examples, SCM, mappings layout, projects, auth,
both full capture journeys, responsive checks and mutation. The complete mutation result of 695/695 above
belongs to the earlier source; the correction harness now registers 700 mutants and has not completed
its full run. The inherited responsive 407/421 exception remains unchanged. Fresh correction captures
must also be reviewed after transfer. This correction must not be reported READY until those proofs finish.
