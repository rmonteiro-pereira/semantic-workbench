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
