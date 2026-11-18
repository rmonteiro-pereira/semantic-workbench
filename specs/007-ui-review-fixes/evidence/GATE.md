# Integration and regression gate

## Focused regressions and suite retries

### Lineage detail camera

- Lineage records a screen anchor before card representation changes or a column list opens. The worker supplies the new position and the view keeps the current zoom.
- The anchor constrains the card vertically. At 390 px, it can preserve a negative horizontal position after zoom or column expansion.
- Apply the same viewport bound horizontally to the anchored card and keep the existing layout, zoom and action history contracts.
- Replay Mall Properties and UBL Consignment with the real zoom, column expansion and filter controls, then inspect the two repeated captures.

- M4, Mall mapping Fit. `sw-midgard-run` ran the detached `verify-fixes` phase and returned 0. The `fitted-names` step passed twice at the same
  1440×900 light viewport after `11abdf8c`. The previous candidate's label overflow is preserved under
  `regression-before/{1,2}/local/light/1440/mapping-fit/` on Midgard, and the passing frames are under
  `candidate/{1,2}/local/light/1440/mapping-fit/`. The 1440×900 pair in `before/fixes/mall-mapping-fit-1440.png` and
  `after/fixes/mall-mapping-fit-1440.png` shows the 185 reachable cards filling more of the pane, with names wrapping within their borders. `bun test
  tests/lineage-view.test.ts` passed 11 tests and 35 assertions after removing the unused worker packing mode in `25635dac`. The standalone `bun
  scripts/ci-validate.ts --step browser --suite test:mapping-graph` returned 0. Its summary was `12 mapping graph checks passed`, including complete
  names at least 9 px at 1280×720 and 1440×900 and no browser errors (134.4 s).
- M15, UBL Neighborhood Walk. Both focused 1600×1000 light repetitions reached all five targets after lowering the automatic fit floor. The next
  standalone graph run found the default center description at 4.09 px against the 9 px threshold, so the center now compensates for zoom. Both
  focused repetitions with compensation reached every target again. The standalone graph rerun passed the UBL Order centering check and then failed
  with a 28 px shared relationship path between `r-0-13` and `r-22-208`. Edge geometry remains open.
- `bun scripts/ci-validate.ts --step browser --suite test:back-history` reached and re-centered on both Mall neighbors after the viewport change. The
  updated test can reach the folded Labels control but its state snapshot missed the relationship labels after Controls closes. The next retry records
  the rendered labels.
- `RESPONSIVE_ONLY='examples: 1280×720 mall Graph toolbars' bun scripts/ci-validate.ts --step browser --suite test:responsive` timed out at the Mall
  ontology loading indicator before the Mall ODCS check. The detached `mall-example-geometry` phase then opened only Mall ODCS with the same example
  fixture and 1280×720 viewport. Main and candidate both logged `MALL_EXAMPLE_CANVAS {"x":313,"y":248,"width":954,"height":389}` and failed `>= 421`.
  The repeated frozen-import comparison also measures 389 px on release, main and candidate. Lane B's first-view change does not account for the
  height.
- `bun scripts/ci-validate.ts --step browser --suite test:auth` returned 0 after using the Settings entry point and checking the read-only Source
  Control region. The session-change, grant and refusal checks passed, including the local workspace smoke check (`8811a5a0`).
- `bun scripts/ci-validate.ts --step browser --suite test:item-edit` returned 0 with `11 item-edit checks passed` after opening catalog details by
  concept name (`e1d4acef`).
- `bun scripts/ci-validate.ts --step browser --suite test:monorepo` returned 0 with `8 monorepo checks passed` after following the current clone and
  deletion labels (`c0bbf4b8`).
- `bun scripts/ci-validate.ts --step browser --suite test:theme` passed the offline fonts, token, switching and contrast checks. The retried tour
  reached the light ontology graph and reported that “Allowance charge” and “Document reference” area headings overlap cards. The `test:responsive`
  retry cleared the previous phone startup failure and repeated the same two overlaps in its tour. The matched release and main captures had no
  heading overlap. The candidate before the fix reproduced both overlaps at 390×844 and 1280×720.
- `bun scripts/ci-validate.ts --step browser --suite test:two-editors` returned 0 (73.4 s). Edits, branches, commit identities, publication visible to
  the Viewer, pulls and sparse-project isolation all passed after the test followed the current Sync label.
- Main `5597ae52` also returned 1 for `bun scripts/ci-validate.ts --step browser --suite test:admin`. Both candidate and main time out waiting for the
  `Dry-run result` region. Main `test:responsive` reproduces the 481 px Full Graph canvas against `> 503.99999999999994`. The candidate clears that
  check before a different phone-stage timeout. Lane B's ODCS first view is a separate check.
- Main `test:editor` hit the same 1.9 MB sustained-typing gate as the candidate. Main measured 55.36 ms/key and the candidate measured 55.31 ms/key
  against the 30 ms threshold. Main passed the preceding six editor checks.
- Main `test:sidebar` passed 4 layout checks. Main `test:telemetry` passed 8 checks (79.2 s).
- Candidate `test:sidebar` returned 0 with `4 sidebar layout checks passed` (196.0 s). Candidate `test:telemetry` again passed its first seven checks,
  then timed out opening Catalog with an empty fixture. With an isolated UBL file selected, `test:telemetry` returned 0 with
  `8 telemetry checks passed` (30.4 s), including zero reports when disabled (`252764a9`).
- `sw-midgard-run --pull out/gate-007/comparison/preliminary-proofs -- bash scripts/ui-review/gate-007/matrix-launch.sh` returned 0 after starting the
  detached comparison. The focused catalog baseline `bun scripts/ci-validate.ts --step browser --suite test:clipping` passed 6 checks with no browser
  errors (29.5 s). The same command with `RESPONSIVE_MUTATION=catalog-description-clip` printed `INJECTED_CATALOG_DESCRIPTION_CLIP` and exited 1
  specifically at “a catalog card description is clipped.” The obsolete tooltip mutant is replaced in `597d6d7e`. The full mutation rerun remains
  pending.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/fix-launch.sh` built the candidate and repeated the affected states.
  For m9, both repetitions of the 390×844 light and 1280×720 light and dark views returned `GRAPH_HEADING_GEOMETRY []` after `c3c6f3f0`.
  The viewed pair `before/fixes/ubl-area-headings-1280.png` and `after/fixes/ubl-area-headings-1280.png` shows separate title plates and cards.
  The words still wrap and the plate continues to cover crossing strokes. `bun scripts/ci-validate.ts --step browser --suite test:theme`
  returned 0 with `10 theme checks passed` (211.7 s), including the light and dark tours and browser-error check.
- After the M15 correction, `bun scripts/ci-validate.ts --step browser --suite test:graph` passed the five Walk steps, Back and Forward,
  link labels, dragged positions, 1,000-entity picker, incremental expansion and the Lease pierce. It reached the large Both-direction pierce
  budget, where the longest main-thread task was 287 ms against the 100 ms limit. Running the same command on main reached the same test
  and failed the same assertion at 240 ms. Both logs preserve the passing steps before the failure.
- Main `test:autosave` passed the commit UI check, then failed on the same `git log -1 --format=%s main` unknown-revision error as the candidate. Main
  `test:git-setup` passed identity setup and the commit action, then failed on the same `git log -1 --format=%an` error that the default branch has no
  commits. These postconditions still assume direct local commits on the default branch.
- Main `test:lineage` stopped earlier, when the resize separator intercepted the Walk click. It did not reach the first-view performance assertion.
  The candidate reproduced the UBL timing failure at 3,811 ms against 2,000 ms. The same timed entry point is included in the matched capture.
- The initial gallery contains 126 recorded comparison steps. At this checkpoint it shows 40 intended fixes, 6 merged feature differences, 52 neutral
  changes, 17 regression frames, 1 unchanged step and 10 awaiting a matched or settled capture. The regression-frame count includes downstream Walk
  steps blocked by one failed click. It shows the initial candidate, before the graph corrections. Graph captures that caught loading or mismatched
  state are scheduled for repetition. The initial page was rendered on Midgard at 1440×900 and 390×844. Both previews showed the version labels and
  controls, and the phone confined horizontal scrolling to the comparison strip.
- The UBL Order replay is saved under `before/fixes/ubl-neighborhood-walk-1600.png` and `after/fixes/ubl-neighborhood-walk-1600.png` in the comparison
  folder. In the first frame the trail cuts across the first Walk control. The new frame shows the complete AllowanceCharge card and its Walk control,
  and the centered Order description wraps in full. Secondary descriptions are smaller than they were in the clipped first view.
  The separate pair `before/fixes/ubl-neighborhood-walk-reached-1600.png` and `after/fixes/ubl-neighborhood-walk-reached-1600.png` shows the
  shared path splitting after `3f08c538`. Both repetitions reached all five targets and each step reported `WALK_EDGE_GEOMETRY ... []`.

### Latest serial Midgard run

- `sw-midgard-run -- bash scripts/ui-review/gate-007/complete-launch.sh` started the serial comparison. Candidate preparation built the app, reproduced the
  39 fixture hashes, and completed both frozen imports before running the browser phases.
- The repeated `bun scripts/ci-validate.ts --step browser --suite test:back-history` returned 1 after all 25 forward actions and 14 successful undo
  steps. Its first mismatch was `Back over "select an entity in the graph"`. The fingerprint reads only mounted Flow nodes. Selection changes the
  camera, and the candidate virtualizes graph nodes outside the viewport. The next retry fits both snapshots before comparing that state.
- The first release phone Import replay reached the imported workspace and timed out opening the drawer for the unbound fixture rename. The import
  result and rename dialog are recorded separately. The phone import stage needs a replay that waits for the drawer after import navigation.
- The supplementary `timing` phase recorded UBL lineage at 1,953 and 2,018 ms on release, 2,036 ms on main, and 2,151 and 2,221 ms on the candidate.
  Main's second repetition did not finish the prerequisite Mall file switch. The detached Pierce probe measured 82 and 55 ms on main. Both release
  and candidate repetitions failed the probe's additional visible frontier marker precondition, so this probe cannot establish a relative Pierce
  budget. The identical standalone suite assertion above supplies the inherited failure evidence.

- The candidate responsive retry passed the edit and screen tours at all four review widths. It returned 1 in the phone ODCS group with
  `odcs-contract-search: contract id is cut off`. The canonical main suite stops earlier at the 481 px canvas. On pinned main,
  `RESPONSIVE_ONLY='ODCS screens: 390×844' bun scripts/ci-validate.ts --step browser --suite test:responsive` returned 1 at the same clipping
  assertion. The contrast with main establishes that the phone ID clipping is inherited.

- `sw-midgard-run -- bash scripts/ui-review/gate-007/gate-launch.sh` ran both focused ODCS checks serially. Both returned 1 with
  `odcs-contract-search: contract id is cut off`. Candidate preparation then returned 0 for the build, fixture inventory and both imports.
- The mutation retry returned 1 at `Baseline failed (fmt:check)` after detecting four SCM presentation mutants. The formatter picked up 17 temporary
  fixture files while the frozen imports were staged under the capture script directory. The next attempt keeps the byte-exact fixture bundle in the
  ignored output directory during mutation and formatting. The final unit/check/build phase uses the same isolation.

### Final suite disposition

`bun scripts/ci-validate.ts --step mutation` returned 0. `771/771 targeted mutants killed; all unmodified module baselines passed.` The rebuilt catalog
mutant triggered the actual clipping assertion, and the examples module baseline passed. The browser gate covered all 36 registered suites. Twenty-nine
passed after focused harness fixes. The seven remaining suite failures have a matching main failure at the failing behavior.

| Suite | Candidate | Pinned main |
| --- | --- | --- |
| `test:admin` | Times out waiting for Dry-run result. | Same timeout on the canonical suite. |
| `test:autosave` | The UI commits, then the fixture cannot resolve `main`. | Same unknown-revision error after the UI commit. |
| `test:git-setup` | The default branch has no commits after a UI working-copy commit. | Same Git error after the UI commit. |
| `test:editor` | 55.31 ms/key for the 1.9 MB source against a 30 ms limit. | 55.36 ms/key at the same assertion. |
| `test:graph` | 287 ms longest task on Both-direction Full pierce against a 100 ms limit. | 240 ms at the same assertion. |
| `test:lineage` | The UBL canonical suite exceeds 2 s. The matched switch with frozen imports also exceeds 2 s. | The canonical suite stops earlier at a Walk click; the matched switch with the same timed lab steps exceeds 2 s. |
| `test:responsive` | Passes the compact Full Graph threshold (511 px). The phone tour fails the ODCS contract-ID assertion. | Fails the earlier Full Graph threshold (481 px). The focused phone ODCS run fails the same ID assertion. |

The Mall ODCS canvas is separate from those responsive checks. It remains 389 px on both main and candidate against 421 px in the equivalent Example
view. The candidate's 30 px Full Graph gain comes from the Full Graph toolbar, not from lane B's lineage changes.

### Verification after the graph corrections

| Command | Summary |
| --- | --- |
| `bun test` | Exit 0. 2,448 pass, 0 fail, 346,969 assertions across 350 files (1,859.88 s). |
| `bun --bun run check` | Exit 0. TypeScript passed, 1,180 files formatted, 2,661 lint warnings and 0 errors. Comments, theme and brand passed. |
| `bun --bun run build` | Exit 0. Vite built in 3.18 s with the chunk-size advisory. |

The application revision includes `481d012b`. The retry of the browser history suite changes its test fingerprint only.
`sw-midgard-run -- bash scripts/ui-review/gate-007/retry-launch.sh` started the browser retry followed by mutation and the checkpointed capture.

### Full Graph reopening through browser Back

- The history suite can compare area contents at the same Fit zoom. The fitted retry restored selection and all explicit area actions.
- Undoing the first Neighborhood tab then reopened the unchanged Mall model with 196 separate cards instead of its original 12 counted areas. The
  explicit area choice was still unset, so the automatic Network legibility decision ran again.
- The opening check should still use the rendered name sizes. At Fit, a virtualized name cannot exceed its card's sizing cap multiplied by the fitted
  zoom. Use that bound even when React Flow has yet to mount a card's name element.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/history-launch.sh` ran `bun test tests/overview-capacity.test.ts` (12 pass, 0 fail, 69 assertions).
  The instrumented `bun scripts/ci-validate.ts --step browser --suite test:back-history` recorded the same 1,114×755 graph pane for both 1440×900
  captures. Before the fix, returning to the Graph gave an infinite measured name size and rendered 195 individual cards. With `481d012b`, both visits
  measured 2.21 px at Fit and rendered 12 counted areas. The Back assertion passed at that step and the comparison images were opened.
- After `d6bafdba`, the canonical `bun scripts/ci-validate.ts --step browser --suite test:back-history` returned 0. All 25 undo and 25 redo comparisons
  passed. Neighborhood and Lineage arrows agree with browser history, Back does not save the grouping a second time, Back after reload leaves the
  app, and the suite emitted `PASS back-history`. The test reads Full Graph's displayed counted-area status without treating its camera as history.

### Phone graph capture controls

- Mapping Graph already exposes its zoom actions in the Viewport group. The capture driver opens the floating Controls panel before every named
  button, so the driver's own Pierce overlay covers Zoom when the candidate folds secondary controls.
- Use the visible action first. Fold Controls away before pressing outside it and open it only to reach an action inside it. Use the product's
  accessible names for the full-screen action and the one-to-three foreign-key range documented in all compared revisions.
- Keep the first-view captures independent and verify the same phone Mapping Graph Zoom steps on all three builds before classifying the earlier
  failed clicks.
- Lineage Fit and the first view can intentionally use name-only cards. The detailed column actions must still be reachable through Zoom in.
- Keep the untouched first-view frame, then capture column actions after zooming via the visible toolbar. Record whether the required control
  appears and preserve the original failure if repeated zoom cannot reach it.

### First 390 px light comparison

- The first local light slice scored 472 steps after two runs per version. The page and manifest combine them with the earlier 126-step pilot.
  `python3 .data/gate/publish-review-007.py` published 598 rows: 83 intended fixes, 14 merged features, 111 neutral, 10 unchanged, 17 historical
  regression frames from the earlier candidate and 363 awaiting classification. `du -sh` measured 52 MB. The leak scan returned zero hits
  for the page and manifest.
- The phone Catalog tour shows “Entity type” and wrapped full descriptions, with Edit available for touch. The Sidebar tour shows the file-type badges
  and scroll fade. The inherited abbreviated project title is visible on all three. These captures support keeping the explicit action and full wording
  in T057.
- The phone ODCS search screenshot shows the same visually shortened ID beside Copy on release, main and candidate. The phone Source Control diff
  opens in its own pane with Back to changes. Main's Preview, Publish and working-copy destination are present on the candidate.
