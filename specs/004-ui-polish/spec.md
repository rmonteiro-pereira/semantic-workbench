# UI polish: requirements

Every requirement has numbered acceptance criteria, the finding or findings it covers in
`findings.md`, and the browser check that proves it. A check named "new" does not exist yet and is
written with the change. Status is kept in the last column of the traceability table and is
reported in the final note.

Shared rules for all requirements:

- Geometry assertions run at 390x844, 1280x720, 1440x900 and 2560x1440 unless a requirement says
  otherwise.
- No budget, timeout or assertion is loosened. The 30 ms keystroke and 100 ms graph budgets hold.
- The `--text-small` 12 px floor holds on every screen.

## R1. Theme isolation

Changing the project's colours is one edit in one place.

1. All colours, surfaces, borders, shadows and focus rings are CSS custom properties defined in one
   theme file (`src/theme.css`). Names are semantic: `--color-surface`, `--color-text-muted`,
   `--color-accent`, `--color-pk`, `--color-fk` and so on.
2. Light and dark are two value sets of the same tokens in that file. Dark applies when the person
   or the system asks for it, and every screen stays readable in both.
3. No colour literal (hex, rgb, hsl, named colour) appears outside the theme file: not in CSS, in
   TSX inline styles, in graph and lineage renderers, in canvas code or in the server's sign-in
   pages. Data-driven colours (group colours chosen at runtime) are the only exception and are
   listed in one place.
4. `bun run check` fails when a colour literal appears outside the theme file.
5. The README explains how to change the theme with a worked example.
6. Swapping the accent token in the browser changes the rendered primary button, the selected tab
   and the graph selection colour.

Findings: F18, F19, F62. Checks: `scripts/theme-check.ts` in `bun run check` (new), theme swap in
`scripts/theme-browser-check.ts` (new, `bun run test:theme`), contrast measurement in the
responsive suite `screens:` checks.

## R17. White-label brand bundle

A deployment shows its own name, logo, favicon and accent without a rebuild. The owner asked for
the logo to be easy to change.

1. One brand bundle in `public/brand/`: `logo.svg` (sidebar), `logo-mark.svg` (compact mark for
   narrow screens and the sign-in pages), `favicon.svg`, `brand.json` (`productName` 1 to 60
   characters, `shortName` 1 to 24, optional `supportUrl`, http or https only) and `brand.css`
   (theme tokens only). Every place that shows the name or the logo reads from it: the sidebar,
   the header title with no document open, the document title, the favicon and the sign-in pages
   with their titles.
2. `SW_BRAND_DIR` names a folder with any subset of those files; a missing file keeps its default.
   The server serves the bundle at `/brand/*` in both modes. Files are read at start. Start-up
   stops only when the variable names a folder that cannot be read.
3. Each file is checked: only the five names, 256 KiB for images and 64 KiB for `brand.json` and
   `brand.css`, SVG rebuilt from drawing elements with scripts, `foreignObject`, handlers, outside
   links and `url()` outside the drawing removed, CSS cut down to custom properties under the
   theme selectors, and a symlink out of the folder refused. An invalid file is logged by name and
   its default stays. Every brand response carries `nosniff`, its own Content-Type and a policy by
   type: `default-src 'none'; style-src 'unsafe-inline'; sandbox` for SVG and
   `default-src 'none'; sandbox` for the JSON and CSS.
4. `index.html` holds no product name. `brand.css` loads after the theme stylesheet. The Vite
   development server serves `public/brand/`; `SW_BRAND_DIR` is out of scope there.
5. `bun run check` fails when the product name, the split wordmark or the inline layers logo
   appears in `src/`, `server/`, `index.html` or `public/` outside `public/brand/`, with a short
   allow-list of technical identities (the committer of server commits and the like).
6. README, `.env.server.example`, `deploy/README.md`, the configuration contract and
   `ARCHITECTURE.md` describe the bundle, with a Compose and an Azure Files example.

Findings: F77, F78, F79, F80, F81, F82. Checks: `tests/brand/*.test.ts` (new), `scripts/check-brand.ts`
in `bun run check` (new), `scripts/brand-browser-check.ts` (new, `bun run test:brand`), the `brand-*`
mutants in `scripts/brand-mutants.ts`.

