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

### T065 — phone mappings

- Before: review `screenshots/followup/local-mapped-commerce-mappings--concept-with-bindings-390-full.png`.
- After: `/tmp/sw-E/final-content-phone/screenshots/followup/local-mapped-commerce-mappings--concept-with-bindings-390.png` (opened). Identifier and Back to concepts now sit inside the viewport, replacing the concept list. Resolved bindings are open with styled disclosure rows.
- `test:mappings-layout`: 8 checks passed, including the added phone-selection geometry assertion and the existing long-list bounds.

### T071 — footer and missing-resource investigation

- Parsing Mall semantic alone yields 167 entities and 277 edges: 259 declared joins plus 18 metric-to-dataset dependencies. Parsing UBL first does not change Mall's result. There is no stale relationship count to correct.
- `tests/footer-counts.test.ts` retains the real parsing regression through the model entry point.
- The repeated 404 is an optional draft read, not a missing font or favicon. Navigation now consults the existing draft inventory before fetching a draft. A concurrent deletion can still race that read and yield the existing harmless 404.
- Follow-up status captures: `/tmp/sw-E/final-content-phone/screenshots/followup/local-status-bar--mall-semantic-yaml{,-after-ubl}-390.png`; capture records retain both results.

### T066 — findings beside fields

- Wizard blocking findings now carry their owning field; the repeated footer/list copies are removed. Item editor findings mark their field, and duplicate-name refusal marks Name in both forms.
- Before: review `screenshots/states/local-metric-wizard--step-3-validation-error-1440.png` and `screenshots/followup/local-item-editor--duplicate-name-refusal-1440.png`.
- After (opened): `/tmp/sw-E/final-metrics/local-metric-wizard--step-3-validation-error-1440.png` and `/tmp/sw-E/final-content-desktop/screenshots/followup/local-item-editor--duplicate-name-refusal-1440.png`.
- Name and numerator feedback sit under their controls; the wizard no longer repeats them below the form. Follow-up reports `field_error: 1` for duplicate Name in both forms.
- `test:item-edit`: 11 checks passed; `test:metrics`: 11 checks passed.

### T064 — scope exception

- Sidebar reserves the Add project slot for readers without that action; `test:sidebar`: 4 checks passed.
- Width portion skipped: at 2560×1440 measured content starts are Catalog 650, Overview 648, Mappings 648, Metrics 656 and Metric detail 1234.71875 px. The detail is deliberately beside the metric list, so making it share the other pages' content edge requires changing the master/detail layout, beyond a content-width correction. No such layout redesign is included.
- The common-root width experiment was removed. The existing content cap is reused by the metric list.

### T067 — first run and menus

- Before: review `screenshots/states/local-shell--new-menu-1440.png`, `local-shell--avatar-menu-1440.png`, `local-workspace--first-run-empty-1440.png`.
- After: `/tmp/sw-E/final-shell/local-shell--{new-menu,avatar-menu}-1440.png` and `/tmp/sw-E/final-empty/local-workspace--first-run-empty-1440.png`.
- Opened new-menu and first-run after images: Add table is first for the contract, unavailable entries retain their explanations, desktop Back is absent, and first run offers Import files without the tab/search toolbar.
- Local Admin menu wording is Local administration.
- `test:projects`: 8 checks passed; `test:sidebar`: 4 checks passed.

### T068 — import refusal and empty mappings

- Unsupported extensions are rejected before repair for both import destinations. A project without a mapping hides its empty selector/disabled actions and offers Import and Load example instead.
- Before: review `screenshots/states/local-import--refused-file-1440.png`; after: `/tmp/sw-E/final-files/local-import--refused-file-1440.png` (opened: single notice, no YAML repair editor).
- `tests/new-file.test.ts` includes extension refusal; focused files total 37 pass. `test:ui`: 20 checks passed; `test:projects`: 8 checks passed.
- The empty-state decision belongs to MappingExplorer: QueryComposer is rendered only after a mapping context resolves, so changing the composer itself is unnecessary.

### T059 and T069 — shared controls

