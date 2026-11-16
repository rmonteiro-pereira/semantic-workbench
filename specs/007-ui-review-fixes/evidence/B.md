# Lane B

## Scope ledger

- Existing lineage closure, navigation history and ELK row-port geometry remain authoritative.
- Presentation changes must preserve card IDs, selections and all persisted document bytes.
- Canvas room and viewport framing are separate guarantees; compact headers alone cannot bring remote neighbours into view.
- Browser entry points and geometry assertions cover the presentation delta.

## Commits and progress

- Legend moved from graph to odcs in a separate commit, with imports updated.
- T024: compact table header on Lineage; pane begins at y=358 (1280×720 and 1440×900), y=399 (390×844). Visible height is 309, 449 and 445 px respectively. Header height no longer includes facts or prose. `checkDatasetLineageRoom` passes at all three widths. A whole neighbour still depends on the first-view work in T026, so T024 is explicitly skipped as incomplete.

## Captures

Images are under the ignored `out/lane-b/` folder because this lane is restricted to its own worktree. Baselines are under the supplied review's `screenshots/` folder.

| Task | Before | After | Observation |
| --- | --- | --- | --- |
| T024 | states/local-lineage-walk--first-view-1280.png | out/lane-b/room-1280.png | Header is one line and the pane starts 158 px earlier; the centre is whole but neighbours still lie beyond the pane. |
| T024 | states/local-lineage-walk--first-view-1440.png | out/lane-b/room-1440.png | Compact header leaves more vertical room for cards. |
| T024 | states/local-lineage-walk--first-view-390.png | out/lane-b/room-390.png | Canvas is visibly taller; toolbar and legend still need their later tasks. |

The stock `lineage-visibility.ts` initially captured the loading state after its fixed one-second wait. `out/lane-b/review-room.ts` waits for the centre card and measures the settled pane. Scripts use an ignored preload to bind isolated APIs to 5222 and frontend requests to 5221. No changes to shared fixture code.

## T025 — partial implementation; acceptance skipped

Walk targets now use `max(24, 24 / zoom)` canvas pixels, and are omitted when the available card header cannot contain them. Unit checks: 6 pass, 0 fail. The four-click-after-Fit acceptance conflicts with the required hiding rule: the fitted 1440 baseline measurement has a 2.78×2.96 px button, corresponding to a card narrower than 24 screen pixels. Such a button must be absent under FR-017. No claim of four successful fitted clicks is made. The task remains unchecked for the integrator to reconcile this acceptance condition. No new neighbour-list UI was added.

## T026 — implementation

The first-view hook now checks actual laid-out bounds before choosing the complete reach. Small reaches use a low-padding Fit; larger reaches retain the existing nearest-card framing. Mapping entry requests the measured all-card readiness path before falling back to the readable neighbourhood. Unit checks: 7 pass, 0 fail, including horizontal and vertical one-pixel boundary cases. The required first-view pair still shows clipped neighbours after the readable fallback; this task is explicitly skipped as incomplete.

## T027 — skipped: incompatible geometry

The requested 9 px names cannot fit inside the measured fitted card heights. At 1440 the existing walk button scales to 2.78×2.96 px, with the entire card only a few pixels wide. A font compensated to 9 screen pixels and bounded by that card's header height cannot simultaneously satisfy both bounds. Fixing this requires changing Fit semantics, layout density or the representation beyond the named font adjustment. No name-only rendering change is made.

## T028 — partial implementation; bundling skipped

Opening the side panel fits every currently laid-out card into the reduced pane instead of returning to one readable centre with neighbours under the panel. Bundling across a shared source column is larger than the described existing bundle split: the current bundle groups by *card pair and edge kind*, while the Mall hub has distinct destination cards. Combining those into at most three paths needs shared route trunks with multiple endpoints and changed attachment/selection behavior, rather than one counted edge between existing ports. That routing change is skipped; T028 remains unchecked.

## Confirmed inferences

T029 / M17 confirmed at 1280×720 and 2560×1440. `.lineage-hops` has `flex-wrap: wrap` and a computed width of 488.421875 px at both widths. Its path uses `flex: 1 1 160px`. The children have widths 27.09375, 103.609375, 259.515625, 48.203125 and 105.21875 px. The final Foreign keys button wraps to y=249 at 1280 (steps y=213), and y=209 at 2560 (steps y=173), despite the wide pane. The flex basis participates in intrinsic sizing of the non-growing hops item, then its path grows on the first row, leaving the final button alone on the second. `.lineage-subbar > .lineage-hops` only caps max-width; it does not allocate remaining width or prevent this wrapping.

