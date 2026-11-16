# Lane A evidence

## Final outcome

T011–T022 are complete, including the formerly skipped T012–T014 and the remaining title layering in T019. No visual fix remains skipped. T023's all-green acceptance is explicitly skipped because two
failures reproduce on foundation `593f2c18` outside lane A ownership. The full gate was executed; it is not reported as green. The following results supersede the original skips and gate limitations
retained below.

| Command                            | Final output summary                                                                                     | Log under `/tmp/sw-A/resume/` |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `bun test`                         | `2076 pass`; `1 fail`; `130793 expect() calls`; `Ran 2077 tests across 286 files`                        | `unit.log`                    |
| Graph-focused unit repetition      | `129 pass`; `0 fail`; `4765 expect() calls`; `Ran 129 tests across 21 files`                             | `graph-unit-final.log`        |
| `bun --bun run check`              | Exit 0; formatting, lint, comments, theme and brand checks pass                                          | `check-delivery.log`          |
| `bun --bun run build`              | Exit 0; `built in 2.37s`; existing chunk-size warning                                                    | `build-after-selection.log`   |
| `bun run test:graph`               | `18 graph and neighborhood checks passed`; all 16 opening cases pass; longest pierce task 98 ms          | `graph-final-retry.log`       |
| `bun run test:overview-areas`      | `7 overview area checks passed`                                                                          | `overview.log`                |
| `bun run test:edges`               | `6 edge attachment UI checks passed`                                                                     | `edges-retry.log`             |
| `bun run test:grouping-validation` | `8 grouping and validation UI checks passed`                                                             | `grouping.log`                |
| `bun run test:responsive`          | Fails only at Mall ODCS canvas height: 407 px, expected at least 421 px, after the preceding blocks pass | `responsive-retry.log`        |
| `bun run test:ui`                  | `20 UI checks passed`                                                                                    | `ui-after-selection.log`      |
| `bun run test:examples:ui`         | `19 example UI checks passed; no browser runtime errors`                                                 | `examples-retry.log`          |
| `bun scripts/mutation-tests.ts`    | `670/670 targeted mutants killed; all unmodified module baselines passed`                                | `mutation-retry.log`          |
| `bun run test:terminology`         | No KPI or contract object in the eight files' views, metric detail, wizard, README and docs              | `terminology-final.log`       |

### Foundation comparisons and integrator follow-ups

- Unit failure: `tests/pipeline/deploy-azure.test.ts:100` hardcodes `/tmp/sw-deploy-registry-`, whereas the required isolated TMPDIR produces `/tmp/sw-A/sw-deploy-registry-`. The exact test on the
  foundation has `4 pass`, `1 fail` with the same assertion (`foundation-unit-cli.log`). Its production adapter honors TMPDIR; no pipeline source or test outside this lane was changed. The integrator
  can remove the test's assumption about the system temporary directory.
- Responsive failure: both the full foundation run (`foundation-responsive-full.log`, line 1668 in its script) and final lane run (`responsive-retry.log`, line 1669) report the identical Mall ODCS
  height, 407 instead of 421. Both passed the sidebar resize assertion first. The integrator or ODCS lane must resolve that canvas-height finding; the graph lane does not change ODCS styles or weaken
  the assertion.
- The initial sidebar assertion did not recur in the complete foundation or final lane run. The initial examples failure did not recur: both foundation and lane pass all 19 checks. The first
  foundation dev server shared the dependency cache; it was restarted with an isolated Vite cache before these final comparisons. These failed attempts remain in their logs and are not called
  pre-existing code defects.
- The lane-introduced selected-edge failure and mutation dispatch failure were fixed. Foundation edges pass all six checks; current edges now do too. The old graph-detail mutation case passes on both
  foundation and lane. The 109 ms graph repetition was corrected by preserving the existing interaction fixture lifetime; foundation measures 99 ms and lane 98 ms without changing the 100 ms budget.

