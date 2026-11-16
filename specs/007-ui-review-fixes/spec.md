# Feature Specification: UI review fixes

**Feature Branch**: `007-ui-review-fixes`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Fix the UI." The owner's instruction is that one sentence. It rests on `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/REVIEW.md`, a review of `main` at e8b7d69 with no blocker, 24 major findings (M1-M24), 28 minor findings (m1-m28) and a polish list (here P1-P10). Screenshot paths below are relative to that folder's `screenshots/` directory and are the "before" side of every comparison.

## Reading this document

- **Finding ids** are the review's: M for major, m for minor, P for the ten polish bullets in review order.
- **Examples**: UBL is `public/examples/ubl/` (45 entities, 277 relationships). Mall is `public/examples/mall/` (195 entities, 896 relationships in the ontology; 142 datasets and 25 metrics in the semantic file). Commerce is `public/examples/commerce/`.
- **Viewports** are the review's four: 390x844, 1280x720, 1440x900, 2560x1440. **Themes**: light and dark.
- **Capture** means one of the review's scripts, copied to `scripts/ui-review/` by the setup tasks. Every scenario below can be checked against the screenshot named in it, recaptured with the same script, same example, same file, same state stage, same viewport and same theme.
- **Thresholds** are the named constants in the Measured thresholds table. A threshold with no source in the review says so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a large model's graph (Priority: P1)

A person opens a model's Graph tab (Network, Layered or Neighborhood) to see how the entities relate. Today the first view is unreadable at the two most common laptop sizes and on a phone, and the controls that depend on it inherit the problem.

**Why this priority**: the graph is the product's centre (the review verdict); five major findings and the largest share of minor ones sit here, and `docs/user-guide.md` makes a claim the product does not meet.

**Independent Test**: on the lane A branch alone, recapture the Network, Layered and Neighborhood states listed below at the stated viewports and run `bun run test:graph`; every scenario holds without any other lane's change.

**Acceptance Scenarios**:

1. **Given** UBL open on the Graph tab, Network layout, light theme, **When** the first view settles at 1440x900 (`states/local-full-graph-network--first-view-1440.png`, today names near 6 px with about 80 px of empty space above and below), **Then** the rendered entity-name height is at least `NAME_MIN_PX` and the drawn graph fills at least 80% of the pane in its limiting dimension. The same holds at 1280x720 and at 390x844 (`states/local-full-graph-network--first-view-390.png`, today a 190 px landscape block in a 580 px portrait pane).
2. **Given** the Mall ontology (195 entities) in Network layout, **When** the first view settles at 1280x720 and at 1440x900 (`states/local-mall-full-graph--group-automatic-1280.png`, `states/local-mall-full-graph--group-definition-types-1440.png`, today a grey mass with cards about 30x6 px), **Then** the model opens as counted area cards and **Expand all** still shows every entity; and UBL does not open collapsed at any of the four viewports.
3. **Given** UBL in Layered layout, light, **When** the first view settles at 1440x900 (`followup/local-ubl-full-graph--layered-node-selected-1440.png`, `states/local-full-graph-layered--first-view-1440.png`, today a band about 110 px tall in a 655 px canvas), **Then** the drawn graph is at least 60% of the canvas height and no area frame overlaps another.
4. **Given** UBL, Network, light, 1440x900, **When** the person selects a node so the details pane opens (`followup/local-ubl-full-graph--network-node-selected-1440.png`, `states/local-full-graph-network--fullscreen-node-selected-1440.png`), **Then** the view zooms to the selection so names are at least `NAME_MIN_PX`, dimmed nodes are not dimmer than `DIM_MIN_OPACITY`, and the toolbar is one row, including **Exit full screen** in full-screen mode; the same one-row rule holds at 1280x720 for the Mall toolbar with no pane open (`local-light/local-contract-graph-1280.png` shows the three-row case in lineage).
5. **Given** UBL, Network, with **Labels** on and then with areas collapsed (`states/local-full-graph-network--labels-on-1440.png`, `states/local-full-graph-network--areas-collapsed-1440.png`), **When** the view is at fit zoom, **Then** labels show only for the selected or hovered item, and collapsed-area names are not broken inside a word.
6. **Given** UBL in Neighborhood at 1280x720, light (`states/local-neighborhood--first-view-1280.png`, `states/local-neighborhood--walk-3-1440.png`), **When** it opens, **Then** the centre card's description is at least `NAME_MIN_PX`, the canvas is at least `NEIGHBORHOOD_CANVAS_MIN_PX` tall, and the file chips are one **Other files** menu.
7. **Given** the Neighborhood after **Full pierce** (`followup/local-ubl-neighborhood--pierce-alone-1440.png`), **When** the result publishes, **Then** it is fitted, or a '<N> entities, Fit' prompt is present.
8. **Given** the one-entity files (`states/local-full-graph--empty-1440.png`, `states/local-neighborhood--empty-1440.png`), **When** they open, **Then** the counts read '1 entity' and the Neighborhood card has the normal size.
9. **Given** UBL, Network, with the mini-map on and at minimum zoom (`states/local-full-graph-network--mini-map-on-1440.png`, `states/local-full-graph-network--zoomed-minimum-1440.png`), **Then** the mini-map has a border and a viewport rectangle and the graph cannot shrink below `MIN_ZOOM_FRACTION` of its fitted size.

---

### User Story 2 - Walk lineage (Priority: P1)

A person opens a table's Lineage tab, or a mapping graph, to follow where its columns come from and go, and walks to a neighbouring table.

**Why this priority**: the review's top issue and the v0.6.1 known issue ("Walk here of a neighbouring table does not become clickable"), shown to be a layout cause.