## R2. Lineage view redesign

The lineage reads as a column-level lineage diagram: table cards with their columns, and edges
between columns.

1. Before any code, every defect found in screenshots at the four sizes is listed in
   `specs/004-ui-polish/lineage-defects.md`.
2. Card titles and column rows are at least 12 px on screen at the default zoom.
3. The first view fits without cutting a card in half. When not every card can show whole at a
   readable size, the cards that do not show are behind a counted control.
4. No two cards overlap, no edge crosses an unrelated card, edge labels do not overlap each other.
5. A selected column highlights its path and dims the rest; the path is also written as plain
   sentences (R5).
6. **Full pierce** still expands everything reachable and still meets its budget. A fan-out
   collapse shows a counted row that says what it hides and how to expand it.
7. Controls are the shared toolbar plus the View options dialog.

Findings: F01, F03, F08, F20, F25, F40, F49, F57, F63. Checks: `lineage:` blocks of
`scripts/responsive-ui-tests.ts` (extended), `scripts/lineage-browser-check.ts` (extended),
`test:graph` pierce budget.

## R2a. Table cards without pagination (lineage, ODCS graph and mapping graph)

The cards of the lineage canvas and the ODCS graph show "93 more columns" and page buttons
"1 2 ... 11". Page numbers go away.

1. By default a card shows the columns that matter: primary key columns, foreign key columns,
   columns with an edge in the current view or on the current path, and columns that match the
   search.
2. The card ends with one plain line, for example "+ 93 more columns", that expands the card in
   place.
3. Expanded, the card lists every column in one scrollable list inside the card, with a maximum
   height, virtualised for very wide tables. A card of more than about 30 columns has a small
   filter box. "Show fewer" collapses it again.
4. No page numbers or pager buttons appear on any canvas card.
5. **Full pierce** still shows every connected column.
6. Edges anchor to rows inside the scrolled list. When a connected row is scrolled out of view,
   the edge points to the list edge and carries a marker.
7. Edge labels do not repeat on bundled or parallel edges: a bundle is labelled once, or its label
   shows on hover or selection.

Findings: F65, F66. Checks (new): `no pager on any canvas card` in `scripts/lineage-browser-check.ts`
and `scripts/odcs-browser-check.ts`; `card expands and collapses in place with filter and Show
fewer` in the same suites; `edges stay anchored on expanded cards, with an edge marker for rows
scrolled out` in the responsive suite `lineage:` block; `parallel edges carry one label`.

## R3. Admin is a page

1. Admin is a full workspace view with its own route state; reload lands on the same section and
   browser Back works.
2. A left section navigation lists every section the panel has; the content area uses the full
   width. At phone width the navigation becomes a compact switcher.
3. There is a clear way back to the workspace.
4. The modal version is removed. Dialogs inside Admin are confirmations and dry-run previews only.
5. Geometry assertions pass for the page at four sizes in server mode.

Findings: F12, F13, F33, F34, F55. Checks: `test:admin`, `test:auth`, the `admin page` block in
the responsive suite (new).

## R4. ODCS terminology and views

1. Schema objects are called Tables in all UI text: lists, headings, counts, breadcrumbs, empty
   states, graph legend, search and aria names. A logical type other than table shows as a small
   badge. ODCS terms remain only where they name the standard's fields or appear in validation
   messages.
2. The ODCS graph is the primary target: table cards read at the default zoom, a clear primary key
   and foreign key legend (kept), relationship edges with readable labels, first view without
   crop, no overlaps, controls in the toolbar plus View options, selection and neighbour
   highlighting, the foreign-key hop display (R5).
3. The ODCS data view (contract page, dataset page tabs) has no sideways-scrolling table, no
   cut-off column and readable text at four sizes.
4. Before coding, defects of the ODCS graph are listed in `specs/004-ui-polish/odcs-graph-defects.md`.

Findings: F10, F11, F16, F21, F22, F23, F24, F56, F57. Checks: `test:terminology`, `test:odcs`,
`odcs-browser-check` graph assertions (new), `ODCS screens:` in the responsive suite.

## R5. Foreign-key hops