All final browser suites ran one at a time with `TMPDIR=/tmp/sw-A`, current frontend 5211 and OS-assigned isolated APIs. The comparator is a detached temporary checkout of the foundation under
`/tmp/sw-A/resume/foundation`; its frontend explicitly requested port 0 and received 33509. There is no forced-port preload. No other checkout or process was changed.

### Final opening measurements and matched image pairs

`graph-final-retry.log` contains 16 opening cases: UBL and Mall, Network and Layered, at 390, 1280, 1440 and 2560. The minimum rendered name is 9.022002 px. Network's additional counted-layout pass
took 333.5–618.6 ms; the longest complete cold case was 8813 ms. Names, layout passes and elapsed times come from the actual rendered layout. No timing limit changed.

The fresh opening pairs and selected Person/Order pairs are listed below. In addition, the review's three Layered images named first-view actually contain Order already selected and Mini-map enabled.
Their exact matching after states are `/tmp/sw-A/resume/after/matched-states/local-full-graph-layered--first-view-{390,1440,2560}.png`, compared with `screenshots/states/` under the review root. All
three were opened: Order and its connected context are legible, with the same inspector and mini-map state. Fresh first-area openings remain separately available under `after/states/`. The first
temporary matched driver omitted the official startup wait; its failed file selection is not proof. The final driver reuses the official 1500 ms startup wait and all three captures report `[]`
geometry problems (`capture-layered-matched-retry.log`).

Final public-doc scans have zero hits; the internal scan of 38 changed files and 14 then-existing images had zero hits, and the final new images are scanned again below. The readable-code checker
passes all 32 changed code files. Documentation synchronization exits 0. The repository formatter excludes Markdown in its normal configuration; Markdown formatting uses the same formatter with the
ignore list removed in a temporary configuration. Shared tasks retain only this lane's checkbox edits. `scripts/commit_cadence.py` is absent in both lane and foundation.

The matched-state retry uses the official capture harness's initial 1500 ms settling wait. It completed all three captures with `[]` geometry problems. Each image was opened: Order is legible at 390,
1440 and 2560, with the inspector and mini-map matching the review's state. Log: `/tmp/sw-A/resume/capture-layered-matched-retry.log`. The earlier temporary driver attempt omitted that initial
settling wait and is not used as proof.

Final cleanup: both owned Vite process trees and listeners were stopped. No listeners remain on 5211, 5212 or the assigned comparator port 33509; no test or browser process remains with either owned
working directory. Cleanup log: `/tmp/sw-A/resume/process-cleanup.log`. All final code checks, docs synchronization and scanners pass. The public documentation scan has zero hits; the internal scan
covers all lane files and final after images with zero confidential-term hits.

Implementation commits in this continuation: `2898b6d1`, `a2517826`, `4ee6dcc4`, `9a12f12f`, `bcbc51c7`, `bad5978e`, `663cd561`. The final evidence and formatting commits follow these.

## Integrator continuation: measured openings

The integrator authorized measuring completed layouts and opening Layered on its first existing area. This supersedes the three original skips, the earlier documentation limitation, and the earlier fixed-port-only gate attempt. The thresholds locked before implementation remain unchanged.

Network fits the completed expanded layout, waits for two animation frames, and measures the smallest name box and its rendered font size. Below `NAME_MIN_PX = 9`, it runs one additional layout using the existing counted-area projection. The 250-entity limit remains an upper safety cap. Explicit Expand all and area choices remain explicit. Fit padding is 0.08 instead of 0.12; counted names have a minimum fit zoom, including a subpixel margin. Counted Network cards compensate their count text while area titles retain their existing Network scale, avoiding a new two-line header overlap on the phone.

Layered preserves the node positions, existing area order and orthogonal routes. It opens at the first area's readable viewport; pan reaches other areas and Fit model returns to the whole layout. `docs/user-guide.md` describes this exact behavior.

