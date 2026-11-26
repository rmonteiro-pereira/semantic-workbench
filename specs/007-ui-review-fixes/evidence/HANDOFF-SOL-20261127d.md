# Regression gate handoff

Both requested visual regressions are fixed locally. All ten final states pass the geometry checks and have been visually reviewed against main and the previous candidate. The browser gate remains red: responsive has a failure reproduced on main, while graph stops on a later neighborhood-height assertion. These failures do not invalidate the ten-state visual proof.

## Revisions and causes

- Main baseline: `da54cf17`; previous candidate: `d7514f41`; final source: `c28793c0`.
- `6e1322b3`: the shared 1600px metric page gave the list only about 579px. Its 760px container breakpoint hid Type, Owner and Concept. The wide breakpoint now reserves an 800px list and the remaining width for detail. The common left edge and combined width remain intact. Rules below 1920px are unchanged. The existing responsive width check also checks all columns and detail width.
- `7e48f18b`: the full graph actually rendered SVG labels through GraphEdge/RoutedEdge, rather than the neighborhood label placer. Browser hit testing found area titles above the 7- and 10-relationship SVG labels. Other bundles occupied identical positions. Collapsed Network connections now reuse placeLabels and RelationshipLabel in a shared overlay, reserving entity cards and area headers. The actual React Flow canvas is measured separately from the toolbar.
- `c28793c0`: visible placement can also use neighboring horizontal lanes. This keeps all eleven labels inside the 1440px canvas. Existing routes, card positions, area names, other layouts and neighborhood default placement remain intact.

## Capture setup and review

All captures use the same isolated API helper and example load order: ubl, commerce, mapped-commerce, mall. UBL uses Network, suggested communities, areas collapsed, Labels on and Mini-map on. Metrics opens the first Mall metric, Total GLA. Device scale is 1; viewports are 1440×900, 1920×1080 and 2560×1440. Main and previous-candidate frontends are git archives. Final captures use the frozen final commit.

Native screenshots and measurements: `out/round-d/captures/{main,before,fixed}/`. Native pixel comparisons: `out/round-d/review/pixels.json`. Reviewed crops: `out/round-d/review/`; every crop has a longest side at most 1600px. Thirty final comparison images were reviewed in three batches of ten, after pixel comparison. Intermediate diagnostic images are superseded.

The earlier matrix was left unchanged. Reproduced previous-candidate metric lists at 2560px and graph regions at 1440px match it exactly in both themes. Graph regions at 2560px differ by 93 light and 175 dark pixels, confined to line rendering. Details: `out/round-d/earlier-pixels.json`.

## Metrics with an open detail

| Theme | Window | Main columns | Previous columns | Final columns | Final list/detail px | Common width/left edge | Visual result                         |
| ----- | ------ | ------------ | ---------------- | ------------- | -------------------- | ---------------------- | ------------------------------------- |
| light | 1920   | 3            | 3                | 6             | 800/794              | Pass                   | Six readable columns; detail readable |
| light | 2560   | 6            | 3                | 6             | 800/800              | Pass                   | Six readable columns; detail readable |
| dark  | 1920   | 3            | 3                | 6             | 800/794              | Pass                   | Six readable columns; detail readable |
| dark  | 2560   | 6            | 3                | 6             | 800/800              | Pass                   | Six readable columns; detail readable |

At 1920px the available content frame is 1594px; at 2560px it is capped at 1600px. Main at 2560px used 2234px, which is deliberately not restored because the shared-width decision must remain.

## UBL Network with areas collapsed

| Theme | Window | Main                       | Previous candidate          | Final             | Card/header or label collisions | Visual result                       |
| ----- | ------ | -------------------------- | --------------------------- | ----------------- | ------------------------------- | ----------------------------------- |
| light | 1440   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |
| light | 1920   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |
| light | 2560   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |
| dark  | 1440   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |
| dark  | 1920   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |
| dark  | 2560   | 11 DOM labels, overlapping | 11 DOM labels, 7/10 covered | 11 visible labels | 0                               | All counts visible; names preserved |