- Disabled buttons use a solid muted border instead of a dashed outline; the existing muted label retains its contrast. Inputs, selects, textareas and checkboxes share the focus token.
- Before: review `screenshots/local-dark/local-dark-metric-wizard-1440.png` and `screenshots/followup/local-interaction--focus-native-select-1440.png`.
- After (opened): `/tmp/sw-E/final-dark-metrics/local-dark-metric-wizard--step-1-empty-validation-1440.png` and `/tmp/sw-E/final-focus/screenshots/followup/local-interaction--focus-native-select-1440.png`. Disabled Back is subdued with a solid border; select focus uses the theme ring.
- Modal already used the required 18 px title and primary-last footer. The dialog gate now asserts the title scale and solid disabled border. Selects retain one native chevron with the token border; the custom-chevron experiment was removed after it shrank intrinsic widths.
- Eyebrow weight is consistent; form label color is shared.
- `test:theme`: 10 checks passed; `test:dialogs`: 9 checks passed at six viewports. `tests/admin-clipping.test.tsx` and `tests/admin-dialogs.test.tsx`: 13 pass, 0 fail after removing the custom-chevron experiment.
- Some earlier capture runs overlapped source edits; only the explicitly listed inspected states are evidence. Logs retain those earlier failures.

### T070 — palette and polish

- Replaced the confirmed red-family group entry with blue-gray #6d819b; unit coverage rejects group hues in 345–20 degrees.
- Before: review `screenshots/states/local-contract-lineage--first-view-1440.png`; after: `/tmp/sw-E/focused-lineage/local-contract-lineage--first-view-1440.png`. Both opened: the same properties/portfolios cards retain their layout and use blue-gray instead of pink.
- The focused capture invokes the original lineage capture routine on a fresh browser; the full graph sweep accumulated fullscreen state failures, retained in its log.
- Before: review `screenshots/states/local-metric-wizard--step-8-1440.png`; after: `/tmp/sw-E/final-metrics/local-metric-wizard--step-8-1440.png` (opened). Preview lines wrap inside the bounded pane.
- Explore neighborhood and the item editor's source action use standard button spacing; labels share their token. Removed the unlabelled sidebar dot; deletion preview now says Will move to trash.
- `bun test tests/theme-check.test.ts`: 18 pass, 0 fail, 85 assertions. `test:theme`: 10 checks passed.

### T072 — documentation

- Updated the existing first-run, catalog, wizard, mappings and trash guidance; theme guidance describes palette exclusions and solid disabled borders. README reflects the searchable inventory and catalog count. The changelog retains the foundation font entry.
- `SW_BASE_URL=http://127.0.0.1:5251 bun run test:terminology`: Terminology check passed across 8 files' views, metric detail, wizard, README and docs.
- `bun --bun run check`: TypeScript, formatter, lint, comment, theme and brand checks passed before the lane-A dependent import.
- Full leak scanner: 0 hits in README, user guide, theme guide and changelog.
- Safety deviation: two earlier terminology attempts omitted SW_BASE_URL and attempted the harness default 5173. Both were refused (no listener reached); the successful run explicitly used 5251. No service was started on 5173.

### T057 — partial; integration dependency and skipped hover behavior

- Cards top-align their rows and content; descriptions end at a word boundary with an ellipsis, with the complete description in the title. Sidebar types are inline badges and the scrolling tree has an edge fade.
- Before: review `screenshots/local-light/local-catalog-1440.png`; after: `/tmp/sw-E/final-stock/local-catalog-1440.png`. Both opened: headings and type labels align; descriptions no longer end in a cut word; sidebar types have a badge background. Same UBL file, light theme, 1440×900, four example projects.
- The stock capture driver ran with only catalog/item-editor selected and the 1440×900 viewport; its state setup and screenshot code are unchanged. `/tmp/sw-E/final-stock/local-item-editor-1440.png` was also opened: source action has standard padding and one native select chevron remains.
- `test:sidebar`: 4 checks passed; `test:clipping`: 6 checks passed, errors []. Catalog presentation: 17 pass, 0 fail, 31 assertions (including word-boundary truncation through CatalogView).
- Hover-only Edit is explicitly skipped. Hiding Edit breaks the shared edit-tour entry point, which locates and clicks Edit before hovering; that driver is outside lane E ownership. The attempted hiding rules were removed. Edit remains accessible and visible.
- The final catalog edit imports `humanizeIdentifier` from `src/app/graph/EntityName.tsx`, as directed. Verified its export on branch 007-lane-a with git show; it is absent on this branch. No local copy or graph-file edit was made. The inspected catalog image precedes this final dependent import and still shows EntityType. Integrator must merge A before E, then capture the humanized type label and rerun checks. T057 remains unchecked because that proof and hover-only behavior are incomplete.

### T073 — checks executed; gate incomplete

All browser suites below used `SW_BASE_URL=http://127.0.0.1:5251`; isolated fixtures used dynamic ports, or 5252 for the fixed-port follow-up capture driver. No test budget or assertion was relaxed.

