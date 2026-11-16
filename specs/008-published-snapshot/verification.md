# Published snapshot verification

## Restart recovery

`TMPDIR=/tmp/sw-008 bun test tests/publishing.test.ts tests/published-initialization.test.ts`: 19 pass, 0 fail, 107 assertions.

SC-006 recovery matrix: 9 of 9 scenarios passed (100%). Stops after intent, ref and pointer were
exercised without an outside move and with outside fast-forward and diverged moves. An outside
move leaves the settled pointer served, the external ref unchanged and the pending move visible.

## Agent performance

The fixture loads the shipped UBL, commerce, mapped-commerce and mall examples, commits them and reopens the same copied data root for both revisions. The three measured requests address mapped-commerce; its plan selects the governed `gross_revenue` metric. Cold means the first request after opening a workspace with an empty in-memory snapshot index; the SQLite parsing cache remains populated. Warm measurements use 100 subsequent calls per opening, with 12 openings per endpoint. Requests include response serialization and consume the full body. This is a shared host measurement, not a load test.

```sh
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-fixture.ts
git archive 655df094 | tar -x -C out/008-main-source
ln -s "$PWD/node_modules" out/008-main-source/node_modules
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-measurement.ts "$PWD/out/008-main-source"
TMPDIR=/tmp/sw-008 bun specs/008-published-snapshot/performance-measurement.ts "$PWD"
```

| Endpoint | Base cold p95 ms | Snapshot cold p95 ms | Base warm p95 ms | Snapshot warm p95 ms | Warm change |
|---|---:|---:|---:|---:|---:|
| catalog | 81.69 | 150.96 | 29.81 | 29.28 | -1.78% |
| context | 36.85 | 85.58 | 32.72 | 34.38 | +5.06% |
| plan | 26.81 | 92.44 | 35.37 | 32.18 | -9.01% |

All three warm p95 changes satisfy the 10% budget. Cold p95 is reported separately and includes Git object validation; the success criterion sets no cold-time budget. Each warm row contains 1,200 calls; each cold row contains 12 calls.