- The initially matched commit step timed out twice in every version because the capture asked for “Commit” instead of “Commit to” the active branch.
  The import frames for Commerce and Mall also show the preceding project in some versions. Their screenshots are provisional until the driver
  waits for the newly imported project and invokes the actual commit control. The focused Import preparation still verified identical frozen bytes.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/replay-launch.sh` exited 0 and resumed the serial matrix by matched action. Before the launch,
  the previous matrix process had exited, ports 5401 and 5402 had no listeners, and `free -g` reported 106 GB available. `git diff --check` and
  the readable-code check for the graph capture driver both exited 0.

### Matched phone Import, Source Control and Clone

- `sw-midgard-run -- bash scripts/ui-review/gate-007/finish-launch.sh` returned 0 and started the next serial run. The Import, Source Control, Clone
  and lineage-columns action groups recorded `MATRIX_ACTION_COMPLETE`. Every Import and Clone step worked in both repetitions of all three builds.
- Nine file selections verified the original byte hashes and the new project's matching import notification before capture. The clean workspace
  exposes Import files directly; the picker retains the existing disabled destination explanation until a project exists. The focused local Clone run
  opens the same Sales and Finance files in all three builds, and the candidate confirmation reads “Cloned finance.”.
- The revised Source Control action selects the visible Commit-to-branch button. The same Commerce edit was staged and committed twice on each version.
  Baseline committed to main. Main and candidate committed to work/local, then both recorded “Published to main” and zero commits ahead or behind
  the published snapshot. There is no release frame for Publish. The candidate also shows the disabled commit reason and replaces the phone split
  diff with one readable column. The “All files” history link still wraps in all three versions at 390 px.
- The latest standalone `test:graph` passed the new Mall 390 px assertion, the UBL five-step Walk and its Back and Forward steps. It returned 1
  at the inherited Both-direction Full pierce assertion with 202 ms against 100 ms. The earlier pinned main run measured 240 ms at that assertion.

### Neighborhood phone center picker

- The search field's native input size follows the current center name. The trail remains the navigation record.
- The full-screen button consumes enough width to hide the end of “Consignment aggregate roles” in the phone import frame.
- Keep the existing controls and let their row wrap around the natural search field size where the name needs the room.
- Replay the frozen UBL Import at 390×844 and verify the full center name and the unchanged search and full-screen actions.

### Phone regression replays

- `sw-midgard-run -- bash scripts/ui-review/gate-007/lineage-anchor-launch.sh` returned 0 and launched serial verification. Candidate build and
  both fresh frozen-data imports returned 0. The 390 px UBL Neighborhood picker replay measured 241 px of available input against 225.86 px for
  the full placeholder in both repetitions. In the viewed pair `before/fixes/ubl-center-picker-390.png` and `after/fixes/ubl-center-picker-390.png`
  the clipped name becomes “Center: Consignment aggregate roles”. Controls and Full screen move to the second row. Score 20.807206%. Fixed by
  `9ec1cd45` for m13.
- At 390×844, the UBL Consignment filter returns 8 of 103 columns in both repetitions. The earlier candidate keeps a negative left anchor and
  cuts off the card heading and all eight row names. `0c756231` constrains the anchor in both axes. The inspected pair
  `before/fixes/ubl-lineage-columns-390.png` and `after/fixes/ubl-lineage-columns-390.png` shows the whole header, search and eight names.
  Score 25.741888%. The Mall Properties replay still loses the inspected card when repeated toolbar zoom targets the canvas midpoint.
  A pointer-centered zoom replay is needed to establish whether the Mall column action is reachable.
- The candidate `test:lineage` rerun passed the first nine Commerce checks and the Mall edge check. It failed at the same inherited UBL first-view
  budget, this time at 3,528 ms versus 2,000 ms. No browser errors appeared in the log.
- The comparison checkpoint contains 610 rows, with 155 intended fixes, 24 merged features, 166 neutral, 10 unchanged, 2 marked fixed regression,
  20 other regression frames and 233 awaiting review. Most regression frames preserve the earlier candidate. Correction pairs give the corresponding
  matched proof separately while affected matrix actions are replayed.

### Phone files and dialog comparison checkpoint

- The three-way strips for the remaining phone UBL file tabs show full Catalog descriptions, result counts, direct Import and Load example actions
  in empty Mappings, and the same nine metrics. Source and mapping frames captured during validation or layer resolution still need settled replays.
- The earlier phone capture of Commerce OWL shows one of five counted areas. UBL semantic cuts off outer areas on both sides. Neither frame substitutes
  for a replay after the shared phone-fit fix. The phone UBL semantic mapping first view replaces the readable Party card with a dense set of names.
  The desktop Commerce ODCS frame also loses its initial column detail. Both need matching zoom and first-view checks.
- The 1440 px server Admin strip shows the new Allowed banner and a matching-grant sentence. The selected dry-run grant input fails validation on all
  three builds, and the Access check fixture returns Allowed in all three. These frames cannot certify confirmation or the denied state.
- `python3 .data/gate/contact-sheet-007.py` and the focused contact-sheet renderer produced the strips reviewed here. Publishing the checkpoint produced
  610 rows: 187 intended fixes, 27 merged-feature differences, 197 neutral, 10 unchanged, 4 rows marked fixed by focused replays, 23 regression rows
  including earlier candidates, and 162 awaiting review. These are comparison rows. The preceding focused replays list the distinct fixes.
- `sw-midgard-run --pull out/gate-007/comparison/gallery-previews -- bash scripts/ui-review/gate-007/preview-launch.sh` returned 0 and rendered the
  gallery at 1440×900 and 390×844. Both previews were visually inspected. The phone view keeps the strip scroll inside each row and the filters visible
  above it. The same command launched the next detached serial replay. Its initial memory checks showed 104 GB available.
- Candidate `bun scripts/ci-validate.ts --step browser --suite test:back-history` returned 0 after the picker and lineage corrections.
  The run passed all 25 Back and Forward actions and the reload check in 208 seconds.

### Matched regression replays

- The 390 px Mall Properties and UBL Consignment lineage replays both worked twice in each version after the driver switched to pointer-centered
  zoom. The inspected Mall strip shows a complete Properties heading and the expanded list on the candidate. The UBL strip shows the whole search
  field and eight matched column names. Main-to-candidate scores are 22.889172% and 35.099040%.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/framing-launch.sh` returned 0. Both 1440 px candidate repetitions kept all 13 Neighborhood
  cards whole on each of Commerce scale, UBL ontology, OWL, semantic and SHACL. The opened strips confirm that the previous edge clipping is gone.
- Both repetitions in each version reached AllowanceCharge, Consignment, Contract, Delivery and Address through UBL Walk at 1600×1000.
  All eleven opened strips have six successful captures. The candidate keeps the target inside the pane, and the details title agrees with the center.
- The Mall mapping Fit replay preserves the 185 complete names seen in the correction pair. `bun scripts/ci-validate.ts --step browser --suite
  test:mapping-graph` later returned 0 with 12 passing checks in 133.6 seconds after the compact name correction.
- The phone graph batch returned 0 on all six browser launches, but individual state results expose driver failures. On the candidate a Selected path
  dialog intercepts Exit full screen after selection. On release and main a preceding screen blocks Mall contract navigation. The driver now closes
  Selected path after recording it and opens each graph family independently. The next run will verify these paths.
- The 621-row gallery checkpoint has 189 intended fixes, 27 merged-feature differences, 197 neutral, 23 fixed regression rows, 10 unchanged,
  9 regression rows including earlier captures and 166 awaiting review.

### Long names in compact mapping first view

- The shared lineage layout estimates wrapped name height to choose compact card packing. Automatic first framing currently checks only a single line.
- The frozen UBL semantic mapping reach has 84 assets, and on a phone the entire reach opens with long labels overlapping adjacent cards.
- Reuse the wrapped-name fit calculation for the automatic first view and its fallback. Keep cards reachable through explicit Fit and pan.
- Recheck the same imported mapping on the phone, and verify that the small Commerce reach still opens on all its cards.

- `sw-midgard-run -- bash scripts/ui-review/gate-007/name-framing-launch.sh` returned 0 and started serial verification. The focused unit command
  `bun test tests/lineage-view.test.ts` passed 12 tests and 38 assertions. The build passed in 3.29 seconds with its existing chunk-size advisory.
- Both 390 px replays have a whole Party card and no overlapping names on entry. Commerce ODCS still frames all six reachable cards.
  The opened pair `before/fixes/ubl-mapping-first-390.png` and `after/fixes/ubl-mapping-first-390.png` changed 26.908191% of pixels. Fixed by
  `f791ac00` for M4. The full phone viewport remains available for explicit Fit or pan.

### Counted Network title clearance

- The graph worker's Network area frames preserve space above cards. Counted areas can use larger, compensated titles while ordinary Network uses 20 px.
- At 390×844 four UBL semantic area heading plates overlap a counted card, reproducibly in both captures after the Mall counted-fit correction.
- Reserve two compensated title lines for counted-area interiors. Leave normal Network widths and entity header spacing in place.
- Replay UBL semantic and Mall counted areas in both themes and verify the title and card bounds, including that Fit still keeps all tiles inside.
- The first candidate with the 160 px Layered reserve kept all 11 Mall cards in the pane, but the smallest name was 8.97 px. Use 128 px for two heading
  lines without allocating a link-summary row on counted Network areas.

- The 128 px header by itself still produced a four-column Mall layout with 8.97 px counts. Reducing the gap between counted tiles from 70 to 60 graph
  units kept clearance and brought the smallest fitted count above 9 px.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/counted-headings-launch.sh` returned 0. Both light and dark replays passed twice. The UBL ten
  title plates clear their cards and Mall keeps all 11 count cards inside the pane with the smallest count at 9.21054 px. The unit group
  `bun test tests/overview-capacity.test.ts tests/graph-tiles.test.ts tests/full-layout.test.ts` reported 25 pass, 0 fail, 3272 assertions.
- The opened pair `before/fixes/ubl-counted-headings-390.png` and `after/fixes/ubl-counted-headings-390.png` has a 30.750091% pixel difference.
  The four wrapped titles now have clearance above the card border. Fixed by `eaf4d1ea` for m9.

### Matched phone empty mapping and desktop framing

- The repeatable file opener follows the named project before choosing its tab. The earlier phone run opened the drawer and lost it after switching
  to Model explorer, which prevented the empty-mapping action from reaching the intended file. The rescue uses the visible workspace controls.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/lineage-phone-launch.sh` recorded `MATRIX_ACTION_COMPLETE` for local light 390 empty mapping and
  local light 1440 file framing. All six runs per step completed with the expected file and tab. The following targeted operator changes were made
  with 105 GB available. The prior runner exited 143 after a checkpoint, and ports 5401 and 5402 were idle before its replacement.
- The three `local/light/390/empty-mapping/zero-mapping-graph/after-*` strips show the candidate's “No linked assets for Identifier” explanation
  (m5). At 5 s and 15 s all three builds show the isolated Identifier. The candidate still shows a card beside the explanation. The proof is
  partial for the requirement to use just the explanatory line.
- The six `local/light/1440/file-framing` strips keep the same named UBL or Commerce asset in view. Candidate Commerce ODCS shows six whole
  assets including linked metrics, while release and main show two detailed tables. UBL Neighborhood uses the Other files disclosure where
  release and main expose separate links.
- All 47 contact sheets of the first phone graph action batch were opened. The capture showed selected cards outside the visible portion,
  unrelated loading states in matched positions, and different cameras after changing the same zoom. Those frames remain marked for replay
  where the captured state does not establish a match.

### Compact mapping relationship labels

- `sw-midgard-run -- bash scripts/ui-review/gate-007/compact-mapping-launch.sh` ran `bun test tests/lineage-view.test.ts tests/edge-labels.test.ts`.
  Exit 0, 20 pass, 0 fail, 61 assertions. Vite built in 3.10 s with the usual chunk-size advisory. Available memory was 105–106 GB.
- Both repetitions of UBL Mapping Graph Fit at 390×844 showed 43 raw labels before the fix, with one visible overlap beneath Party.
  With `b4e87d7a`, both light and both dark runs recorded zero overlapping labels and retained 43 relationship labels in the edge hover markup.
  Party, Address and the routed lines kept their positions. This step measures the text presented before hover and its retained markup.
- Opened both light and both dark pairs. Light scored 0.257018% on both repeats. Dark scored 0.439604% and 0.434135%.
  The gallery links `before/fixes/ubl-mapping-labels-390-{light,dark}.png` and their after frames (m8).
  The UBL mapping filename is visibly shortened by the workspace title in release, main and candidate at this width.
- `bun scripts/ci-validate.ts --step browser --suite test:mapping-graph` exited 0 after the fix. All 12 checks passed in 132.9 s,
  including the detailed Order.customer → Customer relationship label, the 9 px first-view threshold and no browser errors.

### Phone Lineage Fit and walked captions

- Compact card heights and related link ports use the layout's existing shared geometry. Names
  compensate for zoom and wrap inside the text area.
- Settled three-version phone strips exposed overlapping names on Fit and minimum zoom. They
  also exposed a walked caption extending past the full-screen toolbar after the back and forward buttons.
- Keep existing complete fits when they preserve whole names. When the reach is too dense, center the
  current card, keep the other cards available by panning and bound compact zoom from the existing name estimate.
- Keep the same trail and arrow controls and wrap the caption in the remaining width.
  Replay the Mall contract and UBL semantic mapping in both themes with explicit Fit and the actual zoom buttons.
- The 390 px light graph batch ran twice per version to completion. Scoring saved 141 rows, with one
  exact unchanged result, 110 first-repeat actions reached on all three, 28 shared failures and three differing
  action outcomes. One candidate Fit was still disabled after a Walk in its first repetition; the retry reached Fit.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/matched-states-launch.sh` preserved both completed release
  workspace-state repetitions. The next restart interrupted its pinned-main repetition while introducing the more
  focused phone diagnostics. The serial runner returned 143, ports 5401 and 5402 had no listeners and 103 GB was available.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/lineage-phone-launch.sh` started the matched phone measurements.
  In the first pre-correction light run the UBL mapping rendered 84 cards with name overflow at Fit,
  and the three-hop Mall contract rendered 127 cards with name overflow at Fit. Ten Zoom out actions
  reproduced overlapping text on both. The full-screen Mall caption text overhung its trail by 55.94 px.
- After `645265c9`, the walked Mall caption fits on two lines with 13.80 px spare at the right edge in
  both 390×844 themes and repetitions. The opened light pair `before/fixes/mall-walked-caption-390.png` and
  `after/fixes/mall-walked-caption-390.png` changed 10.093875% of pixels. The same table name and arrows remain visible.
  This focused replay uses one hop; the source matrix frame uses three.
- After `c7a52f9e`, both themes and repetitions reported zero name overflows. UBL mounts 3 cards around Fit
  and 21 at minimum zoom. The three-hop Mall contract mounts 3 at Fit and 27 at minimum zoom. Other cards
  remain available by panning. The opened light pairs have the following scores, calculated from decoded RGBA pixels.
  At Fit, Party and Properties keep their names and CENTER markers. At minimum zoom the visible compact names
  wrap inside distinct cards. The labeled mapping connections still need a closer comparison for m8.
  - `{before,after}/fixes/mall-explicit-fit-390.png` — 55.173168%.
  - `{before,after}/fixes/mall-minimum-zoom-390.png` — 25.461782%.
  - `{before,after}/fixes/ubl-mapping-explicit-fit-390.png` — 28.567870%.
  - `{before,after}/fixes/ubl-mapping-minimum-zoom-390.png` — 12.547697%.
- `bun test tests/lineage-view.test.ts` passed 12 tests, 0 failures and 40 assertions. `bun --bun run build`
  completed in 3.09 seconds with the existing chunk-size advisory.

### Counted Mall graph on a phone

- The Mall semantic Graph opens 11 counted areas after the full entity layout falls below the readable-name threshold.
- The first fit should frame the actual area bounds. The current readable-zoom floor can exceed that fit and push whole cards past both edges.
- Honor the fitted bounds in that case. Keep the counted representation, fitted text sizing, explicit expansion and selection zoom conventions.
- Verify the imported Mall semantic Graph at 390×844 through the normal Graph tab and check the actual card and canvas boxes.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/counted-phone-launch.sh` reproduced the issue twice in light and dark, with 4 of 11 cards fully
  visible. The first fit change framed all 11 in light but shrank the smallest count to 6.51 px. Its dark run timed out waiting 5 seconds for
  the layout to finish. The final check allows up to 30 seconds for the initial layout and still requires every counted card to fit.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/counted-phone-launch.sh after` reported 11 of 11 inside the canvas and a minimum rendered count
  of 12.21 px in both repetitions and both themes. `bun test tests/overview-capacity.test.ts tests/graph-tiles.test.ts tests/full-layout.test.ts`
  returned 0 with 25 passes, 0 failures and 3251 assertions. The built application passed in 2.94 s with the existing chunk-size advisory.
- M2 regression fixed in `aba04e4f`. Both opened before/after pairs at 390×844 show all 11 tiles inside the pane. Their full names and counts
  remain visible. The exact changed-pixel scores are 42.627294% for `before/fixes/mall-counted-390-light.png` versus the corresponding `after/fixes`
  image, and 42.696865% for `mall-counted-390-dark.png`. RGBA scoring used `ffmpeg -pix_fmt rgba -f rawvideo` and compared the two 390×844 buffers.

### Wide content and metric layout