1. Each hop is a plain sentence with its direction: `orders.customer_id → customers.id`.
2. The hop count and the path appear in one place, in the lineage, the graph and the data view.
3. The stepping control has plain labels and one line of help text.
4. The path renders legibly (12 px or more, no collisions, whole inside the viewport) at four
   sizes.

Findings: F58. Checks: FK path check in `scripts/odcs-browser-check.ts` and the responsive suite
(new).

## R6. Examples menu

1. Examples is a button that opens a fly-out menu anchored to it, built on the shared menu.
2. Enter or Space opens, arrows move, Escape closes and returns focus, Tab leaves.
3. On the phone drawer the menu stays inside the viewport.

Findings: F59. Checks: keyboard and geometry check in `scripts/dialogs-browser-check.ts` (new).

## R7. Header corner

1. The corner is grouped: file actions, save state, primary action, account.
2. Controls share one height (36 px desktop, 34 px phone) and spacing; nothing overlaps or is cut
   at any width; the save state is whole from 1200 px.
3. It works at 390 px with icons and accessible names.
4. Every capability stays reachable by role and name.

Findings: F17, F51, F60. Checks: `shell:` block of the responsive suite, header assertions in
`scripts/helpers/sign-in.ts`.

## R8. Dialogs, disclosure and no overlap

1. Secondary controls sit behind dialogs or menus instead of in crowded panels.
2. No overlapping elements on any screen, in any dialog or beside the drawer.
3. Nested dialogs show one layer; the phone drawer closes behind a dialog.

Findings: F02, F04, F05, F06, F07, F13, F14, F15, F26, F27, F28, F29, F30, F31, F32, F35, F36,
F37, F38, F41, F43, F44, F45, F46, F47, F48, F50, F52, F53, F54. Checks: `layoutProblems` in every
suite, `screens:`, `edit screens:`, `ODCS screens:`, `project dialogs:`, `shell:` and `overlaps:`
blocks of the responsive suite, `test:dialogs`.

## R9. Readable text

1. No text below 12 px on any screen except inside graph cards, which follow R2 and the far-zoom
   rule (names stay at least 12 px down to zoom 0.27).
2. Muted text has at least 4.5:1 contrast on its background in light and dark.
3. Tab strips that scroll show a fade cue.

Findings: F09, F18, F19, F20. Checks: `smallTextProblems` in every tour check; contrast
measurement (new, `scripts/helpers/text-geometry.ts`).

## R10. Visual audit

1. Every screen and dialog is captured at four sizes in local and server mode, in light and dark.
2. A separate reviewer reads the screenshots strictly and writes its findings into `findings.md`.
3. Every S1 and S2 finding is fixed and the capture and review repeat until a round has none.
4. The final screenshots are in `specs/004-ui-polish/screenshots/after`.

Findings: F61, F64. Checks: `scripts/polish-capture.ts` and `scripts/polish-capture-server.ts`
report no problems; reviewer rounds recorded in `findings.md`.

## R11. Earlier owner asks that must still hold

| # | Ask | Check |
| --- | --- | --- |
| a | The graph has full-screen mode and stays responsive | `test:graph`, `full screen:` in the responsive suite |
| b | YAML source has VS Code-like highlighting; embedded SQL is highlighted and linted | `test:editor`, `test:sql` |
| c | Deleting uses a trash icon on the right of each row | `test:trash` |
| d | The project hierarchy is a list of files | `test:monorepo`, `test:projects` |
| e | Concept mapping in the graph shows real mappings, not a box full of boxes | `test:mapping-graph`, `test:mappings-layout` |
| f | Source control works like VS Code's | `test:scm`, `test:git-setup` |
| g | Entities and relationships are edited by clicking them | `test:item-edit`, `test:rdf-edit` |

Finding: F64. Each row has an acceptance criterion: the check passes and the screen in the after
screenshots looks right.

## R12. Built-in examples include metrics

The examples loaded from the Examples menu show governed metrics.

1. Every example where metrics make sense, at least the ODCS and Ossie ones, ships a few realistic
   metrics in the workbench's normal format: definitions in the Ossie `custom_extensions` under the
   vendor `SEMANTIC_WORKBENCH`, and KPI bindings at the mapping-file root (`kpi_bindings`).
