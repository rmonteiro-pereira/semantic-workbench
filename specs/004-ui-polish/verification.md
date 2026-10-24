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