**Independent Test**: on the lane B branch alone, run `scripts/ui-review/known-issues.ts` (four scripted Walk here clicks on the Mall dataset) and `bun run test:lineage`.

**Acceptance Scenarios**:

1. **Given** the Mall dataset's Lineage tab, light, **When** it opens at 1280x720 (`states/local-lineage-walk--first-view-1280.png`, today the pane starts at y=516 and no neighbour is visible), **Then** the pane's top is at most 50% of the viewport height, at least one neighbour card is whole, and the table header card is one line. At 1440x900 the same holds (`states/local-lineage-walk--first-view-1440.png`), and at 390x844 the visible canvas is at least 300 px (`states/local-lineage-walk--first-view-390.png`, today about 130 px).
2. **Given** the same first view, **When** the known-issues script clicks the four **Walk here** buttons, **Then** four of four succeed with no scroll and none is intercepted by the dataset header; each button's box is at least `HIT_MIN_PX` by `HIT_MIN_PX`, also after **Fit** (`states/local-lineage-walk--fitted-1-before-1440.png`, today 2.8x3.0 px at 1280).
3. **Given** the Mall dataset at 1 hop (34 tables), **When** the person presses **Fit** at 1440 and at 2560 (`states/local-contract-lineage--after-fit-1440.png`, `states/local-contract-lineage--after-fit-2560.png`, today cards 5-10 px wide), **Then** each card shows its name at least `NAME_MIN_PX` high.
4. **Given** the commerce contract graph and mapping graph at 1440 (`local-light/local-contract-graph-1440.png`, `local-light/local-mapping-graph-1440.png`), **When** they open, **Then** the centre card is not at a pane edge, no label is cut ('ord →' today), and all 8 mapping cards are visible.
5. **Given** the contract lineage, light, 1440 (`states/local-contract-lineage--column-selected-1440.png`) and the mapping graph (`states/local-mapping-graph--node-selected-1440.png`), **When** the person selects `properties.id` and the Selected path panel opens, **Then** the parallel lines read as one counted line and no card is cut under the panel.
6. **Given** the commerce contract graph, **When** it opens at 1280, 1440 and 2560 (`local-light/local-contract-graph-1280.png`, `local-light/local-contract-graph-1440.png`, `local-light/local-contract-graph-2560.png`), **Then** the hops row is one row, the CENTER badge is on the centre card at every width, and the toolbar has at most two rows of chrome above the canvas at 1280x720.
7. **Given** a walk to a neighbour (`states/local-lineage-walk--fitted-1-after-1440.png`), **Then** the canvas says 'Lineage around <table> (opened from <original table>)'.
8. **Given** a table with no links (`states/local-contract-lineage--no-links-1440.png`, `states/local-dark-mapping-graph--empty-bindings-2560.png`), **Then** one explanatory line shows and Hops is disabled.
9. **Given** the docs, **Then** they say foreign-key hops go from one to three and mapping steps from one to five, matching `MAX_HOPS = 3` and the Steps list in `LineageToolbar.tsx`.

---

### User Story 3 - Review and commit changes (Priority: P2)

A person compares versions in Source control, resolves a stale save, fixes an invalid draft and commits.

**Why this priority**: two of these screens mislead (a deletion shown as a new file; a white diff in dark), and the commit path is core. Ranked after the graph work because the work-around exists (use light theme, read the file list).

**Independent Test**: on the lane C branch alone, run `bun run test:scm`, `test:editor`, `test:validation` and `test:theme`.

**Acceptance Scenarios**:

1. **Given** the dark theme, **When** the modified diff opens at 1440x900 (`states/local-dark-source-control--diff-modified-1440.png`) and the stale-save dialog at 390x844 (`states/local-dark-source-editor--stale-save-warning-390.png`), **Then** no collapsed-lines row or gutter is white, and `bun run test:theme` covers both states.
2. **Given** `sales.mapping.yaml` staged for deletion, light, 1440x900 (`states/local-source-control--staged-changes-1440.png`, `states/local-source-control--commit-message-filled-1440.png`), **Then** the left header is the file's last-commit version, the right header reads 'Deleted (staged)', 'The two versions are identical.' is absent and the row is highlighted.
3. **Given** the stale-save dialog at 390x844, light (`states/local-source-editor--stale-save-warning-1440.png` for the desktop layout), **Then** every button is whole inside the viewport, the safe action is primary, and the diff is unified under 650 px.
4. **Given** Source control at 390x844 (`states/local-source-control--diff-modified-390.png`), **When** a change is chosen, **Then** its diff opens as its own view with a Back row.
5. **Given** an invalid unsaved draft in the Source tab (`states/local-source-editor--invalid-unsaved-draft-1440.png` and the 390 image), **Then** the page does not show the banner 'Validation failed. Review the findings and repair in Source.', and failure text appears at most twice (the header and one located message).
6. **Given** server mode as Carol (Viewer), 1440x900, light (`server-personas/server-carol-source-control-1440.png`), **Then** the commit block is 'You have read access'; for Alice (Editor) the commit block is unchanged.
7. **Given** the diff header and the dark ontology source (`states/local-source-control--diff-modified-1440.png`, `local-dark/local-dark-ontology-source-1440.png`), **Then** the file name shows once and whole column labels, and YAML keys and values have clearly different colours.
8. **Given** Source control, remote dialogs and clone (`local-light/local-source-control-1440.png`, `states/local-remote-folder--refused-1440.png`, `states/local-clone-repository--connecting-wait-1440.png`), **Then** the wording and button weight rules of FR-039 to FR-043 hold.

---

### User Story 4 - Administer access (Priority: P2)

An Admin in server mode grants access, deactivates people, checks what a person can do and reads the audit; a person without a grant or role meets the script-free pages.

