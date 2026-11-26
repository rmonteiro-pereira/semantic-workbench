# Implementation Plan: UI review fixes

**Branch**: `007-ui-review-fixes` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-ui-review-fixes/spec.md`

## Summary

Fix the 24 major, 28 minor and 10 polish findings of the 2026-11-15 UI review of `main` at e8b7d69, without changing the visual design. The work is front-end only: graph sizing and first views, lineage layout, diff and dialog presentation, admin wording, shared styles and a bundled font. It is split into five lanes that touch mostly disjoint files, so five agents can implement in five worktrees at once. A foundation step (the font bundle and the capture tooling) merges first because it changes text width on every screen. The last step is a cross-lane regression gate that recaptures the whole journey with the review's scripts and classifies every changed pair.

## Technical Context

**Language/Version**: TypeScript 5 on Bun; React 19; Vite+ (`vp build`). No change.

**Primary Dependencies**: React Flow 12.12 (with the repository patch), Cytoscape with fCoSE and ELK in workers, CodeMirror 6 (merge view), Playwright for browser checks. **No new runtime dependency.** The fonts are vendored woff2 files with licence texts, not an npm package.

**Storage**: none touched. Trash, drafts and Git behaviour are unchanged.

**Testing**: `bun test` (unit and integration under `tests/`), `bun --bun run check` (tsc, Oxfmt check, Oxlint, comment check, theme check, brand check), `bun --bun run build`, the browser suites under `scripts/`, and `bun run test:mutation` (`scripts/mutation-tests.ts`). Capture: the review's scripts, copied to `scripts/ui-review/`.

**Target Platform**: modern desktop and phone browsers, in local and server mode; viewports 390x844, 1280x720, 1440x900, 2560x1440; light and dark.

**Project Type**: web application (React frontend in `src/app/`, Bun server in `src/server/`, shared code in `src/shared/`).

**Performance Goals**: no budget moves: 30 ms keystroke and 100 ms graph budgets hold; Full pierce keeps its budget; layout stays off the main thread.

**Constraints**: CSP `default-src 'self'` unchanged (fonts are same-origin); no network call added; same tokens and components; no change to any API field or authorization decision; light and dark parity (`tests/theme-check.test.ts`).

**Scale/Scope**: 62 review items (24 + 28 + 10) becoming 72 requirements and 78 tasks; 183 distinct paths named across the tasks.

## Constitution Check

*GATE: passes before Phase 0 and after Phase 1. Written against constitution 3.2.0 and re-checked against 4.0.1 before merging: principle names are unchanged and no MUST conflicts.*

| Principle | Result | How the plan complies |
| --- | --- | --- |
| I. Local and Server Modes | Pass | No new network call: fonts are served from the application's origin (`default-src 'self'` already covers them), the support link on the script-free pages is an anchor the person follows and is rendered only when the existing, sanitised `supportUrl` is set, and no telemetry changes. The refused-Admin notice reads the identity already in `useMe`. Local mode is unaffected (one Admin principal). |
| II. Byte-Exact Source Preservation | Pass | Only presentation changes. The staged-deletion work changes labels and, if the cause is in the diff response, corrects values the diff reports; it never writes a document. Derived views stay derived. |
| III. One Validation Rule Set | Pass, with a rule | The grant form's e-mail pre-check is derived from the same pattern the access-grant schema uses (imported from the shared module, not retyped), and the server still validates; a document that the form accepts is never rejected for the address by a different rule. |
| IV. Atomic, Hash-Checked Persistence | Pass | The stale-save dialog only changes which button is primary and how the diff lays out; the hash check and the overwrite action are untouched. The trash work lists items and restyles a button; `purgeAll` and journaling are untouched, and a task confirms what Empty trash removes first. |
| V. Pinned Official Standards | Pass | No schema or standard changes. The grouping tint stays labelled as an application choice, and the legend entry (FR-025) says so. |
| VI. Verification Gate | Pass, by plan | Every behaviour change has a unit test or a browser check named in its task; layout work adds geometry assertions across the four viewports (extended existing suites, new per-lane helper files); new decision logic gets mutants (legibility decision, Fit-versus-centre, staged-delete label, e-mail check, last-admin guard, trash sections, font fallbacks). Gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `test:ui`, `test:responsive`, `test:edges`, `test:grouping-validation`, `test:examples:ui`, the lane suites, `test:mutation`. Browser checks use mocked or isolated stores only. No new route, so the authorization matrix is unchanged. |
| VII. Honest Claims | Pass, by plan | Docs change in the same lane as the behaviour: the 'first view shows every entity by name' claim is replaced by the legibility rule as implemented; 'one to five foreign keys' becomes 'one to three'; the reserved `supportUrl` sentence is updated; the README names the fonts and their licence. Counts quoted in docs come from tests. |
| VIII. Readable Code | Pass, by plan | Oxfmt at 100 columns, one statement per line, functions about 40 lines, components about 150; a file that is already over the limit is split before anything is added to it, no spec ids in comments (`check:comments`), module headers and JSDoc on exports. Every lane brief carries the Code style, Design and Docs blocks. The copied capture scripts are reformatted to pass the same check. |
| Technical Constraints | Pass | Heavy layout stays in workers. No new dependency. No input-limit change. No server route added. |
| Development Workflow | Pass | Five feature branches off 007, merged in a stated order; destructive actions stay reachable from the UI; README and docs reflect the behaviour; this plan has the Constitution Check. |

No violation, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-ui-review-fixes/
├── spec.md              # Requirements, scenarios, traceability, thresholds
├── plan.md              # This file
├── research.md          # Decisions, provenance of numbers, inferences to confirm, review items judged wrong
├── quickstart.md        # How to capture before/after pairs and run each lane's checks
├── tasks.md             # Tasks per lane, with proof for each
├── capture-index.md     # (setup task) review screenshot name -> script, group, theme, widths
├── checklists/requirements.md
├── changelog/           # (lanes wrote A.md ... E.md; folded into CHANGELOG.md and removed by T077)
└── evidence/            # (lanes write A.md ... E.md and GATE.md: confirmed inferences, check output, image paths)
```