Proof: `out/lane-b/hops.jsonl` and `out/lane-b/t029/local-contract-graph-{1280,1440,2560}.png`, reproduced by `scripts/ui-review/capture-tour.ts`. An ignored preload restricts the tour inventory to the two owned canvases and its viewport matrix to the requested desktop sizes. All example/state navigation remains the stock tour.

T026 after images at `out/lane-b/t029/local-{contract,mapping}-graph-1440.png` were opened. Contract centre is whole, but right-side cards/labels remain clipped. Mapping top cards are still clipped after readable fallback. The change is therefore not accepted. The supplied mapping fixture has nine reachable assets, while the task describes eight.

## T030 — complete

Hops uses a non-wrapping row, with only the path text growing/shrinking. Zoom and fullscreen now share one icon group beside the walk trail, leaving the primary toolbar on one row at 1280. Opened all three after images `out/lane-b/t030-final/local-contract-graph-{1280,1440,2560}.png`, paired with `local-light/local-contract-graph-{1280,1440,2560}.png`. Hops is visibly one row at each width and there are two rows of controls above the canvas at 1280. The 2560 second-row Foreign keys defect is gone. Unit summary: 10 pass, 0 fail (`lineage-hops` and `lineage-view`). Dedicated `checkHopsRow` checks child centre-lines through the browser entry point.

## T031 — implementation and capture

The existing 1400 px content measure now includes `.odcs-lineage-host`; no second page-width rule was added. Opened `out/lane-b/t031/local-odcs-dataset--lineage-2560.png`: header and canvas align at both edges. The task's `rest`/`SW_ONLY=odcs` command emits `local-odcs-dataset--lineage`, rather than its stated `local-dataset-lineage--first-view` basename; both open Mall/properties on Lineage. The latter baseline is the graph-state sequence and was separately recaptured for the exact settled stage below. Browser width assertion was added to test:odcs at 2560 and restores the previous viewport afterwards.

## T032 — implementation

Walk trail names the current and original centre after a walk. CENTER now sits beside the name, independently of the kind line hidden at far zoom. The legend explains grouping tint and collapses behind a Legend disclosure on narrow screens; expanded content retains keys and line kinds. Empty reaches show one explanatory line and disable hop buttons. `out/lane-b/t032/local-contract-lineage--no-links-390.png` opened: disabled Hops, visible CENTER, one message and the collapsed Legend are present. The underlying fixed header/port geometry is retained; removing its unused band would require relayout on zoom and is not included.

## T033 — implementation

Label placement rejects a slot intersected by any laid-out route, including diagonal segments; renderer suppresses placed labels clipped by the current pane. Layout state disables the native controls fieldset and hop buttons while ELK runs. The route-crossing test distinguishes a blocked slot from a clear route. Focused unit summary: 17 pass, 0 fail, 40 expect calls. The final visual pairs and edge-check results are recorded below.

## T034 — complete

Foreign-key docs now state one to three. Mapping Steps (1–5) is described separately, and first-view docs describe the actual bounds decision and nearest-set fallback. `bun test tests/lineage-hops.test.ts`: 4 pass, 0 fail, 13 expect calls. `rg -n 'one to five' docs README.md` has no matches. The changelog fragment and both edited guides pass the deliverable leak scanner with zero hits.

## Final check progress and target containment correction

- `bun --bun run check`: passed (TypeScript, formatting, lint, comments, theme and brand).
- `bun --bun run build`: passed, `built in 1.92s` (existing chunk-size warning only).
- `test:odcs`: `10 ODCS checks passed`.
- `test:mapping-graph`: `12 mapping graph checks passed`.
- `test:edges`: `6 edge attachment UI checks passed`.
- `test:ui`: `20 UI checks passed`.
- The initial lineage run exposed Walk here intercepting Expand at reduced zoom. The first containment attempt removed the overlay; responsive then caught targets taller than short metric headers. Targets now participate in normal action layout and are hidden when the available header height cannot contain 24 screen pixels. The corrected UBL Expand/Undo entry-point check passes; its first view measured 1906 ms against the unchanged 2000 ms limit.
- The earlier repeat measured 2060 ms and failed that limit; no budget was changed.
- The complete unit command with a port preload encountered ten identity-fixture failures needing concurrent listeners on 5222. It was stopped after confirming this infrastructure conflict. A bare command with `BUN_OPTIONS` also caused Bun's package-script recursion; the corrected invocation was `bun test ./tests --preload ./out/lane-b/ports.ts`. No full-unit pass is claimed.
- `python3 scripts/commit_cadence.py <worktree>` cannot run: this repository has no such file.
- Focused production baseline and both registered viewport mutants passed: `2/2 lineage viewport mutants killed; production baseline passed.`