**Why this priority**: three screens show raw validator text, internal codes or an answer nobody can see, but only Admins reach them.

**Independent Test**: on the lane D branch alone, run `bun run test:admin`, `bun run test:auth` and `bun scripts/admin-last-admin-check.ts`.

**Acceptance Scenarios**:

1. **Given** the grant form with 'invalid-address' as e-mail, 1440 and 390, light (`states/server-admin-grant-form--validation-error-1440.png`, `states/server-admin-grant-form--validation-error-390.png`), **Then** the field shows 'Enter a valid e-mail address', no schema text is on the page and the button reads **Review change**.
2. **Given** the last-admin refusal, 1440, light and dark (`states/server-admin-protection--last-admin-1440.png`, `states/server-dark-admin-protection--last-admin-1440.png`), **Then** there is no enabled Confirm and one plain sentence.
3. **Given** the access check, 1440 and 390, light (`states/server-admin-access-check--refused-1440.png`, `states/server-admin-access-check--allowed-1440.png`, `states/server-admin-access-check--refused-390.png`), **Then** a green or red result banner is inside the viewport after the check runs.
4. **Given** Alice, Bob and Carol opening `/#/admin/grants` (`followup/server-carol-admin--direct-address-1440.png`, `followup/server-alice-admin--direct-address-1440.png`), **Then** a notice 'Admin requires the Admin role' shows.
5. **Given** admin grants, roles, audit and settings at 2560 and 1440, light (`server-light/server-admin-grants-2560.png`, `server-light/server-admin-roles-1440.png`, `server-light/server-admin-audit-1440.png`, `server-light/server-admin-settings-1440.png`, `states/server-admin-access-change--review-confirm-1440.png`), **Then** forms and tables use one maximum width each and the table, dialog and date rules of FR-049 to FR-052 hold.
6. **Given** the signed-out error and no-access pages, 1440, light (`auth-pages/auth-page-sign-in-error--page-1440.png`, `auth-pages/auth-page-no-access--page-1440.png`), **Then** the action is a primary button with plain wording and a support line.

---

### User Story 5 - First run and everyday navigation (Priority: P2)

A person installs the workbench, opens it for the first time, searches the catalog, builds a metric, deletes and restores a file, and moves between tabs.

**Why this priority**: the first screen is the first impression, and the shared styles (fonts, disabled buttons, dialogs, content width) touch every other story; the font fix is delivered first for that reason.

**Independent Test**: on the lane E branch alone, run `bun run test:ui`, `test:responsive`, `test:theme`, `test:dialogs`.

**Acceptance Scenarios**:

1. **Given** a machine without DM Sans or Manrope installed, light and dark, 1440x900 (`states/local-workspace--first-run-empty-1440.png`, `states/local-workspace--project-no-files-1440.png`, `states/local-dark-workspace--first-run-empty-1440.png`), **Then** 'Give your data a shared language.' renders in a sans face from a font file served by the application, with no request to another host.
2. **Given** the catalog with a search that matches nothing, 1440 and 390 (`states/local-catalog--search-no-result-1440.png`, `states/local-catalog--search-no-result-390.png`), **Then** the message, **Clear search** and 'N of M' show and the box is at least `SEARCH_MIN_PX` wide on desktop.
3. **Given** the metric wizard, 1440, light (`states/local-metric-wizard--step-2-1440.png`, `states/local-metric-wizard--step-1-empty-validation-1440.png`, `states/local-metric-wizard--step-4-1440.png`), **Then** step 2 shows a count and a searchable list and the title stays within 2 px across steps.
4. **Given** the dark theme (`local-dark/local-dark-metric-wizard-1440.png`, `local-dark/local-dark-item-editor-1440.png`, `local-dark/local-dark-clone-folder-refused-1440.png`), **Then** disabled buttons have a solid muted border and a dimmer label than enabled buttons, and 3:1 contrast holds.
5. **Given** a file deleted in one project with another selected (`states/local-trash--populated-1440.png`), **Then** the dialog names the other project and lists the file, and Empty trash has the danger style.
6. **Given** 2560x1440, light (`local-light/local-catalog-2560.png`, `local-light/local-ontology-overview-2560.png`, `local-light/local-metric-detail-2560.png`), **Then** Catalog, Overview, Metrics list, Metric detail and Mappings start at the same left edge.
7. **Given** Mappings at 390x844 (`followup/local-mapped-commerce-mappings--concept-with-bindings-390-full.png`, `states/local-mappings--selected-binding-390.png`) and 1440 (`local-light/local-mappings-1440.png`), **Then** choosing a concept shows its detail under a Back row, resolved bindings are open by default, and disclosures are styled.
8. **Given** the first-run screen, New menu and avatar menu (`states/local-workspace--first-run-empty-1440.png`, `states/local-shell--new-menu-1440.png`, `states/local-shell--avatar-menu-1440.png`), **Then** the do-nothing tabs and search are hidden, **Import files** is offered and enabled menu items come first.

### Edge Cases

- A model sits exactly on the legibility threshold: the decision must not flip between two layouts on a one-pixel resize. Resizing never re-lays out (`docs/graph-design.md`); **Re-layout** re-decides.
- The pane is resized or the sidebar dragged after the first view: the first view is not redone; **Fit model** and **Fit** are the explicit actions.
- A Walk here button of a card that is narrower than `HIT_MIN_PX` after zoom is hidden, not left as a 3 px target.
- A person without the Admin role in local mode: local mode has one Admin principal, so the refused-address notice never shows there.
- Brand bundles that do not set `supportUrl`: the no-access page prints the plain line and no link.
- A project with a single file, or a model of one entity, uses the same view rules without the count plural bug.
- Dark and light must both pass: every change that adds a colour uses a token that exists in both sets (`tests/theme-check.test.ts`).
- The review's own caveats: images that accumulated state were recaptured in `followup/`; where a "before" image is such a first-round image, the task names the follow-up image to compare instead.

