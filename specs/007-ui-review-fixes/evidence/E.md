# Lane E

## Scope ledger

- Catalog receives validated entities and a controlled search string; filtering does not change the document.
- Empty-result presentation adds a clear callback through the existing canvas; entity selection and editing keep their contracts.
- Shared modal focus, inert background and footer behavior remain the framework guarantees for wizard changes.
- Browser fixtures use disposable workspaces and dynamic API ports; the frontend is on 5251.

## Completed work

### T056 — catalog search

- Added result count, no-match message, Clear search, and desktop search minimum width 240 px.
- Before: review `screenshots/states/local-catalog--search-no-result-{1440,390}.png`.
- After: `/tmp/sw-E/catalog/local-catalog--search-no-result-{1440,390}.png`.
- Both after images opened: query, count (0 of 45), message and complete clear button are visible at both widths.
- `bun test tests/polish-presentation.test.tsx`: 9 pass, 0 fail, 17 assertions.
- Static check initially identified the nullable model contract; filtering now preserves the previous null-safe behavior.

## Confirmed inferences

## Checks and limitations

- Capture console identifies missing drafts (`/api/drafts/ubl/ubl.ontology.yaml`) as the recurring 404; investigation belongs to T071.

### T060 — cross-project purge confirmation

- Real handler scenario imports Alpha and Beta, deletes Alpha's file, evaluates the dialog split with Beta selected, and invokes confirmed DELETE `/api/trash`.
- The deleted entry exists in the temporary trash directory before Empty trash and is absent afterwards, even though Beta's file list is empty. The risk is confirmed.
- `bun test tests/trash-sections.test.ts`: 3 pass, 0 fail.

### T061 — phone mapping confirmation

- At 390×844, selecting Identifier (5 bindings) puts its row at y=669.1875–730.1875 and the detail at y=1165.1875: 435 px below the selected row's bottom.
- Scrolling reaches the detail; it is below the concept list rather than missing.
- Before-fix capture: `/tmp/sw-E/confirmation/screenshots/followup/local-mapped-commerce-mappings--concept-with-bindings-390-full.png`.
- Follow-up drivers' fixed fixture ports are remapped in a temporary Bun preload to 5252; no repository capture driver changed.

### T062 — palette confirmation

- Mall contract Graph at 1440×900: properties and portfolios carry computed `--card-tint: #ab6d64`, the sixth (index 5) GROUP_PALETTE entry.
- Cards themselves have surface-white backgrounds; the tint is applied to their children. The domain group uses this entry; the inference about the palette source is confirmed.

### T058 — stable metric wizard

- The eight-step title position and the step-2 searchable dataset/metric list pass `test:metrics`: 11 checks passed.
- Before: review `screenshots/states/local-metric-wizard--step-{1-empty-validation,2,4}-1440.png`.
- After: `/tmp/sw-E/final-metrics/local-metric-wizard--step-{1-empty-validation,2,4}-1440.png`.
- Opened all three after images: title at the same top position, 142 datasets / 25 metrics count above a bounded searchable list, and fixed footer visible. The step 2 review image was also opened for comparison.
- Capture geometry incorrectly counts text behind an open native dialog as covered/overlapping; this is retained in capture logs, not suppressed.

### T063 — all-project trash visibility

- Other-project deleted files are now listed under project names, with the existing project-selection action behind Switch to project. Empty trash has danger styling and keeps the explicit every-project confirmation.
- Before: review `screenshots/followup/local-trash--populated-1440.png`; after: `/tmp/sw-E/final-trash/screenshots/followup/local-trash--populated-1440.png` (both opened; the neutral action is now red).
- `test:trash`: 13 checks passed. Its cross-project scenario asserts the formerly hidden filename and the switch action. `tests/trash-sections.test.ts`: 3 pass, including filesystem purge confirmation.
