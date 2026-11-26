# Collapsed Network final regression handoff

The six remaining review items are fixed on `007-ui-review-fixes`. The targeted unit, static and visual checks pass. T076 remains open until the broader journey gate is accepted. The product code revision is `ff92022c`; the visual comparison baseline is `eace3283`, and the main comparison reference remains `da54cf17`.

## Commits and item status

| Item                                                | Status | Commit and proof                                                                                                                                                                                           |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leader ends on the painted curve                    | Fixed  | `0cf2a262`: refine the nearest sampled segment using SVG arc lengths. A curved-path test distinguishes the endpoint from its chord.                                                                        |
| Bounds overlap without a viewport intersection      | Fixed  | `5768d551`: require a segment intersection after the bounds check. The corner-missing diagonal cannot claim another route's lane.                                                                          |
| Labels slide under the mini-map during a pan        | Fixed  | `ff92022c`: publish the live transform once per animation frame, synchronously update placement before paint, and cancel pending work on unmount.                                                          |
| Unpublished labels bypass obstacle construction     | Fixed  | `0cf2a262`: derive eligibility from final edge appearance and share it between placement and obstacle construction. Labels-off changed relationships have a regression test.                               |
| Route work and retained geometry grow unnecessarily | Fixed  | `0cf2a262`, `5768d551`: batch changed paths, evict absent edges, cache SVG bounds, lazily sample routes reaching the viewport and cap curvature subdivision. Bounds accumulate without coordinate spreads. |
| Measurement and placement are buried in one hook    | Fixed  | `0cf2a262`: named route measurement, sampling, anchor refinement and full-graph placement functions live beside the existing graph modules.                                                                |

## Commands and exits

Heavy verification uses unchanged `sw-midgard-run`, with loopback isolation, disposable DATA_DIR roots beneath `/srv/dev`, and frontend port 5471. Commands inside the wrapper use the final committed product source.

| Command                                                                                                                       | Exit | Result                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                                                                                                               | 0    | TypeScript, Oxfmt, lint, comments, theme and brand checks pass. Local log: `~/scratch/sw-007/round-f-check.log`.                                                                                                                |
| `bun test ./tests/neighborhood-layout.test.ts ./tests/label-placement.test.ts ./tests/label-route.test.ts` inside the wrapper | 0    | 20 tests, 297 assertions, zero failures. Includes curve refinement, bounds-only false positives, long-route bounds, lazy sampling, bounded sampling and unpublished-label eligibility.                                          |
| `sw-midgard-run --pull out/round-f -- bash out/round-f/run.sh`                                                                | 0    | Wrapper runs targeted units, both capture revisions, metric probes and the two suites sequentially.                                                                                                                             |
| `bun out/round-f/capture.ts before` inside the wrapper                                                                        | 0    | Seven baseline states complete, including the held mid-pan frame.                                                                                                                                                               |
| `bun out/round-f/capture.ts fixed` inside the wrapper                                                                         | 0    | Seven candidate states complete; all ten intermediate drag probes have zero mini-map overlaps.                                                                                                                                  |
| `bun out/round-f/header-probe.ts` inside the wrapper                                                                          | 0    | All six metric headers and readable detail at 1920 and 2560, light and dark. Missing headers and hidden Type, Owner and Concept are detected.                                                                                   |
| `bun run test:graph` inside the wrapper                                                                                       | 1    | Neighborhood canvas is 458.609375 px against a minimum of 480, at `graph-review-checks.ts:90`. Same assertion and measurement as the preceding handoff.                                                                         |
| `bun run test:responsive` inside the wrapper                                                                                  | 1    | Full-screen transform restoration fails at `responsive-ui-tests.ts:547`, matching the preceding handoff. Expected `matrix(1.00515, 0, 0, 1.00515, -135.787, -62.825)`, received `matrix(0.5635, 0, 0, 0.5635, -41.03, 13.035)`. |
| `bun out/round-f/review.ts`                                                                                                   | 0    | Pixel comparison precedes geometry assertions and native crop review. All seven states have zero label collisions or clipping.                                                                                                  |
| Oxfmt, readable-code, docs-sync and `git diff --check`                                                                        | 0    | Changed source and documentation pass. Markdown uses a scratch Oxfmt configuration because the repository configuration excludes Markdown.                                                                                      |
| Pre-push check before scratch synchronization                                                                                 | 0    | 19 unpushed commits checked, zero findings. Architecture review found no blocker. No origin or GitHub push.                                                                                                                     |