## Requirements *(mandatory)*

### Functional Requirements

Each requirement is checked by an existing browser check, extended where none exists, plus the before/after capture named in its task. The finding column of the table that follows the list is the traceability record.

#### US1: Reading a large model's graph (lane A)

- **FR-001**: The Network first view packs its areas to the pane's own aspect ratio and uses the smallest fit padding that keeps every card whole, so that on UBL at 1440x900, 1280x720 and 390x844 the rendered entity-name height at fit zoom is at least NAME_MIN_PX and the drawn graph fills at least 80% of the pane in its limiting dimension.
- **FR-002**: The choice to open a model as counted area cards is made from legibility, not from the entity count: when names at fit zoom would render below NAME_MIN_PX in the current pane, the model opens as counted area cards (Expand all still shows every entity). UBL (45 entities) never opens collapsed at 1280, 1440 or 2560; the Mall model (195 entities, 896 relationships) opens as counted area cards at 1280 and 1440; the 1,000-entity synthetic model keeps opening as counted area cards.
- **FR-003**: The Layered layout's first view fills the pane: areas wrap into rows to match the pane's aspect ratio, so on UBL at 1440x900 the drawn graph is at least 60% of the canvas height and area frames do not overlap their neighbours. When the model still cannot show names at NAME_MIN_PX, Layered opens zoomed on the first area and Fit model returns to the whole layout.
- **FR-004**: Selecting a node with the details pane open keeps the graph readable: the view zooms to the selection and its neighbours so that their names are at least NAME_MIN_PX, unrelated nodes are dimmed no lower than DIM_MIN_OPACITY, and the graph toolbar stays on one row at 1280 and 1440 (switches move into an overflow before the toolbar wraps), including **Exit full screen** in full-screen mode.
- **FR-005**: With **Labels** on, relationship labels at fit zoom show only for the selected or hovered entity or relationship; collapsed-area cards break names at identifier boundaries (never mid-word, for example not 'AllowanceCha/rge'), show their entity count once, and their text does not overlap link labels.
- **FR-006**: The Neighborhood first view opens at the readable zoom centred on the centre card, so that at 1280x720 on UBL the centre card's description is rendered at least NAME_MIN_PX high and the canvas is at least NEIGHBORHOOD_CANVAS_MIN_PX tall. The 'Continue in…' file chips fold into one **Other files** menu at every width, not only on a phone.
- **FR-007**: A Full pierce result in the Neighborhood opens fitted to the whole result, or, when the result cannot be shown at readable zoom, shows a prompt '<N> entities, Fit' that fits it with one click. Cards are not left outside the pane without a cue.
- **FR-008**: In the Network view, edges are drawn beneath area title plates, so no edge crosses an area title; a bundle outline reads as a link and not as a second area frame; and the metric badge icon does not overlap its number.
- **FR-009**: Counts use correct plurals everywhere in the graph views ('1 entity', never '1 entities'), and a Neighborhood of a single entity keeps the normal card size and hides the '0 of 0 neighbors' line.
- **FR-010**: The mini-map has a border, shows a rectangle for the current viewport, and its corner is reserved so it does not cover a card at fit zoom.
- **FR-011**: The Network minimum zoom is derived from the fitted zoom, so the model cannot shrink below MIN_ZOOM_FRACTION of its fitted size (instead of the fixed 0.001 that lets it become a 40 px speck).
- **FR-012**: Controls in the graph toolbars are not truncated while the toolbar has free room: the grouping select ('Whole m…') and the Neighborhood centre picker ('Center: AllocationSha') grow to their content up to a stated maximum.
- **FR-013**: Raw identifiers in graph labels are shown as words: type names such as 'EntityType' and 'ValueType' read 'Entity type' and 'Value type', area names 'DocumentReference' and 'Document Reference' use one form, and the mall area prefixes 'core:' and 'fin:' are not shown as part of the name.
- **FR-014**: While a graph layout is loading ('Arranging 45 graph nodes…'), the graph toolbar controls that need a finished layout are disabled.
- **FR-015**: In full-screen Neighborhood at 390x844 the details pane takes at most 40% of the screen and an explicit **Exit full screen** control is visible without scrolling.

#### US2: Walking lineage (lane B)

