# Batch gate: Loose Ends

Baseline: `main` at `4efb44e2`. Every heavy run goes through `sw-midgard-run` on midgard as dev.

## Run 1: full unit suite (2026-11-26)

Commit `46091782` (P0, P1, P2 and P3 merged). Command: `sw-midgard-run -- bun test ./tests`.

| Result | Value |
| --- | --- |
| Tests | 4415 across 642 files |
| Pass | 4414 |
| Fail | 1 |
| Wall time | 66 min |

The one failure is `tests/tessera/compile-scale.test.ts`, "a project of 200 documents and about 20 MB compiles
within thirty seconds", at 31.3 s. Capture jobs and another pane's full suite were running on midgard at the same
time. Rerun alone at `4f53093c`: 2 pass, 26.3 s. That is load, not a change in the compiler, but the margin to the
30 s limit is small, so later gate runs keep midgard free of other jobs while this file runs.
