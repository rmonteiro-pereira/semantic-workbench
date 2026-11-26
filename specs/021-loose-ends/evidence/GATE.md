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

### Rule for later runs of `compile-scale.test.ts`

Every gate run also runs `tests/tessera/compile-scale.test.ts` alone, with no other job on midgard, and records its
time here, next to the main baseline. The 30 s limit stays as it is; if it ever changes, the merge line says so.

| Run | Commit | Alone on midgard | Time | Result |
| --- | --- | --- | --- | --- |
| 1 (in the full suite) | `46091782` | no | 31.3 s | fail |
| 1 (rerun) | `4f53093c` | yes | 26.3 s | pass |

## Bundle size after the Ossie 0.3.0 draft base

Measured by the Ossie pane with `bun --bun run build`, `main` `4efb44e2` against branch `021-ossie`:

| Chunk | main | candidate | Change |
| --- | --- | --- | --- |
| Main application chunk | 2,970,373 B | 2,993,434 B | +23,061 B (+0.8%) |
| 0.3 validators (loaded only for a 0.3.0.dev0 file) | none | 409,567 B | new, lazy |
| Lint worker | | | +13.5 KB |

The 0.3 validators stay out of the main chunk. The +23 KB is new code every user loads (the conversion entry point,
the dialogs and the shared readers that accept both forms). Accepted; the final gate run measures it again.