- **FR-016**: On a dataset's Lineage tab the canvas starts above the fold: at 1280x720 the top of the lineage pane is at most 50% of the viewport height, at least one neighbour card is fully visible, and the table header card is collapsed to one line while the Lineage tab is active. The same holds at 1440x900 and, with a visible canvas of at least 300 px, at 390x844.
- **FR-017**: The **Walk here** button keeps a hit area of at least HIT_MIN_PX by HIT_MIN_PX CSS pixels at every zoom (its size is compensated for the zoom) and is hidden when the card is too small to carry it. The four scripted clicks of the known-issues check on the Mall dataset all succeed in the first view with no scroll and none is intercepted by the dataset header.
- **FR-018**: The lineage first view frames the nearest cards whole: when the whole reach fits at readable zoom, the first view is Fit; otherwise the chosen set is centred. The centre card is not pushed to a pane edge, no card or label is cut by the pane edge (no 'ord →'), and in the mapping graph at 1440 all 8 cards of the commerce example are visible in the first view.
- **FR-019**: After **Fit** every lineage and mapping card is readable: below the card-detail zoom threshold cards are drawn name-only with a zoom-compensated name at least NAME_MIN_PX high (as the mapping graph already does), so the Mall dataset at 1 hop (34 tables) after Fit shows names, not 5-10 px specks, at 1440 and 2560.
- **FR-020**: Selecting a hub column bundles its parallel lines into one counted line instead of a striped band (for `properties.id` in the contract lineage at 1440, at most 3 drawn paths remain visible before the bundle is opened), and opening the Selected path panel re-centres or shrinks the canvas so no card is cut under the panel (the 'orc', 'gro', 'ave' cards of the mapping graph show whole).
- **FR-021**: The hops row is one non-wrapping row at 1280 and wider: the hop selector, the path text (which shrinks with an ellipsis), the **Foreign keys (N)** button and the trail share one baseline, with the trail pushed to the right; at 390 the row wraps in a stated order.
- **FR-022**: On the dataset page at 2560x1440 the lineage canvas card has the same left and right edges as the header card above it.
- **FR-023**: After a walk in the Lineage tab, the canvas is labelled 'Lineage around <table> (opened from <original table>)' so the page header and the canvas no longer disagree.
- **FR-024**: The lineage card header shows the same content at 390, 1280, 1440 and 2560 for a given zoom class: the CENTER badge is always shown on the centre card, and no empty 40 px band remains when the type line and physical name are omitted.
- **FR-025**: The legend lists the card tint from grouping, and at 390 it is collapsible and still lists the PK and FK badges and the line kinds. (The tint palette change that removes the red-family hue belongs to the theme requirement.)
- **FR-026**: A lineage or mapping graph with nothing to show displays one explanatory line in the canvas and disables the Hops control, instead of a lone card with '0 hops'.
- **FR-027**: The documentation and the code agree on the hop limit: the user guide and graph-design describe the foreign-key hop control as one to three hops (`MAX_HOPS = 3`) and the mapping graph's **Steps** setting as one to five mapping lines, each under its own name. The code limits do not change.
- **FR-028**: At 1280x720 the lineage toolbar's zoom and full-screen controls do not wrap onto a second row: they become an icon-only group, leaving at most two rows of chrome above the canvas.
- **FR-029**: Lineage edge labels are not crossed by another line and are not clipped by the pane edge, as `docs/graph-design.md` states.
- **FR-030**: While the lineage is laying out ('Laying out the lineage…') the toolbar controls that need the layout are disabled.

#### US3: Reviewing and committing changes (lane C)

- **FR-031**: In the dark theme the diff has no white surface: the collapsed-lines row, both line-number gutters, the merge gutters and the stale-save dialog's gutters use surface tokens. The diff (modified, added, deleted) and the stale-save dialog are part of the theme tour, so `test:theme` fails on a white band.
- **FR-032**: A staged deletion compares the last commit with the index and is labelled 'Deleted (staged)' on the right and with the file's last-commit version on the left (never 'new file'). 'The two versions are identical.' is not shown when one side does not exist, and the selected change row stays highlighted.
- **FR-033**: At 390x844 the stale-save dialog keeps all its buttons whole and visible, stacked full width in a footer that does not scroll away, and the two columns become a unified diff below 650 px.
- **FR-034**: In Source control at 650 px and narrower, choosing a change opens its diff as its own view with a Back row (instead of under the branch, remote, message, change and history blocks), and the diff is unified.
- **FR-035**: An invalid unsaved draft is announced once beyond the header state: the header shows 'Not saved: N errors', the editor shows one located message, and the status bar keeps only its Validation details control. The banner 'Validation failed. Review the findings and repair in Source.' is not shown while the Source tab is open, and the editor toolbar pill is not truncated.
- **FR-036**: A role that cannot commit (Viewer) sees 'You have read access' in place of the commit message box, the disabled **Commit to main** and **New branch**; Alice (Editor) and Bob (Steward) keep the commit block unchanged.
- **FR-037**: The diff header shows the file name once above both columns and each column label ('Last commit', 'Staged changes') is whole, not cut with an ellipsis, at 1440.
- **FR-038**: In the dark source editor, YAML keys and plain values use two clearly different tokens (contrast ratio between the two token colours of at least 1.5:1 and each at least 4.5:1 on the editor surface).
- **FR-039**: Source control wording and styling are consistent: 'No remote yet. Add one to push and pull.' is set in body text (not the monospace URL style); one name is used for **Sync**; 'Not published' does not look like an input; a disabled **Commit to main** states its reason in its title and in text; and the history header keeps the file name in its original case without wrapping 'All / files'.
- **FR-040**: In dialogs that offer a safe action and a destructive one, the safe action is the primary (green) button and the destructive action is the outlined danger button: the stale-save dialog no longer makes the overwrite primary, and **Remove remote** is not heavier than the primary button.
- **FR-041**: While a clone waits ('Connecting to workspace updates…') the dialog shows a spinner and a plain reason why the button is disabled.
- **FR-042**: At 390x844 the header Commit control shows its count and not a bare dot.
- **FR-043**: Wording in Source control and validation is plain: the clone result reads 'Cloned finance.' (not 'finance: Cloned.'), and Validation details shows no raw parser caret line.

#### US4: Administering access (lane D)

