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
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-fixture.ts
mkdir -p out/008-main-source
git archive 655df094 | tar -x -C out/008-main-source
ln -sfn "$PWD/node_modules" out/008-main-source/node_modules
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-measurement.ts "$PWD/out/008-main-source"
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-measurement.ts "$PWD"
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
| `bun --bun run build` | `✓ built in 1.59s`; exit 0 |
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