## Acceptance audit

| Task | Disposition | Remaining reason |
| --- | --- | --- |
| T024 | Skipped after partial implementation | More canvas room is proved, but the required whole neighbour at 1280 still depends on unresolved first-view framing. |
| T025 | Skipped after partial implementation | Compensated targets are contained safely; four fitted clicks conflict with hiding targets when their cards cannot hold 24 screen pixels. The supplied script also selects at most three candidates per viewport. |
| T026 | Skipped after partial implementation | The actual-bounds predicate is covered, but the commerce mapping's top cards remain cut under the existing readable fallback. Fitting all cards requires a smaller representation. |
| T027 | Skipped | The required name size and fitted header bounds cannot both hold for the measured tiny cards without changing Fit or card representation. |
| T028 | Skipped after partial implementation | Panel fitting is implemented; shared-source trunks across distinct destination cards need routing/attachment changes beyond the existing per-card-pair bundle. |
| T029 | Complete | Computed rule, widths and wrapping positions recorded above. |
| T030 | Complete | All three desktop pairs inspected; hops occupy one row. |
| T031 | Complete | Settled 2560 first-view pair inspected; header and canvas share both edges. |
| T032 | Skipped after partial implementation | Empty state, legend, centre badge and walked label are implemented. Removing the fixed empty header band changes row-port geometry; the fitted walk proof also conflicts with hidden targets. Full requested state matrix is not proved. |
| T033 | Complete | Loading, three-hop list and one-hop node-selected pairs inspected; route/pane rejection and disabled pending controls verified. |
| T034 | Complete | Documentation and MAX_HOPS agree. |
| T035 | Skipped as an incomplete gate | Full units and mutation baselines need concurrent listeners; responsive also timed out on the unowned full-model loading state. Other checks pass; no all-green claim. |

Unchecked tasks above are deliberate explicit skips, not merge-ready acceptance. No new representation, cross-card routing or neighbouring-list design was improvised.

Final renderer review found that a clipped mapping label could reappear through its legacy text fallback. The fallback now applies only when no structured label exists. `bun test tests/edge-labels.test.ts`: 7 pass, 0 fail, 20 expect calls. The full `check` command passes again after this correction.


## Settled width proof

Opened the exact T031 pair: baseline `states/local-dataset-lineage--first-view-2560.png` and after `out/lane-b/final-dataset/local-dataset-lineage--first-view-2560.png`. The compact header and canvas now share x=652 and x=2052 edges (1400 px). The view contains settled cards; neighbouring clipping remains the separately skipped first-view issue. The stock graph-state entry point was restricted to the dataset stages and 2560/light using an ignored preload; its initial navigation and first-view capture are unchanged. The capture recorded resource 404 console entries, so it is visual width proof, not an error-free browser-suite claim.


## Label and pending-control proof

Opened all three T033 review baselines and their after images:

- `states/local-contract-lineage--loading-1-1440.png` → `out/lane-b/final-states/local-contract-lineage--loading-1-1440.png`: pending layout is visible and primary layout actions/hop choices are disabled. Viewport-only controls remain available.
- `states/local-contract-lineage--hops-3-list-1440.png` → `out/lane-b/final-states/local-contract-lineage--hops-3-list-1440.png`: same three-hop dialog and selected path; no clipped label pill is drawn in the visible strip. The capture overlap checker treats modal backdrops as coverage, which is expected for this state.
- `states/local-contract-lineage--node-selected-1440.png` → `out/lane-b/final-node/local-contract-lineage--node-selected-1440.png`: same Mall/properties, one-hop selected centre with expanded columns. The reach fits beside the panel and labels are suppressed at this small zoom. This does not establish the separately skipped readable-name requirement.

The first two use `capture-states.ts`; the last uses `lineage-panel-states.ts` restricted to 1440/light and the centre expansion/selection stages. All captures use the stock capture writer. The broad graph-state attempt's node-selected capture remained at three hops, so it is not used as the exact one-hop pair.

The full mutation command initially identified the old bounds anchor as missing after route-aware placement added an argument. Route context now belongs to each `LabelRequest`, preserving the existing three-argument placement call and the existing bounds mutant. Focused edge-label tests pass (7 pass, 0 fail, 20 expect calls), and the complete `check` command passes. No shared mutation anchor was changed.


## Final gate results

Commands use the assigned frontend `SW_BASE_URL=http://127.0.0.1:5221` and an ignored Bun preload restricting API listeners to 5222. Final isolated fixtures use `TMPDIR=/tmp/sw-B/tmp`. The wrappers are local harness configuration, not product changes.