- **FR-044**: The grant form validates the e-mail address in the form and shows 'Enter a valid e-mail address' under the marked field; server schema errors are mapped to field messages or to one plain sentence, and no schema text ('must match', 'oneOf', 'grantsFile', data paths) reaches the page. The submit button reads **Review change**, not 'Dry run'.
- **FR-045**: When a deactivation is refused because it would remove the last active Admin, no enabled confirm button remains, one sentence explains the refusal without the 'last-admin:' code, the title reads 'Deactivate Dave Dias?' (the person's name, not 'for'), and destructive confirms that stand alone use the danger style.
- **FR-046**: The access check shows its answer as a result banner under the buttons (green for allowed, red for denied, one sentence with the reason) scrolled into view, so at 390x844 the banner is inside the viewport after the check runs; empty result sections are hidden, raw attributes sit behind a disclosure, matching grants read as sentences, and the inputs are capped to the form width.
- **FR-047**: A person without the Admin role who opens an Admin address (for example `#/admin/grants` as Alice, Bob or Carol) sees a short notice 'Admin requires the Admin role' with a way back to the workspace, instead of the workspace silently.
- **FR-048**: Admin forms share one maximum width and admin tables share another, so at 2560x1440 the grants table is not spread over the full pane and the form and table edges align.
- **FR-049**: Admin tables are plain and readable: no lock emoji in headers; the role matrix distinguishes allowed from denied without a wall of identical words; audit rows show human labels ('Signed in', not 'signIn') and allow and deny look different; the filter row is aligned; **Save settings** sits directly under the fields it saves; the review dialog states counts in plain words.
- **FR-050**: Admin review dialogs place the primary button on the right, as every other dialog does.
- **FR-051**: The script-free signed-out, error and no-access pages show their one action as a primary button, use plain wording ('This sign-in link expired or was already used. Sign in again.' in place of 'Expired or replayed sign-in attempt.'), and show a support link when the brand's `supportUrl` is set and a plain 'Ask an administrator for access' line otherwise.
- **FR-052**: Dates in the admin pages are shown in the person's locale without seconds.

#### US5: First run and everyday navigation (lane E)

- **FR-053**: DM Sans and Manrope are shipped as self-hosted font files with their SIL Open Font License texts beside them and declared with `@font-face`; every `font` and `font-family` declaration ends in a sans-serif fallback; no request goes to a host other than the application's origin; and the first-run heading 'Give your data a shared language.' renders in a sans face on a machine without those fonts installed.
- **FR-054**: A catalog search with no match shows 'No entity matches "<query>"' with a **Clear search** action and an 'N of <total>' count, as the Metrics list does; the search box is at least SEARCH_MIN_PX wide on desktop and does not clip the query.
- **FR-055**: In the metric wizard, step 2 shows '<N> datasets · <M> metrics' with a searchable list instead of one paragraph of every name, and the dialog keeps one height across all steps (title position varies by at most 2 px), with a scrolling body.
- **FR-056**: A disabled button reads as disabled in dark and light: a solid muted border (not dashed), and a label dimmer than an enabled button's label while it keeps at least 3:1 contrast.
- **FR-057**: The trash dialog lists deleted files of other projects instead of printing only a count: they are grouped under their project's name with an action to switch to it, and **Empty trash** is shown with the danger style and a confirmation that names what it removes. Whether Empty trash removes a file that is not listed is confirmed first, and the dialog states the answer.
- **FR-058**: One content-width rule applies to Catalog, Overview, Metrics list, Metric detail and Mappings, so at 2560x1440 their content starts at the same left edge (within 2 px).
- **FR-059**: In Mappings at 390x844 choosing a concept replaces the list with its detail under a Back row, so the detail is on screen; resolved bindings are open by default; and the disclosures are styled as app sections instead of bare browser triangles.
- **FR-060**: Without **Add project**, the 'SHARED WORKSPACE' label keeps the same gap under the logo as the other sidebar sections.
- **FR-061**: Catalog cards in one row share a baseline and a top edge; a description that is cut ends at a word boundary with an ellipsis; the Edit action appears on hover or focus and in the details pane rather than as 45 identical buttons.
- **FR-062**: The sidebar tree shows a fade at an edge that has more rows, and an entry's type is an inline badge.
- **FR-063**: Validation errors in the metric wizard step 3 and the item editor appear under the field that caused them, the field is marked invalid, and a duplicate-name refusal marks the Name field; the same message is not repeated in the footer.
- **FR-064**: Keyboard focus looks the same on every control: native selects, textareas, checkboxes, the commit textarea and the branch input use the `--color-focus` ring as tabs and dialog inputs do.
- **FR-065**: In the New menu the enabled item comes first and disabled items are visibly disabled with a reason; no Back row shows on desktop; the local-mode avatar menu does not repeat 'Admin' under 'Local / Admin'.
- **FR-066**: The first-run screen hides the tabs and search that do nothing and offers both **Open example ontology** and **Import files**, with text that matches the actions.
- **FR-067**: A refused import (for example an `.exe`) is rejected in one plain line and is not offered for repair in a YAML editor.
- **FR-068**: All dialogs use one title scale and one button order (primary on the right).
- **FR-069**: Mappings with no mapping document hide the empty select and the disabled **Show query** and **Export** controls and offer **Load example** and **Import**.
- **FR-070**: No `GROUP_PALETTE` entry has an HSL hue between 345 and 20 degrees (the red family), so a group tint is never read as an error, and every entry keeps its contrast on the light and dark page (`tests/theme-check.test.ts`).
- **FR-071**: Visual polish applies in the shared styles: native selects use the token border and one chevron; eyebrow labels use one style; **Explore neighborhood** and **Open Source tab** use the size of other buttons; form labels use one colour in the item editor and in the clone and remote dialogs; the wizard's step 8 shows the mapping diff without breaking tokens; 'Moved to trash' does not appear before anything is deleted; the unlabelled green dot beside the workspace label has a label or is removed.
- **FR-072**: The status bar's relationship count is investigated: for `mall.semantic.yaml` the count either is shown to be correct and the reason is written in `research.md`, or it is fixed so that it comes from the open document (not from another file's graph).


### Traceability: finding → requirement → task

Every major, minor and polish item appears once. 'NONE' would mean a gap; the analyze step fails on it.

