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

## Whole-journey comparison: round 1 (2026-11-27)

`main` `4efb44e2` against `990d6659`, light and dark, 390 and 1440 px, graph states also at 1920 px, two passes
per side. Evidence outside git: `~/scratch/sw-021/journey/` and `/srv/dev/sw/021-journey/` on midgard; tooling on
branch `021-journey`.

| Class | Pairs |
| --- | --- |
| Unchanged | 627 |
| Intended | 427 |
| Neutral | 453 |
| Regression | 9 (four issues) |
| Not compared | 336 |
| Pending review | 274 |
| Total | 2,126 |

Collapsed Network edge labels (DOM text count), equal on both sides in both themes and passes: UBL 11 at 1440 and
1920; Mall 0 at 1440 and 39 at 1920.

Regressions, sent to their owners: the attribute dialog's reading sentence differs from Name in face and height; Save
governance partly below the panel at 1440; a long restriction path in a confirmation heading at 390; Git remote
actions wrapping at 1440.

### What the verdict needs

- Every "not compared" group gets a stated reason: state unreachable on both sides, data-dependent, or capture
  failure. A capture-failure group is recaptured, not accepted.
- Every pair records the scale it was viewed at. The gate is called clean only together with the share of changed
  pairs that were looked at in full resolution.

## Run 2: mutation and browser suites (2026-11-27)

- First attempt at `990d6659`: 40 of 47 browser suites failed in seconds with `ERR_CONNECTION_REFUSED` on port 5173,
  because the driver ran each suite without a frontend. Not a result. Suites now run through
  `bun run ci:validate -- --step browser --suite <name>`, which starts a fresh frontend per suite.
- Mutation at `990d6659` stopped at the lineage-review baseline: the runner rewrites every quoted relative import in
  a case file to an absolute path, including the import text the case searches for. `main` `4efb44e2` fails the same
  way. Fixed in `09d6ac6f`.
- Mutation at `09d6ac6f`: 1,526 lines of KILLED results, then the mesh baseline "diamond de-duplication" failed with
  a missing `src/server/projects/reader` in its copy. Cause: the journey comparison job ran `sw-midgard-run` from the
  same worktree name during the run, which reset and cleaned the shared midgard checkout. The mesh mutants alone pass
  locally (15 of 15 killed). Mutation is rerun with nothing else using that checkout.
