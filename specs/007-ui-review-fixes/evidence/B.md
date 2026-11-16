# Lane B

## Scope ledger

- Existing lineage closure, navigation history and ELK row-port geometry remain authoritative.
- Presentation changes must preserve card IDs, selections and all persisted document bytes.
- Canvas room and viewport framing are separate guarantees; compact headers alone cannot bring remote neighbours into view.
- Browser entry points and geometry assertions cover the presentation delta.

## Commits and progress

- Legend moved from graph to odcs in a separate commit, with imports updated.
- T024: compact table header on Lineage; pane begins at y=358 (1280×720 and 1440×900), y=399 (390×844). Visible height is 309, 449 and 445 px respectively. Header height no longer includes facts or prose. `checkDatasetLineageRoom` passes at all three widths. A whole neighbour still depends on the first-view work in T026, so T024 is not ticked yet.

## Captures

Images are under the ignored `out/lane-b/` folder because this lane is restricted to its own worktree. Baselines are under the supplied review's `screenshots/` folder.

| Task | Before | After | Observation |
| --- | --- | --- | --- |
| T024 | states/local-lineage-walk--first-view-1280.png | out/lane-b/room-1280.png | Header is one line and the pane starts 158 px earlier; the centre is whole but neighbours still lie beyond the pane. |
| T024 | states/local-lineage-walk--first-view-1440.png | out/lane-b/room-1440.png | Compact header leaves more vertical room for cards. |
| T024 | states/local-lineage-walk--first-view-390.png | out/lane-b/room-390.png | Canvas is visibly taller; toolbar and legend still need their later tasks. |

The stock `lineage-visibility.ts` initially captured the loading state after its fixed one-second wait. `out/lane-b/review-room.ts` waits for the centre card and measures the settled pane. Scripts use an ignored preload to bind isolated APIs to 5222 and frontend requests to 5221. No changes to shared fixture code.

## T025 — partial implementation; acceptance skipped

Walk targets now use `max(24, 24 / zoom)` canvas pixels, and are omitted when wider than the card. Unit checks: 6 pass, 0 fail. The four-click-after-Fit acceptance conflicts with the required hiding rule: the fitted 1440 baseline measurement has a 2.78×2.96 px button, corresponding to a card narrower than 24 screen pixels. Such a button must be absent under FR-017. No claim of four successful fitted clicks is made. The task remains unchecked for the integrator to reconcile this acceptance condition. No new neighbour-list UI was added.

## T026 — implementation

The first-view hook now checks actual laid-out bounds before choosing the complete reach. Small reaches use a low-padding Fit; larger reaches retain the existing nearest-card framing. Mapping entry requests the measured all-card readiness path before falling back to the readable neighbourhood. Unit checks: 7 pass, 0 fail, including horizontal and vertical one-pixel boundary cases. Browser validation is in progress.

## T027 — skipped: incompatible geometry

The requested 9 px names cannot fit inside the measured fitted card heights. At 1440 the existing walk button scales to 2.78×2.96 px, with the entire card only a few pixels wide. A font compensated to 9 screen pixels and bounded by that card's header height cannot simultaneously satisfy both bounds. Fixing this requires changing Fit semantics, layout density or the representation beyond the named font adjustment. No name-only rendering change is made.

## T028 — partial implementation; bundling skipped

Opening the side panel fits every currently laid-out card into the reduced pane instead of returning to one readable centre with neighbours under the panel. Bundling across a shared source column is larger than the described existing bundle split: the current bundle groups by *card pair and edge kind*, while the Mall hub has distinct destination cards. Combining those into at most three paths needs shared route trunks with multiple endpoints and changed attachment/selection behavior, rather than one counted edge between existing ports. That routing change is skipped; T028 remains unchecked.

## Confirmed inferences

T029 / M17 confirmed at 1280×720 and 2560×1440. `.lineage-hops` has `flex-wrap: wrap` and a computed width of 488.421875 px at both widths. Its path uses `flex: 1 1 160px`. The children have widths 27.09375, 103.609375, 259.515625, 48.203125 and 105.21875 px. The final Foreign keys button wraps to y=249 at 1280 (steps y=213), and y=209 at 2560 (steps y=173), despite the wide pane. The flex basis participates in intrinsic sizing of the non-growing hops item, then its path grows on the first row, leaving the final button alone on the second. `.lineage-subbar > .lineage-hops` only caps max-width; it does not allocate remaining width or prevent this wrapping.

Proof: `out/lane-b/hops.jsonl` and `out/lane-b/t029/local-contract-graph-{1280,1440,2560}.png`, reproduced by `scripts/ui-review/capture-tour.ts`. An ignored preload restricts the tour inventory to the two owned canvases and its viewport matrix to the requested desktop sizes. All example/state navigation remains the stock tour.

T026 after images at `out/lane-b/t029/local-{contract,mapping}-graph-1440.png` were opened. Contract centre is whole, but right-side cards/labels remain clipped. Mapping top cards are still clipped after readable fallback. The change is therefore not accepted yet.

## T030 — complete

Hops uses a non-wrapping row, with only the path text growing/shrinking. Zoom and fullscreen now share one icon group beside the walk trail, leaving the primary toolbar on one row at 1280. Opened all three after images `out/lane-b/t030-final/local-contract-graph-{1280,1440,2560}.png`, paired with `local-light/local-contract-graph-{1280,1440,2560}.png`. Hops is visibly one row at each width and there are two rows of controls above the canvas at 1280. The 2560 second-row Foreign keys defect is gone. Unit summary: 10 pass, 0 fail (`lineage-hops` and `lineage-view`). Dedicated `checkHopsRow` checks child centre-lines through the browser entry point.

## T031 — implementation and capture

The existing 1400 px content measure now includes `.odcs-lineage-host`; no second page-width rule was added. Opened `out/lane-b/t031/local-odcs-dataset--lineage-2560.png`: header and canvas align at both edges. The task's `rest`/`SW_ONLY=odcs` command emits `local-odcs-dataset--lineage`, rather than its stated `local-dataset-lineage--first-view` basename; both open Mall/properties on Lineage. The latter baseline is the graph-state sequence and needs a separate recapture for an exact stage pair. Browser width assertion was added to test:odcs at 2560 and restores the previous viewport afterwards.

## T032 — implementation

Walk trail names the current and original centre after a walk. CENTER now sits beside the name, independently of the kind line hidden at far zoom. The legend explains grouping tint and collapses behind a Legend disclosure on narrow screens; expanded content retains keys and line kinds. Empty reaches show one explanatory line and disable hop buttons. `out/lane-b/t032/local-contract-lineage--no-links-390.png` opened: disabled Hops, visible CENTER, one message and the collapsed Legend are present. The underlying fixed header/port geometry is retained; removing its unused band would require relayout on zoom and is not included.

## T033 — implementation

Label placement rejects a slot intersected by any laid-out route, including diagonal segments; renderer suppresses placed labels clipped by the current pane. Layout state disables the native controls fieldset and hop buttons while ELK runs. The route-crossing test distinguishes a blocked slot from a clear route. Focused unit summary: 17 pass, 0 fail, 40 expect calls. Loading/edge browser proof remains part of the final checks.

## T034 — complete

Foreign-key docs now state one to three. Mapping Steps (1–5) is described separately, and first-view docs describe the actual bounds decision and nearest-set fallback. `bun test tests/lineage-hops.test.ts`: 4 pass, 0 fail, 13 expect calls. `rg -n 'one to five' docs README.md` has no matches. The changelog fragment and both edited guides pass the deliverable leak scanner with zero hits.