| Finding | Requirement | Task |
| --- | --- | --- |
| M1 | FR-016, FR-017 | T024, T025 |
| M2 | FR-001, FR-002 | T011, T012, T022, T013 |
| M3 | FR-003 | T011, T014, T022 |
| M4 | FR-018, FR-019 | T026, T027 |
| M5 | FR-031 | T036, T037, T038 |
| M6 | FR-032 | T039, T046 |
| M7 | FR-053 | T004, T005, T006, T007, T008 |
| M8 | FR-054 | T056, T072 |
| M9 | FR-044 | T048, T054 |
| M10 | FR-045 | T049, T054 |
| M11 | FR-046 | T050, T054 |
| M12 | FR-033, FR-034 | T040, T041, T046 |
| M13 | FR-004 | T011, T015, T022 |
| M14 | FR-005 | T016, T022 |
| M15 | FR-006 | T011, T017, T022 |
| M16 | FR-020 | T028 |
| M17 | FR-021 | T029, T030 |
| M18 | FR-055 | T058, T072 |
| M19 | FR-056 | T059, T072 |
| M20 | FR-057 | T060, T063, T072 |
| M21 | FR-035 | T042, T046 |
| M22 | FR-036, FR-047, FR-060 | T043, T046, T051, T054, T064 |
| M23 | FR-022, FR-048, FR-058 | T031, T052, T064 |
| M24 | FR-059 | T061, T065, T072 |
| m1 | FR-007 | T018 |
| m2 | FR-023 | T032 |
| m3 | FR-024 | T032 |
| m4 | FR-025, FR-070 | T032, T062, T070 |
| m5 | FR-026 | T032 |
| m6 | FR-027 | T034 |
| m7 | FR-028 | T030 |
| m8 | FR-029 | T033 |
| m9 | FR-008 | T019 |
| m10 | FR-009 | T020 |
| m11 | FR-010 | T020 |
| m12 | FR-011 | T011, T020 |
| m13 | FR-012, FR-037 | T021, T044 |
| m14 | FR-061 | T057 |
| m15 | FR-062 | T057 |
| m16 | FR-063 | T066 |
| m17 | FR-064 | T059 |
| m18 | FR-038 | T044 |
| m19 | FR-065 | T067 |
| m20 | FR-066 | T067, T072 |
| m21 | FR-041, FR-067 | T045, T068 |
| m22 | FR-039 | T045 |
| m23 | FR-050, FR-068 | T052, T069 |
| m24 | FR-040 | T040, T045 |
| m25 | FR-049 | T052 |
| m26 | FR-051 | T053, T054 |
| m27 | FR-069 | T068, T072 |
| m28 | FR-015, FR-025, FR-042 | T021, T032, T045 |
| P1 (Raw identifiers shown as labels (EntityType, DocumentReference, core:, fin:)) | FR-013 | T021 |
| P2 (Native select look beside custom controls) | FR-071 | T069, T070 |
| P3 (Eyebrow labels in three styles) | FR-071 | T069, T070 |
| P4 (Explore neighborhood and Open Source tab set larger than other buttons) | FR-071 | T069, T070 |
| P5 (Form label colours differ; edit is a drawer, add is a modal (drawer/modal part out of scope)) | FR-071 | T069, T070 |
| P6 (Wizard step 8 shows the mapping diff as a JSON one-liner wrapped mid-token) | FR-071 | T069, T070 |
| P7 (Wording: Moved to trash, finance: Cloned., parser caret, US dates with seconds) | FR-043, FR-052, FR-071 | T045, T052, T069, T070 |
| P8 (Loading states are text only with the toolbar enabled) | FR-014, FR-030 | T021, T033 |
| P9 (Unlabelled green dot (fixed); React Flow attribution (kept, out of scope)) | FR-071 | T069, T070 |
| P10 (Status bar relationship count (investigation)) | FR-072 | T071 |


### Measured thresholds

Numbers used above. Where the review gave no number, the source says so and the lane A baseline task fixes the value before implementation (a number with no recorded source is not allowed).