2. Each such example has a simple metric (a SUM or COUNT over one table), a ratio or derived metric
   that builds on other metrics, and one that walks a foreign-key path across two or more tables.
3. Each metric has an owner and a status, so governed-metrics behaviour is visible.
4. Each metric binds to real ODCS columns, so the breakdown, the lineage path and the SQL preview
   all have content. The workbench still never executes anything.
5. Upstream example files stay unmodified and hash-checked. The metrics live in workbench-authored
   files inside the example project (a mapping or extension file), labelled as workbench
   additions. A metric that can only be expressed by changing an upstream file is not added;
   the spec names it instead (see the open list below).
6. Opening each example shows its metrics in the Metrics view; every metric's breakdown, lineage
   path and SQL preview render; all examples validate cleanly.

Findings: F67. Checks: `test:examples:ui` asserts the metric count of each example and that the
breakdown, lineage path and SQL preview render (extended); the examples end-to-end test
(`test:examples` and `tests/examples*.test.ts`) asserts the metric counts, validation and that the
upstream file hashes are unchanged (extended).

Metrics that need an upstream change: none. The official Flights files stay unchanged and its metrics live in three workbench-authored files; `tpcds_semantic_model.yaml` and `enterprise-1000.ossie.yaml` are not loadable examples and gain no metrics.

## R13. Export project

The project "..." menu gets **Export project...** after **Import files into this project**.

1. It downloads a .zip of the project's files exactly as stored on disk, byte for byte, the same
   guarantee as the single-document export. The zip keeps the folder structure and includes the
   project manifest and `.gitignore`. It excludes `.git` and anything git-ignored.
2. The dialog offers one option, **Include Git history**, off by default. When on, the zip also
   holds a `git bundle` of the repository.
3. Unsaved drafts are not exported. The dialog says so and offers to save first when drafts exist.
4. In server mode the export holds only the files the person may read. Restricted paths are left
   out and reported by count only. The export is recorded in the audit log. Viewer and above may
   export.
5. The server streams the zip under the existing size limits. A request over the limit is refused
   with a clear message and nothing is partly sent as a finished file.
6. A new server route is added to the route inventory and the access table.
7. Round trip: exporting a project and importing the zip into a new project gives equal file
   hashes.

Findings: F68. Checks: unit tests for the route, the filtering, the size limit and the round trip;
mutants for the filtering and the byte-exactness in `scripts/mutation-tests.ts`; a browser check
`export project downloads a zip that imports back byte-exact` in `scripts/projects-browser-check.ts`
(or the nearest project suite); a server-mode check that restricted paths are left out and the
audit entry exists in `test:auth` or `test:admin`.

## R14. Menus and popovers are opaque and never clipped

1. Menus and popovers have an opaque surface token, a border, a shadow and a stacking level above
   the tree and the canvas.
2. A menu never sits inside a clipping or masked container: it is anchored to its button and
   positioned in the viewport, so the project "..." menu is not cut off by the file list and
   nothing shows through it. The fix is in the shared menu component so every menu gets it.
3. At the four sizes, every menu stays inside the viewport and shows all its items.

Findings: F69. Checks (new): in `scripts/dialogs-browser-check.ts`, every menu (project, file,
New, person, Examples) is opaque (computed background alpha is 1), fully visible, inside the
viewport, and `document.elementFromPoint` at each item's centre returns that item.

## R15. Git remote into a folder of the repository (v0.5.0)

A project can live in a subfolder of a remote repository, for example `semantic/ubl/` in a team's
shared repo. Clone, pull and push work against that folder only, without checking out the rest of
the repo. This extends the existing monorepo model ("Projects in this repository...") and adds no
parallel one.

1. **Clone.** The Clone dialog and the Remote dialog have an optional field **Folder in
   repository** (a path like `semantic/ubl`). When set, clone runs with `--filter=blob:none
   --no-checkout`, then `git sparse-checkout set --cone <folder>`, then checks out the branch.
   The workbench project root is that folder. The path is validated: relative, no `..`, not
   absolute, normalised; a bad path is refused with a clear message.
2. **Remote on an existing local project.** Adding a remote with a folder means the project's
   files must sit under that folder in the repository. The dialog previews which files move
   where and needs a confirmation. History is never rewritten.