No `data-model.md` (no data changes) and no `contracts/` (no interface changes): both are stated in `research.md`.

### Source code (repository root)

```text
src/
├── app/
│   ├── graph/        # lane A (LineageLegend.tsx and legend.css: lane B)
│   ├── odcs/         # lane B
│   ├── mappings/     # MappingCanvas.tsx, mapping-graph.ts: lane B; the rest: lane E
│   ├── scm/          # lane C
│   ├── editor/       # lane C
│   ├── validation/   # lane C
│   ├── admin/        # lane D
│   ├── metrics/      # lane E
│   ├── projects/     # StaleSave.tsx: lane C; the rest: lane E
│   ├── edit/         # lane E
│   ├── auth/         # lane E (PersonMenu)
│   ├── components/   # lane E (read-only for the others)
│   ├── workspace/    # per-file ownership below
│   ├── theme/        # lane E
│   ├── style.css     # shared: selector groups per lane below
│   └── main.tsx      # lane E
├── server/routes/    # auth.ts, auth-stylesheet.ts: lane D; src/server/projects/scm.ts: lane C, only if the diff cause is there
└── shared/
    ├── theme/        # theme.css: lane E, plus lane C for the editor syntax tokens
    └── fonts/        # new, foundation (lane E)
tests/                # new and extended unit tests, by lane
scripts/              # browser checks by lane; scripts/ui-review/ (copied capture scripts); per-lane mutant files
docs/, README.md, ARCHITECTURE.md, CHANGELOG.md
index.html            # lane E (no change expected beyond the stylesheet order, which main.tsx owns)
```

**Structure Decision**: keep the existing layout. Nothing moves. New code goes next to the module it changes; new shared code (fonts) goes in `src/shared/`, the repository's shared layer. Lane agents add per-lane helper and mutant files instead of growing the large shared suites (`responsive-ui-tests.ts` is 1,756 lines).

## Lane split for parallel implementation

Five agents, five worktrees (`wt switch -c 007-lane-a` ... `-e` under `/home/rodrigo/projetos/semantic-workbench-wt/`), each with its own dev port and `DATA_DIR`. Each agent's brief is its lane section of this plan, its tasks, the spec's requirements for its story, and the Code style, Design and Docs blocks. Lanes follow the owner's split with three adjustments the code asked for, marked below.