| Name | Value | Provenance | Status |
| --- | --- | --- | --- |
| `NAME_MIN_PX` | 9 | Review M2 fix: collapse below about 9 px | Lane A baseline task measures UBL and Mall at the four widths; value is locked in research.md before implementation |
| `HIT_MIN_PX` | 24 | WCAG 2.2 success criterion 2.5.8, minimum target size | Fixed |
| `DIM_MIN_OPACITY` | 0.35 | Chosen so that dimmed names stay legible; no source in the review | Lane A confirms on the selected-node capture and may change it with a note in research.md |
| `NEIGHBORHOOD_CANVAS_MIN_PX` | 480 | Review M15 measured about 390 px at 1280x720; 480 leaves 6 stacked cards at the 4:3 card size | Lane A baseline task confirms |
| `MIN_ZOOM_FRACTION` | 0.25 | Chosen: a quarter of the fitted size; review m12 shows a 40 px speck at the old minimum | Lane A confirms on the zoomed-minimum capture |
| `SEARCH_MIN_PX` | 240 | Review M8 fix: 240-320 px | Fixed |
| `Inline figures` | 80% fill, 60% Layered fill, 50% pane top, 300 px phone canvas, 3 visible hub paths, 2 px, 650 px | Chosen here, except 650 px (review M12) and the 2 px alignment tolerance (the review's own 2 px misalignment note, m25); the review gives no figure for the others | Lane A and lane B baseline tasks confirm the first four and the last-but-one; any change is written in research.md |


### Key Entities

None. No data, API, file format or authorization rule changes. The only server-side files touched are the HTML of the script-free pages (`src/server/routes/auth.ts`) and, if the staged-deletion investigation finds the cause there, the diff response of `src/server/projects/scm.ts` (same fields, corrected values).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: UBL, Network, first view, at 1280x720, 1440x900 and 390x844: rendered entity-name height at least `NAME_MIN_PX` (measured on the DOM by the extended `test:graph`). Baseline: about 6 px at 1440.
- **SC-002**: Mall opens as counted area cards at 1280 and 1440; UBL never does; the 1,000-entity synthetic model still does (`test:overview-areas`, `tests/overview-capacity.test.ts`).
- **SC-003**: Layered on UBL at 1440x900: drawn graph at least 60% of the canvas height (baseline about 17%); Neighborhood at 1280x720: canvas at least `NEIGHBORHOOD_CANVAS_MIN_PX` (baseline about 390 px).
- **SC-004**: At 1280x720 the lineage pane's top is at most 360 px (baseline 516 px); one neighbour card is whole; the four scripted Walk here clicks succeed without scrolling (baseline 2 of 4); the button box is at least 24x24 CSS px (baseline 2.8x3.0 px after Fit).
- **SC-005**: Mall dataset at 1 hop after Fit, at 1440 and 2560: every card name at least `NAME_MIN_PX` (baseline cards 5-10 px wide).
- **SC-006**: Zero white bands in the dark diff: in the theme tour's diff and stale-save states no `.cm-collapsedLines`, `.cm-gutters` or merge gutter has a computed background lighter than `--color-surface`.
- **SC-007**: The staged-deletion diff shows no 'new file' on the left and no 'identical' text (`test:scm`).
- **SC-008**: On the first-run screen the loaded faces include DM Sans and Manrope (`document.fonts.check`), every stylesheet font declaration ends in a generic family (`tests/fonts.test.ts`) and the only request host is the application's.
- **SC-009**: Catalog no-match state has the message, the clear action and the count; the search box is at least `SEARCH_MIN_PX` on desktop.
- **SC-010**: Zero occurrences of 'must match', 'oneOf' or 'grantsFile' on the grant form page after an invalid submit; zero enabled buttons named Confirm in the last-admin refusal; the access-check result banner's box is inside an 844 px viewport at 390.
- **SC-011**: Stale-save dialog at 390x844: every button box inside the dialog box and the viewport; Source control diff at 390: inside the viewport after selection; Mappings detail at 390: inside the viewport after selection.
- **SC-012**: Invalid draft on the Source tab: at most two failure messages; no banner (`test:validation`).
- **SC-013**: At 2560x1440 the main content's left edge is identical (within 2 px) on Catalog, Overview, Metrics list, Metric detail and Mappings; admin form and table widths each equal one cap.
- **SC-014**: Metric wizard: the dialog title's top varies by at most 2 px across steps 1-8 (baseline y of 272, 53, 137, 196, 236, 172).
- **SC-015**: Toolbars: one row for the Full graph at 1280 and 1440 with the details pane open, at most two rows of chrome above the lineage canvas at 1280x720 (baseline three), and the Mall Graph canvas at 1280x720 is at least 421 px tall (the v0.6.1 known issue; baseline 407 px).
- **SC-016**: No regression: `evidence/GATE.md` classifies every changed before/after pair on the merged branch; zero are marked regression; every finding id has at least one 'fixed' pair, except the investigation items, which have a written result.
- **SC-017**: The verification gate passes on the merged branch: `bun test`, `bun --bun run check`, `bun --bun run build`, `test:ui`, `test:responsive`, `test:edges`, `test:grouping-validation`, `test:examples:ui`, the browser suites each lane names, and `test:mutation` detecting every mutant including the new ones; no budget or timeout is loosened (the 30 ms keystroke and 100 ms graph budgets hold).

## Assumptions

- The review's baseline screenshots are the "before" images; they were taken at e8b7d69, the commit this branch starts from, so no baseline recapture is needed. Where a first-round image accumulated state, the review's follow-up image is the baseline.
- Capture, viewing and judging screenshots of the merged branch is delegated to Codex under the owner's standing rule, with a temporary data folder, a spare port and a neutral Git identity (the review notes that some images show the owner's name as committer). Screenshots stay out of git.
- The visual design is kept: same tokens, components and layout language. A finding's suggested fix that is a redesign is replaced by the smallest change that removes the defect, and the larger idea is listed under Out of scope.
- Both themes and four viewports are checked wherever a finding names them; where a finding names one viewport, that one plus the two neighbouring widths are checked for regressions.
- Server-mode images that the review could not capture (query composer, server file move for Editor and Viewer at 390) are not claimed as fixed beyond the code path they share with the local captures.
- The status-bar relationship count is an investigation item (the review says it is not established as a defect).
- DM Sans and Manrope are redistributable under the SIL Open Font License 1.1; the licence texts ship beside the files.

## Out of scope

- Removing the React Flow attribution (its licence asks for it unless a subscription is held).
- The 'Walk to…' neighbour list in the lineage toolbar (review M1 fix); only the smaller collapse of the header card ships. Recorded as a follow-up idea.
- A separate full-screen diff screen with swipe on phones; only a Back-row diff view ships.
- Merging the contract **Hops** control and the mapping **Steps** setting into one control (review m6); only the documentation is made consistent, and the code limits do not change.
- Raising `MAX_HOPS` above 3.
- Making the edit drawer and the add modal one pattern (review polish).
- Re-designing the role matrix as a grid or icon table, or renaming audit events on the server; only presentation labels in the client change.
- A changed status-bar relationship count unless the investigation shows the count is wrong.
- Motion, real hover timing, screen-reader output and keyboard order (the review did not assess them).
- Server-mode captures the review could not reach (connected GitHub account state, the "one folder of a larger repository" flow).
- Any new route, API field, data file format or authorization decision.
- New runtime dependencies (the fonts are vendored files, not an npm package).