3. **Commit, push, pull.** Commits touch only paths inside the folder. Pull and fetch work
   normally and sparse checkout keeps the rest of the repository absent from disk. Push sends the
   branch as usual. The source-control panel header shows the folder, for example
   `origin · main · semantic/ubl`.
4. **Server mode.** It works with per-user worktrees: `extensions.worktreeConfig` is set and
   sparse-checkout is configured per worktree. Access filtering and governance guards map
   project-relative paths correctly. Remote credentials keep working as before.
5. **Safety.** Git is invoked with argument lists, timeouts, no prompts and serialised per
   repository. The Git 2.42 minimum guard stays. A folder that does not exist on the remote branch
   gives a clear error, and the dialog offers to create it on the first push. Changing the folder
   later is an explicit, previewed action.
6. **Tests.** Integration tests against local bare repositories, no network: clone into a folder,
   edit, commit, push, other folders on the remote are untouched, pull changes by others inside and
   outside the folder, switch branches. Mutants for the path validation and the sparse-checkout
   arguments. `test:scm` and `test:git-setup` cover the dialog field. The server-mode
   `test:two-editors` runs with a sparse project.
7. **Docs.** README Git section and the remote credential guide.

Findings: F70. Checks: `tests/*sparse*.test.ts` (new), mutants in `scripts/mutation-tests.ts`,
`test:scm`, `test:git-setup`, `test:two-editors`.

## R16. Wizards never scroll sideways (issue 10)

The metric attributes wizard showed a seven-step strip that scrolled sideways with tiny labels, a
two-line body above a large empty area, and no strategy for long metric names.

1. A shared stepper (`src/projects/WizardStepper.tsx`) replaces any scrolling step strip. Below
   1200 px it is one line, "Step 2 of 8 · Data", a progress bar and a menu of all steps; from
   1200 px it is a vertical list that marks completed, current and pending steps. Labels are at
   least 12 px. It never scrolls sideways.
2. Cancel, Back and Next sit in the shared dialog footer; the body takes the height of its step.
3. Long identifiers wrap (overflow-wrap anywhere) and the dialog title carries the full name.
4. Every multi-step wizard uses the shared stepper.
5. At 390, 600, 1280 and 1440 px: no horizontal scrollbar in the wizard, every step reachable,
   the footer visible without scrolling, a long-name fixture wraps without overflow.

Findings: F71 (issue 10). Checks: the wizard walk in `scripts/item-edit-browser-check.ts` (new long
name check at four widths), the `metric-wizard` screen in the `edit screens:` block of the
responsive suite.

## Traceability

Every finding maps to a requirement. Status values are open, fixed, deferred (with the reason in
`findings.md`) or verified.

| Finding | Requirement | Status |
| --- | --- | --- |
| F01, F03, F08, F20, F25, F40, F49 | R2 | fixed except lineage redesign (open) |
| F02, F04, F05, F06, F07, F14, F15 | R8 | fixed |
| F09 | R9 | fixed |
| F10, F11, F21, F22, F23, F24 | R4 | fixed, redesign pass open |
| F12, F13, F33, F34, F55 | R3 | fixed |
| F16 | R4 | not changed, on purpose; revisited by R4.2 |
| F17, F51, F60 | R7 | fixed |
| F18, F19 | R1, R9 | text floor fixed; theme isolation open |
| F26, F27, F28, F29, F30, F31, F32, F35, F36, F37, F38, F41, F43, F44, F45, F46, F47, F48, F50, F52, F53, F54 | R8 | fixed |
| F39, F42 | R8 | fixed |
| F56, F57 | R4 | fixed |
| F58 | R5 | fixed |
| F59 | R6 | fixed |
| F61 | R10 | open |
| F62 | R1 | open |
| F63 | R2 | open |
| F65 | R2a, R4 | fixed |
| F66 | R2a | fixed |
| F67 | R12 | fixed |
| F68 | R13 | fixed |
| F69 | R14 | fixed |
| F70 | R15 | fixed |
| F71 | R16 | open |
| F77, F78, F79, F80, F81, F82 | R17 | fixed |
| F72 | R8 | open |
| F73 | R16 | open |
| F74 | R8 | open |
| F75 | R8 | open |
| F76 | R8 | open |
| F64 | R11 | open |