| Lane | Story | Findings | Task count |
| --- | --- | --- | --- |
| A | US1 | M2, M3, M13, M15, m12, M14, m1, m9, m10, m11, m13, P1, P8, m28 | 13 |
| B | US2 | M1, M4, M16, M17, m7, M23, m2, m3, m4, m28, m5, m8, P8, m6 | 12 |
| C | US3 | M5, M6, M12, m24, M21, M22, m13, m18, m22, m21, m28, P7 | 12 |
| D | US4 | M9, M10, M11, M22, M23, m25, m23, P7, m26 | 8 |
| E | US5 | M7, M8, m14, m15, M18, M19, m17, M20, M24, m4, M23, M22, m16, m19, m20, m21, m27, m23, P2, P3, P4, P5, P6, P7, P9, P10 | 18 (+6 foundation) |

Foundation, merged first: the six font tasks (lane E; counted separately above as '+6 foundation') and the four setup and worktree tasks that belong to no lane (the copied capture scripts, the capture index, the sentinel lines, the worktrees). The gate has five more tasks that belong to no lane.

### File ownership

**Lane A: full graph and neighbourhood**
- `src/app/graph/**`, except `LineageLegend.tsx` and `legend.css` (lane B)
- `src/app/workspace/`: `GraphViews.tsx`, `DetailsPanel.tsx`, `EntityDetails.tsx`, `RelationshipDetails.tsx`, `hooks/useInspector.tsx`, `hooks/useWalkNavigation.tsx`
- Tests: `tests/overview-capacity.test.ts`, `full-layout`, `collapse`, `graph-view`, `graph-tour`, `graph-tiles`, `neighborhood-layout`, `incremental-layout`, `expansion-viewport`, `expansion`, `pierce`, `label-placement`, `layout`, `layout-boundaries`, `edge-path`, `edge-appearance`, `entity-name`, `grouping*`, `overview`
- Scripts: `graph-browser-check.ts`, `graph-expansion-checks.ts`, `graph-tile-checks.ts`, `large-graph-browser-check.ts`, `overview-areas-browser-check.ts`, `relationship-browser-check.ts`, `grouping-validation-ui-tests.ts`, `scripts/helpers/graph-*.ts`, `overview-areas.ts`, `grouping-menu.ts`, `graph-mutants.ts`
- `style.css` selector groups: `.graph-*`, `.neighborhood-*`, the full-screen block, the graph toolbar parts of the adaptive-reflow blocks
- Docs: `docs/graph-design.md` (rendering engines, whole-model pipeline, neighbourhood), `docs/user-guide.md` (graph part of Model views)
- Adjustment: the owner's lane A list names only `src/app/graph/`; the details pane files are added because M13 changes what happens when the pane opens, and they are used only by graph views.

**Lane B: lineage and mapping canvases**
- `src/app/odcs/**`, `src/app/graph/LineageLegend.tsx`, `src/app/graph/legend.css`
- `src/app/mappings/MappingCanvas.tsx`, `src/app/mappings/mapping-graph.ts`
- `src/app/workspace/ContractView.tsx`, `hooks/useLineage.tsx`
- Tests: `tests/lineage*.test.ts`, `mapping-graph`, `edge-route`, `edge-labels`, `odcs-*`
- Scripts: `lineage-browser-check.ts`, `odcs-browser-check.ts`, `mapping-graph-browser-check.ts`, `edge-attachment-ui-tests.ts`, `scripts/helpers/odcs-graph-*.ts`, `edge-geometry.ts`, `lineage-mutants.ts`
- Docs: `docs/graph-design.md` (contract lineage, mapping graphs, first-view readability), `docs/user-guide.md` (lineage and hops)
- Adjustment: the legend lives in the graph folder but is used only by the lineage canvas, so it moves to lane B.