- `sw-midgard-run -- bash scripts/ui-review/gate-007/focused-launch.sh` initially failed with “Permission denied” on the detached script. Invoking
  the script through Bash returned 0. The two wide groups reported `MATRIX_ACTION_COMPLETE local/light/2560/content-width` and
  `MATRIX_ACTION_COMPLETE local/dark/2560/content-width`. Both reps ran in release, main and candidate.
- In the light captures the measured boxes agreed across the three versions. Their left edges were 313 px for the Overview header, 650 px for
  the first Catalog card, 630 px for the Metrics list and Mappings wrapper, and 1121.03 px for the open Metric detail. The boxes represent the
  visible sections and include different inner padding, so these figures are not the same measurement as the original lane comparison.
- In both themes the three wide strips show Metric detail next to the list. Moving it to the Catalog or Overview edge would also move the list
  or replace the split view. T064 keeps the existing split and the metric list cap, and leaves the common-left-edge requirement as an explicit
  design decision. The replay waits for “Where the data comes from.” Both themes and all three versions show the settled explanation in both repetitions.

### Matched UBL lineage timing

The repeated 1440×900 frozen-import switch from Mall ODCS to UBL ODCS measured 2,090 and 2,264 ms on main. The candidate measured 2,092 and 2,119 ms.
Both exceed the 2,000 ms suite threshold in the matched built-app scenario. The candidate is within the run-to-run range on the same inputs, so no
speculative worker change was retained. The standalone main suite still stops earlier at the Walk click.

### Opened correction pairs

These pairs compare the candidate before and after each correction. The scores are percentages of changed RGBA pixels at the original dimensions.

| Image in `before/fixes/` and `after/fixes/` | Finding | Changed pixels | Observation |
| --- | --- | ---: | --- |
| `mall-mapping-fit-1440.png` | M4 | 25.618750% | The layout uses the available width. Complete names wrap inside all fitted cards. |
| `ubl-neighborhood-walk-1600.png` | M15 | 13.231375% | The first target and its Walk control are inside the canvas. |
| `ubl-neighborhood-walk-reached-1600.png` | M15 | 11.775875% | The two relationship paths enter the reached card separately. |
| `ubl-area-headings-1280.png` | m9 | 1.119575% | The two wrapped title plates have visible clearance above their cards. |
| `mall-graph-back-1440.png` | M2, M13 | 40.086034% | Back restores 12 readable counted areas in place of 195 tiny individual cards. |

### Full Graph area headings

- The Network layout reserves a fixed header above each area's entity cards. The title background covers relationship strokes.
- The background's block padding consumes space reserved for a second title line. Removing that padding preserves the label, horizontal inset and
  background.
- Recheck the theme and responsive tours and capture the same area headings at the same viewport in both themes.

### Neighborhood walks

- The first view must keep the center description readable. Walk routes use the measured card dimensions and the former center remains visible as
  context.
- Both matched release and main runs have no shared path after walking to AllowanceCharge. The compensated candidate repeats a 28 px overlap there.
- Keep the description compensation on the first center. Subsequent centers keep the route geometry of the ordinary cards while the details pane
  carries their full description.
- Verify the graph's route and label assertions and repeat the matched five-step Walk.

## Gate after rebase

`git fetch origin` resolved `origin/main` to `5597ae52c55cb76a864aa242873dbbe7083a000e`. `git rebase origin/main` replayed the prior integration branch `a8cf837e` through `6e301fd4`. The release baseline `v0.6.1` resolves to commit `3b1c2c10bc6ae96c6c603301764bde4cfdc4dcd4`. All results in the historical sections below precede this rebase.

The conflict resolutions preserve operation boundary mutation coverage and the address architecture map, while adding the lane mutation registrations and font map. FullGraph keeps canonical entity addresses and delegates edge styling, fitting and opening to the lane modules. Graph and lineage suites retain their screenshot and address handling alongside layout checks. Mapping graph assertions use canonical selectors while opening and fitting the detailed card rows. Source Control retains publication styles alongside phone diff rules. Footer and theme tests keep both existing cases. The changelog retains publication, addresses, operation boundary and the UI entries. Git dropped the portable registry temp path patch because its contents were already upstream.

- T002 is complete. The capture index introduced in `5f77711f` and refined in `ceaeed5d` and `6e301fd4` covers all 109 distinct PNG paths named in the spec and tasks.
- T057 is partially accepted. `81bee1e1` implements the catalog alignment, inline badges, sidebar scroll fade and humanized type labels. `77cd6447` and `7733dfb0` preserve complete descriptions and consistent row height. The 1440 px UBL and Commerce comparisons show aligned card titles, complete descriptions, humanized types and visible Edit actions. Commit `3731b0ae` shows Edit on hover and keyboard focus with a fine pointer, retains it on touch, and fades only the edges with more tree rows.
Description shortening is excluded by the complete-text requirement.
- T064 is partially accepted. `81bee1e1` preserves the sidebar spacing and reuses the content cap for the metrics list. The metric detail remains beside that list. Moving it onto the same left edge as other tabs would redesign the approved master/detail layout, so that portion is skipped. See the measured offsets in `E.md`.
- T010 is recorded as complete from the five original lane refs and the lane evidence. `git show-ref --verify` found A `db4d394f`, B `ab5a420c`,
  C `837ab16b`, D `f676f076` and E `200044e6`. The owner confirmed the separate worktrees and the lane logs document their isolated ports and data.
- T035 and T055 were already checked and their final lane evidence records successful runs. T009, T023, T047 and T073 remain unchecked because their lane evidence records failed or blocked checks. Pre-rebase results below do not settle the rebased gate.

The rebased candidate under test is `c8a99063d82a2e1e92758da847de631bb80cb743`. Heavy verification runs through `sw-midgard-run` in the isolated Midgard checkout. Its Git transfer goes to the authorized scratch bare repository. No project remote received a push.

The suite driver checks available memory before each command, waits below 8 GB, and records terminal output and exit status per command. It runs unit tests, check, build, the mutation gate and each of the 36 registered browser suites serially. The suite log and completion status are written under `out/gate-007/suites/` on Midgard.

Completed checks on the rebased candidate:

