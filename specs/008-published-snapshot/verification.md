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

The driver used for these earlier runs has since been replaced by `scripts/ci-validate.ts --step browser --suite <script>`. It started its own frontend on 5481, points the API proxy at 5482, and runs the
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

The ten requested corrections are implemented. Architecture review remains PASS at `cc9ba64d`;
production source is unchanged from the reviewed `5a5a64e5`, and the harness delta passed review at
`06ce59e6`. The results below supersede the earlier incomplete correction attempt.

| Command | Verified result | Exit |
| --- | --- | --- |
| Remote `bun test --timeout 30000` | 2198 pass, 0 fail, 134740 assertions, 305 files, 1221.61 s | 0 |
| Local `bun --bun run check` after disk repair | TypeScript, formatting, lint, comments, theme and brand pass | 0 |
| Local `bun --bun run build` | `✓ built in 1.13s`; production unchanged afterward | 0 |
| Remote `test:published-snapshot` | 2 published snapshot browser checks passed | 0 |
| Remote `test:ui` | 20 UI checks passed | 0 |
| Remote `test:edges` | 6 edge attachment UI checks passed | 0 |
| Remote `test:grouping-validation` | 8 grouping and validation UI checks passed | 0 |
| Remote `test:examples:ui` | 19 example UI checks passed; no browser runtime errors | 0 |
| Remote `test:scm` | 18 source-control checks passed | 0 |
| Remote `test:mappings-layout` | 7 mapping layout checks passed | 0 |
| Remote `test:projects` | 8 project checks passed | 0 |
| Remote `test:auth` | Final check: Git history refused without access to every file; suite passed | 0 |
| Remote `bun scripts/mutation-tests.ts` | 700/700 targeted mutants killed; all unmodified module baselines passed | 0 |
| Remote complete local capture | 232 states, all `problems=0` | 0 |
| Remote complete server capture | 232 states, all `problems=0` | 0 |
| Remote targeted responsive groups after repair | 21 checks: dark theme, graphs, shell, examples at 1440/2560 px, phone drawer | 0 |
| Remote complete responsive suite | First canvas 481 px against more than 504 px; identical on exact main/base | 1 |
| Remote built-frontend mall at 1280 px | Canvas 389 px against at least 421 px; identical on exact main/base | 1 |

The mall-import browser check now awaits the import response and requires status 200 before its
unchanged model-title assertion. Its successful rerun is committed. All 686 source, five askpass and
nine visual mutants were detected; none was removed or classified as equivalent. The measured
administration baseline requires the same 30-second limit already used for examples; that limit applies
equally to original and mutated candidates. All other deadlines and every assertion remain unchanged.

The complete responsive suite is not green. The original local 407/421 mall failure was reproduced
on a temporary origin/main worktree and assigned to the UI lane. On midgard, exact main/base revision
`655df094` independently reproduces both 481/>504 and the built-frontend mall 389/421 result. These are
pre-existing failures; canvas code and responsive assertions were not changed. The six additional groups
were rerun and committed individually after disk repair. No full responsive pass is claimed.

Fresh correction captures comprise 464 full-journey images plus 34 publication-control images, indexed
in [review-capture-index.tsv](review-capture-index.tsv). After repair, all 498 retained files matched their
committed SHA-256 values. Native inspection and the historical release comparison are described in
[visual-findings.md](visual-findings.md); no historical timing or capture is presented as a new measurement.

Full heavy logs and new artifacts remain on midgard. Post-repair runs pulled only small summaries.
The temporary baseline source and data roots are removed, and the final remote audit found no owned
Bun, Node or Vite runtime process. The tree is committed before handoff. No requested application task
was skipped and no blocking code/specification contradiction was found.

Before merging feature 010, replace the interim `surfaceFromCredential` classification in
`src/server/auth/request-surface.ts` with operation-boundary metadata. Its single request-symbol setter
and the documented read-source inventory provide the existing integration point. Preserve the UI
regression exceptions above until their owning lane resolves them.