| Command | Observed summary | Log |
| --- | --- | --- |
| `bun test` | 2076 pass; 0 fail; 130812 assertions; 286 files; 524.57 s | `/tmp/sw-E-bun-test-final.log` |
| `bun --bun run check` before A import | TypeScript, formatter, lint, comments, theme and brand passed | `/tmp/sw-E-check-final-before-A.log` |
| `bun --bun run build` before A import | built in 3.42 s; existing chunk-size/directive warnings | `/tmp/sw-E-build.log` |
| `bun run test:ui` | 20 UI checks passed | `/tmp/sw-E-ui.log` |
| `bun run test:responsive` | Exit 1: mall.odcs.yaml canvas expected >=421, received 407 | `/tmp/sw-E-responsive-final.log` |
| `bun run test:theme` | 10 theme checks passed | `/tmp/sw-E-theme3.log` |
| `bun run test:dialogs` | 9 dialog checks passed at six viewports | `/tmp/sw-E-dialogs.log` |
| `bun run test:metrics` | 11 metrics checks passed | `/tmp/sw-E-frozen-metrics.log` |
| `bun run test:trash` | 13 trash checks passed | `/tmp/sw-E-frozen-trash.log` |
| `bun run test:projects` | 8 project checks passed | `/tmp/sw-E-projects.log` |
| `bun run test:sidebar` | 4 sidebar layout checks passed | `/tmp/sw-E-sidebar.log` |
| `bun run test:mappings-layout` | 8 mapping layout checks passed | `/tmp/sw-E-frozen-mappings.log` |
| `bun run test:item-edit` | 11 item-edit checks passed | `/tmp/sw-E-item-edit.log` |
| `bun run test:clipping` | passed: 6, errors: [] | `/tmp/sw-E-clipping3.log` |
| `bun scripts/mutation-tests.ts` | Exit 1: Baseline failed (example-registry), empty stderr, existing 10 s child limit | `/tmp/sw-E-mutations-final.log` |
| `bun scripts/shell-mutants.ts` | 2 shell mutants killed; 2 baselines passed | `/tmp/sw-E-shell-mutants-final.log` |

- Full unit/browser results and the focused mutants above precede the final A-dependent import. They are not a claim that the final unintegrated tree passes.
- Final `bun --bun run check`: TS2305, EntityName has no exported member humanizeIdentifier. Final build: missing export of that same function. Logs `/tmp/sw-E-check-with-A-import.log` and `/tmp/sw-E-build-with-A-import.log`. Merge A first; no local substitute was created.
- Responsive failure reproduced on an archived copy of foundation commit 593f2c18 inside this worktree's ignored out directory, served on 5251: canvas x313, y249, width954, height407. Log `/tmp/sw-E-baseline-canvas.log`. It belongs to the graph toolbar/canvas work; E does not change those selectors or lower its threshold.
- The complete mutation runner failed twice at example-registry before reaching E mutants. The unmodified example-registry case also completed successfully when invoked without the runner's 10 s limit against the archived foundation module. A whole-run attempt inside ignored out stopped earlier because Oxlint ignores out; no pass is claimed for that attempt. Existing example-registry source and timeout remain unchanged.
- The shell mutations reuse the existing isolated asset-category dispatch through E-owned font-mutants.ts. Shared mutation-tests.ts changes contain only the E import and registration within its sentinels.
- Final formatter: All matched files use the correct format (1023 files); lint exit 0. Readability checker and docs-sync exit 0. The requested scripts/commit_cadence.py is absent (exit 2); no replacement tooling was added.
- T073 remains unchecked: the full gate is not green. T057, T064 and T073 are explicitly incomplete/partially skipped for the reasons above. All other lane tasks are checked.
- All started dev servers and browser processes have exited. Final process inspection found no Bun/Vite/Chromium process with this worktree as its working directory. No push, merge, tag, remote change or deployment was performed.

## Lane commits

```text
4de9aad3 fix: explain empty catalog searches (T056)
65dd27f2 test: confirm cross-project trash purge and phone mapping placement (T060 T061)
ad5a1a88 docs: confirm the Mall lineage palette entry (T062)
514cef73 fix: stabilize metric authoring and locate validation feedback (T058 T066)
4689f358 fix: list deleted files from every project in Trash (T063)
8da2d04d fix: keep mapping selection visible on phones and avoid absent draft reads (T065 T071)
3f56ccbb fix: mark item fields that need correction (T066)
3d1527f4 fix: clarify first-run creation and refuse unsupported imports (T067 T068)
7e1d6909 fix: unify disabled actions and native control presentation (T059 T069)
b0f80caf fix: reserve red for destructive feedback (T070)
49c0cc37 docs: describe revised workspace flows (T072)
816ac087 fix: align catalog content and reuse lane A type labels (T057 T064)
```
