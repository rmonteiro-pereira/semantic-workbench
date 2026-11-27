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

### Browser suites: candidate against main

Run with `bun run ci:validate -- --step browser --suite <name>` through `sw-midgard-run`. At `09d6ac6f`, 34 of 46
suites passed. The 12 that failed were rerun on `main` `4efb44e2` and on the frozen candidate `5a8c6102`:

| Suite | main | candidate `5a8c6102` | Verdict |
| --- | --- | --- | --- |
| `test:graph` | fail: height at least 480 px | fail: same (458.6 px) | inherited |
| `test:editor` | fail: timing under 30 | fail: same | inherited |
| `test:item-diff` | fail: output list differs | fail: same | inherited |
| `test:lineage` | fail: timing within 2000 | fail: same | inherited |
| `test:usage-traffic` | fail: output list differs | fail: same | inherited |
| `test:responsive` | fail: graph transform | fail: same | inherited |
| `test:admin` | pass | pass | fixed by the settings fixes |
| `test:ui` | pass | fail: import review, second file's text | regression, sent to the Ossie pane |
| `test:validation` | pass | fail: Validation details does not open | regression, sent to the Ossie pane |
| `test:autosave` | pass | fail: `.validation-details` missing | regression, sent to the Ossie pane |
| `test:attributes` | pass | fail: two fields match the label Name | regression, sent to the captures pane |
| `test:acp` | pass | fail: expects the old "Reconnecting…" wording | test follows an intended wording change |

Mutation at `5a8c6102` ran every case up to the UI mutants, which need a frontend on port 5173; the mesh mutants
killed 15 of 15. Mutation is rerun through `bun run ci:validate -- --step mutation`.

### Accepted by main (2026-11-27): below the first phone screen

At 390 px, intended additions to the Admin screens (record labels, confirmations, help text, save state) push these
actions below the first phone screen. Each is fully visible once scrolled into view, and nothing overlaps it. Main
accepted them as a small layout choice with no feature removed:

- Access check with an error explanation: Check access and Who can access.
- Git remotes: the fourth remote card's actions.
- Projects access: Preview agent grants.
- Settings: Save settings.

Covered or overlapping elements stay regressions. Mesh "Used by" under the fixed validation status bar at 390 is open
with its fix.

## Whole-journey comparison: round 3 and its review shards (2026-11-27)

Round 3 compared `main` `4efb44e2` with the frozen candidate `5a8c6102` and left 892 changed pairs to review. Eight
Sol review shards looked at them, each pair's changed region cropped 1:1 from the native captures:

| Result | Pairs |
| --- | --- |
| Reviewed | 694 of 892 (198 not reached) |
| Seen at 1:1 | 677 of 694 |
| Intended | 86 |
| Improvement | 6 |
| Neutral | 126 |
| Regression | 4 (one issue) |
| Not compared: capture failure | 426 |
| Not compared: state unreachable on both sides | 42 |
| Not compared: data-dependent | 4 |

The regression: at 390 px the fixed Admin header covers the top of the Access check heading and the first row of the
Roles editor navigation, after the phone navigation was made to scroll with the section. Sent to the settings pane.

Most capture failures are graph states where the two sides caught a different layout, zoom or loading stage. The
final recapture therefore waits for a settled, deterministic graph state on both sides before each screenshot.

## Run 3: full gate on `c783616a` (2026-11-27)

All steps through `sw-midgard-run`, one after another, logs in `out/gate-021d/` on the midgard checkout.

| Step | Exit | Time |
| --- | --- | --- |
| `bun --bun run check` | 0 | 67 s |
| `bun --bun run build` | 0 | 6 s |
| `bun test ./tests` | 0 (4,524 pass, 0 fail, 668 files) | 4,164 s |
| `bun run ci:validate -- --step mutation` | 0 (958 of 958 targeted mutants killed, every baseline passed) | 3,494 s |
| Browser suites, `ci:validate --step browser --suite <name>` | 46 of 54 pass | - |

Compile-scale timing, inside the full suite (not alone): `tests/tessera/compile-scale.test.ts` 26.51 s and
`tests/compile/compile-scale.test.ts` 27.12 s, against the unchanged 30 s limit. The alone run for both `main` and the
candidate is part of the final run.

The eight failing suites:

| Suite | Verdict | Evidence |
| --- | --- | --- |
| `test:graph`, `test:editor`, `test:item-diff`, `test:lineage`, `test:responsive`, `test:usage-traffic` | inherited | same assertions fail on `main` `4efb44e2` (run 2 table) |
| `test:theme` | load, not a change | a graph edge path was still hidden in the accent check; rerun alone it passes on `e431dab1`, `09d6ac6f` and `main` |
| `test:sidebar` | inherited timing margin | see below |

`test:sidebar` waits 5 s for the project tree after each example click. It failed twice alone on `e431dab1`, while
bisecting the five merges after `09d6ac6f` gave pass and fail in no order (a5ed985c fail, cb3fab2d pass, 5a8c6102 fail,
e43fa7bc fail, c783616a pass). With the load time of each example logged, the first UBL load takes 4.6 to 5.3 s on the
candidate (three runs) and 4.8 to 5.1 s on `main` (two runs); later UBL loads take a median of about 3.35 s on both.
The check's margin on the first UBL load is the same on both sides, so this is inherited, not a regression. The 5 s
wait was not changed.

## Whole-journey comparison: round 4 and its review shards (2026-11-27)

Round 4 compared `main` `4efb44e2` with the frozen candidate `e431dab1`, with graph screenshots taken only once node
positions had settled. It classified 1,243 pairs directly and left 1,039 changed pairs for review. Ten Sol review
shards reviewed all 1,039, each pair's changed region cropped 1:1 from the native captures.

| Result | Pairs |
| --- | --- |
| Reviewed by the shards | 1,039 of 1,039 |
| Seen at 1:1 | 1,039 of 1,039 |
| Intended | 434 |
| Neutral | 444 |
| Regression | 2 (one issue) |
| Not compared: capture failure | 139 |
| Not compared: data-dependent | 12 |
| Not compared: state unreachable on both sides | 8 |

Round 4's own classes outside the queue: 355 intended, 23 improvement, 216 neutral, 314 unchanged, 0 regression.

Not compared in round 4 itself (204 pairs), by reason: graph screenshots in a loading phase (90), missing image or
failed action in a required passage (97), lineage centred on a different object across passages (16), hover target not
recorded (1). Together with the shards' 159, these 363 pairs go to a targeted recapture (round 5) on the candidate
with the harness causes fixed; none is accepted as it is.

The regression: `mesh/import-editor-populated-{light,dark}-390`. With the import editor open at 390 px, the fixed
validation status bar rests on the Used by button, where `main` shows the Used by label. Sent back to the captures
pane.

Collapsed Network labels, equal on both sides, both themes and both passes: UBL 11 at 1440 and 1920; Mall 0 at 1440
and 39 at 1920.