| Command | Summary |
| --- | --- |
| `bun test` | 2,446 pass, 0 fail, 347,024 assertions across 350 files (2,030.75 s). |
| `bun --bun run check` | Exit 0 in 46.8 s. TypeScript passed, 1,180 files formatted, lint reported 2,661 warnings and 0 errors. Comments, theme and brand checks passed. |
| `bun --bun run build` | Exit 0 in 6.2 s. Vite built in 3.24 s with the chunk-size advisory. |
| `bun scripts/ci-validate.ts --step mutation` | Exit 1 in 2,994.7 s. `Surviving UI mutant: clamped catalog description without its full-text tooltip`. All unmodified module baselines passed. |
| `bun scripts/ci-validate.ts --step browser --suite test:auth` | Exit 1 in 47.0 s. Read-only role check expects an accessible name beginning with `Commit to` but the disabled button is named `Commit`. |
| `bun scripts/ci-validate.ts --step browser --suite test:two-editors` | Exit 1 in 73.7 s. Personal edits, branches and commit authors all passed. The publication step waited for the obsolete button name `Sync…`. |
| `bun scripts/ci-validate.ts --step browser --suite test:admin` | Exit 1 in 35.6 s. The candidate failed at the `Dry-run result` region, the same assertion reported on main. |
| `bun scripts/ci-validate.ts --step browser --suite test:ui` | Exit 0 in 65.8 s. `20 UI checks passed`, including no browser runtime errors. |
| `bun scripts/ci-validate.ts --step browser --suite test:responsive` | Exit 1 in 105.1 s. The candidate passed the 1280×720 compact-shell assertion that main fails. At the next phone viewport, loading the UBL model timed out before the heading appeared. The Mall ODCS check still needs a standalone run. |
| `bun scripts/ci-validate.ts --step browser --suite test:edges` | 6 edge attachment UI checks passed (32.8 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:grouping-validation` | 8 grouping and validation UI checks passed (60.9 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:overview-areas` | 7 overview area checks passed (37.9 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:published-snapshot` | 2 published snapshot browser checks passed (32.6 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:examples:ui` | 19 example UI checks passed, no browser runtime errors (129.7 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:projects` | 8 project checks passed (37.3 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:trash` | 13 trash checks passed (43.0 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:sidebar` | Exit 1 in 67.8 s. Timed out opening a desktop viewport before the project tree or empty state appeared. |
| `bun scripts/ci-validate.ts --step browser --suite test:metrics` | 11 metrics checks passed (69.3 s), including phone and wide-screen containment. |
| `bun scripts/ci-validate.ts --step browser --suite test:graph` | Exit 1 in 115.3 s. The Mall ontology Graph passed the 473 px minimum. Later, the Neighborhood trail intercepted pointer events for Walk to AllowanceCharge. |
| `bun scripts/ci-validate.ts --step browser --suite test:editor` | Exit 1 in 56.3 s. The 1.9 MB editor check measured 55.31 ms per keystroke with a limit below 30 ms. |
| `bun scripts/ci-validate.ts --step browser --suite test:item-edit` | Exit 1 in 50.5 s. The first two edit checks passed. The next still selected the raw EntityType label instead of the humanized catalog row. |
| `bun scripts/ci-validate.ts --step browser --suite test:addresses` | 4 item address browser checks passed (18.1 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:rdf-edit` | 9 RDF edit checks passed (40.4 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:validation` | Exit 0 in 22.1 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:scm` | 20 Source Control checks passed (59.7 s), including phone containment and read-only actions. |
| `bun scripts/ci-validate.ts --step browser --suite test:odcs` | 10 ODCS checks passed (39.2 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:lineage` | Exit 1 in 63.7 s. Commerce and Mall edge rendering passed. The 169-table UBL first view measured 3,784 ms with a 2,000 ms limit. |
| `bun scripts/ci-validate.ts --step browser --suite test:autosave` | Exit 1 in 25.6 s. Save and commit assertions passed, followed by a Git log assertion that could not resolve main. |
| `bun scripts/ci-validate.ts --step browser --suite test:sql` | 10 SQL checks passed (36.0 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:git-setup` | Exit 1 in 12.3 s. Setting identity and committing through the UI passed. The fixture repository had no commits on its current main branch. |
| `bun scripts/ci-validate.ts --step browser --suite test:monorepo` | Exit 1 in 30.7 s. Clone finished with “Cloned monorepo.” but the browser check required “Cloned.”. |
| `bun scripts/ci-validate.ts --step browser --suite test:dialogs` | 9 dialog checks passed across six viewports (326.5 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:telemetry` | Exit 1 in 104.8 s. Seven reporting and privacy checks passed. The disabled-report scenario could not open Catalog. |
| `bun scripts/ci-validate.ts --step browser --suite test:terminology` | Exit 0 in 104.2 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:mappings-layout` | 8 mapping layout checks passed (78.6 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:clipping` | Exit 0 in 28.8 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:mapping-graph` | Exit 1 in 109.1 s. Fit left five Mall overview card names outside their cards at 9 px. |
| `bun scripts/ci-validate.ts --step browser --suite test:back-history` | Exit 1 in 52.2 s. The Neighborhood trail covered the second Mall neighbor and prevented the first selection. |
| `bun scripts/ci-validate.ts --step browser --suite test:theme` | Exit 1 in 56.7 s. Both font loads, offline first-run fonts, theme switching and contrast checks passed. The light sidebar assertion counted a disabled status indicator as an outlined action. |
| `bun scripts/ci-validate.ts --step browser --suite test:brand` | Exit 0 in 11.9 s. |

The first pass ran all 36 registered browser suites. Twenty passed and sixteen failed.

The catalog mutation removed a tooltip from a description that already wraps in full. The mutation needs to inject actual clipping and the assertion needs to reject clipped descriptions even with a tooltip.
The read-only Auth check still expects the commit form the Source Control fix deliberately removes. The denied state remains represented by the disabled header button and its tooltip. The two-editor check still uses the former Sync label. Both browser checks need to be rerun against the reviewed controls.

Reported failures on middle revision `5597ae52`: `test:responsive` observed a 481 px canvas at 1280×720 where the compact-shell check requires more than 504 px. This is distinct from the 421 px minimum on the Mall ODCS Graph. `test:admin` failed at the Dry-run result step. The candidate diverges on compact-shell geometry and reaches the same Admin assertion. The live three-version comparison is pending.

The first repeated capture batch measured the viewport at 1280×720 on the same frozen inputs.

| Local Graph canvas | v0.6.1 | Main | Candidate |
| --- | ---: | ---: | ---: |
| UBL ontology | 481 px | 481 px | 511 px |
| Mall ontology | 481 px | 481 px | 511 px |
| Mall ODCS | 389 px | 389 px | 389 px |

The 30 px UBL gain is in the Full Graph surface owned by lane A. The Mall ODCS canvas uses the lineage surface owned by lane B.
The frozen-import ODCS geometry is below the suite's 421 px threshold on all versions. The standalone suite still needs to check
the example-loading scenario where lane B passed before rebase.

The repeated 1600×1000 local UBL Walk reached all five targets on the release and main. On the candidate the first button
(`Walk to AllowanceCharge`) timed out because the trail intercepted pointer events. The Walk state is a regression.
The 1440×900 Mall mapping Fit showed a different failure on the candidate. The two older versions had fitted name text at
0.6 px, and the candidate reached 9 px but some names extended outside their compact cards.

The comparison fixture consists of the seven release projects with 36 unique source files.
Each file was read once from the release Git blob using `git show` and hashed with SHA-256.
The duplicate Commerce contract is shared by the Commerce and Mapped commerce imports.
Three supplemental files exercise SQL colouring, SQL warnings and a mapping with no bindings.
The two SQL files come from the release fixtures. The empty mapping keeps the Commerce mapping reference fields and drops its bindings.
The Import UI returned success for all nine frozen projects in both local and server mode on all three versions.
Each run wrote 43 files across the projects, using 39 unique inputs, and every reported file hash matched the frozen hash.
The per-file inventories returned the same 5,298 entities and 12,145 relationships across the unique inputs.
The UBL server import went into HR for the reader's journey. The other server imports went into Sales.
The unbound project was renamed through the UI after import to distinguish it from the other Mapped commerce project.

| Capture version | Commit | Vite build | Local import | Server import | Entities | Relationships |
| --- | --- | --- | --- | --- | --- | --- |
| v0.6.1 | `3b1c2c10bc6ae96c6c603301764bde4cfdc4dcd4` | 3.10 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |
| Main | `5597ae52c55cb76a864aa242873dbbe7083a000e` | 3.12 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |
| Candidate at preparation | `e090f17691f0a6dc593386a916fb6ac90317a52d` | 3.01 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |

`sw-midgard-run` launched the detached comparison preparation and returned status 0 for the full prepare phase.
`bun --bun run build` ran within each checkout. Each used the same dependency lock.
The per-version `bun -e` inventory verified every SHA-256 and ran that version's `inspect`.
The serial Import driver verified each response file hash and closed Chromium and the assigned servers before starting another batch.

<details>
<summary>Frozen input hashes</summary>

| Frozen source | SHA-256 |
| --- | --- |
| `billing/billing.mapping.yaml` | `8df7269adfa49bae09ebedd26da75e03a8b7e134333a96c44e1b4cfeb7c481f4` |
| `billing/billing.odcs.yaml` | `3f3bbda2933f10e6e42e3ffaaaef58b7de9ab78eaef1405c8ec7096fbcb4d078` |
| `billing/billing.ontology.yaml` | `faf35e9592ade9fe15ff5107bf24258b7156c3346f8443b43e6c479d8554b1a3` |
| `billing/billing.semantic.yaml` | `2653c136378a00df30b90649ca1fd06d5268d5a7bb0adcb588cbb07f3e3bbdc0` |
| `commerce/commerce-business.ossie.yaml` | `7ad7245528e26cac6ba14f8fba5541562d5aed76399b126aae40bef06bb911b0` |
| `commerce/commerce-data.ttl` | `3ff01477fdba89c0f36030cbc271b7a73c618682f06c405dcde8c0634e98d31a` |
| `commerce/commerce-scale.ttl` | `e93b0b93f039617d868f49cc52f5cfc04db2d8be245f45c88170be11f5d389e3` |
| `commerce/commerce.mapped-ontology.yaml` | `21f1ff7a40946b0fc7cd46bdc130390e243f904dbb00fbd9c5f35f16f2e80a01` |
| `commerce/commerce.mapped-semantic.yaml` | `64c18fb46af93c4f00f804a578312f9af7f476157cf89b373dd3ab556ee6168e` |
| `commerce/commerce.mapping.yaml` | `bed274e8cb6d3b632e7dfe1d5e02f70d8a3af1b8e0fd162a717899887e423599` |
| `commerce/commerce.odcs.yaml` | `30cbafad91dac376320668e6a3df16913f171bdf156c2114913e5d17a80e1992` |
| `commerce/commerce.owl` | `d92ee09aaeea891f6774a822f46aefa1de5065ff2c5be03c8374e8646b422a3a` |
| `commerce/commerce.owl.ttl` | `cc7f01232bb10a8fd73bc394ba3378765572112b32662a4a4bddb11bd90178f1` |
| `commerce/commerce.shacl.ttl` | `0ee9a65a3aa413f3478419e8260fdadcfd6b8f71a2ee43ff47ac8e08da60a552` |
| `commerce/sales.mapping.yaml` | `e4d29469e30fd486805980b377976338a4127341255bb75ad1d45affed505c49` |
| `commerce/sales.ossie.yaml` | `42d5fd7389861ef34349b2d5d9b9be91c4a80528b55ba2720aac9e51de6f2232` |
| `mall/mall-data.ttl` | `b2a24c09086d44b178210fb6a0376d1529d103ee552399b2e3a5e3e0e1faa532` |
| `mall/mall.mapping.yaml` | `ddfe91807d88a22a91948e790852dff9dcfe28f962cc90b3a0ad74e3ea28177f` |
| `mall/mall.odcs.yaml` | `707d338f3f3fdee63b5fa5e2e9fa1ed1d8f7a0b14b7c20863a1b84dfa333c400` |
| `mall/mall.ontology.yaml` | `5d11b246f6890a4e3a11a0ed17e08810945dfeac458d369d0726dec54a8fe4f7` |
| `mall/mall.owl.ttl` | `df4b7eb7fead55f9061ee194f7ba482fab1bdebd4015fa8a39fa5c552b1e02b2` |
| `mall/mall.semantic.yaml` | `ce3ba1ed501bd170d24e30cd6c04746a9319dab7734943a8e3de99dcfb5692e1` |
| `mall/mall.shacl.ttl` | `0f9f4e5c3b4e069018c7c8768f7b8bf841ef26db505a4984b71fefaee96711b9` |
| `ossie/flights.mapping.yaml` | `dd62e2614097d0fa3f457fdb15a4ac431cfbbc088fa0a46148d2671ca6b1215c` |
| `ossie/flights.metrics.mapping.yaml` | `73a7a1061c2b5f6c273cee8e3b8c93a2a8f8c73affbe1f1c469dbba3d6deaa0b` |
| `ossie/flights.metrics.semantic.yaml` | `2d7aa9fada288ae70acb41921f4f58f555b928b26b009d7a0517d531cddb1c86` |
| `ossie/flights.odcs.yaml` | `9a7c220945419e97b815f185a707ecbc692110366bb1fc74a67262a3ba2a7d61` |
| `ossie/flights.ontology.yaml` | `4035aa22494a1dfc739f5fe6689ffa74d07338497ef67a7acab69c568eae00fd` |
| `ossie/flights.semantic_model.yaml` | `e0652e489c1bbf69066c9c17109175721e7d9e7e27d302a5cae9747cabbac75e` |
| `ossie/flights.yaml` | `1d716be212d952422885fd74997583b466d267c78f5add3a71fd357f84012130` |
| `ubl/ubl.odcs.yaml` | `bd2eedd821abef9b834e2bbad8e70495042b922ee73ca1a67ed06dba8e35efb4` |
| `ubl/ubl.ontology.yaml` | `ac8343193ce8b087c9975583e6b047caf653e59c2416dc40c043bb35bea63b2f` |
| `ubl/ubl.owl.ttl` | `4ae7d7872dcde977f71fc2e50ec22a7b0bf453919db954fe5c9ac72062a221de` |
| `ubl/ubl.semantic-mapping.yaml` | `ad70e22d7a6b171b1644d1e113b307f440f9c934de218af16dbbfedee455a6a0` |
| `ubl/ubl.semantic.yaml` | `3b97121ee492a6eaea2a3798ced9810462e7da58701445bb272b232b898ad6ab` |
| `ubl/ubl.shacl.ttl` | `a40474f3e9e2593664ffb2d4561afa40670171c810832070d48141d953f7282d` |
| `sql/case-when.ossie.yaml` | `17c3bfc8909fb2420224b0fc83aab7db65e21333ebf70fbb27862d9e9e056415` |
| `sql/case-when-broken.ossie.yaml` | `23ba6a85d5d846fb00fb2fb326ba324f43d0ad62988bc6191f548e810f7f3cf1` |
| `unbound/commerce.mapping.yaml` | `ae4b63433db73d910c9536d77313a7841b22c223e1f17d3a3d504b0cbdbbd4fc` |

</details>

`bunx --bun oxfmt --check` passed on all 196 changed TypeScript, JSX and CSS files. The formatter configuration excludes Markdown.
The confidential-only scanner passed for the task and evidence documents. Neither the repository nor the installed skills includes the named cadence checker.
The original review archive contains 3,559 PNGs. A read-only count by folder measured 72 in `auth-pages`, 175 in `followup`, 220 each in `local-dark` and `local-light`, 228 each in `server-dark` and `server-light`, 51 in `server-personas` and 2,365 in `states`. The superseded comparison bundle contained exact copies of all 3,559, verified byte by byte before removal. The source archive remains intact. The current comparison uses newly captured release, main and candidate frames.

Status: in progress. No visual pair is classified before both images have been opened.

The gallery checkpoint of 752 rows includes 333 intended fixes, 32 expected merged-feature differences, 300 neutral changes and 11
unchanged steps. It retains 43 frames of fixed regressions and 33 frames flagged as possible or unresolved regressions. A frame count
can include multiple actions that carry the same underlying issue. The manifest records actions without matched captures.
The counted Network heading and compact mapping correction pairs were opened at 390×844 in both themes.
The 75-state phone replay (local, light, 390×844) was opened across 25 contact sheets. Both repetitions on all three versions
opened the named mapping and its Source tab. The Source view preserves the empty concept list. The transient empty-bindings frame
is timing noise, confirmed by the settled Identifier replay. The candidate also shows the full line-23 SQL warning and a green
keyboard focus ring on the metric grouping control. The empty Trash dialog keeps its explanation and Close action.
- `bash .data/gate/pull-review-007.sh .data/gate/empty-mapping-confirmed local/light/390/empty-mapping` returned five strips, all opened.
  The 390×844 linked control succeeded twice per version. Candidate shows 9 cards, no empty note, and enabled Mapping steps.
  Both references show 2 cards and enabled steps. Unlinked Identifier renders one card and enabled steps in both references.
  Candidate `c50a6823` renders zero cards, one complete explanation, and disabled Mapping steps in both repeats.
  Candidate/main scores are 19.391481% linked, 12.067687% unlinked, and 12.089561%/12.080447% at 5 and 15 seconds.
  The 1-second score is 79.550067%; both references still resolve the mapping while the candidate shows its empty state.

- `bash .data/gate/pull-review-007.sh` for `local/light/{390,1440}/catalog-hover` returned eight strips, all opened. Each action
  succeeded in both repetitions of all three versions. With a fine pointer at 1440×900, `3731b0ae` changes Edit opacity from 0 at rest to
  1 on hover and focus. The measured card frame stays at x=333, y=169.390625, 202.796875×222.09375 in all six candidate measurements.
  Both 390×844 touch repetitions leave Edit visible. The sidebar fades down at the top and up at the bottom. The last ODCS row and badge
  remain whole. Desktop main/candidate differences were 14.532022% at Catalog rest, 13.926080% on hover and focus, and 1.376157%/1.763349%
  at the top and bottom sidebar positions.
- `bash .data/gate/pull-review-007.sh .data/gate/full-graph-confirmed local/light/390/full-graph-controls` pulled 43 steps.
  `python3 .data/gate/contact-sheet-007.py` composed 15 sheets. Both repeats were opened throughout. Network Fit and Expand all
  show all 45 names at phone width. Collapsing Layered shows all four counted cards. Selecting Order and expanding again keeps
  Order above the inspector. The hidden mini-map leaves the full width available. Each fullscreen path exposes Exit full screen.
  The Legend step is unavailable in all six runs, and one release pass missed the initial Layered Order selection.
- `bash .data/gate/pull-review-007.sh .data/gate/refused-import-confirmed local/light/1280/refused-import` returned the m21 strip. Both
  repeats were opened. At 1280×720 the settled UBL Overview stays visible in the candidate and the full supported-format notice
  appears below the Add project control. Release and main open the Review import parser error for the same unsupported file.
  All six actions passed. The main/candidate score is 74.038628%.
- `bash .data/gate/pull-review-007.sh .data/gate/wide-bundle-fixed local/light/1440/wide-bundle` returned both strips and all six route
  checks passed with `distinct_routes:9`. Both repeats and the native pair were opened. At 1440×900, the earlier candidate's
  nine reads lay on a single stroke between compact cards. After `c5910838`, both cards expose their full column rows and nine
  distinct routes, as in release and main. The native pair is `before/fixes/lineage-bundle-1440.png` and
  `after/fixes/lineage-bundle-1440.png`. `python3 .data/gate/pixel-difference-007.py` reported 15.767978%.
- `bash .data/gate/pull-review-007.sh .data/gate/neighborhood-pierce-verified local/light/1440/neighborhood-pierce` returned two strips.
  Both repeats of each were opened. All six Full pierce actions reported 45 entities in three steps. Both candidate repeats show
  `45 entities, Fit`, and the Back action returns to Party with its relationship labels. Main/candidate scores are 22.376543%
  for Full pierce and 21.965972% after Back. The graph suite clicked the Fit action and checked that it framed every card.
- `bash .data/gate/publish-current-review.sh` returned 752 rows with the counts above.

The Full Graph replay scored 43 steps, from two repetitions per version. The candidate Network first view and Fit show four named counted areas.
Both full-screen selection paths open Order and keep it readable. After changing area visibility with Order selected, Layered can leave Order
in the inspector while the canvas moves to Address. Network's expanded and collapsed frames use only the left portion of the pane after the
mini-map toggle has been enabled. The phone stylesheet hides the map in all three versions. The desktop framing and the independent selection
and area controls require separate replays. Full Graph has no Legend control in any build.

The phone Admin replay scored six steps, each with six successful action records. The valid grant review opened in all three versions with the
isolated frozen-workspace fixture. The candidate puts confirmation on the right and gives a plain-language count. Both Access check outcomes
scroll into view, with the allowed and denied text inside the phone viewport. The invalid-address check stays under the email field and exposes
no schema details. This targeted comparison is separate from the canonical suite's inherited timeout at Dry-run result.

- `bash .data/gate/pull-review-007.sh` for phone Full Graph and Admin exported 43 and six captured strips respectively.
- `python3 .data/gate/contact-sheet-007.py` produced 15 Full Graph sheets and two Admin sheets. All were opened.
The desktop Admin replay shows the same confirm order and contextual access results. Both last-Admin steps passed twice on each build.
The candidate names the account and uses a danger action before refusal, then replaces the raw refusal code with one sentence and leaves Cancel.
The dark Source Control replay shows dark gutters and collapsed lines in the modified, staged, added and deleted diffs. The stale-save dialog
also keeps the gutters dark and makes Keep editing primary. The explicit Publish step appears in main and candidate. The dark Source editor keeps
the same YAML with separate blue tokens for keys and values. DM Sans and Manrope load from registered local faces in the candidate. The matched
first-run screenshot shows the Manrope heading in place of the release and main serif heading.
The dark phone auth replay shows primary actions and the no-support-URL administrator guidance in all three candidate screens. The error explains
that the sign-in link expired or was already used.

- `bash .data/gate/pull-review-007.sh` for desktop Admin, last Admin, dark Source Control, typography, diffs and auth pulled all scored strips.
- `python3 .data/gate/contact-sheet-007.py` generated 10 sheets for those six groups. All were opened.
- The superseded candidate unit rerun was stopped at its checkpoint before the camera correction trial. Its status was 143, the verification
  payload was restored and ports 5401 and 5402 were clear. `sw-midgard-run -- bash scripts/ui-review/gate-007/remaining-findings-launch.sh`
  started the next serial replay. Midgard reported 106 GB available at the first build, which passed.

The phone mini-map correction is `c039c13a`. A hidden Mini-map setting previously reduced UBL Fit from 0.648148 to 0.277778, leaving
all four counted areas in the left part of the phone pane. After the fix, both settings give 0.648148 in both repetitions and themes.
The corrected 1440 px map stays visible when enabled, with its outlined corner and viewport rectangle. The desktop fit remains at 1.0
and shifts left 108 px to leave room for the map. Both phone before/after pairs were opened. They show all four counted cards returning
to full width. The pairs are `before/fixes/ubl-hidden-minimap-390-light-1.png` and `-2.png` with the same filenames under `after/fixes`.

- `python3 .data/gate/pixel-difference-007.py` measured 30.382185% and 30.376413% changed pixels for the two native phone pairs.
- `bash .data/gate/pull-review-007.sh` returned the light and dark, phone and desktop mini-map strips. All eight steps were opened.
- The frozen desktop UBL Network opens as four counted areas at 1440 px in both themes, while the release and main open the 45 entities.
  This is a separate regression against the specified desktop first view. The existing opening check accepted the fallback based on a 7.39 px
  measured minimum. The 1440 px off-state strips retain this issue while the Network packing is investigated.

The gallery and CSV passed the local path and content scan. The gallery folder uses 56 MB on disk.

The Order inspection replay found that a delayed Layered fit could show Address while the inspector still named Order.
Commit `fca85397` keeps the selected entity in frame when the completed layout contains it. Both 390 px light repetitions
after the correction showed the whole Order card at 103.68 × 33.81 px. The opened native pair
`before/fixes/ubl-layered-expanded-order-390.png` and `after/fixes/ubl-layered-expanded-order-390.png` changed 27.421922%
of pixels. The corrected image shows Order beside Contract. The 1440 px strip likewise shows Order with its immediate
neighbors after expansion. Explicit Collapse areas still clipped the lower counted cards on desktop and showed only part
of the layout on phone at this checkpoint. Its correction is under a separate replay.

- `bash .data/gate/pull-review-007.sh` fetched the phone and 1440 px light selection replays. The six changed triptychs were opened.
- `git diff --check` returned 0 before the selection correction commit. The detached candidate rebuild returned 0.

Commit `e009e7ca` corrects the separate Layered Collapse areas action. With Order still in the inspector, the settled candidate
keeps all four area cards inside the canvas in both repetitions at 390 px light, 390 px dark and 1440 px light. The matching
version strips were opened. After Expand all, the Order card still matches the inspector. The opened native pairs under
`{before,after}/fixes/ubl-layered-collapsed-390.png` and `ubl-layered-collapsed-1440.png` replace the clipped lower row with
the complete four-area model. They changed 16.518107% and 21.097377% of pixels, respectively.

- `sw-midgard-run -- bash scripts/ui-review/gate-007/collapsed-and-network-launch.sh` rebuilt the candidate and completed the three selection comparisons.
- `bash .data/gate/pull-review-007.sh` and `python3 .data/gate/contact-sheet-007.py` fetched and arranged the nine inspected triptychs.
- `python3 .data/gate/pixel-difference-007.py` counted 54,371 of 329,160 changed pixels on phone and 273,422 of 1,296,000 on desktop.
- `bun .data/gate/gate-007/box-fit-trial.ts` and the Midgard Network diagnostics measured the geometry separately from the browser. Compressing the
  force layout and repeating its de-overlap pass left the smallest UBL name below 9 px in the desktop trial. Tighter area packing remains under test.

Commit `a5ee8187` restores the named Network first view. In both local light repetitions, all 45 UBL entity cards were whole, with zero name boxes
outside their cards. The minimum name measured 9.95 px at 390×844, 9.88 px at 1280×720 and 11.53 px at 1440×900. The model filled 93.09%, 92.66%
and 92.64% of the pane in its limiting dimension, respectively. Mall opened with all 12 counted areas in both repetitions at those widths.
The opened native pairs under `{before,after}/fixes/ubl-network-first-view-390.png` and `ubl-network-first-view-1440.png` replace four area counts
with readable cards. Long words wrap within the taller portrait cards. The compact desktop rows leave less room between cards, with relationship
arrows still present. Both repeat rows were opened for the frozen first views at these three widths.

- `sw-midgard-run -- bash scripts/ui-review/gate-007/verified-network-launch.sh`: targeted `bun test tests/full-layout.test.ts` returned
  `6 pass`, `0 fail`, `5540 expect() calls` in 4.92 s. The candidate build and first three comparisons returned 0.
- `bash .data/gate/pull-review-007.sh` and `python3 .data/gate/pixel-difference-007.py`: native revisions changed 160,385 of 329,160 pixels at 390 px
  (48.725544%) and 438,704 of 1,296,000 at 1440 px (33.850617%). The main and release first views show the same assets with smaller names.
- The same driver repeated the light 2560 px first view and the dark 390 and 1440 px first views. Both dark repeats matched the light name and
  coverage measurements. In the wide light repeats, the force layout varied (14.78 and 10.60 px), while all 45 names and cards remained whole.
  Both repeat strips for each model and width were opened.

The `local/light/1280/dataset-chrome/mall-properties-lineage-chrome/first-view` comparison shows the same frozen Properties table in all three
versions. The candidate's table header is 44 px high. Hops, path text, Foreign keys, the trail and viewport controls share one row. The lineage
region starts at y=214 px and its left and right edges are each one pixel from the header. The two records have identical candidate coordinates.
The opened repeats show the compact first view and carry M17 and M1. The older refused-import trial used a locator inside the repair dialog. It
therefore reported the intended lack of a repair dialog as a missing state. The next run uses the standard file chooser and records the visible
refusal or review dialog for each version.

The 2560×1440 Properties comparison confirms M23 in both opened repeats. The reference header ends at x=2052 and its
lineage extends to x=2207. The candidate header keeps x=652–2052 and the lineage region spans x=653–2051. Its 44 px header and
single control row leave the lineage region y=214–1402. The main/candidate score is 20.756538%. The matched strip is
`local/light/2560/dataset-chrome/mall-properties-lineage-chrome/first-view`.

The extra frozen lineage fixture imports one ODCS table and one semantic dataset. Each file has one entity and zero in-file relationships.
The pair resolves nine lineage reads across files. All six Imports verified the same hashes:

| File | SHA-256 |
| --- | --- |
| `wide/wide.odcs.yaml` | `eb129c1913684711753e77d45b12d587f6a7878e40df7b758e9525160f3f85fa` |
| `wide/wide.semantic.yaml` | `5da5d53c4a4238164996490f0046b4d2fdf5a8f062e5c57cc3573ffc337d00af` |

`bash .data/gate/pull-review-007.sh` exported the 2560 px Properties strip and the two 1440 px wide-fixture strips. Each was opened
including the repeat frames. The split produced nine read elements in all six browser records. In the candidate the compact
cards share their ports, so the nine lines coincide in both repeats. The references separate those lines at their column rows.
Main/candidate difference was 19.558488%. The earlier candidate screenshot is preserved at `before/fixes/lineage-bundle-1440.png`.

The 390×844 three-hop Mall contract replay returned five strips, all opened at both repetitions. The candidate's
`powers_of_attorney` name stayed whole after Find assets, Fit, Forward and full screen, with at least 19.88 px clearance on
its closest horizontal edge. The caption wraps and retains the original centre. Fit keeps readable names and leaves the
dense reach pannable. The reference Fit reduces names to small marks. Main/candidate scores were 44.532142% after selecting
the asset, 36.489853% at Fit, 44.633005% at Forward and 45.575100% in full screen. The separate Back step restored one hop
and left the same centre in all six records. The search result uses a mouse-down handler, while the history starts a
group on click. The pre-existing Back behavior is visible in the 44.160591% Back strip; the separate canonical Back test
uses the actual Walk here button.

- `bash .data/gate/pull-review-007.sh .data/gate/walked-fit-confirmed local/light/390/walked-lineage-fit` exported five strips.
- The confidential scanner returned clean on the evidence, tasks, gallery page and manifest. The readability checker
  passed on the six changed TypeScript files after `bun --bun node_modules/.bin/oxfmt`. `git diff --check` returned 0.

The five matched Properties phone strips were also opened, including both repeats. The candidate's centre title has
18.22 px of horizontal clearance after the search result, Fit and Forward. Both reference full-screen frames put the
centre behind the bottom edge. The candidate keeps it in the pane with the complete caption. The first capture
checked the contract's full-screen wrapper in all builds, so the recorded full-screen assertion failed across builds
despite the visual transition. The replay uses the visible Exit full screen control.

- `sw-midgard-run -- bash scripts/ui-review/gate-007/sidebar-and-mapping-launch.sh` started with at least 8 GB available;
  the sampled steps reported 105–106 GB. The serial check and build returned 0. Check formatted 1,180 files and reported 2,661 warnings,
  zero errors, with TypeScript, comments, theme and brand checks passing. Build completed in 3.00 s with the chunk-size advisory.
- `bun scripts/ci-validate.ts --step browser --suite test:graph` passed all 16 new and existing opening checks from `708ebe53`.
  The four UBL Network minimum name sizes were 9.95, 9.88, 11.53 and 10.98 px at 390, 1280, 1440 and 2560 px.
  It also logged `PASS full pierce offers Fit for 45 entities; Fit frames every card`. Exit 1 at the inherited 100 ms
  Full pierce long-task limit. This retry measured 298 ms; pinned main previously measured 240 ms at the same assertion.

## Differences for owner acceptance

- The release has no published working-copy notice. Main adds it to Mappings, with both older release and candidate data otherwise kept under the
  same comparison inputs. The notice appears in Commerce, Sales and OWL strips. Source Control confirms the separate local Publish step on main and
  candidate in both phone repetitions.
- Main's local commit path writes to the authoring branch. Two browser fixtures still inspect the default branch after successfully committing
  through the UI. The failures and exact commands are recorded in the suite table above.
- Main and candidate both clip the same contract ID at 390×844 and both produce a 389 px Mall ODCS canvas at 1280×720. The separate 481 px Full
  Graph canvas on main is 511 px on the candidate. The owner can decide whether to take the two inherited ODCS defects into another change.
- The 390 px workspace header shortens the UBL mapping filename in release, main and candidate. The matched label correction leaves that inherited
  header behavior visible in both themes.
- The metric detail's same-left-edge proposal would displace the existing side-by-side list and detail. That design decision remains under T064.

## Findings with opened visual evidence

Paths in this table are step identifiers in `manifest.csv`, except for the explicit correction pairs above. The table covers the opened pilot and focused
replays. The outstanding findings still require a matched screenshot or a recorded exclusion.

| Finding | Opened step | Observation |
| --- | --- | --- |
| M2, M13 | `local/light/1280/geometry/mall.ontology.yaml/canvas-dimensions` | Counted areas replace undersized names and the toolbar leaves 30 px more graph height. |
| M3 | `local/light/390/full-graph-controls/full-graph-layered/areas-collapsed` | The replay frames all four counted areas, even with an entity selected. |
| M4 | `local/light/1440/mapping-fit/mall-mapping/fitted-names` | The follow-up correction keeps the Mall mapping labels inside cards at Fit. |
| M5, m24 | `local/dark/1440/diff-surfaces/scm-stale-save/tour` | The merge gutters stay dark and Keep editing is primary. |
| M7 | `local/light/390/import/workspace/empty-before-import` | The first-run heading changes from serif to Manrope and remains whole. |
| M9 | `server/light/1440/admin/grant-form/validation-error` | A short email error appears next to its input. |
| M10 | `server/light/1440/last-admin/last-admin/refused` | The refusal leaves Cancel and explains the last-active-Admin rule. |
| m18 | `local/dark/1440/typography/typography/yaml-source` | The same YAML displays light-blue keys and deeper-blue plain values. |
| m26 | `server/dark/390/auth/auth/sign-in-error` | The sign-in error gives a primary retry and administrator guidance. |
| M11 | `server/light/1440/admin/access-check/allowed` | The allowed result gives its reason in the banner. The matched 390 px replay also shows both banners inside the viewport. |
| M14 | `local/light/390/graphs/full-graph-network/labels-on` | Selecting Order exposes its nearby relationship labels. |
| M15, m10 | `local/light/1440/files/commerce.mapping.yaml/neighborhood` | One normal-size card, no empty neighbor count and cross-file links in Other files. |
| M16 | `local/light/390/graphs/mapping-graph/node-selected` | Selecting Customer opens its path and editable binding details. |
| M17 | `local/light/1280/dataset-chrome/mall-properties-lineage-chrome/first-view` | Hops, path, keys, trail and viewport actions share a row above the complete cards. |
| M19 | `local/light/390/states/add-concept/field-errors` | Save to file is visibly disabled while Type is missing. |
| M21 | `local/light/390/states/editing/stages` | The located editor error wraps without a second copy below the editor. |
| M22 | `server/light/1440/reader/reader/admin-refusal` | A reader who opens Admin sees the role refusal. |
| m1 | `local/light/1440/neighborhood-pierce/ubl-neighborhood/pierce-alone` | After pierce, the candidate offers Fit for all 45 entities. |
| m2 | `local/light/390/walked-lineage-fit/mall-three-hop-lineage/fit` | The caption names the walked centre and the original Properties centre. |
| m3 | `local/light/390/graphs/contract-lineage/more-columns` | The expanded Properties card shows its heading, CENTER badge, all 13 rows and Show fewer. |
| m4 | `local/light/390/files/commerce.owl/overview` | The Order group uses the new non-error tint. |
| m5 | `local/light/390/empty-mapping/mapping-steps/unlinked` | The unlinked mapping explains the empty canvas and disables Mapping steps. |
| m6 | Documentation only | The graph guide names one to three foreign-key hops and one to five mapping steps. There is no requested screen change. |
| m7 | `local/light/390/graphs/mapping-graph/fullscreen` | Full screen keeps zoom and exit controls visible, with all nine compact assets in the pane. |
| m8 | `before/fixes/ubl-mapping-labels-390-light.png` and its after frame | The compact graph removes the overlapping raw path labels and keeps hovered relationship names available. |
| m9 | `before/fixes/ubl-area-headings-1280.png` and its after frame | Wrapped headings have clear space above their cards. |
| m11 | `local/dark/1440/mini-map-framing/full-graph-minimap-framing/minimap-on` | The framed mini-map marks the viewport and reserves its corner. |
| m12 | `local/light/390/graphs/full-graph-layered/zoomed-in` | Zoom leaves the selected Order name and Metric badge legible. |
| m13 | `local/light/1440/files/commerce-data.ttl/graph` | The Order line area title uses word boundaries. |
| m14, m15 | `local/light/1440/files/commerce-data.ttl/catalog` | Card starts align and type badges read as words. The dedicated Catalog and sidebar strips show hover, keyboard, touch and both scroll edges. |
| m27 | `local/light/1440/files/ubl.ontology.yaml/mappings` | The empty view offers Import and Load example. The separate phone detail transition is M24. |
| M1 | `local/light/390/followup/mall-properties-lineage/bundled-line-split` | The collapsed dataset header leaves a visible lineage canvas with multiple whole cards. The frame does not establish a successful bundle split. |
| M6 | `local/light/390/tour/scm-diff-deleted/tour` | The staged deletion labels the right side Deleted (staged). |
| M8, m14 | `local/light/390/files/ubl.semantic.yaml/catalog` | All 178 results are counted. The two bridge descriptions include the formerly hidden source occurrence range. |
| M12 | `local/light/390/source-control/source-control/modified-diff` | The changed file opens in a unified diff with Back to changes. |
| M18 | `local/light/390/states/metric-wizard/primary-hover` | The phone wizard retains its heading, active step and visible footer actions. |
| M20 | `local/light/390/trash/trash/another-project` | A deleted file shows its project and Switch to project alongside the outlined empty-trash action. |
| M23 | `local/light/2560/dataset-chrome/mall-properties-lineage-chrome/first-view` | The header and graph edges match within a pixel, compared with 155 px overshoot in both references. |
| M24 | `local/light/390/followup/mapped-commerce-mappings/ai-context-open` | The details view has a Back to concepts action within the phone layout. |
| m13 | `before/fixes/ubl-center-picker-390.png` and its after frame | The center picker accommodates the full label without dropping an action. |
| m16 | `local/light/390/followup/add-concept/duplicate-name-refusal` | The duplicate-name refusal appears under Name and disables Save. |
| m17 | `local/light/390/states/metrics/keyboard-focus` | The grouping control shows the candidate focus outline. |
| m19 | `local/light/390/states/shell/avatar-menu` | The local identity menu gives its administration action a distinct name. |
| m20 | `local/light/390/import/workspace/empty-before-import` | The empty workspace offers Import files without inactive tabs and search. |
| m21 | `local/light/1280/refused-import/import/refused-file` | The unsupported-format notice leaves the workspace visible. |
| m22 | `local/light/390/source-control/source-control/clean` | The why-disabled message and remote guidance wrap as body text. Branch and publication changes came from main. |
| m23 | `local/light/390/tour/admin-settings/tour` | The Save settings control sits under Session lifetimes, apart from Remote policy. |
| m25 | `local/light/390/tour/admin-audit/tour` | Audit rows give readable action labels and decision colors. |
| m28 | `local/light/390/tour/ontology-neighborhood-fullscreen/tour` | Exit full screen is exposed in the primary row on the phone. |

## Scope ledger

- Existing lane modules and public contracts remain the implementation boundaries.
- Integration combines lane changes and can expose shared-style or capture-expectation conflicts.
- Corrections cover named findings and observed failures through existing entry points.
- Gate evidence distinguishes current failures, baseline failures and completed visual inspection.

## Command journal

All commands run from this worktree. Raw output is retained in `.data/gate/logs/` unless a row names another location. No push, remote changes or deployment is authorized.

| Command | Summary |
| --- | --- |
| `pwd; git status --short; cat README.md; cat ARCHITECTURE.md` | Correct integration worktree; initially clean; existing architecture read. |
| `cat specs/007-ui-review-fixes/{tasks,plan,quickstart,capture-index}.md` | Merge boundaries, suites and capture matrix read. |
| `git merge --no-ff 007-lane-a -m 'merge: integrate graph review fixes from lane A'` | `f1398bf8`; clean merge, no conflicts. |
| `bun test` | Running after merge A; raw log `A-test.log`. |
| `bun --bun run check` | Passed after A; formatter, lint, comments, theme and brand checks passed. |
| `bun --bun run build` | Passed after A; `built in 1.51s`. |
| `find <baseline>/screenshots -type f -name '*.png'` | Exactly 3,559 baseline PNG images. |
| `df -h . /tmp; free -h` | 59 GiB worktree filesystem free; 8.3 GiB temporary filesystem free; 25 GiB available memory. |

## Historical validation journal

This section retains integration and capture observations from before the rebase. The current suite and visual statuses are above.

### Merge A unit result

```text
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2077 pass
 0 fail
 130795 expect() calls
Ran 2077 tests across 286 files. [321.82s]
```

### Merge B

`git merge --no-ff 007-lane-b -m merge: integrate UI review fixes from lane B`: exit 0. Full output: `B-merge.log`.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2083 pass
 0 fail
 130825 expect() calls
Ran 2083 tests across 286 files. [292.31s]
```

### Capture fixture ports

Existing API/mock/Git factories already accept OS-assigned ports. The follow-up adapters unnecessarily forced fixed ports; removing those adapters preserves fixture behavior. The second frontend retains
the same graph-reopen stages with a dynamically allocated port and a private cache. No application behavior changes.

- `bunx --bun oxfmt scripts/ui-review/{followup-local,followup-trash,followup-server,known-issues}.ts`: formatted four files.
- `bunx --bun tsc --noEmit`: exit 0.
- `python3 <readable-code>/scripts/readable_check.py --changed <four capture scripts>`: exit 0.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/port-smoke graphs`: transport/setup succeeded;
  light/dark state assertions failed because the old driver clicked a counted area instead of expanding to an entity. This capture-expectation failure remains to fix; these are not final gate pairs.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/known-issues.ts .data/gate/reopen-smoke 11 11`: exit 0; dynamic frontend 42327; toolbar appeared in 80 ms; canvas 954×507; exact started listener stopped.

### Known temporary-directory assertion

`git archive e8b7d69 | tar -x -C .data/gate/main` creates a baseline copy inside this worktree; dependency resolution uses this worktree's node_modules.
`TMPDIR="$PWD/.data/gate/tmp" bun test ./.data/gate/main/tests/pipeline/deploy-azure.test.ts`: `4 pass`, `1 fail`, `18 expect() calls`.
The failure is the same hard-coded `sw-deploy-registry-` prefix directly under `/tmp` at line 100. Baseline production code correctly honors TMPDIR. A portable assertion is still pending.

`bun scripts/mutation-case.ts <archived-main>/src/shared/projects/examples.ts example-registry`: exit 0 without the runner deadline. This is diagnostic only; the complete mutation gate is pending.

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 652ms on 1037 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.53s
```

### Merge C

`git merge --no-ff 007-lane-c -m merge: integrate UI review fixes from lane C`: exit 0. Full output: `C-merge.log`.

### Capture expectations and scratch roots

- Expanded-area entity selection now uses the existing Expand all helper before native node clicks. First-view captures retain the new counted-area presentation.
- Source-control history is an existing region rather than a button. Phone diff sequences use Back to changes between selections and before staging or entering a commit message.
- Scratch factories now resolve the system temporary directory rather than hard-coding `/tmp`; the gate can keep their data inside its ignored TMPDIR.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/expectation-smoke graphs`:
  light and dark captures both report `failed: false`, inspector visible, Network layout, no geometry problems.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/source-control-states.ts .data/gate/scm-smoke`: in progress; 68 captures through light/2560 with no unreachable state so far.
- `bun --bun run check`: exit 0 after these capture updates; raw log `capture-updates-check.log`.
- Readability checker on all changed capture scripts: exit 0.
- Full leak scan on `docs/development.md`: exit 0 after replacing machine-specific sample output paths with ignored relative output paths.

These scratch captures are driver verification only. Final merged-branch capture and pair classification remain pending.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2090 pass
 0 fail
 130847 expect() calls
Ran 2090 tests across 287 files. [329.58s]
```

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 51ms on 1042 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.77s
```

### Merge D

`git merge --no-ff 007-lane-d -m merge: integrate UI review fixes from lane D`: exit 0. Full output: `D-merge.log`.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2097 pass
 0 fail
 130894 expect() calls
Ran 2097 tests across 287 files. [302.60s]
```

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 80ms on 1042 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.55s
```

### Merge E

`git merge --no-ff 007-lane-e -m merge: integrate UI review fixes from lane E`: exit 1. Full output: `E-merge.log`.

### Portable registry-isolation assertion

The CLI adapter already chooses the system temporary directory. The assertion now compares with that same standard location, preserving its registry-directory prefix and cleanup checks.
`TMPDIR="$PWD/.data/gate/tmp" bun test tests/pipeline/deploy-azure.test.ts`: `5 pass`, `0 fail`, `20 expect() calls`, 79 ms. The archived-main result above proves the original failure.
Formatter and readability checks passed. Commit: `c8e08bbc`.

### Source-control driver completion

The full scratch run finished with 144 captures, light/dark at all four widths, no `failures.jsonl` and exit 0. Generic modal-background coverage messages remain in the raw log and are not treated as
geometry passes. Final merged-branch captures remain separate.

### Capture report

The old report contained historical counts and hard-coded commands. It now reads the current manifests and optionally compares unreachable-state identities with a baseline.
Synthetic CLI fixtures proved both branches: an existing failed state exits 0 (`1 images, 1 failed attempts, 0 new failed states`); a new failed state exits 1 (`1 images, 1 failed attempts, 1 new failed states`).
`bun --bun run check`: exit 0 (`capture-report-check.log`). Readability and the public documentation leak scan passed.

### Lineage truncation investigation

Three lane-B additions used CSS ellipsis in the dataset summary, lineage context and name-only card. The gate rule forbids those cuts. Removing the cuts and allowing wrapping passes the suite's
functional and geometry checks, including readable names, whole frames and native Walk clicks. Its final browser-error check failed on two React Flow parent-size warnings. This is not yet green;
the final merged run and baseline comparison must settle those warnings before delivery. Raw log: `lineage-unclipped.log`.

### Lane E boundary conflicts

`git merge --no-ff 007-lane-e` conflicted in `tests/footer-counts.test.ts` and `tests/theme-check.test.ts`. Neither test file appears in the plan's permitted shared-file list.
These are lane-boundary errors: C added Source footer/validation and dark YAML contrast coverage; E added Mall relationship isolation and non-red group-palette coverage. Both imports and both sets of
assertions are retained. No intent was dropped. The shared stylesheet/doc/sentinel edits merged mechanically.

`bun test tests/footer-counts.test.ts tests/theme-check.test.ts`: `23 pass`, `0 fail`, `98 expect() calls`, 511 ms. Merge commit: `1416dac2`.
`rg -n humanizeIdentifier src/app/graph/EntityName.tsx src/app/workspace/CatalogView.tsx`: A exports the function; E imports it directly; no temporary placeholder exists.

The five merge commits, in order, are A `f1398bf8`, B `6f632145`, C `5b13344c`, D `9d77dd22`, E `1416dac2`. E's complete checks passed: `bun test` 2102 pass, 0 fail, 130929 assertions in 287 files (294.46 s); `bun --bun run check` exit 0; `bun --bun run build` exit 0 (1.64 s).

### bun run test:ui

Exit 1; raw output `suite-ui.log`.

```text
  ariaSnapshot: "- complementary \"Workspace documents\":\n  - img \"Semantic Workbench\"\n  - button \"Add project\":\n    - img\n    - text: Add project\n  - text: LOCAL WORKSPACE\n  - button \"Model explorer\":\n    - img\n    - text: Model explorer\n  - button \"Source editor\":\n    - img\n    - text: Source editor\n  - button \"Source control 1 changed files\":\n    - img\n    - text: Source control 1\n  - text: PROJECTS 7\n  - tree \"Projects\":\n    - treeitem \"UBL business model\" [expanded]:\n      - button \"UBL business model\":\n        - img\n        - img\n        - text: UBL business model 6\n      - button \"Delete project UBL business model\"\n      - button \"Actions for UBL business model\":\n        - img\n      - group:\n        - treeitem \"ubl.odcs.yaml\" [selected]:\n          - button \"ubl.odcs.yaml\":\n            - img\n            - text: ubl.odcs.yaml\n          - button \"Delete ubl.odcs.yaml\"\n          - button \"Actions for ubl.odcs.yaml in UBL business model\":\n            - img\n          - text: ODCS\n        - treeitem \"ubl.ontology.yaml\":\n          - button \"ubl.ontology.yaml\":\n            - img\n            - text: ubl.ontology.yaml\n          - button \"Delete ubl.ontology.yaml\"\n          - button \"Actions for ubl.ontology.yaml in UBL business model\":\n            - img\n          - text: Ossie ontology · modified\n        - treeitem \"ubl.owl.ttl\":\n          - button \"ubl.owl.ttl\":\n            - img\n            - text: ubl.owl.ttl\n          - button \"Delete ubl.owl.ttl\"\n          - button \"Actions for ubl.owl.ttl in UBL business model\":\n            - img\n          - text: OWL\n        - treeitem \"ubl.semantic-mapping.yaml\":\n          - button \"ubl.semantic-mapping.yaml\":\n            - img\n            - text: ubl.semantic-mapping.yaml\n          - button \"Delete ubl.semantic-mapping.yaml\"\n          - button \"Actions for ubl.semantic-mapping.yaml in UBL business model\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"ubl.semantic.yaml\":\n          - button \"ubl.semantic.yaml\":\n            - img\n            - text: ubl.semantic.yaml\n          - button \"Delete ubl.semantic.yaml\"\n          - button \"Actions for ubl.semantic.yaml in UBL business model\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"ubl.shacl.ttl\":\n          - button \"ubl.shacl.ttl\":\n            - img\n            - text: ubl.shacl.ttl\n          - button \"Delete ubl.shacl.ttl\"\n          - button \"Actions for ubl.shacl.ttl in UBL business model\":\n            - img\n          - text: SHACL\n    - treeitem \"commerce\" [expanded]:\n      - button \"commerce\":\n        - img\n        - img\n        - text: commerce 1\n      - button \"Delete project commerce\"\n      - button \"Actions for commerce\":\n        - img\n      - group:\n        - treeitem \"commerce.owl\":\n          - button \"commerce.owl\":\n            - img\n            - text: commerce.owl\n          - button \"Delete commerce.owl\"\n          - button \"Actions for commerce.owl in commerce\":\n            - img\n          - text: OWL\n    - treeitem \"UBL 2.3 procurement-to-payment · 45 business entities\" [expanded]:\n      - button \"UBL 2.3 procurement-to-payment · 45 business entities\":\n        - img\n        - img\n        - text: UBL 2.3 procurement-to-payment · 45 business entities 1\n      - button \"Delete project UBL 2.3 procurement-to-payment · 45 business entities\"\n      - button \"Actions for UBL 2.3 procurement-to-payment · 45 business entities\":\n        - img\n      - group:\n        - treeitem \"roundtrip.ontology.yaml\":\n          - button \"roundtrip.ontology.yaml\":\n            - img\n            - text: roundtrip.ontology.yaml\n          - button \"Delete roundtrip.ontology.yaml\"\n          - button \"Actions for roundtrip.ontology.yaml in UBL 2.3 procurement-to-payment · 45 business entities\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"JSON round trip\" [expanded]:\n      - button \"JSON round trip\":\n        - img\n        - img\n        - text: JSON round trip 1\n      - button \"Delete project JSON round trip\"\n      - button \"Actions for JSON round trip\":\n        - img\n      - group:\n        - treeitem \"roundtrip.json\":\n          - button \"roundtrip.json\":\n            - img\n            - text: roundtrip.json\n          - button \"Delete roundtrip.json\"\n          - button \"Actions for roundtrip.json in JSON round trip\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"Batch valid\" [expanded]:\n      - button \"Batch valid\":\n        - img\n        - img\n        - text: Batch valid 2\n      - button \"Delete project Batch valid\"\n      - button \"Actions for Batch valid\":\n        - img\n      - group:\n        - treeitem \"batch-good.yaml\":\n          - button \"batch-good.yaml\":\n            - img\n            - text: batch-good.yaml\n          - button \"Delete batch-good.yaml\"\n          - button \"Actions for batch-good.yaml in Batch valid\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"batch-repaired.json\":\n          - button \"batch-repaired.json\":\n            - img\n            - text: batch-repaired.json\n          - button \"Delete batch-repaired.json\"\n          - button \"Actions for batch-repaired.json in Batch valid\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"retry\" [expanded]:\n      - button \"retry\":\n        - img\n        - img\n        - text: retry 1\n      - button \"Delete project retry\"\n      - button \"Actions for retry\":\n        - img\n      - group:\n        - treeitem \"retry.ttl\":\n          - button \"retry.ttl\":\n            - img\n            - text: retry.ttl\n          - button \"Delete retry.ttl\"\n          - button \"Actions for retry.ttl in retry\":\n            - img\n          - text: RDF\n    - treeitem \"Mapped commerce\" [expanded]:\n      - button \"Mapped commerce\":\n        - img\n        - img\n        - text: Mapped commerce 4\n      - button \"Delete project Mapped commerce\"\n      - button \"Actions for Mapped commerce\":\n        - img\n      - group:\n        - treeitem \"commerce.mapped-ontology.yaml\":\n          - button \"commerce.mapped-ontology.yaml\":\n            - img\n            - text: commerce.mapped-ontology.yaml\n          - button \"Delete commerce.mapped-ontology.yaml\"\n          - button \"Actions for commerce.mapped-ontology.yaml in Mapped commerce\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"commerce.mapped-semantic.yaml\":\n          - button \"commerce.mapped-semantic.yaml\":\n            - img\n            - text: commerce.mapped-semantic.yaml\n          - button \"Delete commerce.mapped-semantic.yaml\"\n          - button \"Actions for commerce.mapped-semantic.yaml in Mapped commerce\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"commerce.mapping.yaml\":\n          - button \"commerce.mapping.yaml\":\n            - img\n            - text: commerce.mapping.yaml\n          - button \"Delete commerce.mapping.yaml\"\n          - button \"Actions for commerce.mapping.yaml in Mapped commerce\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"commerce.odcs.yaml\":\n          - button \"commerce.odcs.yaml\":\n            - img\n            - text: commerce.odcs.yaml\n          - button \"Delete commerce.odcs.yaml\"\n          - button \"Actions for commerce.odcs.yaml in Mapped commerce\":\n            - img\n          - text: ODCS\n  - button \"2 grouping suggestions\":\n    - img\n    - text: 2 grouping suggestions\n  - button \"Trash\":\n    - img\n    - text: Trash\n  - button \"Settings\":\n    - img\n    - text: Settings\n  - text: Project folders · on your machine Your definitions stay local.\n- separator \"Resize sidebar\"\n- main:\n  - button \"Hide sidebar\" [expanded]:\n    - img\n  - heading \"ubl.odcs.yaml\" [level=1]\n  - text: UBL business model ODCS\n  - status \"Save state\": Saved to file · 1 uncommitted change\n  - button \"Commit\":\n    - img\n    - text: Commit\n  - button \"More actions\":\n    - img\n  - group \"Account\":\n    - button \"Person menu\"\n  - button \"Contract\":\n    - img\n    - text: Contract\n  - button \"Overview\":\n    - img\n    - text: Overview\n  - button \"Graph\":\n    - img\n    - text: Graph\n  - button \"Neighborhood\":\n    - img\n    - text: Neighborhood\n  - button \"Catalog\":\n    - img\n    - text: Catalog\n  - button \"Source\":\n    - img\n    - text: Source\n  - button \"Mappings\":\n    - img\n    - text: Mappings\n  - button \"Metrics 9\":\n    - img\n    - text: Metrics 9\n  - region \"Lineage graph\":\n    - group \"Lineage controls\":\n      - combobox:\n        - img\n        - textbox \"Find assets\":\n          - /placeholder: Find assets…\n      - button \"Fit\":\n        - img\n        - text: Fit\n      - button \"Full pierce\":\n        - img\n        - text: Full pierce\n      - text: \"Expand:\"\n      - radiogroup \"Pierce direction\":\n        - radio \"Outgoing\"\n        - radio \"Incoming\"\n        - radio \"Both\" [checked]\n      - button \"Undo expansion\" [disabled]:\n        - img\n      - 'button \"Group by: Suggested communities\"':\n        - img\n        - text: Suggested communities\n        - img\n      - group \"View options\":\n        - group \"Show\":\n          - button \"Metrics\" [pressed]\n          - button \"Other contracts\" [pressed]\n    - group \"Foreign-key hops\":\n      - text: Hops\n      - group \"How far to follow foreign keys\":\n        - button \"1 hop\" [pressed]: \"1\"\n        - button \"2 hops\": \"2\"\n        - button \"3 hops\": \"3\"\n      - text: party · 22 connected tables 1 hop\n      - button \"Foreign keys (93)\"\n    - button \"Back\" [disabled]:\n      - img\n    - button \"Forward\" [disabled]:\n      - img\n    - list:\n      - listitem:\n        - button \"party\"\n    - group \"Viewport\":\n      - button \"Zoom out\":\n        - img\n      - button \"Zoom in\":\n        - img\n      - button \"Full screen\":\n        - img\n    - application:\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#purchase_order\": purchase_order.quotation_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#purchase_order\": purchase_order.originator_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.originator_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#purchase_order\": purchase_order.freight_forwarder_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#invoice\": invoice.accounting_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#invoice\": invoice.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#invoice\": invoice.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#invoice\": invoice.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice\": invoice.payee_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice\": invoice.tax_representative_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#credit_note\": credit_note.accounting_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#credit_note\": credit_note.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#credit_note\": credit_note.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#credit_note\": credit_note.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note\": credit_note.payee_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note\": credit_note.tax_representative_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#party__person\": party__person.source_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#party\": party.postal_address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#party\": party.physical_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#party\": party.contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#party\": party.agent_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#financial_account to object:ubl.odcs.yaml#party\": party.financial_account_id → financial_account.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#customer_party\": customer_party.party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.delivery_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.accounting_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.buyer_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#supplier_party\": supplier_party.party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.despatch_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.accounting_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.seller_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#location\": location.address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#item__manufacturer_party\": item__manufacturer_party.source_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#item__manufacturer_party\": item__manufacturer_party.target_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#item\": item.catalogue_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#item\": item.information_content_provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#line_item\": line_item.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#line_item\": line_item.warranty_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#line_item\": line_item.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#delivery to object:ubl.odcs.yaml#delivery__notify_party\": delivery__notify_party.source_id → delivery.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery__notify_party\": delivery__notify_party.target_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#delivery\": delivery.delivery_address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#delivery\": delivery.delivery_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#delivery\": delivery.alternative_delivery_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery\": delivery.carrier_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery\": delivery.delivery_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#consignment\": \"17\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#transportation_service to object:ubl.odcs.yaml#consignment\": \"2\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#consignment\": \"9\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.loading_proof_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.owner_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.operating_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.loading_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.unloading_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.storage_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#transport_means to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.applicable_transport_means_id → transport_means.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#delivery to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.delivery_id → delivery.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice_line\": invoice_line.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#invoice_line\": invoice_line.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note_line\": credit_note_line.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#credit_note_line\": credit_note_line.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#document_reference\": document_reference.issuer_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transportation_service\": transportation_service.responsible_transport_service_provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_means\": transport_means.owner_party_id → party.record_id\n      - group:\n        - group \"Table party\":\n          - button \"party center\":\n            - strong: party\n            - emphasis: center\n      - group:\n        - group \"Table purchase_order\":\n          - button \"purchase_order\":\n            - strong: purchase_order\n      - group:\n        - group \"Table invoice\":\n          - button \"invoice\":\n            - strong: invoice\n      - group:\n        - group \"Table credit_note\":\n          - button \"credit_note\":\n            - strong: credit_note\n      - group:\n        - group \"Table party__person\":\n          - button \"party__person\":\n            - strong: party__person\n      - group:\n        - group \"Table customer_party\":\n          - button \"customer_party\":\n            - strong: customer_party\n      - group:\n        - group \"Table supplier_party\":\n          - button \"supplier_party\":\n            - strong: supplier_party\n      - group:\n        - group \"Table item__manufacturer_party\":\n          - button \"item__manufacturer_party\":\n            - strong: item__manufacturer_party\n      - group:\n        - group \"Table item\":\n          - button \"item\":\n            - strong: item\n      - group:\n        - group \"Table line_item\":\n          - button \"line_item\":\n            - strong: line_item\n      - group:\n        - group \"Table delivery__notify_party\":\n          - button \"delivery__notify_party\":\n            - strong: delivery__notify_party\n      - group:\n        - group \"Table delivery\":\n          - button \"delivery\":\n            - strong: delivery\n      - group:\n        - group \"Table consignment\":\n          - button \"consignment\":\n            - strong: consignment\n      - group:\n        - group \"Table transport_equipment\":\n          - button \"transport_equipment\":\n            - strong: transport_equipment\n      - group:\n        - group \"Table invoice_line\":\n          - button \"invoice_line\":\n            - strong: invoice_line\n      - group:\n        - group \"Table credit_note_line\":\n          - button \"credit_note_line\":\n            - strong: credit_note_line\n      - group:\n        - group \"Table document_reference\":\n          - button \"document_reference\":\n            - strong: document_reference\n      - group:\n        - group \"Table transportation_service\":\n          - button \"transportation_service\":\n            - strong: transportation_service\n      - group:\n        - group \"Table transport_means\":\n          - button \"transport_means\":\n            - strong: transport_means\n      - group:\n        - group \"Table address\":\n          - button \"address\":\n            - strong: address\n      - group:\n        - group \"Table location\":\n          - button \"location\":\n            - strong: location\n      - group:\n        - group \"Table contact\":\n          - button \"contact\":\n            - strong: contact\n      - group:\n        - group \"Table financial_account\":\n          - button \"financial_account\":\n            - strong: financial_account\n      - img\n      - link \"React Flow attribution\":\n        - /url: https://reactflow.dev/attribution\n        - text: React Flow\n    - group:\n      - list \"Legend\":\n        - listitem:\n          - img\n          - text: Table\n        - listitem: \"Card tint: application grouping\"\n        - listitem: PK Primary key\n        - listitem: FK Points to another table\n        - listitem: 5 Several links in one line\n        - listitem: Foreign key\n        - listitem: Feeds\n    - text: Links follow the names declared in this contract.\n  - img\n  - text: Structure checked\n  - button \"Validation details\"\n  - text: 169 entities · 401 relationships",
},

      at captureRawStack (./node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (./node_modules/playwright/lib/matchers/expect.js:13316:57)
      at expectResolvedBindings (./scripts/helpers/mapping-bindings.ts:6:61)
      at ./scripts/ui-tests.ts:464:11
      at check (./scripts/ui-tests.ts:46:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:ui" exited with code 1
```


### Complete text and integrated canvas geometry

The existing card geometry, row ports and semantic edge set remain the layout contract. Compact names must stay whole at the existing nine-pixel minimum.
Only compact reaches whose layered fit cannot hold the full wrapped names use the existing ELK box algorithm; detailed cards retain layered routes.
Expansion placement remains incremental: an attempted relayout of existing expansion cards failed the stability assertion and was removed.
Packed links use the empty row and column gutters, retaining every original endpoint. No text is shortened to satisfy geometry.

- `bun test tests/lineage-view.test.ts`: 10 pass, 0 fail, 33 assertions, 82 ms (`packing-unit.log`); rerun after routing: `packing-final-unit.log`.
- `bun scripts/lineage-mutation-cases.ts`: exit 0 (`packing-case.log`). Two packing predicate mutants were added to the existing registry.
- `bun --bun run check`: exit 0 (`packing-routes-check.log`); final CSS follow-up: `packing-final-check.log`.
- `python3 <readable-code>/scripts/readable_check.py --changed <changed code files>`: exit 0.
- `bun .data/gate/measure-lineage.ts`: four widths, 19 compact names each, zero text rectangles outside their cards (`lineage-final-geometry.log`).
  The phone and 1280-pixel screenshots were opened: all names wrap, the full reach is visible, and the summary/back action share one row.
- `bun .data/gate/measure-ubl.ts`: diagnostic UBL expansion exposed six overflowing names with a one-column compact pack.
  Keeping the compact pack's aspect ratio at least square preserves room for complete wrapped names (`ubl-pack-debug4.log`).
- `bun run test:lineage`: intermediate failures and fixes are retained in `lineage-complete-names.log`, `lineage-packed-final.log`, `lineage-packed-final2.log`,
  `lineage-frozen.log`, `lineage-preserve-expansion.log`, and `lineage-routed-packing.log`.
  The first exposed overflowing full names; the second attempt moved existing cards and was reverted; the third exposed links crossing cards and led to gutter routing.
  The next run passed full-text, four-width geometry and stable expansion checks, but found only 280 px of visible dataset canvas.
  The compact dataset header now puts All tables beside the summary and keeps a 300 px minimum stage. Final suite result remains pending.
- `bun run test:responsive`: the first run passed the resize/lineage checks, then found unequal catalog row heights after complete descriptions were restored.
  Grid items now stretch to their row height, preserving every description (`suite-responsive.log`). The final rerun is in `suite-responsive-complete-text.log`.
- `bun run test:ui`: the first run was invalidated by Vite reloading regenerated validators during another command's build (`suite-ui.log`).
  Frozen rerun: 20 UI checks passed, no browser runtime errors (`suite-ui-frozen.log`).
- Archived `e8b7d69`, `bun run test:ui`: 20 UI checks passed (`main-suite-ui-valid-root.log`). The invalidated merged run is not claimed as a main failure.
  An earlier archived-root configuration returned HTTP 404 and was corrected before the valid comparison (`main-suite-ui.log`, `main-smoke.log`).
- `bun scripts/mutation-tests.ts`: all ordinary mutants, including example-registry, ran before the UI phase failed at the unconfigured default frontend port 5173 (`mutation-final.log`).
  Rerun uses `SW_BASE_URL=http://127.0.0.1:5261` (`mutation-assigned-port.log`); no deadline or assertion was relaxed.
- `bun --bun run build`: exit 0, built in 1.87 s (`frozen-build.log`). Builds rewrite validators and trigger Vite reloads; the suite driver is paused during captures.

### Changelog assembly

`CHANGELOG.md` Unreleased contains the five lane fragments and their font foundation entry; the fragment folder was deleted in `dc829ba8`.
Historical release counts remain attached to their named releases. Current mapping hops match `MAX_HOPS = 3`.
`rg -n 'one to five|Dry run|first view shows every entity' docs README.md` found only the intended architecture SVG Dry run label.
`bun --bun run check` and the public-document leak scanner passed for this step.

### Capture restart

The first partial local-light run was interrupted when the full lineage suite found the expansion-placement regression.
Its partial images will be replaced, not accepted as final evidence. Capture and browser fixtures use isolated temporary data and the assigned frontend or dynamic listener ports.

### bun run test:edges

Exit 0; raw output `suite-edges.log`.

```text
$ bun scripts/edge-attachment-ui-tests.ts
PASS network graph path endpoints attach to actual entity borders
PASS zoomed worker routes attach after hover and selection
PASS individual entity dragging preserves endpoints
PASS parent area dragging preserves child edge attachment
PASS layered and network layout changes preserve attachment
PASS browser has no runtime errors
6 edge attachment UI checks passed
```

### bun run test:grouping-validation

Exit 0; raw output `suite-grouping-validation.log`.

```text
$ bun scripts/grouping-validation-ui-tests.ts
PASS Flights grouping modes state provenance honestly and retain all graph connections
PASS grouping corrections persist across views, documents and reload without rewriting source
PASS UBL grouping provenance remains explicit and source exports remain unchanged
PASS contracts and semantic models group into communities; lineage cards carry the group tint
PASS invalid source highlights the precise feature and finding action selects its offending line
PASS mixed import repair highlights and locates the faulty file without modifying saved documents
PASS fixture exports preserve the exact upstream source of every fixture
PASS browser has no uncaught runtime errors
8 grouping and validation UI checks passed
```

### bun run test:examples:ui

Exit 1; raw output `suite-examples-ui.log`.

```text
232 |     await page.screenshot({ path: '<temporary directory>/workbench-mapping-chains.png' });
233 |     await page.setViewportSize({ width: 390, height: 844 });
234 |     const e2 = (await page.locator('.mapping-bindings').boundingBox())!;
235 |     const k2 = (await page.locator('.mapping-concepts').boundingBox())!;
236 |     expect(k2.y).toBeLessThan(e2.y);
                 ^
TypeError: null is not an object (evaluating 'k2.y')
      at <anonymous> (./scripts/examples-ui-tests.ts:236:12)
      at async check (./scripts/examples-ui-tests.ts:36:9)

Bun v1.4.0 (Linux x64)
error: script "test:examples:ui" exited with code 1
```

### bun run test:graph

Exit 1; raw output `suite-graph.log`.

```text
  timeout: 5000,
  ariaSnapshot: "- complementary \"Workspace documents\":\n  - img \"Semantic Workbench\"\n  - button \"Add project\":\n    - img\n    - text: Add project\n  - text: LOCAL WORKSPACE\n  - button \"Model explorer\":\n    - img\n    - text: Model explorer\n  - button \"Source editor\":\n    - img\n    - text: Source editor\n  - button \"Source control\":\n    - img\n    - text: Source control\n  - text: PROJECTS 3\n  - tree \"Projects\":\n    - treeitem \"UBL business model\" [expanded]:\n      - button \"UBL business model\":\n        - img\n        - img\n        - text: UBL business model 6\n      - button \"Delete project UBL business model\"\n      - button \"Actions for UBL business model\":\n        - img\n      - group:\n        - treeitem \"ubl.odcs.yaml\":\n          - button \"ubl.odcs.yaml\":\n            - img\n            - text: ubl.odcs.yaml\n          - button \"Delete ubl.odcs.yaml\"\n          - button \"Actions for ubl.odcs.yaml in UBL business model\":\n            - img\n          - text: ODCS\n        - treeitem \"ubl.ontology.yaml\":\n          - button \"ubl.ontology.yaml\":\n            - img\n            - text: ubl.ontology.yaml\n          - button \"Delete ubl.ontology.yaml\"\n          - button \"Actions for ubl.ontology.yaml in UBL business model\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"ubl.owl.ttl\":\n          - button \"ubl.owl.ttl\":\n            - img\n            - text: ubl.owl.ttl\n          - button \"Delete ubl.owl.ttl\"\n          - button \"Actions for ubl.owl.ttl in UBL business model\":\n            - img\n          - text: OWL\n        - treeitem \"ubl.semantic-mapping.yaml\":\n          - button \"ubl.semantic-mapping.yaml\":\n            - img\n            - text: ubl.semantic-mapping.yaml\n          - button \"Delete ubl.semantic-mapping.yaml\"\n          - button \"Actions for ubl.semantic-mapping.yaml in UBL business model\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"ubl.semantic.yaml\":\n          - button \"ubl.semantic.yaml\":\n            - img\n            - text: ubl.semantic.yaml\n          - button \"Delete ubl.semantic.yaml\"\n          - button \"Actions for ubl.semantic.yaml in UBL business model\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"ubl.shacl.ttl\":\n          - button \"ubl.shacl.ttl\":\n            - img\n            - text: ubl.shacl.ttl\n          - button \"Delete ubl.shacl.ttl\"\n          - button \"Actions for ubl.shacl.ttl in UBL business model\":\n            - img\n          - text: SHACL\n    - treeitem \"Shopping center administration\" [expanded]:\n      - button \"Shopping center administration\":\n        - img\n        - img\n        - text: Shopping center administration 7\n      - button \"Delete project Shopping center administration\"\n      - button \"Actions for Shopping center administration\":\n        - img\n      - group:\n        - treeitem \"mall-data.ttl\":\n          - button \"mall-data.ttl\":\n            - img\n            - text: mall-data.ttl\n          - button \"Delete mall-data.ttl\"\n          - button \"Actions for mall-data.ttl in Shopping center administration\":\n            - img\n          - text: RDF\n        - treeitem \"mall.mapping.yaml\":\n          - button \"mall.mapping.yaml\":\n            - img\n            - text: mall.mapping.yaml\n          - button \"Delete mall.mapping.yaml\"\n          - button \"Actions for mall.mapping.yaml in Shopping center administration\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"mall.odcs.yaml\":\n          - button \"mall.odcs.yaml\":\n            - img\n            - text: mall.odcs.yaml\n          - button \"Delete mall.odcs.yaml\"\n          - button \"Actions for mall.odcs.yaml in Shopping center administration\":\n            - img\n          - text: ODCS\n        - treeitem \"mall.ontology.yaml\":\n          - button \"mall.ontology.yaml\":\n            - img\n            - text: mall.ontology.yaml\n          - button \"Delete mall.ontology.yaml\"\n          - button \"Actions for mall.ontology.yaml in Shopping center administration\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"mall.owl.ttl\":\n          - button \"mall.owl.ttl\":\n            - img\n            - text: mall.owl.ttl\n          - button \"Delete mall.owl.ttl\"\n          - button \"Actions for mall.owl.ttl in Shopping center administration\":\n            - img\n          - text: OWL\n        - treeitem \"mall.semantic.yaml\":\n          - button \"mall.semantic.yaml\":\n            - img\n            - text: mall.semantic.yaml\n          - button \"Delete mall.semantic.yaml\"\n          - button \"Actions for mall.semantic.yaml in Shopping center administration\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"mall.shacl.ttl\":\n          - button \"mall.shacl.ttl\":\n            - img\n            - text: mall.shacl.ttl\n          - button \"Delete mall.shacl.ttl\"\n          - button \"Actions for mall.shacl.ttl in Shopping center administration\":\n            - img\n          - text: SHACL\n    - treeitem \"Commerce scale data\" [expanded]:\n      - button \"Commerce scale data\":\n        - img\n        - img\n        - text: Commerce scale data 1\n      - button \"Delete project Commerce scale data\"\n      - button \"Actions for Commerce scale data\":\n        - img\n      - group:\n        - treeitem \"commerce-scale.ttl\" [selected]:\n          - button \"commerce-scale.ttl\":\n            - img\n            - text: commerce-scale.ttl\n          - button \"Delete commerce-scale.ttl\"\n          - button \"Actions for commerce-scale.ttl in Commerce scale data\":\n            - img\n          - text: RDF\n  - button \"Trash\":\n    - img\n    - text: Trash\n  - button \"Settings\":\n    - img\n    - text: Settings\n  - text: Project folders · on your machine Your definitions stay local.\n- separator \"Resize sidebar\"\n- main:\n  - button \"Hide sidebar\" [expanded]:\n    - img\n  - heading \"commerce-scale.ttl\" [level=1]\n  - text: Commerce scale data RDF\n  - status \"Save state\": Saved to file · 0 uncommitted changes\n  - button \"Commit\" [disabled]:\n    - img\n    - text: Commit\n  - button \"More actions\":\n    - img\n  - group \"Account\":\n    - button \"Person menu\"\n  - button \"Overview\":\n    - img\n    - text: Overview\n  - button \"Graph\":\n    - img\n    - text: Graph\n  - button \"Neighborhood\":\n    - img\n    - text: Neighborhood\n  - button \"Catalog\":\n    - img\n    - text: Catalog\n  - button \"Source\":\n    - img\n    - text: Source\n  - button \"Mappings\":\n    - img\n    - text: Mappings\n  - button \"Metrics\":\n    - img\n    - text: Metrics\n  - img\n  - textbox:\n    - /placeholder: Find an entity…\n  - combobox:\n    - img\n    - textbox \"Find a center\":\n      - /placeholder: \"Center: Customer 10000\"\n  - button \"150 entities, Fit\"\n  - status \"Neighbor counts\":\n    - text: 12 of 13 neighbors ·\n    - strong: 1 hidden\n  - button \"1 more neighbor\"\n  - button \"Full pierce\":\n    - img\n    - text: Full pierce\n  - text: \"Expand:\"\n  - radiogroup \"Pierce direction\":\n    - radio \"Outgoing\"\n    - radio \"Incoming\"\n    - radio \"Both\" [checked]\n  - button \"Undo expansion\":\n    - img\n  - button \"Zoom out\":\n    - img\n  - button \"Zoom in\":\n    - img\n  - group \"View options\":\n    - group \"Neighbors\":\n      - text: Relationship\n      - combobox \"Filter neighbors by relationship\":\n        - option \"All (14)\" [selected]\n        - option \"placedBy (2)\"\n        - option \"soldTo (2)\"\n        - option \"billedTo (1)\"\n        - option \"lastInvoice (1)\"\n        - option \"lastPayment (1)\"\n        - option \"lastShipment (1)\"\n        - option \"paidBy (1)\"\n        - option \"places (1)\"\n        - option \"preferredProduct (1)\"\n        - option \"purchasedBy (1)\"\n        - option \"recipient (1)\"\n        - option \"serves (1)\"\n      - button \"Links between neighbors (6)\" [pressed]\n    - group \"Show\":\n      - button \"Labels\"\n    - group \"Layout\":\n      - button \"Re-arrange\"\n  - button \"Enter full screen\":\n    - img\n  - navigation \"Walk\":\n    - button \"Back\":\n      - img\n    - button \"Forward\" [disabled]:\n      - img\n    - list:\n      - listitem:\n        - button \"Customer 10000\"\n      - listitem:\n        - text: ›\n        - button \"All connected to Customer 10000\"\n  - status:\n    - text: 150 entities shown in 3 steps ·\n    - strong: 850 more reachable\n    - button \"Expand further\"\n  - application:\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#product_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#payment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_174 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_87 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_35 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_48 to https://example.org/commerce#payment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_61 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#line_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#warehouse_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_13 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_35 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_48 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_61 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_78 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#line_113\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_113 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_148 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_161 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_178 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_35 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_48 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_48 to https://example.org/commerce#warehouse_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#product_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#warehouse_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_87 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_96 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_100 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_135 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_148 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_174 to https://example.org/commerce#order_174\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_187 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_196 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#warehouse_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#line_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#order_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_35 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#order_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_61 to https://example.org/commerce#line_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_74 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_9 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_22 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_35 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#order_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#customer_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#warehouse_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#product_91\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_74 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_87 to https://example.org/commerce#product_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_4 to https://example.org/commerce#order_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_4 to https://example.org/commerce#customer_17\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_9 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_13 to https://example.org/commerce#payment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_22 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#order_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#customer_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#payment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#line_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#shipment_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_35 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_48 to https://example.org/commerce#line_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_61 to https://example.org/commerce#payment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#order_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#payment_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#line_126\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#shipment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_9 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_22 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_26 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_35 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#invoice_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#customer_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#order_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#line_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#shipment_91\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_48 to https://example.org/commerce#line_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_74 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_35 to https://example.org/commerce#line_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_39 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#shipment_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_74 to https://example.org/commerce#order_100\"\n    - group:\n      - img\n      - text: Center Customer\n      - strong: Customer 10000\n      - text: 1 field\n    - group:\n      - text: Invoice\n      - strong: Invoice 10026\n      - text: 1 field\n      - button \"Expand Invoice 10026\":\n        - img\n      - button \"Walk to Invoice 10026\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Invoice\n      - strong: Invoice 10087\n      - text: 1 field\n      - button \"Expand Invoice 10087\":\n        - img\n      - button \"Walk to Invoice 10087\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Product\n      - strong: Monitor arm · SKU 10013\n      - text: 1 field\n      - button \"Expand Monitor arm · SKU 10013\":\n        - img\n      - button \"Walk to Monitor arm · SKU 10013\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Product\n      - strong: Monitor arm · SKU 10048\n      - text: 1 field\n      - button \"Expand Monitor arm · SKU 10048\":\n        - img\n      - button \"Walk to Monitor arm · SKU 10048\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order\n      - strong: Order 10000\n      - text: 1 field\n      - button \"Expand Order 10000\":\n        - img\n      - button \"Walk to Order 10000\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order\n      - strong: Order 10100\n      - text: 1 field\n      - button \"Expand Order 10100\":\n        - img\n      - button \"Walk to Order 10100\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order line\n      - strong: OrderLine 10074\n      - text: 1 field\n      - button \"Expand OrderLine 10074\":\n        - img\n      - button \"Walk to OrderLine 10074\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Payment\n      - strong: Payment 10039\n      - text: 1 field\n      - button \"Expand Payment 10039\":\n        - img\n      - button \"Walk to Payment 10039\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Shipment\n      - strong: Shipment 10052\n      - text: 1 field\n      - button \"Expand Shipment 10052\":\n        - img\n      - button \"Walk to Shipment 10052\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Shipment\n      - strong: Shipment 10087\n      - text: 1 field\n      - button \"Expand Shipment 10087\":\n        - img\n      - button \"Walk to Shipment 10087\":\n        - img\n        - text: Walk here\n    - img\n    - link \"React Flow attribution\":\n      - /url: https://reactflow.dev/attribution\n      - text: React Flow\n  - img\n  - text: Structure checked\n  - button \"Validation details\"\n  - text: 1000 entities · 5000 relationships",
},

      at captureRawStack (./node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (./node_modules/playwright/lib/matchers/expect.js:13316:57)
      at ./scripts/graph-browser-check.ts:452:60
      at check (./scripts/graph-browser-check.ts:47:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:graph" exited with code 1
```

### bun run test:odcs

Exit 1; raw output `suite-odcs.log`.

```text
  name: "toBeLessThanOrEqual",
},

      at captureRawStack (./node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (./node_modules/playwright/lib/matchers/expect.js:13316:57)
      at checkDatasetLineageWidth (./scripts/helpers/odcs-graph-review.ts:34:43)
      at ./scripts/odcs-browser-check.ts:160:11
      at check (./scripts/odcs-browser-check.ts:55:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:odcs" exited with code 1
```

### bun run test:mapping-graph

Exit 0; raw output `suite-mapping-graph.log`.

```text
PASS selecting a concept (Region) emphasises its mappings, dims the rest, and lists its bindings with Edit item (0.3 s)
PASS link Order.customer → Customer is labelled and passes through orders.customer_id and customers.customer_id (7.5 s)
PASS Unmapped only: unmapped concepts and fields carry the badge; the filter leaves only them (2.8 s)
PASS warning markers: a resolver finding shows on the affected card with its message and Edit item (2.9 s)
PASS Expand, Collapse and Show all connected work on the mapping canvas: Show all connected from Customer opens exactly the cards its mappings reach (3.6 s)
PASS Flights standalone: drawn lines are the resolver bindings (5.7 s)
PASS Flights consolidated: the same mapping graph for the embedded mappings, and Ontology graph switches to the entity graph (1.6 s)
PASS billing: drawn lines are the resolver bindings (4.9 s)
PASS shopping center: KPI bindings as metric cards, measures solid and of dashed (11.5 s)
PASS readable first view: whole cards retain names at least 9 px at 1280×720 and 1440×900 (5.4 s)
PASS no browser errors (0.0 s)
12 mapping graph checks passed on isolated data root ./.data/gate/tmp/workbench-browser-rKtMkw.
```

### bun run test:scm

Exit 0; raw output `suite-scm.log`.

```text
PASS the Remote dialog starts on the address field; Escape returns to Remote… (0.1 s)
PASS file history: compare two versions of a file (0.3 s)
PASS waiting for credentials: the panel says so and Cancel stops the operation (0.5 s)
PASS Admin → Git remotes sets and removes a local bare remote (1.1 s)
PASS feedback about a remote ends when the remote is removed (0.9 s)
PASS Admin → Git remotes explains an empty workspace and leads back to Add project (1.1 s)
10:30:33 ERROR http.request requestId=98bf020c-340f-4db0-bb02-155f2511a569 actor=local method=GET route=/api/projects/:slug/git/log status=500 durationMs=1
PASS missing Git: the banner explains it, the panel says so, editing and saving still work (3.8 s)
PASS the panel and its remote actions fit at 390, 1280, 1440 and 2560 px (1.4 s)
PASS read access replaces commit and branch creation controls (0.9 s)
PASS no browser errors (0.0 s)
20 source-control checks passed on isolated data root ./.data/gate/tmp/workbench-browser-0fxQNE.
```

### bun run test:editor

Exit 0; raw output `suite-editor.log`.

```text
PASS a finding appears inline within 500 ms of a typing pause, with gutter marker and message; fixing it clears it
PASS a CRLF/mixed-ending file: one edited line changes only that line, and the save sends a patch
PASS the import-repair dialog uses the same editor: findings, Go to line from the report, repair and import
PASS keyboard: the editor is reachable by Tab with its accessible name; search opens with Ctrl+F
  1153 ms for 39 keystrokes (30 ms each)
  in the page: 35.5 ms mean per key without a save running
PASS typing in a 1.9 MB file stays responsive
  no save running: 425 ms wall clock for 39 keystrokes; in the page 44.9 ms mean per key, longest task 0 ms
  automatic save in flight: 375 ms wall clock for 39 keystrokes; in the page 18.3 ms mean per key, longest task 0 ms
PASS typing in a 1.9 MB file stays responsive to each keystroke while an automatic save runs
PASS no browser errors
10 editor checks passed on isolated data root ./.data/gate/tmp/workbench-browser-JQLEFf.
```

### bun run test:validation

Exit 0; raw output `suite-validation.log`.

```text
$ bun scripts/validation-browser-check.ts
PASS invalid Source draft keeps its header state and one located message
{"errors":[]}
```

### bun run test:theme

Exit 1; raw output `suite-theme.log`.

```text
  "      - element is visible, enabled and stable", "      - scrolling into view if needed",
  "      - done scrolling", "      - <div role=\"status\" class=\"full-graph-loading\">Arranging 4 graph nodes…</div> intercepts pointer events",
  "    - retrying click action", "      - waiting 100ms", "    - waiting for element to be visible, enabled and stable",
  "  - element was detached from the DOM, retrying"
],

      at accentCheck (./scripts/theme-browser-check.ts:53:78)
      at check (./scripts/theme-browser-check.ts:20:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:theme" exited with code 1
```

### bun run test:dialogs

Exit 0; raw output `suite-dialogs.log`.

```text
$ bun scripts/dialogs-browser-check.ts
PASS Commit: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Validation details: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Add concept: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Grouping suggestions: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Import: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS New file: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS View definition: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Trash: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS menus: opaque, inside the window and reachable at four sizes
9 dialog checks passed at six viewports on isolated data root ./.data/gate/tmp/workbench-browser-QKj32f.
```

### bun run test:metrics

Exit 1; raw output `suite-metrics.log`.

```text
  timeout: 5000,
  ariaSnapshot: undefined,
},

      at captureRawStack (./node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (./node_modules/playwright/lib/matchers/expect.js:13316:57)
      at ./scripts/metrics-browser-check.ts:253:57
      at check (./scripts/metrics-browser-check.ts:111:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:metrics" exited with code 1
```

### bun run test:trash

Exit 0; raw output `suite-trash.log`.

```text
PASS the row icon runs the same confirmation, undo and trash flow for a single file
PASS rows never overlap or run under the icons at 390 px and 2560 px; touch shows the icons without hover
PASS a mapping imported on its own is suggested for Flights with evidence, and accepting moves it
PASS a dismissed suggestion is not offered again
PASS delete names the file, warns about unsaved edits and broken references; Cancel keeps it
PASS confirmed delete updates every view; Undo within 10 s restores the exact file
PASS after the undo window the file is restored from the trash, and another is purged
PASS deleting a project removes it with its history; restore from the trash brings it back
PASS Clear empties the workspace; Undo brings every project back
PASS Clear again, then empty the trash with confirmation
PASS no page reload and no browser errors
13 trash checks passed on isolated data root ./.data/gate/tmp/workbench-browser-WajKpG.
```

### bun run test:projects

Exit 0; raw output `suite-projects.log`.

```text
$ bun scripts/projects-browser-check.ts
PASS sidebar tree lists projects with their files, types and validity
PASS an invalid file opens in Source for repair
  external edit visible after 396 ms
PASS an external edit appears in the open tab within 2 s without a reload
PASS a save based on an older version is rejected with both versions shown (two tabs)
PASS deleting the cache and restarting restores projects, files, view settings and drafts
PASS export project downloads a zip that imports back byte-exact
PASS the selected project is the context: fallbacks and Import stay in it, never in another project
PASS New file creates each kind in an empty project, opens it and validates
8 project checks passed on isolated data root ./.data/gate/tmp/workbench-browser-XXoTDc.
```

### bun run test:sidebar

Exit 1; raw output `suite-sidebar.log`.

```text
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at openPage (./scripts/sidebar-layout-browser-check.ts:24:14)
      at ./scripts/sidebar-layout-browser-check.ts:109:28
      at check (./scripts/sidebar-layout-browser-check.ts:15:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:sidebar" exited with code 1
```

### bun run test:mappings-layout

Exit 1; raw output `suite-mappings-layout.log`.

```text
59167 |     e = Object.assign(new PlaywrightError(error.error.message), { name: error.error.name });
                                  ^
error: goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5261/
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at ./node_modules/playwright-core/lib/coreBundle.js:59167:27

Bun v1.4.0 (Linux x64)
error: script "test:mappings-layout" exited with code 1
```

### bun run test:back-history

Exit 1; raw output `suite-back-history.log`.

```text
59167 |     e = Object.assign(new PlaywrightError(error.error.message), { name: error.error.name });
                                  ^
error: goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5261/
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at ./node_modules/playwright-core/lib/coreBundle.js:59167:27

Bun v1.4.0 (Linux x64)
error: script "test:back-history" exited with code 1
```

### Browser action readiness

The whole-graph loading overlay already marks unfinished layout, and Expand all is disabled while that work is pending.
The shared browser driver tested that disabled state immediately after switching graphs and could skip the expansion entirely.
The driver will wait for the existing loading indicator before deciding whether expansion is needed and after requesting it.
Existing timeouts and assertions remain unchanged; metrics and theme checks exercise the same entry point.

### Mapping disclosure selection

Resolved bindings now open by default, as the lane-E change requires. Native disclosure toggles still let the reader close the current evidence.
Selecting a different concept must open that concept's evidence, the behavior already required by the examples browser suite.
A stable key per selected concept resets only that disclosure when selection changes; ordinary renders preserve the reader's open/closed choice.

### Resume after external memory stop

The owner confirmed the previous run was stopped externally because other sessions exhausted machine memory. Interrupted commands and connection-refused results remain recorded, but are not accepted as product failures or passes.
All five pending edits are retained: the examples checks follow the approved phone detail view and humanized type label; the graph driver waits for existing layout readiness; mapping evidence resets on a new concept; this journal preserves results; the merge/changelog checkboxes reflect completed commits.
The resumed gate runs one browser or capture script at a time, checks `free -g` before each heavy step, waits below 8 GB available, and verifies that its frontend, API and browser processes exit before the next step.
`bun scripts/mutation-tests.ts` with the assigned frontend completed before the stop: `679/679 targeted mutants killed; all unmodified module baselines passed.` The two new packing mutants were detected.
`bun run test:lineage`: `26 lineage checks passed`, including four readable Walk targets, stable expansion, complete names and no browser errors (`suite-lineage-private-cache.log`).
`bun run test:odcs`: `10 ODCS checks passed`, including the dataset/header alignment (`suite-odcs-aligned-summary.log`).
`bun .data/gate/mall-canvas.ts`: Mall ODCS canvas at 1280×720 is 954×424 px; required minimum is 421 px. The original 407 px regression is fixed.
The full unit attempt reported 2102 pass / 1 timeout in the unchanged audit append benchmark under machine pressure. Focused reruns passed on both archived main (6 tests, 1018 assertions, 5.22 s) and merged code (6 tests, 1018 assertions, 4.85 s). A final serial full run remains required.

### Pending edits completed on serial resume

All five pending edits were retained. The evidence and task status updates are committed in `c9bb867b`.
The examples driver now checks the approved phone detail navigation and humanized catalog label, waits for example loading to finish,
and verifies that manually closed evidence reopens for a newly selected concept. The disclosure key changes only on concept selection.
The shared graph driver waits for the existing layout indicator before and after expansion, without changing timeouts.

- `python3 .data/gate/serial-step.py examples-listen-debug bun run test:examples:ui`: exit 0; `19 example UI checks passed; no browser runtime errors.`
- `free -g`: 25 GB available before that browser step; 24 GB before the following check.
- `bunx --bun oxfmt scripts/examples-ui-tests.ts scripts/helpers/graph-options.ts src/app/mappings/MappingExplorer.tsx`: finished on 3 files.
- `bun --bun run check`: exit 0; all 1044 matched files formatted; lint, comment, theme and brand checks passed.
- `python3 <readable-code>/scripts/readable_check.py --changed scripts/examples-ui-tests.ts scripts/helpers/graph-options.ts src/app/mappings/MappingExplorer.tsx`: exit 0.
- Process cleanup: `OWNED_PROCESSES_REMAINING []`; no gate frontend or API listener remains.

Frontend startup attempts `examples-current-labels`, `examples-final`, `examples-capped`, `examples-api-launch`,
`examples-fresh-cache` and `examples-start-debug` did not reach browser execution. Their driver logs preserve readiness timeouts or explicit diagnostic stops.
Direct Vite API startup with an isolated cache subsequently succeeded; no product timeout or assertion was relaxed.

### Serial browser and capture preparation

Existing Vite configuration and the disposable API fixtures remain authoritative. Capture drivers previously iterated both themes internally.
The capture-record module now validates an optional theme selection; no selection retains the original matrix.
Drivers reuse that selection so a batch can finish and release its servers before the next theme starts.
No viewport, fixture, screenshot identity or assertion is removed.

- `python3 .data/gate/serial-step.py graph-direct-http bun run test:graph`: exit 0; `18 graph and neighborhood checks passed`.
  Additional checks passed for expansion at all four widths in both themes, complete names, tile geometry, stable dragged positions,
  and first opening of UBL/Mall in Network/Layered layouts at all four widths. The 150-node budget/frontier check passed.
- `free -g`: 25 GB available before graph; 26 GB before the capture-driver check.
- `bun -e` importing `captureThemes`: default returns light/dark; light and dark each return only themselves; invalid input throws `Unsupported SW_THEME`.
- `bunx --bun oxfmt` on the changed capture drivers: exit 0.
- `python3 <readable-code>/scripts/readable_check.py --changed` on all changed capture TypeScript files: exit 0.
- `python3 <deliverable-guard>/scripts/leak_scan.py docs/development.md`: `CLEAN`, 0 hits.

Startup diagnostics used `ps`, `ss`, `/proc` status and temporary Vite/Node-net logging inside the ignored gate folder.
The trace stopped after the wildcard IPv6 probe's listening event, before its close callback and before Vite buildStart.
A delayed close did not resolve it. The temporary launcher now uses Vite's supported middleware mode with its existing configuration,
a real HTTP listener on 5261 and the same listener for HMR. This avoids the failing port probe; it changes no application or suite assertions.
Every stopped diagnostic and completed suite reported `OWNED_PROCESSES_REMAINING []`.
- `bun --bun run check` after theme selection changes: exit 0; all 1044 matched files formatted; TypeScript, lint, comments, theme and brand passed.
