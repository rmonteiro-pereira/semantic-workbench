# Release verification

Work started from `bce884c` on `004-ui-polish`. Browser checks use an isolated API and
`SW_BASE_URL=http://127.0.0.1:5175`. The owner's server and data root are not used.

## Shared navigation and dialog fixes

- `bun run fmt`: passed.
- `bun --bun run check`: passed, including type checking, formatting, lint, comments,
  theme literals and brand literals.
- `RESPONSIVE_ONLY='shell screens:' bun --bun run test:responsive`: 4 checks passed,
  at 390×844, 1280×720, 1440×900 and 2560×1440.
- The installed readable-code check passed for the changed code and browser checks.
- Initial edit-screen matrix: 4 checks passed at the four release sizes.
- Strengthened edit checks exposed a real CSS cascade defect: the shared dialog body's padding
  overrode the item drawer's bottom padding. The drawer selector now includes `has-footer`,
  so the scroll-space rule wins.
- A second strengthened-check run exposed the mapping page's paragraph maximum width leaking
  into its query dialog footer. The shared footer hint now explicitly uses the full row.
  These were real failures, not machine-load reruns. The final strengthened edit matrix passed
  all 4 viewport checks after both fixes.
- `bun test`: 1,832 passed, 0 failed, 128,578 assertions across 257 files (294.22 seconds).
- `bun --bun run build`: passed. The existing bundle-size advisory remains informational.
- `bun --bun run check`: passed again after the strengthened assertions and cascade fixes.
- The strengthened dataset matrix passed at 390 and 1280 px, then found the off-centre
  Team and roles dialog at 1440 px. A broad ODCS page-width selector capped the native dialog
  overlay at 1,400 px. Excluding dialogs preserves viewport centring. The redundant 960 px
  Relationships cap was removed so it shares the existing readable content width.
- The first Relationships width assertion mistakenly included the page's horizontal padding
  in its available-width measurement. It now compares the table wrapper with its actual tab
  panel, retaining the existing 1,400 px readable-width cap and all existing assertions.
- Strengthened dataset and final shell matrices: 4 viewport checks each passed.
- `test:dialogs`: 9 checks passed across 6 viewports.
- Focused light/dark capture: 40 images, zero automated geometry problems and no skipped screens.
  Independent visual review found remaining issues recorded for the next batch.
- Check and build passed again after those captures. The full release gate remains pending.

No timing budget, timeout or assertion was relaxed. No load-related rerun has been needed.

## Readable first views and edit states

- Check and build passed after this batch; the overview-capacity unit file passed 5 tests.
- Graph canvas matrix: 4 passed, including rendered detail size multiplied by viewport scale.
- Strengthened edit matrix: 4 passed, including retained metric units and matching column headings.
- Shell matrix: 4 passed, including keyboard traversal to an initially clipped neighboring tab.
- `test:trash`: 13 passed. `test:monorepo`: 8 passed.
- Architecture review caught a Type heading left visible after its cells were hidden. The heading
  now shares the cell class, and a browser assertion compares visible headings with cell labels.
- The new keyboard assertion exposed native focus leaving a tab partially visible. ScrollStrip
  now explicitly reveals a focused control with the same clearance as the selected tab.
- Two subsequent keyboard-check failures were test-state problems: the check left an unselected
  tab in view before the next screen, and attempted focus through an inert phone drawer background.
  It now restores selected focus and checks only interactive strips. All four sizes then passed.
- These are documented diagnostic reruns, not machine-load reruns. Existing timing budgets,
  timeouts and assertions are unchanged. The mutation inventory has one new zoom-cutoff fault;
  the complete mutation run remains part of the pending final release gate.

## Source actions and graph explanations

- Mapping layout: 4 checks passed, including selected-document Source navigation at six sizes.
- Two diagnostic runs corrected the new test setup: EmptyState titles are strong text rather
  than headings, and reopening an original project requires expanding its collapsed tree row.
  The navigation, source-content and viewport assertions were retained.
- Focused graph units: 11 passed, 31 assertions across two files.
- Both new edge-label bounds faults were killed individually: ignoring bounds and omitting the
  caller's bounds. The complete mutation inventory still awaits its final gate run.
- The complete responsive matrix is running. No timing budget or timeout was changed.

- The complete responsive run passed the main, edit, ODCS, project, export, file, folder, shell,
  admin, header, ODCS graph and example tours, then failed dark-theme contrast on deliberately
  transparent clipped tabs. The strip now clips those fragments geometrically while retaining
  opaque theme colors and keyboard focusability. The containment assertion checks the clip;
  focused and selected controls must also have no clip. Contrast assertions remain unchanged.

- Dark theme rerun: all 4 viewport checks passed. Keyboard shell rerun: all 4 passed.
- The new direction-label assertion initially ran before opening the phone Controls panel.
  Its setup now opens that panel, checks the exact label and restores the previous folded state.
- Neighborhood details now disappear below natural scale; its geometry floor is strengthened
  from 11 to 12 rendered pixels. The new graph matrix is being rerun.

- Final strengthened graph matrix: 4 checks passed. Static check and build passed afterward.
- Readable-code, documentation sync and architecture structure checks passed. Independent
  architecture review reports SHIP. Full release gate and complete visual review remain pending.
