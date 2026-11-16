---

description: "Task list for the UI review fixes, split into five parallel lanes"

---

# Tasks: UI review fixes

**Input**: Design documents from `/specs/007-ui-review-fixes/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md (no data-model.md and no contracts/: nothing stored or exposed changes)

**Tests**: required. The constitution's verification gate applies to UI work: unit tests, extended browser checks with geometry assertions, mutants for new decision logic. Each task's Proof line names them.

**Organization**: tasks are grouped by user story, and each story is one lane (plan.md, Lane split), so a lane agent reads one phase. Foundation tasks come first because the font change alters text width on every screen.

## Format: `[ID] [P?] [Story] [Lane] Description`

- **[P]**: can run in parallel with the other tasks of its lane (its files are not named by another task of the lane). Lanes themselves always run in parallel.
- **[Story]**: US1 to US5 (spec.md). **[Lane]**: A to E.
- Every task lists its findings (review ids), its requirements (spec.md), its files, the change in one or two sentences and its proof. **Proof for a visual task is a before/after pair**: the review screenshot named is the 'before'; the 'after' is the same state recaptured with the named script on the same example, file, state stage, viewport and theme (quickstart.md), plus the check named. Pairs are listed in `evidence/<lane>.md`; images stay out of git.
- Run a lane's final task before asking for its merge. Do not run `speckit-implement`-style bulk edits across lanes.

## Path conventions

Repository paths are relative to the worktree root. `<out>` is the lane's output folder under `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/after/<lane>/`. Review screenshot names are relative to `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/`. `CAP` scripts live in `scripts/ui-review/`.

---
## Phase 1: Setup (shared infrastructure)

**Purpose**: tooling every lane needs before it starts. Done once, on the 007 branch.

- [x] T001 Copy the review's capture scripts into `scripts/ui-review/` on the 007 branch and make them pass `bun --bun run check`.
  - Files: scripts/ui-review/*.ts (from /home/rodrigo/projetos/semantic-workbench-ui-review-20261115/capture-scripts/)
  - Change: The scripts import `../helpers/*` and `../../src/*`, so they only run from inside the repository. Copy them unchanged apart from formatting, set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` to a neutral identity in the shared fixture helper so no capture shows the owner's name, and keep them as a development tool documented in `docs/development.md`.
  - Proof: `bun --bun run check` passes; `bun scripts/ui-review/known-issues.ts <out> 1 1` runs against a lane dev server and writes images.

- [ ] T002 Write `specs/007-ui-review-fixes/capture-index.md`: for every review screenshot named in `spec.md` and `tasks.md`, the exact script, `SW_ONLY` group, `SW_THEME` and widths that reproduce it.
  - Files: `specs/007-ui-review-fixes/capture-index.md`
  - Change: Several screenshot names do not appear literally in the scripts (for example `source-control--diff-modified`); resolve each to a command by reading the scripts, and run one command per script to prove it produces the named file.
  - Proof: Every row has a command; one run per script produced the named file in a scratch folder.

- [x] T003 Add lane sentinels so lanes never edit the same lines of the shared registration files.
  - Files: `scripts/mutation-tests.ts`, `scripts/helpers/all-tours.ts`
  - Change: Insert five comment pairs (`// lane A imports` and `// lane A mutants` through lane E) after the last existing import and mutant registration lines, so each lane adds its own import and `mutants.push(...)` under its own sentinel. Do the same in `scripts/helpers/all-tours.ts` for tour entries.
  - Proof: `bun --bun run check` and `bun scripts/mutation-tests.ts` still pass with no mutant added.

---

## Phase 2: Foundational (blocks every lane): fonts and worktrees

**Purpose**: the font change alters text width on every screen, so it merges first and every lane rebases on it before capturing an 'after' image. **No lane captures an 'after' image before this phase is merged.**

- [ ] T004 [P] [E] Vendor DM Sans and Manrope as woff2 files in `src/shared/fonts/` with each family's OFL.txt and a `README.md` recording upstream URL, version and SHA-256.
  - Findings: M7 · Requirements: FR-053
  - Files: `src/shared/fonts/*.woff2`, `src/shared/fonts/OFL-DM-Sans.txt`, `src/shared/fonts/OFL-Manrope.txt`, `src/shared/fonts/README.md`
  - Change: Download the variable woff2 files (Latin and Latin-extended subsets) from each family's official release, check the SHA-256 against the upstream release, and store the licence text beside them. No npm font package is added, so no new runtime dependency is introduced.
  - Proof: Files exist; the README lists a checksum that `sha256sum` reproduces.

- [ ] T005 [E] Declare the fonts and give every font declaration a fallback.
  - Findings: M7 · Requirements: FR-053
  - Files: `src/shared/fonts/fonts.css`, `src/app/main.tsx`, `src/app/style.css`, `src/app/graph/graph-canvas.css`, `src/app/scm/scm.css`, `src/app/editor/editor.css`, `src/app/odcs/odcs.css`, `src/app/odcs/contract.css`, `src/app/edit/edit.css`, `src/app/metrics/metrics.css`, `src/app/admin/admin.css`, `src/app/workspace/WorkspaceHeader.css`
  - Change: Add `@font-face` rules (`font-display: swap`) and `--font-sans` and `--font-display` custom properties in `fonts.css`, import it before the theme stylesheet, and replace every `font` shorthand and `font-family` that names `DM Sans`, `Manrope` or nothing with the tokens, so each ends in `sans-serif` (monospace stays monospace). This is the only task in the plan that edits font lines in every lane's stylesheet; it merges first so no lane meets those lines again.
  - Proof: Before `states/local-workspace--first-run-empty-1440.png` (serif heading); after: same state with `scripts/ui-review/empty-states.ts` at 1440 light and `states/local-dark-workspace--first-run-empty-1440.png` at 1440 dark; check: `tests/fonts.test.ts` (next task) and `bun run test:theme`.

- [ ] T006 [E] Add `tests/fonts.test.ts`: every `@font-face` URL resolves to a file in `src/shared/fonts/`, each family has a licence file, and no CSS file under `src/` has a `font` or `font-family` declaration without a generic family or a `--font-*` token.
  - Findings: M7 · Requirements: FR-053
  - Files: `tests/fonts.test.ts`, `scripts/font-mutants.ts`, `scripts/font-mutation-cases.ts`, `scripts/mutation-tests.ts`
  - Change: Pattern after `tests/theme-check.test.ts`. Add mutants that drop a fallback, point a URL at a missing file and remove a licence file, registered under lane E's sentinel.
  - Proof: `bun test tests/fonts.test.ts` passes; `bun scripts/mutation-tests.ts` detects the three new mutants.

- [ ] T007 [P] [E] Extend the theme browser check so it loads the first-run screen with network access to anything but the origin blocked, and asserts `document.fonts.check('16px "DM Sans"')` and `document.fonts.check('700 22px Manrope')` and that no heading's computed font stack falls to a serif face.
  - Findings: M7 · Requirements: FR-053
  - Files: `scripts/theme-browser-check.ts`, `scripts/helpers/theme-tour.ts`
  - Change: Add the font assertions beside the existing accent and contrast checks; log every request host and fail on any host other than the application's.
  - Proof: `bun run test:theme` passes and the new assertions are listed in its output; before the fix the same assertions fail on `main` (run once on e8b7d69 to show they bite).

- [ ] T008 [E] Document the fonts: README technology stack and licences, `docs/theme.md` (fonts section), `ARCHITECTURE.md` (shared layer), CHANGELOG fragment.
  - Findings: M7 · Requirements: FR-053
  - Files: `README.md`, `docs/theme.md`, `ARCHITECTURE.md`, `specs/007-ui-review-fixes/changelog/E.md`
  - Change: State that the fonts are bundled, name the licence, and describe how to replace them (swap files and the two tokens). The CSP needs no change because `default-src 'self'` already covers fonts from the origin; say so.
  - Proof: Docs build reads true against `src/server/static.ts`; `bun --bun run check` passes.

- [ ] T009 [E] Run the foundation checks and merge: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:theme`, `bun run test:responsive`, `bun scripts/mutation-tests.ts`; then merge to the 007 branch so every other lane rebases on the final glyph metrics.
  - Change: Fonts change text width everywhere, so no lane captures an 'after' image until it has rebased on this merge.
  - Proof: All six commands pass; merge commit id recorded in the gate log.

- [ ] T010 Create one worktree per lane from the 007 branch after the foundation commits: `wt switch -c 007-lane-a`, `-lane-b`, `-lane-c`, `-lane-d`, `-lane-e` under `/home/rodrigo/projetos/semantic-workbench-wt/`, each pointed at its own dev port in the 5200 range and its own `DATA_DIR`.
  - Change: Lane agents never share a dev server, a port or a data folder; each reads only its lane's files.
  - Proof: `wt list` shows five lane worktrees; no two use the same port.

---

## Phase 3: User Story 1 - Read a large model's graph (Priority: P1), lane A

**Goal**: Network, Layered and Neighborhood views are readable at 1280, 1440 and 390 and the Mall model opens as counted areas. **Independent test**: the lane A capture pairs and `bun run test:graph` pass on the lane branch alone. **Owner**: lane A, worktree `007-lane-a`.

- [ ] T011 [P] [US1] [A] Measure the baseline thresholds on e8b7d69 and lock `NAME_MIN_PX`, `DIM_MIN_OPACITY`, `NEIGHBORHOOD_CANVAS_MIN_PX` and `MIN_ZOOM_FRACTION` in `research.md`.
  - Findings: M2, M3, M13, M15, m12 · Requirements: FR-001, FR-002, FR-003, FR-004, FR-006, FR-011
  - Files: `scripts/ui-review/measure-graph.ts`, `specs/007-ui-review-fixes/research.md`
  - Change: Write a small Playwright script that, for UBL and Mall at 390, 1280, 1440 and 2560, opens the Network, Layered and Neighborhood first views and prints the rendered entity-name height, the drawn-graph box against the pane, and the canvas height. Record the numbers and keep 9 px, 0.35, 480 and 0.25 unless the numbers argue otherwise.
  - Proof: Numbers table in `research.md` matches the review's measurements (UBL at 1440 near 6 px; Layered near 17% of canvas height; Neighborhood canvas near 390 px).

- [ ] T012 [US1] [A] Pack the Network layout to the pane's aspect ratio and shrink the fit padding.
  - Findings: M2 · Requirements: FR-001
  - Files: `src/app/graph/full-layout.ts`, `src/app/graph/FullGraph.tsx`, `src/app/graph/stage-size.ts`, `tests/full-layout.test.ts`
  - Change: Pass the pane's width over height into `packNetwork` instead of the fixed `elk.aspectRatio: '2.0'`, re-plan when **Re-layout** is used (resizing still does not re-layout, as `docs/graph-design.md` says), and cut the fit padding at `FullGraph.tsx` to the smallest value that keeps edge cards whole.
  - Proof: Before `states/local-full-graph-network--first-view-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` at 1440 and 390 light, and `states/local-full-graph-network--first-view-390.png`; check: `bun run test:graph` extended to assert name height at least NAME_MIN_PX and fill at least 80% for UBL at 1280, 1440, 390; unit test in `tests/full-layout.test.ts` for the packed aspect ratio.

- [ ] T013 [US1] [A] Decide counted-area first views from legibility.
  - Findings: M2 · Requirements: FR-002
  - Files: `src/app/graph/overview-capacity.ts`, `src/app/graph/overview.ts`, `src/app/graph/useFullGraphLayout.ts`, `tests/overview-capacity.test.ts`, `scripts/graph-mutants.ts`, `scripts/graph-mutation-cases.ts`
  - Change: Replace the `LARGE_MODEL = 250` count with a pure function that takes the entity count, the pane size and the card size and returns whether names at fit zoom reach NAME_MIN_PX; the existing test 'the 45-entity model opens with every entity visible' must still pass, and the Mall model must now open as counted area cards. Add mutants for the comparison and the pane-size input, registered under lane A's sentinel in `scripts/mutation-tests.ts`.
  - Proof: Before `states/local-mall-full-graph--group-automatic-1280.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` (mall-full-graph, 1280 and 1440 light) and `scripts/ui-review/large-model-states.ts <out>` for the 1,000-entity model; check: `bun test tests/overview-capacity.test.ts`; `bun run test:overview-areas`; `bun scripts/mutation-tests.ts` kills the new mutants.

- [ ] T014 [US1] [A] Open Layered filling the pane.
  - Findings: M3 · Requirements: FR-003
  - Files: `src/app/graph/full-layout.ts`, `src/app/graph/layout.ts`, `src/app/graph/useFullGraphLayout.ts`, `tests/layout.test.ts`
  - Change: Wrap the ELK areas into rows for the pane's aspect ratio (the existing `elk.aspectRatio: '1.5'` does not take effect on the root), and when names would still be under NAME_MIN_PX open zoomed on the first area with **Fit model** returning to the whole layout.
  - Proof: Before `followup/local-ubl-full-graph--layered-node-selected-1440.png`, `states/local-full-graph-layered--first-view-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` (full-graph-layered first-view at 390, 1440, 2560) and `scripts/ui-review/followup-local.ts <out> graphs`; check: `bun run test:graph` asserts the drawn graph height is at least 60% of the canvas at 1440 and that no two area frames overlap.

- [ ] T015 [US1] [A] Keep the graph readable and the toolbar on one row when a node is selected.
  - Findings: M13 · Requirements: FR-004
  - Files: `src/app/graph/FullGraph.tsx`, `src/app/graph/CompactControls.tsx`, `src/app/graph/fullscreen.ts`, `src/app/graph/graph-canvas.css`, `src/app/workspace/DetailsPanel.tsx`, src/app/style.css (selectors `.graph-toolbar*`, `.fullscreen-*` only)
  - Change: Fit to the selected node and its neighbours when the details pane opens, raise the dimmed opacity to DIM_MIN_OPACITY, and move the Labels, Value types, Metrics and Mini-map switches into the existing **Controls** overflow before the toolbar wraps; keep **Exit full screen** in the first row.
  - Proof: Before `followup/local-ubl-full-graph--network-node-selected-1440.png`, `states/local-full-graph-network--fullscreen-node-selected-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/followup-local.ts <out> graphs` and `scripts/ui-review/capture-states.ts <out> graphs`; check: `bun run test:graph` asserts one toolbar row at 1280 and 1440 with the pane open and names at least NAME_MIN_PX after selection; the same suite asserts the Mall Graph canvas is at least 421 px tall at 1280x720 with no pane open (`local-light/local-contract-graph-1280.png`, `states/local-mall-full-graph--group-automatic-1280.png`).

- [ ] T016 [US1] [A] Make Labels on and collapsed-area labels readable.
  - Findings: M14 · Requirements: FR-005
  - Files: `src/app/graph/FullGraphNodes.tsx`, `src/app/graph/graph-canvas.css`, `src/app/graph/text-fit.ts`, `src/app/graph/EntityName.tsx`, `tests/entity-name.test.tsx`
  - Change: At fit zoom render labels only for the selected or hovered item, drop `overflow-wrap: anywhere` at `graph-canvas.css:119` in favour of the identifier-boundary break `EntityName` already has, and print the count once in a collapsed-area card.
  - Proof: Before `states/local-full-graph-network--labels-on-1440.png`, `states/local-full-graph-network--areas-collapsed-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs`; check: unit test for the break points in `tests/entity-name.test.tsx`; `bun run test:graph` asserts no name text node is split inside a word.

- [ ] T017 [US1] [A] Open the Neighborhood at readable zoom and fold the file chips.
  - Findings: M15 · Requirements: FR-006
  - Files: `src/app/graph/NeighborhoodGraph.tsx`, `src/app/graph/NeighborhoodToolbar.tsx`, `src/app/graph/useNeighborhoodView.ts`, `src/app/graph/expansion-viewport.ts`, `tests/expansion-viewport.test.ts`, src/app/style.css (selectors `.neighborhood-*` only)
  - Change: Compute the first viewport with `expansion-viewport.ts` (centre on the centre card at readable zoom) instead of fit-all bounds at `NeighborhoodGraph.tsx:460`, and replace the 'Continue in…' chip row with the **Other files** menu already used on a phone.
  - Proof: Before `states/local-neighborhood--first-view-1280.png`, `states/local-neighborhood--walk-3-1440.png` (review baseline); after: same state recaptured with `SW_ONLY=neighborhood scripts/ui-review/capture-states.ts <out> graphs`; check: `bun run test:graph` asserts canvas height at least NEIGHBORHOOD_CANVAS_MIN_PX at 1280x720 and the centre description at least NAME_MIN_PX.

- [ ] T018 [US1] [A] Fit a Full pierce result, or offer Fit.
  - Findings: m1 · Requirements: FR-007
  - Files: `src/app/graph/NeighborhoodGraph.tsx`, `src/app/graph/pierce.ts`, `src/app/graph/PierceControls.tsx`, `tests/pierce.test.ts`
  - Change: After a pierce publishes, fit to the result when the fitted zoom is at least the readable zoom, otherwise show the '<N> entities, Fit' prompt in the toolbar.
  - Proof: Before `followup/local-ubl-neighborhood--pierce-alone-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/followup-local.ts <out> graphs`; check: `bun run test:graph` pierce budget unchanged and the result is inside the pane or the prompt is present.

- [ ] T019 [US1] [A] Draw edges under area titles, separate bundle outlines, and space the metric badge.
  - Findings: m9 · Requirements: FR-008
  - Files: `src/app/graph/FullGraphNodes.tsx`, `src/app/graph/RoutedEdge.tsx`, `src/app/graph/edge-styles.ts`, `src/app/graph/graph-canvas.css`, `tests/edge-appearance.test.ts`
  - Change: Give the area title a plate above the edge layer, draw a bundle outline with the edge style rather than the area-frame style, and add the gap between the badge icon and its number.
  - Proof: Before `states/local-full-graph-network--zoomed-in-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs`; check: `bun run test:edges` stays green; geometry assertion that no edge path crosses an area title box in the zoomed-in state.

- [ ] T020 [US1] [A] Fix plurals, the single-entity Neighborhood card, mini-map frame and minimum zoom.
  - Findings: m10, m11, m12 · Requirements: FR-009, FR-010, FR-011
  - Files: `src/app/graph/FullGraphNodes.tsx`, `src/app/graph/collapse.ts`, `src/app/graph/NeighborhoodGraph.tsx`, `src/app/graph/FullGraph.tsx`, `src/app/graph/graph-canvas.css`, `tests/collapse.test.ts`, `tests/neighborhood-layout.test.ts`
  - Change: Use one plural helper for entity counts (`FullGraphNodes.tsx:52`, `collapse.ts:18`); cap the lone card's size and hide '0 of 0 neighbors' at `NeighborhoodGraph.tsx:666`; add a border and a viewport rectangle to the mini-map and reserve its corner; replace `minZoom={0.001}` at `FullGraph.tsx:496` with a value computed from the fitted zoom.
  - Proof: Before `states/local-full-graph--empty-1440.png`, `states/local-neighborhood--empty-1440.png`, `states/local-full-graph-network--mini-map-on-1440.png`, `states/local-full-graph-network--zoomed-minimum-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/empty-graph-states.ts <out>` and `scripts/ui-review/capture-states.ts <out> graphs`; check: unit tests for the plural and the minimum-zoom function; `bun run test:graph`.

- [ ] T021 [US1] [A] Stop truncating toolbar controls, humanise identifiers in graph labels, disable controls while laying out, and give the phone full-screen an Exit.
  - Findings: m13, P1, P8, m28 · Requirements: FR-012, FR-013, FR-014, FR-015
  - Files: `src/app/graph/NeighborhoodToolbar.tsx`, `src/app/graph/GroupingControls.tsx`, `src/app/graph/EntityName.tsx`, `src/app/graph/overview.ts`, `src/app/graph/fullscreen.ts`, `src/app/graph/graph-canvas.css`, `tests/entity-name.test.tsx`
  - Change: Let the grouping select and the centre picker size to their content up to a maximum; add one exported function that turns 'EntityType' into 'Entity type' (the catalog task in lane E reuses it) and strips 'core:' style area prefixes in labels only; disable Re-layout, grouping and zoom controls while the layout worker runs; cap the details pane at 40% in phone full screen and show a labelled Exit.
  - Proof: Before `states/local-neighborhood--walk-3-1440.png`, `states/local-neighborhood--fullscreen-390.png`, `states/local-full-graph-network--first-view-2560.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` and `scripts/ui-review/graph-loading-states.ts <out>`; check: `bun run test:graph` and `bun run test:responsive` graph block (390 full screen).

- [ ] T022 [P] [US1] [A] Update `docs/graph-design.md` (whole-model pipeline step 3 and 7, neighborhood opening), `docs/user-guide.md` (the 'first view shows every entity by name' paragraph and Labels) and write `changelog/A.md`.
  - Findings: M2, M3, M13, M14, M15 · Requirements: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
  - Files: `docs/graph-design.md`, `docs/user-guide.md`, `specs/007-ui-review-fixes/changelog/A.md`
  - Change: Replace the '250 visible business entities' sentence by the legibility rule as implemented, with the fixture and the check that measure it (Constitution VII); say plainly that very large models start as counted area cards and what Expand all does.
  - Proof: Every number in the docs is produced by `tests/overview-capacity.test.ts` or `test:graph` output; `bun run test:terminology` passes.

- [ ] T023 [US1] [A] Run lane A checks: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:graph`, `bun run test:overview-areas`, `bun run test:edges`, `bun run test:grouping-validation`, `bun run test:responsive`, `bun run test:ui`, `bun run test:examples:ui`, `bun scripts/mutation-tests.ts`.
  - Change: Fix every failure in lane A's files; a failure that points at another lane's file is reported, not patched.
  - Proof: All commands pass; command output saved to `specs/007-ui-review-fixes/evidence/A.md` with the before/after image paths.

**Checkpoint**: lane A ready to merge.

---

## Phase 4: User Story 2 - Walk lineage (Priority: P1), lane B

**Goal**: the Lineage tab starts above the fold, Walk here is reachable, Fit is readable. **Independent test**: `known-issues.ts` reports 4 of 4 clicks and `bun run test:lineage` passes on the lane branch alone. **Owner**: lane B, worktree `007-lane-b`.

- [ ] T024 [US2] [B] Collapse the table header card on the Lineage tab and give the canvas the rest of the viewport.
  - Findings: M1 · Requirements: FR-016
  - Files: `src/app/odcs/DatasetPage.tsx`, `src/app/odcs/odcs.css`, `src/app/odcs/LineageCanvas.tsx`, `src/app/workspace/ContractView.tsx`
  - Change: While the Lineage tab is active show the table header as one line (name and a link to Properties) and let the pane take the remaining height (`odcs.css:518` region). A 'Walk to…' neighbour list stays out of scope.
  - Proof: Before `states/local-lineage-walk--first-view-1280.png`, `states/local-lineage-walk--first-view-1440.png`, `states/local-lineage-walk--first-view-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/lineage-walk-states.ts <out>` (Mall dataset, light); check: `bun run test:lineage` asserts pane top at most 50% of the viewport at 1280x720 and one neighbour card whole.

- [ ] T025 [US2] [B] Keep Walk here a 24 px target at every zoom and prove the four scripted clicks.
  - Findings: M1 · Requirements: FR-017
  - Files: `src/app/odcs/LineageCard.tsx`, `src/app/odcs/odcs.css`, `src/app/odcs/useLineageViewport.ts`, `tests/lineage-view.test.ts`
  - Change: Size the 13 px icon button at `LineageCard.tsx:111` as `max(24px, 24px / zoom)`, hide it when the card is narrower than the button, and make the pane's z-order put the button above the dataset header.
  - Proof: Before `states/local-lineage-walk--first-view-1280.png`, `states/local-lineage-walk--fitted-1-before-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/known-issues.ts <out> 1 1` and `scripts/ui-review/lineage-visibility.ts <out>`; check: the known-issues script reports 4 of 4 clicks succeeding with no scroll and a button box at least 24 by 24; `test:lineage` runs the same assertion.

- [ ] T026 [US2] [B] Make the first view frame whole cards, using Fit when everything fits.
  - Findings: M4 · Requirements: FR-018
  - Files: `src/app/odcs/lineage-view.ts`, `src/app/odcs/useLineageViewport.ts`, `src/app/odcs/lineage-layout.ts`, `src/app/mappings/MappingCanvas.tsx`, `src/app/mappings/mapping-graph.ts`, `tests/lineage-view.test.ts`, `tests/mapping-graph.test.ts`
  - Change: In `lineage-view.ts` choose Fit as the first view when the whole reach fits at the readable entry zoom; otherwise centre the chosen set in the pane; fix the mapping graph's top-card cut.
  - Proof: Before `local-light/local-contract-graph-1440.png`, `local-light/local-mapping-graph-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local light` (screens contract-graph and mapping-graph); check: `tests/lineage-view.test.ts`; `bun run test:lineage` and `bun run test:mapping-graph` assert no card or label cut by the pane edge in the first view.

- [ ] T027 [US2] [B] Draw name-only compensated cards after Fit.
  - Findings: M4 · Requirements: FR-019
  - Files: `src/app/odcs/LineageCard.tsx`, `src/app/odcs/LineageColumnList.tsx`, `src/app/odcs/odcs.css`, `src/app/odcs/lineage.ts`
  - Change: Below the card-detail zoom threshold render the name only, with a font size compensated for zoom and bounded by the card height, as the mapping graph does (`states/local-mapping-graph--after-fit-1440.png`).
  - Proof: Before `states/local-contract-lineage--after-fit-1440.png`, `states/local-contract-lineage--after-fit-2560.png`, `followup/local-mall-properties-lineage--more-columns-open-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` and `scripts/ui-review/followup-local.ts <out> lineage`; check: `bun run test:lineage` asserts every card name at least NAME_MIN_PX after Fit for the Mall dataset at 1 hop.

- [ ] T028 [US2] [B] Bundle same-column lines and keep cards clear of the Selected path panel.
  - Findings: M16 · Requirements: FR-020
  - Files: `src/app/odcs/LineageEdge.tsx`, `src/app/odcs/edge-route.ts`, `src/app/odcs/SelectedPath.tsx`, `src/app/odcs/LineageCanvas.tsx`, `tests/edge-route.test.ts`
  - Change: Draw the lines that join the same column as one line with a count (the bundle split already exists), and shift the viewport when the panel opens so cards stay beside it.
  - Proof: Before `states/local-contract-lineage--column-selected-1440.png`, `states/local-mapping-graph--node-selected-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs`; check: `bun run test:lineage` and `bun run test:mapping-graph` assert no card box intersects the panel box and at most 3 visible paths for the hub column.

- [ ] T029 [P] [US2] [B] Confirm first (cause inferred in the review): find why the hops row wraps at 2560 with room to spare.
  - Findings: M17 · Requirements: FR-021
  - Files: `specs/007-ui-review-fixes/evidence/B.md`
  - Change: Read the computed layout of `.lineage-hops` and its children at 2560x1440 and 1280x720 and write which rule causes the wrap (the review suspects `hops.css:39-45` and `odcs.css:628-636`) in the 'Confirmed inferences' section of `evidence/B.md`.
  - Proof: `evidence/B.md` names the rule and its computed width values for `local-light/local-contract-graph-2560.png` reproduced with `scripts/ui-review/capture-tour.ts`.

- [ ] T030 [US2] [B] Make the hops row one row, and move zoom and full screen into an icon group.
  - Findings: M17, m7 · Requirements: FR-021, FR-028
  - Files: `src/app/odcs/hops.css`, `src/app/odcs/odcs.css`, `src/app/odcs/ForeignKeyHops.tsx`, `src/app/odcs/LineageToolbar.tsx`, `tests/lineage-hops.test.ts`
  - Change: Make `.lineage-hops` a non-wrapping flex row with the path text shrinking (`hops.css:39-45`, `odcs.css:628-636`) and render the zoom and full-screen buttons icon-only in one group with accessible names.
  - Proof: Before `local-light/local-contract-graph-1280.png`, `local-light/local-contract-graph-1440.png`, `local-light/local-contract-graph-2560.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local light`; check: `bun run test:lineage` asserts one row for the hops block at 1280 and wider and at most two toolbar rows at 1280x720.

- [ ] T031 [US2] [B] Align the dataset page card widths.
  - Findings: M23 · Requirements: FR-022
  - Files: `src/app/odcs/contract.css`, `src/app/odcs/odcs.css`
  - Change: Give the lineage card the header card's width rule (`contract.css:326`) and do not add a second page-width rule; the shared content-width rule is lane E's.
  - Proof: Before `states/local-dataset-lineage--first-view-2560.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> rest` (SW_ONLY=odcs) at 2560 light; check: `bun run test:odcs` asserts equal left and right edges.

- [ ] T032 [US2] [B] Label the walked canvas, keep the card header stable, add the legend entries and the empty state.
  - Findings: m2, m3, m4, m28, m5 · Requirements: FR-023, FR-024, FR-025, FR-026
  - Files: `src/app/odcs/LineageCanvas.tsx`, `src/app/odcs/LineageCard.tsx`, `src/app/odcs/odcs.css`, `src/app/graph/LineageLegend.tsx`, `src/app/graph/legend.css`, `src/app/odcs/LineageToolbar.tsx`, `src/app/odcs/ForeignKeyHops.tsx`
  - Change: Add 'Lineage around X (opened from Y)' after a walk; always show the CENTER badge and drop the empty band (`odcs.css:890`); add a legend row for the grouping tint and make the 390 legend collapsible with PK, FK and line kinds; show one line in an empty canvas and disable Hops.
  - Proof: Before `states/local-lineage-walk--fitted-1-after-1440.png`, `local-light/local-contract-graph-1280.png`, `states/local-contract-lineage--first-view-1440.png`, `states/local-contract-lineage--no-links-1440.png`, `states/local-contract-lineage--first-view-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/lineage-walk-states.ts`, `scripts/ui-review/empty-graph-states.ts`, `scripts/ui-review/capture-states.ts <out> graphs`; check: `bun run test:lineage`; the pair for the empty state is also taken for `states/local-dark-mapping-graph--empty-bindings-2560.png`.

- [ ] T033 [US2] [B] Keep edge labels clear of lines and the pane edge; disable the toolbar while laying out.
  - Findings: m8, P8 · Requirements: FR-029, FR-030
  - Files: `src/app/odcs/edge-labels.ts`, `src/app/odcs/LineageEdge.tsx`, `src/app/odcs/useLineageLayout.ts`, `src/app/odcs/LineageToolbar.tsx`, `tests/edge-labels.test.ts`
  - Change: Reject label slots that a line crosses or the pane clips (the placement code already ranks gaps), and pass the layout state to the toolbar so layout-dependent controls are disabled.
  - Proof: Before `states/local-contract-lineage--hops-3-list-1440.png`, `states/local-contract-lineage--node-selected-1440.png`, `states/local-contract-lineage--loading-1-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs` and `scripts/ui-review/graph-loading-states.ts <out>`; check: `tests/edge-labels.test.ts`; `bun run test:edges`.

- [ ] T034 [P] [US2] [B] Make the docs and code agree on hops and steps.
  - Findings: m6 · Requirements: FR-027
  - Files: `docs/user-guide.md`, `docs/graph-design.md`, `specs/007-ui-review-fixes/changelog/B.md`
  - Change: Change 'one to five foreign keys' (user guide line 409, graph-design line 118) to 'one to three', describe the mapping graph's **Steps** (1-5, in View options) separately, and update the 'first view frames the nearest cards whole' paragraph to what the new first view does. `MAX_HOPS` stays 3.
  - Proof: `rg -n 'one to five' docs README.md` returns nothing; `tests/lineage-hops.test.ts` asserts `MAX_HOPS` equals the number the docs state.

- [ ] T035 [US2] [B] Run lane B checks: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:lineage`, `bun run test:odcs`, `bun run test:mapping-graph`, `bun run test:edges`, `bun run test:responsive`, `bun run test:ui`, `bun scripts/mutation-tests.ts`.
  - Files: `scripts/lineage-mutants.ts`, `scripts/lineage-mutation-cases.ts`
  - Change: Add a mutant for the Fit-versus-centre decision and the 24 px compensation in `scripts/lineage-mutants.ts` (registered under lane B's sentinel).
  - Proof: All commands pass; results and image paths in `specs/007-ui-review-fixes/evidence/B.md`.

**Checkpoint**: lane B ready to merge.

---

## Phase 5: User Story 3 - Review and commit changes (Priority: P2), lane C

**Goal**: the diff is true and readable in both themes and on a phone, one message for an invalid draft, no commit block for read-only roles. **Independent test**: `bun run test:scm`, `test:editor`, `test:theme` pass on the lane branch alone. **Owner**: lane C, worktree `007-lane-c`.

- [ ] T036 [P] [US3] [C] Confirm first (inferred in the review): open the dark diff and the stale-save dialog in the browser and name the exact selectors that paint white.
  - Findings: M5 · Requirements: FR-031
  - Files: `specs/007-ui-review-fixes/evidence/C.md`
  - Change: The review inferred that CodeMirror's light defaults for `.cm-collapsedLines` and the merge gutters show through. Read the computed background of every element in `.diff-host` and in the stale-save dialog's columns, and write the list of selectors, with their computed colours, in the 'Confirmed inferences' section of `evidence/C.md`.
  - Proof: `evidence/C.md` lists the selectors with computed values from `local-dark-source-control--diff-modified-1440` reproduced with `scripts/ui-review/source-control-states.ts`.

- [ ] T037 [US3] [C] Theme the dark diff and the stale-save gutters with surface tokens.
  - Findings: M5 · Requirements: FR-031
  - Files: `src/app/scm/DiffView.tsx`, `src/app/scm/scm.css`, src/app/style.css (selectors `.stale-*` only), src/shared/theme/theme.css (editor token group only)
  - Change: Using the selectors confirmed in the previous task, add rules or a CodeMirror theme extension using `--color-surface-sunken`, `--color-border` and `--color-text-muted`.
  - Proof: Before `states/local-dark-source-control--diff-modified-1440.png`, `states/local-dark-source-editor--stale-save-warning-390.png` (review baseline); after: same state recaptured with `SW_THEME=dark scripts/ui-review/source-control-states.ts <out>`; check: `bun run test:theme` with the diff and stale-save states (next task) shows no pixel region above the white threshold.

- [ ] T038 [US3] [C] Put the diff and the stale-save dialog in the theme tour.
  - Findings: M5 · Requirements: FR-031
  - Files: `scripts/helpers/scm-theme-tour.ts`, scripts/helpers/all-tours.ts (lane C sentinel), scripts/theme-browser-check.ts (no edit unless the tour list needs it)
  - Change: Create tour entries that open Source control with a modified, an added and a deleted file, and the stale-save dialog, and assert the computed background of `.cm-collapsedLines`, `.cm-gutters` and merge gutters is not lighter than the surface token in dark.
  - Proof: `bun run test:theme` fails on e8b7d69 with these entries (run once) and passes after the previous task.

- [ ] T039 [US3] [C] Find where the staged-deletion diff goes wrong, then fix it with a test.
  - Findings: M6 · Requirements: FR-032
  - Files: `src/app/scm/DiffPane.tsx`, `src/app/scm/DiffView.tsx`, `src/app/scm/SourceControl.tsx`, `src/server/projects/scm.ts`, `tests/scm-presentation.test.ts`, `tests/git-status.test.ts`
  - Change: Reproduce with a committed file that is staged for deletion. The client asks for HEAD to index and labels the left side 'new file' only when `beforeExists` is false, so the cause may be the server's diff for a path missing from the index; fix whichever side is wrong, label 'Deleted (staged)', hide 'identical' when a side is missing (`DiffView.tsx:70`) and keep the selected row.
  - Proof: Before `states/local-source-control--staged-changes-1440.png`, `states/local-source-control--commit-message-filled-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/source-control-states.ts <out>`; check: unit test of the label function; `bun run test:scm` asserts the left label is not 'new file' and no 'identical' text for a staged delete.

- [ ] T040 [US3] [C] Fix the stale-save dialog at 390 and the order of its buttons.
  - Findings: M12, m24 · Requirements: FR-033, FR-040
  - Files: `src/app/projects/StaleSave.tsx`, src/app/style.css (selectors `.stale-*` only), `src/app/scm/DiffView.tsx`
  - Change: Stack the three buttons full width in the dialog footer (`style.css:2146-2160` region), make the safe choice primary and the overwrite an outlined danger button, and render a unified diff under 650 px using the merge view's unified mode already used for added files.
  - Proof: Before `states/local-dark-source-editor--stale-save-warning-390.png`, `states/local-source-editor--stale-save-warning-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/source-control-states.ts <out>` at 390 and 1440, light and dark; check: `bun run test:editor` and the dialog geometry check assert every button box is inside the dialog and the viewport at 390.

- [ ] T041 [US3] [C] Open the diff as its own view on a phone.
  - Findings: M12 · Requirements: FR-034
  - Files: `src/app/scm/SourceControl.tsx`, `src/app/scm/DiffPane.tsx`, `src/app/scm/scm.css`, `src/app/workspace/SourceControlView.tsx`
  - Change: At 650 px and narrower, selecting a change shows the diff in place of the side column with a Back row; the desktop layout is unchanged. A swipe or a full-screen diff screen is out of scope.
  - Proof: Before `states/local-source-control--diff-modified-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/source-control-states.ts <out>` at 390 light; check: `bun run test:scm` and the responsive source-control block assert the diff is within the viewport after selection.

- [ ] T042 [US3] [C] Announce an invalid draft once.
  - Findings: M21 · Requirements: FR-035
  - Files: `src/app/workspace/StatusFooter.tsx`, `src/app/editor/EditorStatusBar.tsx`, `src/app/editor/editor.css`, `src/app/workspace/SaveStateButton.tsx`, `tests/footer-counts.test.ts`
  - Change: Do not render the 'Validation failed. Review the findings and repair in Source.' banner at `StatusFooter.tsx:77` while the Source tab is open, keep the header state and one located editor message, and let the editor toolbar pill size to its text.
  - Proof: Before `states/local-source-editor--invalid-unsaved-draft-1440.png`, `states/local-source-editor--invalid-unsaved-draft-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> rest` (SW_ONLY=editing); check: `bun run test:validation` counts failure messages on the Source tab: at most two, one of them the header.

- [ ] T043 [US3] [C] Replace the commit block with 'You have read access' for roles that cannot commit.
  - Findings: M22 · Requirements: FR-036
  - Files: `src/app/scm/SourceControl.tsx`, `src/app/workspace/commit-availability.ts`, `src/app/workspace/SourceControlView.tsx`, `tests/commit-availability.test.ts`
  - Change: Use the existing `access.can('commit')` result to show one sentence instead of the message box, **Commit to main** and **New branch**; Editor and Steward are unchanged.
  - Proof: Before `server-personas/server-carol-source-control-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/server-pages.ts <out_root>` (persona carol) and alice for the unchanged case; check: `tests/commit-availability.test.ts`; `bun run test:admin` persona block asserts no commit textarea for Carol.

- [ ] T044 [US3] [C] Fix the diff header and the dark YAML key colour.
  - Findings: m13, m18 · Requirements: FR-037, FR-038
  - Files: `src/app/scm/DiffView.tsx`, `src/app/scm/scm.css`, `src/app/editor/editorExtensions.ts`, `src/app/editor/editor.css`, src/shared/theme/theme.css (editor token group only)
  - Change: Show the file name once above both columns and let each column label take its text; add a dark `--color-syntax-key` (or reuse the existing key token with a distinct dark value) at least 1.5:1 from the value colour and 4.5:1 on the editor surface; `tests/theme-check.test.ts` keeps light and dark token sets equal.
  - Proof: Before `states/local-source-control--diff-modified-1440.png`, `local-dark/local-dark-ontology-source-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/source-control-states.ts <out>` and `scripts/ui-review/capture-tour.ts <out> local dark`; check: `bun test tests/theme-check.test.ts` (adds the two contrast assertions); `bun run test:scm`.

- [ ] T045 [US3] [C] Make Source control wording and button weight consistent; show the header Commit count; plain clone and validation wording.
  - Findings: m22, m24, m21, m28, P7 · Requirements: FR-039, FR-040, FR-041, FR-042, FR-043
  - Files: `src/app/scm/SourceControl.tsx`, `src/app/scm/RemoteActions.tsx`, `src/app/scm/RemoteDialog.tsx`, `src/app/scm/CloneDialog.tsx`, `src/app/scm/clone-summary.ts`, `src/app/scm/scm.css`, `src/app/workspace/HeaderActions.tsx`, `src/app/validation/ValidationPanel.tsx`
  - Change: Move the no-remote sentence out of the URL style (`scm.css:130`, `SourceControl.tsx:404`); one **Sync** name; 'Not published' as a label; a disabled Commit shows its reason; **Remove remote** becomes an outlined danger button beside a primary Cancel; a spinner and the plain reason in the clone wait (`CloneDialog.tsx:273`); count badge in the header Commit at 390; 'Cloned finance.'; remove the raw caret line from Validation details.
  - Proof: Before `local-light/local-source-control-1440.png`, `states/local-remote-folder--refused-1440.png`, `states/local-clone-repository--connecting-wait-1440.png`, `states/local-source-control--diff-modified-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/source-control-states.ts`, `scripts/ui-review/clone-states.ts`, `scripts/ui-review/capture-tour.ts <out> local light`; check: `bun run test:scm`, `bun run test:git-setup`, `bun run test:dialogs`.

- [ ] T046 [P] [US3] [C] Document Source control changes in `docs/user-guide.md` (Source control section) and write `changelog/C.md`.
  - Findings: M6, M12, M21, M22 · Requirements: FR-032, FR-034, FR-035, FR-036
  - Files: `docs/user-guide.md`, `specs/007-ui-review-fixes/changelog/C.md`
  - Change: Describe the staged-delete label, the phone diff view, the single invalid-draft message and the read-access note; no other section is edited.
  - Proof: Each sentence corresponds to a passing assertion named in `evidence/C.md`; `bun run test:terminology` passes.

- [ ] T047 [US3] [C] Run lane C checks: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:scm`, `bun run test:editor`, `bun run test:validation`, `bun run test:autosave`, `bun run test:git-setup`, `bun run test:theme`, `bun run test:dialogs`, `bun run test:responsive`, `bun run test:ui`, `bun scripts/mutation-tests.ts`.
  - Files: `scripts/scm-mutants.ts`, `scripts/scm-mutation-cases.ts`
  - Change: Add mutants for the staged-delete label decision and the 'identical' guard, registered under lane C's sentinel.
  - Proof: All commands pass; results and image paths in `specs/007-ui-review-fixes/evidence/C.md`.

**Checkpoint**: lane C ready to merge.

---

## Phase 6: User Story 4 - Administer access (Priority: P2), lane D

**Goal**: the admin forms speak plainly, the access check shows its answer, refused addresses explain themselves. **Independent test**: `bun run test:admin` and `test:auth` pass on the lane branch alone. **Owner**: lane D, worktree `007-lane-d`.

- [ ] T048 [US4] [D] Validate the grant e-mail in the form and map server errors to field messages.
  - Findings: M9 · Requirements: FR-044
  - Files: `src/app/admin/GrantForm.tsx`, `src/app/admin/ReviewChange.tsx`, `src/app/admin/change-review.ts`, `src/app/admin/AdminNotices.tsx`, `tests/admin-presentation.test.tsx`
  - Change: Check the address with one shared pattern before review, mark the field invalid with 'Enter a valid e-mail address', translate known server schema failures to a plain sentence (`change-review.ts`), never print the validator text (`ReviewChange.tsx:98`), and rename 'Dry run' to **Review change** (`ReviewChange.tsx:133`).
  - Proof: Before `states/server-admin-grant-form--validation-error-1440.png`, `states/server-admin-grant-form--validation-error-390.png` (review baseline); after: same state recaptured with `scripts/ui-review/admin-states.ts <out>`; check: `bun run test:admin` asserts none of 'must match', 'oneOf', 'grantsFile' is on the page and the field has `aria-invalid`.

- [ ] T049 [US4] [D] Refuse the last-admin change without an enabled Confirm.
  - Findings: M10 · Requirements: FR-045
  - Files: `src/app/admin/UsersSection.tsx`, `src/app/admin/AdminNotices.tsx`, `src/app/admin/AdminConfirmation.tsx`, `tests/admin-dialogs.test.tsx`
  - Change: When the server answers 'last-admin', replace the confirmation by one sentence, remove the code prefix, write the title as 'Deactivate Dave Dias?', and use the `danger` class for a lone destructive confirm (`UsersSection.tsx:164`).
  - Proof: Before `states/server-admin-protection--last-admin-1440.png`, `states/server-dark-admin-protection--last-admin-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/last-admin-state.ts <out>`; check: `bun scripts/admin-last-admin-check.ts` asserts no enabled button named Confirm in the refused state.

- [ ] T050 [US4] [D] Make the access-check answer the most visible element.
  - Findings: M11 · Requirements: FR-046
  - Files: `src/app/admin/AccessCheckSection.tsx`, `src/app/admin/admin.css`, `tests/admin-presentation.test.tsx`
  - Change: Render a result banner (allowed green, denied red, one sentence naming the reason) right under the buttons and scroll it into view; hide empty sections; fold the raw attributes into a disclosure; cap input widths with the shared admin form width.
  - Proof: Before `states/server-admin-access-check--refused-1440.png`, `states/server-admin-access-check--allowed-1440.png`, `states/server-admin-access-check--refused-390.png`, `server-light/server-admin-access-check-2560.png` (review baseline); after: same state recaptured with `scripts/ui-review/admin-states.ts <out>`; check: `bun run test:admin` asserts the banner box is inside an 844 px viewport at 390 after the check.

- [ ] T051 [P] [US4] [D] Tell a non-admin who opens an Admin address that Admin needs the Admin role.
  - Findings: M22 · Requirements: FR-047
  - Files: `src/app/admin/AdminHost.tsx`, `src/app/admin/admin-entry.ts`, `src/app/admin/admin-route.ts`, `tests/admin-route.test.ts`
  - Change: When the route names an Admin section and `canOpenAdmin(me)` is false, show a short notice with a link back to the workspace instead of the hidden-workspace fallthrough; local mode (always Admin) is unaffected.
  - Proof: Before `followup/server-carol-admin--direct-address-1440.png`, `followup/server-alice-admin--direct-address-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/followup-server.ts <out_root>`; check: `tests/admin-route.test.ts`; `bun run test:admin` persona block asserts the notice for alice, bob and carol.

- [ ] T052 [US4] [D] Cap admin form and table widths and fix the admin tables.
  - Findings: M23, m25, m23, P7 · Requirements: FR-048, FR-049, FR-050, FR-052
  - Files: `src/app/admin/admin.css`, `src/app/admin/RoleMatrix.tsx`, `src/app/admin/AuditSection.tsx`, `src/app/admin/SettingsSection.tsx`, `src/app/admin/ReviewChange.tsx`, `src/app/admin/AdminPane.tsx`, `src/app/admin/helpers.ts`, `tests/admin-geometry.test.tsx`
  - Change: Use one `max-width` for forms and one for tables (`admin.css:54`); drop the lock emoji (`RoleMatrix.tsx:14`); show allow and deny as different styles and map audit codes such as 'signIn' to labels; align the filter row; place **Save settings** under its fields (`SettingsSection.tsx:162`); reword the counts at `ReviewChange.tsx:117-122`; put the primary on the right; format dates with `toLocaleString` without seconds.
  - Proof: Before `server-light/server-admin-grants-2560.png`, `server-light/server-admin-roles-1440.png`, `server-light/server-admin-audit-1440.png`, `server-light/server-admin-settings-1440.png`, `states/server-admin-access-change--review-confirm-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> server light` and `scripts/ui-review/admin-states.ts <out>`; check: `bun run test:admin`; `bun scripts/admin-pane-geometry.ts` asserts the width caps at 2560.

- [ ] T053 [US4] [D] Restyle the script-free pages and add the support line.
  - Findings: m26 · Requirements: FR-051
  - Files: `src/server/routes/auth.ts`, `src/server/routes/auth-stylesheet.ts`, `tests/auth/auth-pages.test.ts`, docs/theme.md (the `supportUrl` paragraph only)
  - Change: Render the one action as `button primary`, rewrite the reason strings in plain words, and link `supportUrl` from the brand bundle when it is set, otherwise print 'Ask an administrator for access'; the pages stay script-free and the sanitised brand rules in `docs/theme.md` still hold (the paragraph that calls `supportUrl` reserved is updated).
  - Proof: Before `auth-pages/auth-page-sign-in-error--page-1440.png`, `auth-pages/auth-page-no-access--page-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/server-pages.ts <out_root>`; check: `bun test tests/auth/auth-pages.test.ts`; `bun run test:brand`; `bun run test:auth`.

- [ ] T054 [US4] [D] Document the admin changes in `docs/user-guide.md` (Admin section), `docs/server-mode.md` (no-access pages) and `docs/theme.md`; write `changelog/D.md`.
  - Findings: M9, M10, M11, M22, m26 · Requirements: FR-044, FR-045, FR-046, FR-047, FR-051
  - Files: `docs/user-guide.md`, `docs/server-mode.md`, `docs/theme.md`, `specs/007-ui-review-fixes/changelog/D.md`
  - Change: Describe the review step name, the refusal notice and the support link; update the 'reserved for support navigation' sentence.
  - Proof: `rg -n 'Dry run' docs README.md` returns nothing; `bun run test:terminology` passes.

- [ ] T055 [US4] [D] Run lane D checks: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:admin`, `bun run test:auth`, `bun run test:brand`, `bun scripts/admin-last-admin-check.ts`, `bun run test:responsive`, `bun scripts/mutation-tests.ts`.
  - Files: `scripts/admin-mutants.ts`, `scripts/admin-mutation-cases.ts`
  - Change: Add mutants for the e-mail check and the last-admin confirm guard under lane D's sentinel (existing admin mutants stay).
  - Proof: All commands pass; results and image paths in `specs/007-ui-review-fixes/evidence/D.md`.

**Checkpoint**: lane D ready to merge.

---

## Phase 7: User Story 5 - First run and everyday navigation (Priority: P2), lane E

**Goal**: first run, catalog, wizard, trash, mappings, dialogs and shared styles are consistent. **Independent test**: `bun run test:ui`, `test:responsive`, `test:theme`, `test:dialogs` pass on the lane branch alone. **Owner**: lane E, worktree `007-lane-e` (fonts already merged in Phase 2).

- [ ] T056 [US5] [E] Show an empty result for catalog search.
  - Findings: M8 · Requirements: FR-054
  - Files: `src/app/workspace/CatalogView.tsx`, `src/app/workspace/catalog.css`, `src/app/workspace/WorkspaceToolbar.tsx`, `tests/polish-presentation.test.tsx`
  - Change: Add the empty branch at `CatalogView.tsx:42-45` with the message, **Clear search** and 'N of M', modelled on the Metrics list's no-result state; widen the search box to at least SEARCH_MIN_PX.
  - Proof: Before `states/local-catalog--search-no-result-1440.png`, `states/local-catalog--search-no-result-390.png` (review baseline); after: same state recaptured with `SW_ONLY=catalog scripts/ui-review/capture-states.ts <out> rest`; check: `bun run test:ui` catalog block asserts the message and the box width.

- [ ] T057 [US5] [E] Tidy the catalog cards and sidebar tree.
  - Findings: m14, m15 · Requirements: FR-061, FR-062
  - Files: src/app/style.css (catalog selectors only), `src/app/workspace/catalog.css`, `src/app/workspace/CatalogView.tsx`, `src/app/projects/Sidebar.tsx`, `src/app/workspace/WorkspaceSidebar.css`, `src/app/projects/project-tree.ts`
  - Change: Top-align card rows (`style.css:469-490` region), cut descriptions at word boundaries, show Edit on hover and focus and in details, add the scroll fade, and render the type as an inline badge. The raw 'EntityType' label uses lane A's humanise function once lane A has merged.
  - Proof: Before `local-light/local-catalog-1440.png`, `local-light/local-metric-detail-1280.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local light` and `SW_ONLY=catalog scripts/ui-review/capture-states.ts <out> rest`; check: `bun run test:sidebar` and `bun run test:clipping`.

- [ ] T058 [US5] [E] Make the metric wizard stable and its step 2 usable.
  - Findings: M18 · Requirements: FR-055
  - Files: `src/app/metrics/MetricWizard.tsx`, `src/app/metrics/metrics.css`, `src/app/projects/Modal.tsx`
  - Change: Show '<N> datasets · <M> metrics' with a searchable list in step 2 (`MetricWizard.tsx:381`); give the dialog one height and a scrolling body so the title stays put across steps 1-8.
  - Proof: Before `states/local-metric-wizard--step-2-1440.png`, `states/local-metric-wizard--step-1-empty-validation-1440.png`, `states/local-metric-wizard--step-4-1440.png` (review baseline); after: same state recaptured with `SW_ONLY=metrics scripts/ui-review/capture-states.ts <out> rest`; check: `bun run test:metrics` asserts the title's top varies by at most 2 px across steps.

- [ ] T059 [US5] [E] Make disabled buttons read as disabled and unify the focus ring.
  - Findings: M19, m17 · Requirements: FR-056, FR-064
  - Files: src/app/style.css (lines 25-100: base, focus, disabled), src/shared/theme/theme.css (button and focus tokens only), `scripts/helpers/control-geometry.ts`
  - Change: Replace the dashed border at `style.css:71-84` with a solid muted border and a dimmer label token that still meets 3:1; apply `--color-focus` to `select`, `textarea`, `input[type=checkbox]` and the commit and branch inputs.
  - Proof: Before `local-dark/local-dark-metric-wizard-1440.png`, `local-dark/local-dark-item-editor-1440.png`, `followup/local-interaction--focus-native-select-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local dark` and `scripts/ui-review/followup-local.ts <out> content`; check: `bun run test:theme` (`lowDisabledContrastProblems` 3:1 holds; a new assertion compares disabled and enabled borders).

- [ ] T060 [US5] [E] Confirm first (risk inferred in the review): does Empty trash remove a deleted file that the dialog does not list?
  - Findings: M20 · Requirements: FR-057
  - Files: `tests/trash-sections.test.ts`, `specs/007-ui-review-fixes/evidence/E.md`
  - Change: In an isolated workspace delete a file in project A, select project B, open the trash and run Empty trash; read `data/trash/` before and after. The server calls `ws.trash.purgeAll()` and the confirmation says 'from every project', so the expected answer is yes; write the observed answer in 'Confirmed inferences' of `evidence/E.md` and keep a test that records it.
  - Proof: `evidence/E.md` states the observed result; the test passes.

- [ ] T061 [US5] [E] Confirm first (not seen in the review): where the Mappings detail renders on a phone after a selection.
  - Findings: M24 · Requirements: FR-059
  - Files: `specs/007-ui-review-fixes/evidence/E.md`
  - Change: The review inferred the detail sits below the list because its full-page capture stopped at the viewport. Scroll the page at 390x844 after selecting 'Identifier, 5 bindings' and record where the detail is and how far it is from the list.
  - Proof: `evidence/E.md` gives the pixel offset of the detail under the selected row.

- [ ] T062 [US5] [E] Confirm first (inferred in the review): the pink group tint is the `#ab6d64` palette entry.
  - Findings: m4 · Requirements: FR-070
  - Files: `specs/007-ui-review-fixes/evidence/E.md`
  - Change: Read the computed fill of the tinted cards in `states/local-contract-lineage--first-view-1440.png` reproduced with `scripts/ui-review/capture-states.ts` and match it to a `GROUP_PALETTE` entry.
  - Proof: `evidence/E.md` names the entry and the group that picked it.

- [ ] T063 [US5] [E] List the deleted files of other projects in the trash dialog and mark Empty trash as dangerous.
  - Findings: M20 · Requirements: FR-057
  - Files: `src/app/projects/Trash.tsx`, `src/app/projects/trash-sections.ts`, `src/app/projects/api.ts`, `tests/trash-sections.test.ts`, docs/user-guide.md (Trash paragraph)
  - Change: List those files under their project name with a switch link, use the `danger` class on Empty trash, and keep the confirmation naming what it removes.
  - Proof: Before `states/local-trash--populated-1440.png`, `followup/local-trash--populated-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/followup-trash.ts <out_root>`; check: `bun run test:trash` plus `tests/trash-sections.test.ts`; the confirmed answer from the previous task is quoted in the dialog's confirmation text.

- [ ] T064 [US5] [E] Apply one content width to every tab and fix the sidebar gap.
  - Findings: M23, M22 · Requirements: FR-058, FR-060
  - Files: src/app/style.css (`.workspace-content*` and page selectors only), `src/app/workspace/WorkspaceCanvas.tsx`, `src/app/workspace/WorkspaceSidebar.tsx`, `src/app/workspace/WorkspaceSidebar.css`, `src/app/metrics/metrics.css`
  - Change: Define one `--content-max` and use it for Catalog, Overview, Metrics list, Metric detail and Mappings; keep the same top spacing under the logo when **Add project** is absent.
  - Proof: Before `local-light/local-catalog-2560.png`, `local-light/local-ontology-overview-2560.png`, `local-light/local-metric-detail-2560.png`, `server-personas/server-carol-source-control-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local light` at 2560 and `scripts/ui-review/server-pages.ts <out_root>`; check: `bun run test:responsive` asserts the same left edge (within 2 px) of the main content in the five tabs at 2560 and `bun run test:sidebar`.

- [ ] T065 [P] [US5] [E] Make Mappings usable on a phone and fill the desktop pane.
  - Findings: M24 · Requirements: FR-059
  - Files: `src/app/mappings/MappingExplorer.tsx`, `src/app/mappings/mapping-explorer.css`, `tests/mapping-choice.test.ts`
  - Change: At 650 px and narrower selecting a concept swaps the list for its detail with a Back row; open resolved bindings by default; style the disclosure rows like other app sections (`<details>` markers replaced by a chevron).
  - Proof: Before `followup/local-mapped-commerce-mappings--concept-with-bindings-390-full.png`, `states/local-mappings--selected-binding-390.png`, `local-light/local-mappings-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/followup-local.ts <out> content` and `SW_ONLY=mappings scripts/ui-review/capture-states.ts <out> rest`; check: `bun run test:mappings-layout` asserts the detail box is inside the 390 viewport after selection.

- [ ] T066 [US5] [E] Show errors under the fields in the wizard and the item editor.
  - Findings: m16 · Requirements: FR-063
  - Files: `src/app/metrics/MetricWizard.tsx`, `src/app/edit/ItemEditor.tsx`, `src/app/edit/AddItem.tsx`, `src/app/edit/edit.css`, `tests/item-add-delete.test.ts`
  - Change: Pass each finding's field path to the field that owns it, mark it invalid, drop the duplicate footer message, and mark Name on a duplicate-name refusal.
  - Proof: Before `states/local-metric-wizard--step-3-validation-error-1440.png`, `followup/local-item-editor--duplicate-name-refusal-1440.png` (review baseline); after: same state recaptured with `SW_ONLY=metrics scripts/ui-review/capture-states.ts <out> rest` and `scripts/ui-review/followup-local.ts <out> content`; check: `bun run test:item-edit`; `bun run test:metrics`.

- [ ] T067 [US5] [E] Clean up menus and the first-run screen.
  - Findings: m19, m20 · Requirements: FR-065, FR-066
  - Files: `src/app/projects/Menu.tsx`, `src/app/workspace/AddProjectMenu.tsx`, `src/app/auth/PersonMenu.tsx`, `src/app/projects/EmptyState.tsx`, `src/app/workspace/EmptyProject.tsx`, `src/app/main.tsx`
  - Change: Order the New menu with enabled items first, give disabled items a reason, drop the Back row on desktop, rename the local avatar-menu entry; hide the tabs and search on the first-run screen and add **Import files** beside **Open example ontology**.
  - Proof: Before `states/local-shell--new-menu-1440.png`, `states/local-shell--avatar-menu-1440.png`, `states/local-workspace--first-run-empty-1440.png` (review baseline); after: same state recaptured with `SW_ONLY=shell scripts/ui-review/capture-states.ts <out> rest` and `scripts/ui-review/empty-states.ts <out>`; check: `bun run test:projects` and `bun run test:sidebar`.

- [ ] T068 [P] [US5] [E] Reject unsupported imports in one line, and hide the empty query composer controls.
  - Findings: m21, m27 · Requirements: FR-067, FR-069
  - Files: `src/app/projects/ImportDialog.tsx`, `src/app/workspace/hooks/useImport.tsx`, `src/app/mappings/QueryComposer.tsx`, `tests/new-file.test.ts`
  - Change: Drop unsupported file types at selection with one sentence and never open them in a YAML editor; when the project has no mapping document, show **Load example** and **Import** instead of the empty select and disabled buttons.
  - Proof: Before `states/local-import--refused-file-1440.png`, `server-light/server-query-composer-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/file-states.ts <out>` and `scripts/ui-review/capture-tour.ts <out> server light`; check: `bun run test:projects`; `bun run test:ui`.

- [ ] T069 [US5] [E] Give every dialog one scale and one button order; unify native selects and eyebrow labels.
  - Findings: m23, P2, P3, P4, P5, P6, P7, P9 · Requirements: FR-068, FR-071
  - Files: src/app/style.css (lines 2294-2420 and 3510-3600: dialogs; select and eyebrow selectors), `src/app/projects/Modal.tsx`, `src/app/workspace/FileDialogs.tsx`, `src/app/workspace/SaveDialogs.tsx`, `scripts/helpers/dialog-geometry.ts`
  - Change: Use the 18 px dialog title scale everywhere, put the primary on the right (the admin review dialogs are lane D's), style `select` with the token border and one chevron, and use one eyebrow style. SaveDialogs content belongs to lane C; only its title class changes here.
  - Proof: Before `states/local-import--file-chosen-1440.png`, `local-light/local-clone-repository-1440.png`, `local-light/local-metrics-list-1440.png`, `states/local-source-control--branch-menu-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-tour.ts <out> local light` and `scripts/ui-review/file-states.ts <out>`; check: `bun run test:dialogs` (`dialogStandardProblems` extended to title scale and button order).

- [ ] T070 [US5] [E] Remove the red-family tint and apply the remaining visual polish.
  - Findings: m4, P2, P3, P4, P5, P6, P7, P9 · Requirements: FR-070, FR-071
  - Files: `src/app/theme/theme-palette.ts`, src/app/workspace/DetailsPanel.tsx (class names only), `src/app/workspace/WorkspaceSidebar.tsx`, `src/app/metrics/MetricWizard.tsx`, `src/app/projects/DeleteDialog.tsx`, src/app/style.css (button size, label colour selectors)
  - Change: Replace `#ab6d64` (hue about 7 degrees) in `GROUP_PALETTE` with a non-red mid-tone that keeps the light and dark contrast, and add a unit test that no entry has a hue between 345 and 20 degrees, make **Explore neighborhood** and **Open Source tab** the standard button size, use one form-label colour, render the step 8 diff as wrapped lines, remove 'Moved to trash' wording before a delete, and label or remove the unlabelled green dot (`WorkspaceSidebar.tsx:193`). The drawer-versus-modal difference is out of scope.
  - Proof: Before `states/local-contract-lineage--first-view-1440.png`, `local-light/local-item-editor-1440.png`, `states/local-metric-wizard--step-8-1440.png` (review baseline); after: same state recaptured with `scripts/ui-review/capture-states.ts <out> graphs`, `scripts/ui-review/capture-tour.ts <out> local light`, `SW_ONLY=metrics scripts/ui-review/capture-states.ts <out> rest`; check: `bun test tests/theme-check.test.ts`; `bun run test:theme`.

- [ ] T071 [US5] [E] Investigate the status-bar relationship count and the 404 logged on every page.
  - Findings: P10 · Requirements: FR-072
  - Files: `src/app/workspace/StatusFooter.tsx`, `src/app/workspace/hooks/useWorkbench.tsx`, `src/app/workspace/types.ts`, `specs/007-ui-review-fixes/evidence/E.md`, `tests/footer-counts.test.ts`
  - Change: Open `mall.semantic.yaml` after `ubl.ontology.yaml` and alone, read where `relationshipCount` comes from, and compare with the 259 declared relationships. 277 is the UBL count and appears for the Mall semantic file, which points at a stale count, so write the finding in `evidence/E.md` and change code only if the count is wrong. Also name the resource behind the 'Failed to load resource: 404' console error every follow-up capture logged and fix it if it is the application's.
  - Proof: Written finding in `evidence/E.md` with the counts read from the document; if code changed, `tests/footer-counts.test.ts` and before/after of `followup/local-status-bar--mall-semantic-yaml-1440.png` from `scripts/ui-review/followup-local.ts <out> content`.

- [ ] T072 [US5] [E] Update docs for lane E: `docs/user-guide.md` (first run, catalog, metrics wizard, mappings, trash), `docs/theme.md` (palette and disabled style), `README.md`; write `changelog/E.md`.
  - Findings: M8, M18, M19, M20, M24, m20, m27 · Requirements: FR-054, FR-055, FR-056, FR-057, FR-059, FR-066, FR-069
  - Files: `docs/user-guide.md`, `docs/theme.md`, `README.md`, `specs/007-ui-review-fixes/changelog/E.md`
  - Change: Edit only the sections named; keep each claim tied to a passing check.
  - Proof: `bun run test:terminology` passes; `bun --bun run check` passes.

- [ ] T073 [US5] [E] Run lane E checks: `bun test`, `bun --bun run check`, `bun --bun run build`, `bun run test:ui`, `bun run test:responsive`, `bun run test:theme`, `bun run test:dialogs`, `bun run test:metrics`, `bun run test:trash`, `bun run test:projects`, `bun run test:sidebar`, `bun run test:mappings-layout`, `bun run test:item-edit`, `bun run test:clipping`, `bun scripts/mutation-tests.ts`.
  - Files: `scripts/shell-mutants.ts`, `scripts/shell-mutation-cases.ts`
  - Change: Add mutants for the legibility-independent decisions in lane E: the trash section split with other-project files and the catalog empty-state condition.
  - Proof: All commands pass; results and image paths in `specs/007-ui-review-fixes/evidence/E.md`.

**Checkpoint**: lane E ready to merge, last of the five.

---

## Phase 8: Cross-lane regression gate and release

- [ ] T074 Merge the lanes in the stated order (A, B, C, D, then E) onto the 007 branch, resolving only the shared-file cases the plan lists, and run the full gate after each merge: `bun test`, `bun --bun run check`, `bun --bun run build`.
  - Change: A conflict outside the plan's shared-file list is a lane-boundary error: report it, do not patch it.
  - Proof: Three commands green after each of the five merges; merge commit ids in `evidence/GATE.md`.

- [ ] T075 Run every browser suite and the mutation tests on the merged branch: `test:ui`, `test:responsive`, `test:edges`, `test:grouping-validation`, `test:examples:ui`, `test:graph`, `test:lineage`, `test:odcs`, `test:mapping-graph`, `test:scm`, `test:editor`, `test:validation`, `test:theme`, `test:dialogs`, `test:admin`, `test:auth`, `test:brand`, `test:metrics`, `test:trash`, `test:projects`, `test:sidebar`, `test:mappings-layout`, `test:back-history`, then `bun scripts/mutation-tests.ts`.
  - Change: Every mutant must be detected, including the new ones registered under the five sentinels.
  - Proof: All green; output saved in `evidence/GATE.md`.

- [ ] T076 Capture the whole journey on the merged branch with the same scripts (stock tour light and dark local and server, `capture-states.ts graphs` and `rest`, and each script named in a task) and write `evidence/GATE.md` classifying every changed pair against the review's baseline images.
  - Files: `specs/007-ui-review-fixes/evidence/GATE.md`
  - Change: Use the `ui-regression-gate` procedure: same example, file, state stage, viewport and theme for each pair; classify each as fixed (a finding id), intended side effect, unchanged, or regression; fix or revert every regression; list the 3,559 baseline images by folder with counts. Screenshot capture and viewing is delegated to Codex as the owner's rules require. Images stay outside git (they can show the machine's committer name).
  - Proof: `GATE.md` has zero rows marked regression and every finding id has at least one 'fixed' pair; `capture-report.ts` shows no failed screen that the baseline did not also fail.

- [ ] T077 Assemble `CHANGELOG.md` Unreleased from `specs/007-ui-review-fixes/changelog/A.md` to `E.md`, check counts quoted in docs against test output (Constitution VII), then delete the fragment folder.
  - Files: `CHANGELOG.md`, `specs/007-ui-review-fixes/changelog/`
  - Change: One integrator edits CHANGELOG.md once so lanes never conflict on it.
  - Proof: `bun --bun run check` passes; `rg -n 'one to five|Dry run|first view shows every entity' docs README.md` shows only intended text.

- [ ] T078 Run `speckit-analyze` again on the final artefacts, then the architecture review (`architecture-reviewer`) and record it with `review_marker.py mark` before the pull request.
  - Change: Fix findings in the lane that owns the file.
  - Proof: Analyze report has no CRITICAL; reviewer verdict recorded.

---

## Dependencies and execution order

- **Setup (Phase 1)**: first. The capture scripts and the sentinel lines must be on the 007 branch before any worktree is created.
- **Foundational (Phase 2)**: blocks every lane's 'after' captures. Lane agents may start reading and coding for their lane in parallel, but must rebase on the merged foundation before capturing.
- **Lanes (Phases 3-7)**: independent of one another. Lane E's catalog type-label task reuses the identifier function written by lane A's task 'Stop truncating toolbar controls, humanise identifiers…', so lane E merges after lane A (already the merge order). Lane C's `theme.css` edit (editor token) and lane E's `theme.css` edits are different token groups.
- **Gate (Phase 8)**: after all five lanes have merged in the order A, B, C, D, E.
- Within a lane: confirmation tasks ('Confirm first') before the fix they gate; the baseline measurement (lane A) before any lane A fix; the lane's check task last.

## Parallel example

```text
Foundation merged. Then, at the same time, in five worktrees:
  Lane A agent:  measure baseline -> pack Network -> legibility decision -> Layered -> ...
  Lane B agent:  collapse header -> Walk here target -> first view -> Fit cards -> ...
  Lane C agent:  confirm white diff -> theme diff -> staged delete -> stale-save -> ...
  Lane D agent:  grant form -> last admin -> access check -> refused address -> ...
  Lane E agent:  catalog empty -> wizard -> disabled buttons -> trash -> mappings -> ...
Merge: A, B, C, D, E, each followed by bun test, check and build; then the gate.
```

## Implementation strategy

1. Land Setup and Foundation (Phases 1 and 2, nine tasks), so the glyph metrics, the capture tooling and the worktrees are fixed.
2. Start all five lanes at once. Priority inside a lane follows the review's severity: major findings before minor, minor before polish.
3. P1 stories (lanes A and B) hold the review's top issues; if lanes must be staffed unevenly, staff A and B first and take C, D, E in that order.
4. Each lane is shippable alone (its Independent Test), so a lane that is not ready does not block the others; the gate covers whichever lanes have merged and lists the rest as open.
5. The gate decides completion: zero regressions in `evidence/GATE.md`, every finding id fixed or investigated, and the full verification gate green.

## Notes

- A change that makes a screen different from the review's baseline without a finding id behind it is a regression, not a finish.
- No budget, timeout or assertion is loosened to pass a check.
- Commit messages carry the finding ids (for example `fix(graph): ... (M2)`); code comments do not.
- Task counts per lane: see plan.md, Lane split.
