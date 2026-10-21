# Codex brief: Phase 10 adaptive reflow (T150)

Semantic Workbench (`/home/rodrigo/projetos/semantic-workbench`, branch
`001-workbench-improvements`): React 19 + TypeScript, Bun 1.4, Vite+. Layout work only.

**Hard rules:** do not commit; do not touch `data/`; do not modify tests or browser checks
(`tests/`, `scripts/`) to make them pass; no new dependencies; do not change server code or
behaviour (no feature changes, no renamed labels or roles — the browser checks find controls by
their accessible names). CSS changes go mainly in `src/style.css` and the per-view CSS files
(`src/metrics/metrics.css`, `src/odcs/odcs.css`, `src/scm/scm.css`, `src/edit/edit.css`,
`src/editor/editor.css`); small markup changes are fine where CSS alone cannot do it.

## Task

**T150** Adaptive reflow for sidebar, toolbars, inspector, Metrics, ODCS, Source Control and
editors in `src/style.css` (and the view CSS files above).

Requirements (spec):
- **FR-067** Every view MUST reflow from 390×844 to 2560×1440 and on window resize without
  horizontal page scroll, clipped controls or overlap.
- User Story 10, scenario 3: at any viewport from 390×844 to 2560×1440 and any resize between
  them, the sidebar, toolbars, inspector, Metrics, ODCS pages, Source Control and editors reflow
  without horizontal page scroll, clipped controls or overlap.
- Constitution: layout work must keep geometry assertions green across the responsive matrix;
  derived views never rewrite documents (no behaviour changes here).

The resize sweep in `scripts/responsive-ui-tests.ts` already passes (no horizontal page scroll,
no control cut off in any view at 2560×1440, 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768,
800×900, 390×844). It must keep passing. What remains is quality of the reflow, observed in
screenshots:

1. **Tab bar and graph toolbars below 650 px** scroll sideways with no hint that more is there
   (`.tabs`, `.full-graph-tools`, `.neighborhood-tools`): add an edge fade (mask) on the
   scrolling side(s) and keep the selected tab scrolled into view when it changes.
2. **Medium widths (650–1100 px)**: graph toolbars wrap into several rows and eat canvas height.
   Keep them to at most two rows (compact padding/gaps, smaller selects) without hiding controls.
3. **Wide screens (≥ 1920 px)**: text-heavy views stretch to the full width (Mappings: a
   full-width "Mapping document" select and long single-line paragraphs; Metrics list; ODCS
   overview description and sections; Source Control side column; Catalog cards). Give
   paragraphs a readable max width (~90ch), let selects size to content (max ~640px), and use
   multi-column grids where content is a list of cards/sections, so 2560×1440 looks intentional
   rather than sparse.
4. **Inspector (details panel) at 1024–1366 px**: it must not squeeze the graph canvas below about
   60% of the canvas row; prefer the overlay mode used below 1100 px when space is short.
5. **Source Control below 900 px**: the changes column and the diff stack; give the diff a
   usable minimum height and keep the commit box and remote actions reachable without scrolling
   past the whole history.
6. **Editors**: the item-editor drawer (`.item-editor`, `src/edit/edit.css`) and the Source editor
   at 390 px (full width, no clipped footer buttons) and at 2560 px (drawer width capped, not a
   thin column on a huge screen).

Do not work on these (Phase 12 handles them): overlap of mini-map / status line / bundle selector
/ zoom controls, status-toast dismissal, sidebar active states, sidebar crowding by the
suggestions panel and example loaders.

## Tests that must pass

- `bun --bun run check`, `bun --bun run build`, `bun test`.
- `bun run test:responsive` (includes the full-screen checks and the resize sweep), and also
  `test:ui`, `test:examples:ui`, `test:metrics`, `test:odcs`, `test:scm`, `test:item-edit`,
  `test:graph`, `test:edges`. These need the Vite dev server:
  `bun node_modules/vite/dist/vite/node/cli.js dev --host 127.0.0.1 --strictPort` in the
  background (each check starts its own isolated API). If the sandbox prevents the dev server or
  Chromium, say so and report what you could run.
- Screenshots: `test:responsive` writes `/tmp/workbench-sweep-*.png` and
  `/tmp/workbench-responsive-*.png`; look at them.

Final message: files changed, what you ran with results, and anything you were unsure about.