Source and documentation leak scans exit 0 with no findings; the internal handoff uses the confidential-only scan.

Two preliminary local `bun run check` attempts exited 1 on the new test fixture's incomplete type and an unnecessary spread. The fixture is corrected in `ff92022c`; the final check and both local and remote targeted tests pass.

## Visual results

All captures remain outside Git in `out/round-f/{before,fixed}`. Each pair uses the same example, viewport, theme, collapse and zoom actions. Card geometry is identical across every pair. Settled label boxes are identical except for a 0.00006103515625 px numerical difference in dark UBL at 2560. Changes are confined to leader endpoints and the live-pan placement.

| State                                | Visible labels | Changed pixels |
| ------------------------------------ | -------------- | -------------- |
| UBL, 1440, light                     | 11             | 233            |
| UBL, 2560, light                     | 11             | 527            |
| UBL, 1440, dark                      | 11             | 211            |
| UBL, 2560, dark                      | 11             | 687            |
| Mall, zoomed 1440, light             | 21             | 1700           |
| Mall, zoomed 1440, dark              | 21             | 1741           |
| UBL, 1440, light, mouse held mid-pan | 9              | 6473           |

Both themes retain the 7- and 10-relationship counts in settled UBL. Mall's zoomed viewport shows 21 labels among 32 edges. The pan leaves nine edges in the viewport and gives each a visible label. The baseline gesture produces up to three labels under the mini-map, including three in the held frame; the candidate has zero overlaps at every intermediate probe and in the held frame.

The maximum sampled leader-to-path distance is 0.12335205078125 graph units. The probe samples the SVG every 0.25 graph units; the actual endpoints come directly from the painted path. No card, header, map or label collision and no clipped label occurs in the accepted states.

Pixel counts and geometry are in `out/round-f/review/{pixels,geometry}.json`. All nine changed candidate crops were personally reviewed at native resolution, in batches of three and six. Every crop has a longest side at most 1600 px. Wide crops include the mini-map region. Manual recapture was limited to the requested graph states; suite-generated screenshots remain in their own output folders.

## Remaining gate and next step

No remaining regression is observed in the requested collapsed-label matrix. The two browser suites remain red at the same assertions as HANDOFF-SOL-20261127e.md. Main's own Batch 2 gate lists inherited responsive and graph failures, but its graph failure is a timing bound. The 458.609375 px neighborhood-height failure still lacks a matching complete main run and is not classified as inherited here. Responsive's transform failure was reproduced on main in the preceding comparison evidence. No new main suite run was requested or performed in this round.

Retain this targeted matrix and continue T076 at the broader journey assertions. No assertion, threshold, route outside this fix, metric layout or visual design was relaxed.

## Cleanup and safety

Both capture scripts report cleanup complete, and browser contexts and disposable APIs close in their owning finally blocks. The wrapper records matching frontend start/stop PIDs 3959316 (baseline) and 3967970 (candidate). Both exact PIDs were checked absent after the suites. The wrapper reports CLEANUP_COMPLETE. Suite results are in `out/round-f/results.tsv`, logs in `out/round-f/{unit,graph,responsive,header-probe}.log`, and wrapper output in `~/scratch/sw-007/round-f-midgard.log`.

No owner's checkout or data, production service, origin branch, external service or yggdrasil was touched. All commits remain local on `007-ui-review-fixes`; the only synchronization is to the permitted scratch repository and checkout under `/srv/dev`.
