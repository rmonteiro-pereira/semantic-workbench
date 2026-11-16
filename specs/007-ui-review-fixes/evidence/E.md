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
