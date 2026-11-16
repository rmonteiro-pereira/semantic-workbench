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

The requested 12 px names cannot fit inside the measured fitted card heights. At 1440 the existing walk button scales to 2.78×2.96 px, with the entire card only a few pixels wide. A font compensated to 12 screen pixels and bounded by that card's header height cannot simultaneously satisfy both bounds. Fixing this requires changing Fit semantics, layout density or the representation beyond the named font adjustment. No name-only rendering change is made.