Checks so far: `bun test tests/overview-capacity.test.ts`: `11 pass`, `0 fail`, `68 expect() calls`. The graph suite completed `18 graph and neighborhood checks passed`, plus all 16 new opening cases (UBL/Mall, Network/Layered, 390/1280/1440/2560). The initial expanded-only 45-entity assertion now explicitly uses Expand all: its prior wording described the behavior deliberately replaced here. Selection/tile checks also expand explicitly so they continue testing actual entities. The measured-opening fixture waits for the loading state before changing layouts.

Opening output: `/tmp/sw-A/resume/graph.log`. All names met 9 px; Mall at 390 measured 9.022002 px. The second Network layout took 577.0–996.0 ms in that run; no browser deadline or 100 ms interaction budget was relaxed. The 1,000-entity pierce's longest task was 52 ms. Raw graph-layout and opening durations are exposed separately to the capture/check scripts.

Four legibility mutants are killed by the entry point: inverted comparison, wrong threshold, reading before layout paint, and skipped collapse. Focused log: `/tmp/sw-A/resume/graph-mutants.log`. The paint case measures an actual browser name before and after delayed layout publication. The lane A sentinel registers the mutants; the runner dispatches those two categories to the lane-owned case runner.

Final capture driver: `/tmp/sw-A/resume/capture.ts`, using `scripts/ui-review/capture-records.ts`, the same example files, light theme and native viewport dimensions as the review. Output: `/tmp/sw-A/resume/after/states/` and `/tmp/sw-A/resume/after/followup/`. Capture and final gate use `TMPDIR=/tmp/sw-A`; isolated APIs use port 0. An early resumed graph run omitted TMPDIR and used its disposable default `/tmp/workbench-browser-*` root, which it deleted on completion; subsequent commands explicitly set TMPDIR.

### Opening image pairs inspected

Before root: `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/`. After root: `/tmp/sw-A/resume/after/`. Matching relative names:

- `states/local-full-graph-network--first-view-{390,1280,1440,2560}.png`: counted and legible at narrow widths; the wide view retains individually readable entities.
- `states/local-mall-full-graph--group-automatic-{1280,1440}.png`: twelve counted areas replace the unreadable 195-card view.
- `states/local-full-graph-layered--first-view-{390,1440,2560}.png`: the existing first area opens at readable scale, with unchanged orthogonal routes; on the phone, pan is necessary to reach its wider contents.
- `followup/local-ubl-full-graph--layered-node-selected-1440.png`: Person remains the selected entity; names are readable and the toolbar stays on one row.
- `states/local-large-synthetic-graph--first-view-1440.png`: eight counted areas retain the existing large-model safety opening.

Every after image above was opened. The capture helper reports no geometry problems. The review's Layered first-view images carry Order already selected with Mini-map enabled. Fresh opening captures are retained separately from the exact matched states listed in the final outcome. Title crossing was subsequently fixed and recaptured in the separate title-layer pair.

## Title layering completed

T019 now completes through layering, as authorized by the integrator. Actual SVG edges already have z-index -2 and area nodes -1. The earlier conclusion that a title plate could not cover them was incorrect. The existing title receives an opaque page-surface plate above the stroke; no route, node position or dragging behavior changes. There is one relationship stroke rather than an independent bundle-outline renderer, so no additional outline renderer is introduced. The previously completed metric-badge gap remains.

`/tmp/sw-A/resume/titles.log`: `PASS opaque area titles stay above the SVG edge and outline layer`; `PASS title layering, complete names, nonoverlapping areas, cross-area links and selected Fit`. The geometry check inserts and removes a temporary stroke into the actual SVG edge plane under a visible title and verifies the title wins hit testing. It also asserts an opaque background. This proves visible occlusion, rather than incorrectly claiming the underlying route never enters the title rectangle.

Before `screenshots/states/local-full-graph-network--zoomed-in-1440.png` in the review → after `/tmp/sw-A/resume/after/states/local-full-graph-network--zoomed-in-1440.png`. Opened both: the Allowance charge heading is clear above the crossing strokes, with no routing change. Also reopened the updated Network 1440 first view: the vertical edge under Document reference is covered by its title plate. Capture log `/tmp/sw-A/resume/capture-title.log`: both captures report `[]` geometry problems.