**Lane C: source control and editor**
- `src/app/scm/**`, `src/app/projects/StaleSave.tsx`, `src/app/editor/**`, `src/app/validation/**`
- `src/app/workspace/`: `StatusFooter.tsx`, `SourceControlView.tsx`, `SourceView.tsx`, `SaveStateButton.tsx`, `HeaderActions.tsx`, `SaveDialogs.tsx`, `commit-availability.ts`, `hooks/useSourceControl.tsx`, `hooks/useSaving.tsx`, `hooks/useValidation.tsx`
- `src/server/projects/scm.ts` only if the staged-deletion investigation finds the cause there
- Tests: `tests/scm-presentation.test.ts`, `commit-availability`, `footer-counts`, `source-editor`, `editor-*`, `git-status`, `project-changes`
- Scripts: `scm-browser-check.ts`, `commit-browser-check.ts`, `editor-browser-check.ts`, `validation-browser-check.ts`, `autosave-browser-check.ts`, `git-setup-browser-check.ts`, `sql-browser-check.ts`, `scripts/helpers/scm-theme-tour.ts`, `scm-mutants.ts`
- `style.css` selector group: `.stale-*`
- `src/shared/theme/theme.css`: the editor syntax token group only
- Docs: `docs/user-guide.md` (Source control, editor, validation)
- Adjustment: `HeaderActions.tsx`, `SaveStateButton.tsx` and `SaveDialogs.tsx` join because M21 and m28 change the header Commit and save states.

**Lane D: administration and script-free pages**
- `src/app/admin/**`, `src/server/routes/auth.ts`, `src/server/routes/auth-stylesheet.ts`
- Tests: `tests/admin-*.test.tsx`, `admin-route`, `admin-client`, `tests/auth/auth-pages.test.ts`
- Scripts: `admin-browser-check.ts`, `admin-last-admin-check.ts`, `admin-pane-geometry.ts`, `auth-browser-check.ts`, `scripts/helpers/admin-*.ts`, `auth-page-geometry.ts`, `admin-mutants.ts` (existing, extended)
- Docs: `docs/user-guide.md` (Admin), `docs/server-mode.md` (no-access pages), `docs/theme.md` (the `supportUrl` paragraph only)
- `style.css`: none; admin styles live in `admin.css`.

**Lane E: shell, typography, theme, catalog, metrics, trash, mappings, dialogs**
- `index.html`, `src/app/main.tsx`, `src/app/style.css` (everything not named for another lane), `src/shared/theme/`, `src/shared/fonts/`, `src/app/theme/`
- `src/app/workspace/`: everything not named for lanes A, B, C (`CatalogView.tsx`, `catalog.css`, `EmptyProject.tsx`, `AddProjectMenu.tsx`, `WorkspaceSidebar.*`, `WorkspaceHeader.*`, `WorkspaceToolbar.tsx`, `WorkspaceCanvas.tsx`, `SettingsPanel.*`, `ThemeControl.*`, `MetricsPanel.tsx`, `FileDialogs.tsx`, `StructuredItemDialogs.tsx`, `RdfItemDialogs.tsx`, `ExampleItems.tsx`, `AppDialogs.tsx`, remaining `hooks/*`)
- `src/app/metrics/**`, `src/app/projects/**` except `StaleSave.tsx`, `src/app/edit/**`, `src/app/auth/PersonMenu.*`, `src/app/components/**`, `src/app/mappings/` except `MappingCanvas.tsx` and `mapping-graph.ts`
- Tests: `tests/fonts.test.ts` (new), `theme-check`, `trash-sections`, `polish-presentation`, `modal`, `menu-position`, `project-tree`, `mapping-choice`, `item-add-delete`, `new-file`
- Scripts: `theme-browser-check.ts`, `dialogs-browser-check.ts`, `metrics-browser-check.ts`, `trash-browser-check.ts`, `projects-browser-check.ts`, `sidebar-layout-browser-check.ts`, `mappings-layout-browser-check.ts`, `item-edit-browser-check.ts`, `clipping-browser-check.ts`, `scripts/helpers/theme-tour.ts`, `dialog-geometry.ts`, `control-geometry.ts`, `font-mutants.ts`, `shell-mutants.ts`
- Docs: `docs/theme.md`, `docs/user-guide.md` (first run, catalog, metrics, mappings, trash), `README.md`, `ARCHITECTURE.md`

### Shared files and who edits which part