| Required check | Result / output summary | Log |
| --- | --- | --- |
| `bun test` | Not passed: ten identity-fixture listener conflicts on 5222; corrected explicit test-directory invocation stopped after confirming the conflict (exit 130). | `out/lane-b/bun-test-fixed.log` |
| `bun --bun run check` | Passed: TypeScript, format, lint, comments, theme and brand. | `out/lane-b/check-complete.log` |
| `bun --bun run build` | Passed: `built in 1.84s`; existing chunk-size warning. | `out/lane-b/build-complete.log` |
| `bun run test:lineage` | `25 lineage checks passed`; corrected target containment and UBL Expand/Undo pass. | `out/lane-b/test-lineage-final.log` |
| `bun run test:odcs` | `10 ODCS checks passed`. | `out/lane-b/final-odcs.log` |
| `bun run test:mapping-graph` | `12 mapping graph checks passed`. | `out/lane-b/final-mapping-graph.log` |
| `bun run test:edges` | `6 edge attachment UI checks passed`. | `out/lane-b/final-edges.log` |
| `bun run test:responsive` | Not passed: 110 checks passed before Admin at 2560 timed out waiting five seconds for `.full-graph-loading` to disappear in the existing screen-tour helper. Lineage, mapping, ODCS and the viewport overlap checks passed earlier in this run. | `out/lane-b/test-responsive-final.log` |
| `bun run test:ui` | `20 UI checks passed`. | `out/lane-b/final-ui.log` |
| `bun scripts/mutation-tests.ts` | Not passed: `Baseline failed (remote-redirect)` because the redirect-credential fixture needs concurrent servers on 5222. The earlier missing bounds anchor was corrected first. | `out/lane-b/mutation-full.log` |

Additional focused results: `18 pass`, `0 fail`, `48 expect() calls` across three test files (`out/lane-b/focused-final.log`); `2/2 lineage viewport mutants killed; production baseline passed` (`out/lane-b/viewport-mutants-final.log`); `PASS production bounds baseline` and `KILLED existing edge-label-bounds mutant` (`out/lane-b/bounds-mutants.log`). All mutation-anchor presence checks passed before the full runner reached the unrelated redirect baseline.

Observed integrity issues outside this presentation delta: the final ODCS process printed a shutdown-time watcher `RangeError: Cannot use a closed database` after its passing summary; capture scripts logged draft-resource 404s. Neither is treated as a successful error-free capture run or changed under this lane.

The aggregate readable-code scan over this lane's changed lines, docs synchronization check and `git diff --check` passed. Public guides/changelog pass the full leak scanner; the internal evidence/tasks and all changed source files pass its confidential-only check. No attribution trailers were added.

## Local commits

- `4e296cd6` refactor: move lineage legend into its owning module
- `670aa9ca` fix: reclaim table header space for lineage canvas
- `3b20b25d` fix: compensate lineage walk targets for canvas zoom
- `8804223a` fix: fit complete lineage reaches when readable bounds allow
- `deb88de0` fix: fit lineage cards beside the selected path panel
- `1836742b` docs: confirm intrinsic sizing behind lineage hops wrapping
- `c8aa982f` fix: keep lineage hops and viewport actions on one row
- `2dca1556` fix: align embedded lineage with the dataset content width
- `3f0923f4` fix: clarify lineage centres legends and unlinked states
- `1ab09121` fix: reject crossed lineage labels and disable pending layout controls
- `62e4031d` docs: distinguish foreign-key hops from mapping steps
- `b34dfb62` refactor: remove unused path-fit inputs
- `fb80f2a3` test: register readable-fit and walk-target mutants
- `cc16978c` test: recognize the visible phone lineage legend disclosure
- `2eb3fee0` fix: contain compensated walk targets within card headers
- `d4a36270` docs: describe lineage control and viewport exports
- `b5e867b4` fix: prevent clipped mapping labels from using legacy fallback
- `212af55f` docs: record settled dataset width acceptance
- `9ac5ad5c` fix: preserve bounds mutation coverage with route-aware label requests


## Handoff

The final UI smoke run reports `20 UI checks passed`. All lane-owned changes are committed locally; nothing was pushed or merged. The dev server was stopped and neither 5221 nor 5222 has a listener. A process scan found no remaining browser or Bun check process in this worktree.

The integrator must reconcile the skipped Fit/name/target acceptance conditions, decide whether shared-source routing belongs in a separate change, and rerun the complete unit/mutation gates with fixture-compatible listener allocation. The responsive Admin loading timeout and shutdown watcher error remain reported separately. The supplied `scripts/commit_cadence.py` command is unavailable in this repository. This lane is not declared ready to merge.
