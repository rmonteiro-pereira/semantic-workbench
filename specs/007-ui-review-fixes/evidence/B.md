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