| File | Lanes that edit it | Rule |
| --- | --- | --- |
| `src/app/style.css` (3,600 lines) | A, C, E (foundation edits font lines only) | Each lane edits only the selector groups named above and never moves, reorders or reformats a block. A new rule for a new component goes in that lane's own CSS file. The foundation task edits only `font` and `font-family` lines in every stylesheet and merges first, so no lane meets those lines. Hunks of different selector groups merge mechanically. |
| `src/shared/theme/theme.css` | C (editor syntax tokens), E (all else) | Add a token to the light set and both dark blocks together; `tests/theme-check.test.ts` fails otherwise. Different token groups are different hunks. |
| `scripts/mutation-tests.ts`, `scripts/helpers/all-tours.ts` | A to E | The setup task adds one sentinel comment pair per lane; a lane adds its import and `mutants.push(...)` only under its own sentinel. The mutants themselves live in `scripts/<topic>-mutants.ts` and `<topic>-mutation-cases.ts`. |
| `scripts/responsive-ui-tests.ts`, `scripts/ui-tests.ts` | none directly | Lanes extend their own dedicated browser check and add helper files under `scripts/helpers/`. If a suite needs one call line, the lane adds it inside its own block (`graph:`, `lineage:`, `admin:`...) and says so in its evidence file. |
| `docs/user-guide.md`, `docs/graph-design.md`, `docs/theme.md` | by lane | Each lane edits only the headings listed under its ownership. |
| `CHANGELOG.md` | integrator only | Lanes write `changelog/<lane>.md`; the last gate task folds them in once. |
| `specs/007-ui-review-fixes/research.md` | lane A (threshold table), integrator | Other lanes write findings in `evidence/<lane>.md`. |
| `src/app/graph/{ZoomButtons,CompactControls,GraphOptions,fullscreen}` and `src/app/components/ScrollStrip*` | A and E own; B reads | Lane B uses these through their existing props. If B needs a change it asks the owner; no cross-lane edit. |
| `src/app/projects/Modal.tsx` | E | Lane C's stale-save dialog and lane D's review dialogs use it unchanged. |
| `src/app/main.tsx`, `index.html`, `package.json` | E (main, index); nobody (package.json) | No new scripts and no new dependencies, so `package.json` and `bun.lock` do not change. |
| `src/app/theme/theme-palette.ts` | E | Used by lane A's overview code; the tint change lands with lane E and A recaptures nothing for it. |

### Merge order

1. **Foundation** (fonts, capture scripts, sentinels, worktrees): merges first because the new font changes glyph widths, truncation and wrapping on every screen. Lane agents start coding in parallel on their lanes from the pre-foundation base only for work that does not need an 'after' image; they rebase on the foundation before any capture.
2. **A, then B, then C, then D**: disjoint files; any order works, this one keeps the largest visual change first so later gates run against it.
3. **E**, last: it owns the widest set of shared styles and uses lane A's identifier-humanising function in the catalog.
4. **Gate**: full suites, whole-journey recapture and classification, CHANGELOG assembly, `speckit-analyze`, architecture review.

A lane merges only after its own check task passes and `git merge --no-ff` of the previous lane is clean. After each merge the integrator runs `bun test`, `bun --bun run check` and `bun --bun run build`.

## Verification and evidence protocol

- **Before image**: the review's screenshot named in the task (follow-up image where the first-round one accumulated state).
- **After image**: the same script, example, file, state stage, viewport and theme, run against the lane's dev server (`quickstart.md`). Images stay in `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/after/<lane>/` and out of git (they can show the machine's committer name and are large); each lane's `evidence/<lane>.md` lists pairs, check output and the confirmed inferences. Capture and viewing is delegated to Codex under the owner's rule, with a neutral Git identity.
- **Check**: an existing browser suite, extended with a geometry assertion for the numeric requirement; where none exists, a new check in the lane's own helper file. A check that cannot fail on e8b7d69 proves nothing, so each new assertion is run once on the base to show it fails there.
- **Mutation**: each decision function named above gets mutants registered under its lane's sentinel.

## Complexity Tracking

No Constitution Check violation. Two things worth noting: the font files are binary assets under `src/shared/fonts/` (sizes recorded in the font README), justified in `research.md` because the CSP forbids a CDN and a package would add a runtime dependency; and the capture scripts are a development tool added to the repository so the gate can be rerun by anyone.