## Full-gate corrections

The first complete mutation run exposed an introduced dispatch error: using the `graph-` prefix routed the existing `graph-detail-zoom` category to the new graph-opening runner. Dispatch now matches only `graph-capacity` and `graph-opening`. The original detail-zoom case passes both on foundation `593f2c18` and the lane (`bun scripts/mutation-case.ts` with each checkout's overview-capacity module), exit 0. Logs: `/tmp/sw-A/resume/foundation-mutation-detail.log` and the direct lane command. The full mutation run is repeated after this correction; the first failure is not classified as pre-existing.

The edge suite passed all six checks on foundation `593f2c18`, so its selected-view failure was introduced by lane A. The selected-only fallback unnecessarily zoomed to 1.0. It now uses the locked name-size floor to preserve the widest readable context and fits all neighbors whenever they meet that floor. No attachment assertion was weakened and no lane B file changed. `/tmp/sw-A/resume/edges-retry.log`: `6 edge attachment UI checks passed`.

Updated selection pairs: review `screenshots/followup/local-ubl-full-graph--network-node-selected-1440.png` → `/tmp/sw-A/resume/after/followup/local-ubl-full-graph--network-node-selected-1440.png` (Order), and the corresponding `layered-node-selected` pair (Person). Both new after images were opened: each selected entity remains centered and readable; more connected context is visible; the toolbar stays on one row. `/tmp/sw-A/resume/capture-selection-final.log` reports `[]` for both selected captures and their first views. Static check and build passed again in `check-after-selection.log` and `build-after-selection.log`.

## Interaction-budget fixture lifetime

A graph repetition measured a 109 ms main-thread task during the 1,000-entity pierce, exceeding the unchanged 100 ms limit. The 16 new opening cases had been inserted before that existing interaction test. They now run after the original graph, expansion and tile checks, preserving the interaction test's previous fixture lifetime. No production behavior, assertion, timeout or budget changes.

The complete foundation graph suite passed with a 99 ms longest task (`/tmp/sw-A/resume/foundation-graph-performance.log`). The final lane repetition passed with 98 ms (`/tmp/sw-A/resume/graph-final-retry.log`): `18 graph and neighborhood checks passed`, plus all 16 opening cases. This supersedes the failed 109 ms repetition; it is not classified as an existing foundation failure.

The complete mutation gate passed: `/tmp/sw-A/resume/mutation-retry.log`, `670/670 targeted mutants killed; all unmodified module baselines passed.` The four new graph mutants are included, with no survivors or timeouts reported. It ran under a 6 GB memory cap, nice 19 and CPU affinity 24–27 using the repository's existing Bun runner. Both new graph-opening tests kill relevant mutants; no new test is redundant within that predicate's gate.

## Baseline

T011 complete. All 24 fresh light-theme first views measured against an archive of e8b7d69. Locked thresholds and numbers are in research.md. Command: `SW_BASE_URL=http://127.0.0.1:5211 bun --preload /tmp/sw-A/port.ts scripts/ui-review/measure-graph.ts`. The temporary preload binds isolated APIs to 5212 instead of ephemeral ports. Raw output: `/tmp/sw-A/baseline.jsonl`; images: `/tmp/sw-A/baseline-measurements/`.

Scope: workers and React Flow retain layout and measurement ownership; resize does not trigger layout; view decisions change only presentation, never definitions or persistence. Browser checks use disposable examples.

The repository has no `scripts/commit_cadence.py`; its requested cadence command is unavailable.

## Original major-layout investigation (superseded by the integrator decision below)

Original T012 skip: a trial passing the measured pane ratio into ELK box and reducing fit padding from 0.12 to 0.02 filled the phone canvas (577/587 px) but rendered minimum name boxes at 4.96 px. At 1280 the minimum was 5.52 px, below 9 px and worse than baseline. Packing only area rectangles cannot control fCoSE's internal area density. Trial changes discarded; no unsupported guarantee ships. Trial measurements `/tmp/sw-A/packing.jsonl`; trial images `/tmp/sw-A/packing/` are diagnostic, not after proof.

Original T013 skip: count, pane size and card size cannot determine fit-name legibility under current callers: grouping, random fCoSE area bounds and long-name caps also determine it. Baseline UBL needs the uncollapsed 390 view while its names are below 9 px. A count-based estimator would repeat the unsupported first-view claim. An implementation needs actual layout bounds and a revised phone acceptance rule; no replacement count threshold added.

Original T014 skip: the current Layered result includes compound cross-area edge sections with container-relative origins (`layoutFullGraph`), not independent area tiles. Wrapping root areas would invalidate those routes and require redesigning routing or dropping the requested orthogonal paths. The task's aspect-ratio-only change is insufficient; no layout change retained.

## Selection

T015 implementation: Controls folds secondary switches before the desktop toolbar wraps, and Exit stays outside it. Unrelated node opacity is 0.35. Selection fits neighbors when readable and otherwise centers the selected node at readable zoom. Fresh selected-node captures: review `screenshots/followup/local-ubl-full-graph--network-node-selected-1440.png` → `/tmp/sw-A/after/screenshots/followup/local-ubl-full-graph--network-node-selected-1440.png`. Opened both: one toolbar row; names larger; initial trial exposed a selected node outside the pane, corrected by centering the selected node when its neighborhood cannot fit at readable zoom. Fullscreen restoration and rendered-geometry checks passed in the final graph suite.

## Original documentation and checks (superseded)

T022 complete with the T012–T014 limitation preserved: docs no longer promise every initial name is readable, and accurately retain the existing 250-entity collapse rule. Graph controls, neighborhood opening, Other files and Full pierce Fit are documented. `test:terminology`: “Terminology check passed: no KPI or contract object in 8 files' views, the metric detail, the wizard, README and docs.” Public documentation and changelog scanner: 0 hits in 3 files.

T021 shared browser export for lane E: `humanizeIdentifier(identifier: string): string` from `src/app/graph/EntityName.tsx`. It handles camel case, acronym boundaries and namespace labels without rewriting model identifiers. No new shared path was named in plan.md; the task's existing EntityName module is the reuse point.

The first terminology attempt omitted the base URL and preload, attempted 5173 and failed with connection refused; rerun succeeded using 5211/5212. No changes to another checkout or service.

## Original gate findings (rechecked in the final gate)

- `test:edges`: `scripts/edge-attachment-ui-tests.ts:186` requires more than five visible path measurements after selection. The requested readable selection view can show fewer; initial and zoomed network attachment checks passed. The script belongs to lane B and was not edited.
- `test:examples:ui`: `scripts/examples-ui-tests.ts:405` finds no `.mapping-layer-chain` after loading Mapped commerce and opening Mappings. The preceding 17 checks passed. This is a lane E mapping flow; no cross-lane edit.
- The first responsive run exposed selection auto-framing overwriting the saved viewport on full-screen exit. Fixed in lane A by respecting `useViewRestore`'s existing hold; the graph fullscreen restoration checks passed on rerun.
- Captures log 404s for absent `/api/drafts/...` documents, also present in the baseline. These are not missing font assets.

## Original scope exceptions and shared registration

Original T019 partial result (superseded): metric-badge spacing is present. A title background inside an area node cannot rise above edges because its parent has z-index -1. That ineffective trial was removed; title/edge layering needs a separate rendered label plane and remains unresolved. `RoutedEdge` has one BaseEdge/BezierEdge stroke; there is no separate bundle-outline renderer using the area-frame style to replace. Adding one would exceed this finding. The requested geometric prohibition on any underlying path crossing a title is not claimed: no title masking is claimed. The lane B edge-suite failure above prevents its required green check.

The shared responsive suite has one changed call inside its existing Neighborhood details block, plus its helper import, as plan.md permits. The lane-owned `selectNeighborhoodCenter` helper selects the visible center instead of the former last node, which is now legitimately offscreen at readable opening zoom. No unrelated responsive blocks changed.

The original all-graphs capture was stopped after the 1280 pass because it continued into unrelated lineage/mapping states and could not follow the old offscreen-neighbor clicks. Remaining full-model captures use the unchanged `fullGraph` function from `scripts/ui-review/graph-states.ts` via a temporary copy with its viewport/layout inventory filtered to the remaining required Network states. Targeted Neighborhood navigation uses the same `scripts/ui-review/capture-records.ts` capture function, keyboard activation of the existing Walk buttons and the same reviewed Property → AllocationKey → AllocationShare → Identifier route. No failed-state image is used as visual proof. Temporary drivers: `/tmp/sw-A/remaining-graphs.ts`, `/tmp/sw-A/targeted.ts`.

## Original lane check outputs

All successful browser checks below use `SW_BASE_URL=http://127.0.0.1:5211`, `TMPDIR=/tmp/sw-A` and `BUN_OPTIONS=--preload=/tmp/sw-A/port.cjs`. The preload binds Bun listeners to 5212. Checks ran sequentially; no API fixtures shared a listener concurrently.

| Command                                | Final summary                                                                                                        | Log                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Graph-focused `bun test` over 21 files | `127 pass`, `0 fail`, `4761 expect() calls`; 13.54 s                                                                 | `/tmp/sw-A/graph-unit.log`          |
| `bun --bun run check`                  | Exit 0; all 1027 files formatted; comments, theme and brand checks pass                                              | `/tmp/sw-A/check.log`               |
| `bun --bun run build`                  | Exit 0; `built in 2.17s`; existing chunk-size warning remains                                                        | `/tmp/sw-A/build.log`               |
| `bun run test:graph`                   | `18 graph and neighborhood checks passed`; longest pierce main-thread task 78 ms                                     | `/tmp/sw-A/graph-check.log`         |
| `bun run test:overview-areas`          | `7 overview area checks passed`                                                                                      | `/tmp/sw-A/overview-areas.log`      |
| `bun run test:grouping-validation`     | `8 grouping and validation UI checks passed`                                                                         | `/tmp/sw-A/grouping-validation.log` |
| `bun run test:ui`                      | `20 UI checks passed`                                                                                                | `/tmp/sw-A/ui.log`                  |
| `bun run test:terminology`             | `Terminology check passed`                                                                                           | `/tmp/sw-A/terminology.log`         |
| `bun run test:edges`                   | Exit 1 after initial and zoomed attachment checks; visible-path count after readable selection fails                 | `/tmp/sw-A/edges.log`               |
| `bun run test:examples:ui`             | Exit 1 after 17 checks; missing `.mapping-layer-chain`                                                               | `/tmp/sw-A/examples-ui.log`         |
| `bun test --max-concurrency 1`         | Stopped, exit 143; repeated `EADDRINUSE` at 5212 in API/OIDC fixtures                                                | `/tmp/sw-A/unit.log`                |
| `bun scripts/mutation-tests.ts`        | Exit 1: `Baseline failed (remote-redirect)`; redirect fixture needs two simultaneous listeners and gets `EADDRINUSE` | `/tmp/sw-A/mutation.log`            |

The full unit and mutation commands cannot pass with the one assigned API port: serial test execution does not remove fixtures' simultaneous API/issuer or origin/redirect listeners. No additional port was allocated to bypass the restriction. No new legibility mutants were added because T013 was skipped.

The final responsive run passed all Graph/Neighborhood fullscreen, resize and overlay blocks, then failed in `scripts/helpers/edit-tour.ts:17`: opening `sales.ossie.yaml` left `ubl.ontology.yaml` chosen (`screen-tour.ts:40`, called from responsive-ui-tests.ts:1474). Exit 1; log `/tmp/sw-A/responsive.log`. This editing-tour failure is outside lane A ownership.

T023 is not complete: full unit, mutation, edges, examples UI and responsive commands are not green. The lane must not be marked ready to merge on the strength of the focused checks.

The initial remaining-graphs driver reached every required 1440 Network state, then failed entering the unneeded Layered pass because Controls was still open. The final driver filters to Network at 2560. The long controller exited 143 after the empty-state images had been saved; loading was scheduled again separately. No failed capture is used as an after pair.

## Visual pairs opened

Before root: `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/`.
After root: `/tmp/sw-A/after/`. Every row below was opened on both sides, with the same example, file, state stage, viewport and light theme. fCoSE positions vary between fresh layouts.

| Task                                 | Before, relative to before root                                      | After, relative to after root                                               | Observation                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T015                                 | `followup/local-ubl-full-graph--network-node-selected-1440.png`      | `screenshots/followup/local-ubl-full-graph--network-node-selected-1440.png` | Order is readable and centered beside details; toolbar occupies one row.                                                                                       |
| T015                                 | `states/local-full-graph-network--fullscreen-node-selected-1440.png` | `states/local-full-graph-network--fullscreen-node-selected-1440.png`        | Fit, Controls and Exit remain in the top row; selected name readable; unrelated cards retain visible names.                                                    |
| T016                                 | `states/local-full-graph-network--labels-on-1440.png`                | `states/local-full-graph-network--labels-on-1440.png`                       | Readable selected neighborhood; labels remain dense at readable zoom. The browser assertion separately proves that unfocused fit zoom paints no global labels. |
| T016                                 | `states/local-full-graph-network--areas-collapsed-1440.png`          | `states/local-full-graph-network--areas-collapsed-1440.png`                 | Each count appears once; Document reference and Allowance charge remain complete words.                                                                        |
| T017                                 | `states/local-neighborhood--first-view-1280.png`                     | `targeted/local-neighborhood--first-view-1280.png`                          | Center description is legible, canvas taller; cross-file chips are folded into Other files.                                                                    |
| T017, T021                           | `states/local-neighborhood--walk-3-1440.png`                         | `targeted/local-neighborhood--walk-3-1440.png`                              | Identifier and its description remain readable beside details; the center picker displays its full text.                                                       |
| T018                                 | `followup/local-ubl-neighborhood--pierce-alone-1440.png`             | `targeted/local-ubl-neighborhood--pierce-alone-1440.png`                    | Party/Both result retains readable cards and offers “45 entities, Fit”; no inspector is open.                                                                  |
| Historical T019 partial (superseded) | `states/local-full-graph-network--zoomed-in-1440.png`                | `states/local-full-graph-network--zoomed-in-1440.png`                       | Routing still resembles frames; title layering is unresolved. Badge spacing is visible in the selected-node pairs, not this random zoom crop.                  |
| T020                                 | `states/local-full-graph--empty-1440.png`                            | `states/local-full-graph--empty-1440.png`                                   | Area count reads “1 entity”.                                                                                                                                   |
| T020                                 | `states/local-neighborhood--empty-1440.png`                          | `states/local-neighborhood--empty-1440.png`                                 | Lone card stays at natural size; “0 of 0 neighbors” is absent.                                                                                                 |
| T020                                 | `states/local-full-graph-network--mini-map-on-1440.png`              | `states/local-full-graph-network--mini-map-on-1440.png`                     | Mini-map has a visible border and viewport rectangle.                                                                                                          |
| T020                                 | `states/local-full-graph-network--zoomed-minimum-1440.png`           | `states/local-full-graph-network--zoomed-minimum-1440.png`                  | Minimum zoom retains a recognizable graph instead of a near-dot; it remains a quarter of fit zoom, not a reading view.                                         |
| T021                                 | `states/local-neighborhood--fullscreen-390.png`                      | `targeted/local-neighborhood--fullscreen-390.png`                           | AllocationShare stays readable, labelled Exit is visible and details occupy the bottom 40%.                                                                    |
| T021                                 | `states/local-full-graph-network--first-view-2560.png`               | `states/local-full-graph-network--first-view-2560.png`                      | Area headings use Document reference and Allowance charge; identifiers in source and card names retain identity. Title crossings remain the T019 limitation.   |

## Completion and handoff

- Completed: T011, T015, T016, T017, T018, T020, T021, T022.
- Skipped: T012, T013, T014 for the layout/capacity constraints above.
- T019 partial and left unticked: badge spacing only; title layering and the alleged separate bundle outline remain unresolved.
- T023 attempted and left unticked: all-green completion is skipped because the five failed/blocked command groups above remain. Lane A is not ready to merge.

The final graph run passed 18 checks with a 78 ms longest pierce task. An earlier isolated repeat passed at 79 ms; one intermediate run failed at 202 ms against the unchanged 100 ms limit (`/tmp/sw-A/graph-check-performance-failure.log`). No threshold was relaxed.

Additional final assertions prove the Mall Graph keeps at least 473 px at 1280×720, the Controls panel remains inside the graph, the selected group name fits its select, and pending layout disables grouping, Re-layout, zoom and Fit then restores them. The pending-state assertion briefly delays the real worker request; it does not replace layout output. Full pierce offers “45 entities, Fit”, and clicking it frames every card.

Auxiliary loading image opened: `/tmp/sw-A/after/loading/local-full-graph-network--layout-loading-1-1440.png`. Its worker had already completed by the screenshot, so it is not proof of disabled controls; the real-worker assertion above proves that state. The loading matrix completed its images but its outer command ended 143. The matrix exposed the desktop panel extending over the sidebar; the final fix bounds it to the graph, and the required Network pairs were recaptured and reopened afterwards. The final targeted Network capture command exited 0.

Integrators need to resolve T012–T014 and the remainder of T019, adapt lane B's selected-view edge expectation, investigate the lane C editing-tour and lane E mapping flow failures, and run the full unit/mutation gates with enough isolated listener ports. Lane E can import the documented `humanizeIdentifier(identifier: string): string` from `src/app/graph/EntityName.tsx`.

No push, merge, tag, remote change or deploy. All lane processes are stopped; process inspection found none and `ss` showed no listener on 5211 or 5212. The source commits are local on 007-lane-a.

Final mechanical checks: formatter/type/lint check and docs-sync passed; readable-code checker passed on changed code. Public docs/changelog and commit text leak scans exited 0. Confidential-term scans exited 0 for all 31 changed files and 14 internal proof PNGs. PNG scanning covers printable strings only; the table records the visual inspection. No allow-list exception was used.

## Commits before the final evidence commit

```text
0a58b782 test(graph): lock review baseline thresholds (T011)
ec0d32e4 docs(graph): record packing and capacity scope limits (T012 T013)
6bf97c1b docs(graph): record compound layered routing constraint (T014)
175396b0 refactor(graph): separate viewport and edge presentation
ff513789 fix(graph): preserve readable selection and a single toolbar row (T015)
410e335a fix(graph): limit fit-zoom labels and preserve identifier words (T016)
2ea280f0 refactor(graph): isolate neighborhood viewport lifecycle
53eb1b76 fix(graph): open neighborhood at readable scale with folded file links (T017)
55ee505d fix(graph): offer Fit for large pierce results (T018)
e12cbd64 fix(graph): protect area titles and separate metric badge content (T019)
b3f28fa2 fix(graph): bound zoom and frame the mini-map consistently (T020)
d36aa2a6 fix(graph): clarify display identifiers and keep exits visible (T021)
7bfc365c docs(graph): describe readable focus and retained first-view limits (T022)
f0924f08 test(graph): verify compact controls and readable opening geometry (T023)
0bcf2850 fix(graph): respect full-screen viewport restoration (T023)
f5e853d2 fix(graph): let the center picker use its content width (T021)
f1b62f08 test(graph): check links at Fit after readable selection (T023)
e64eba59 test(graph): select the visible neighborhood center responsively (T023)
281b198c fix(graph): withdraw ineffective area title plate (T019)
604547b6 test(graph): prove pierce Fit frames the whole result (T018 T023)
4b6613b6 fix(graph): contain folded controls within the graph pane (T015 T021)
29c44e5f fix(graph): override the legacy group select width cap (T021)
```