There are ten bundle-count labels and one single-relationship name. Final measurements find no clipped labels. The 7- and 10-relationship labels are visible in all six states. Positions can use leader lines to keep text clear of cards and other labels.

## Commands and results

| Command                                                         | Revision                                    | Exit | Result                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| `bun run check`                                                 | Final changes                               | 0    | TypeScript, formatter, lint, comments, theme and brand passed                                       |
| `bun test tests/label-placement.test.ts` through sw-midgard-run | Final                                       | 0    | 105 tests passed, zero failed, 1860 assertions                                                      |
| `bun out/round-d/review.ts`                                     | Final capture files                         | 0    | Native pixel comparison and review crops                                                            |
| `python3 out/round-d/geometry.py` plus ten-state assertions     | Final capture files                         | 0    | Six columns in four metric states; eleven labels and no collisions/clipping in six graph states     |
| `bun run test:responsive` through sw-midgard-run                | Main da54cf17                               | 1    | Canvas height 481px, expected more than 504px; same failure class as Batch 2                        |
| `bun run test:graph` through sw-midgard-run                     | Main da54cf17                               | 1    | Longest task 219ms against a 100ms limit; same failure class as Batch 2                             |
| `bun run test:responsive`                                       | Intermediate 7e48f18b                       | 1    | Later full-screen Graph transform assertion, responsive-ui-tests.ts:547; not the main first failure |
| `bun run test:responsive`                                       | Final c28793c0                              | 1    | Full-screen Graph transform is not preserved; focused main check also fails                         |
| `bun run test:graph`                                            | Final c28793c0                              | 1    | Neighborhood canvas 458.609375px, expected at least 480px; graph-review-checks.ts:90                |
| `RESPONSIVE_ONLY="full screen: Graph" bun run test:responsive`  | Main da54cf17                               | 1    | Same full-screen transform assertion fails, responsive-ui-tests.ts:551                              |
| Readable-code checker, docs-sync and git diff --check           | Changes                                     | 0    | Passed                                                                                              |
| Pre-push checker                                                | Local branch before scratch synchronization | 0    | No findings; no origin push                                                                         |

Heavy-run entry points: `sw-midgard-run -- bash out/round-d/capture.sh` for main; `sw-midgard-run -- bash out/round-d/resume-capture.sh` for previous candidate; `sw-midgard-run -- bash out/round-d/final-candidate.sh` for frozen final captures and suites; `sw-midgard-run -- bash out/round-d/main-focused.sh` for the focused baseline. The wrapper was used unchanged. Ports are 5471 in separate loopback-only namespaces; data roots are disposable directories under the dev scratch tree. Cleanup targets only owned PIDs.

Two early capture attempts exited 143 after the driver could not find Collapse areas at 1440px. The corrected driver opens Controls before that action and closes it before capture. A later intermediate synchronization missed the just-created metric commit; its three-column captures are rejected. Initial label fixes still clipped three, then one label at 1440px; those captures are also rejected. Only the final ten-state matrix is accepted.

## Open regressions and next step

The two requested visual regressions have no remaining failure in the specified matrix. The broader browser gate is not accepted. The full-screen transform mismatch is reproduced on main. The candidate graph failure is a later neighborhood-height assertion; main exits earlier on its task-time limit and its suite does not establish the same height failure. That comparison remains open, rather than being classified as inherited. No additional screen outside the requested matrix is claimed visually equivalent to main.

Next: compare the neighborhood-height assertion against main with the same harness and continue the broader gate independently of these two completed visual fixes. Evidence logs are outside git under out/round-d/. Keep T076 open for the broader journey gate; this round only covers the requested ten states. No origin push, main merge, owner checkout access or production change occurred.

Final capture and suite wrapper: `sw-midgard-run -- bash out/round-d/final-candidate.sh`, exit 0 (the suite driver records individual failures without suppressing them). Frozen source is recorded in `out/round-d/verified-commit.txt`. Final suite logs are `out/round-d/final-suites/fixed-{responsive,graph}.log`; baseline logs are in `out/round-d/suites/main-*.log` and `out/round-d/main-focused/responsive.log`. All owned round-d Vite servers exited after cleanup.
