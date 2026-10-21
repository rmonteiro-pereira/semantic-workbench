# Codex brief: Phase 12 UI polish and overlaps (T158, T159, T160)

Semantic Workbench (`/home/rodrigo/projetos/semantic-workbench`, branch
`001-workbench-improvements`): React 19 + TypeScript, Bun 1.4, Vite+.

**Hard rules:** do not commit; do not touch `data/`; do not modify tests or browser checks
(`tests/`, `scripts/`) to make them pass; no new dependencies; no server changes; keep every
existing accessible name and class hook (the browser checks find controls by them) unless this
brief says otherwise.

## Tasks

- **T158** Fix overlaps of the bundle selector, status line, mini-map, zoom controls, popovers and
  area titles (`src/style.css`, `src/FullGraph.tsx`, `src/NeighborhoodGraph.tsx`,
  `src/GroupingControls.tsx`).
- **T159** Auto-dismiss status messages (`src/main.tsx`).
- **T160** Correct sidebar and tab active state; separate Neighborhood and Overview view state
  (`src/main.tsx`).
- The polish findings below (`polish-findings.md` items 1–8).

## Requirements (spec)

- **FR-071** No overlay (status line, bundle selector, mini-map, zoom controls, toasts, popovers,
  inspector) may overlap another overlay or an active control at any supported viewport
  (390×844, 1024×768, 1280×720, 1366×768, 1920×1080, 2560×1440).
- **FR-072** Status messages MUST auto-dismiss or clear on the next action.
- **FR-073** Navigation state (sidebar, tabs) MUST indicate the current view correctly.
- **FR-074** Existing behaviour and checks (exports, grouping, validation navigation, agent
  endpoints, examples) MUST keep passing.
- User Story 12: bundle selector, status line, mini-map and zoom controls never overlap; a status
  message disappears after a short time or on the next action and never hides controls; the
  active sidebar item and tab match the view; on narrow widths popovers stay anchored to their
  control and inside the viewport.

## Baseline defects to fix (spec appendix)

10. The bundle selector (`.graph-bundle-choice`) sits 16 px from the left and 62 px from the
    bottom, on top of the zoom controls column.
11. The full-graph status line (`.full-graph-status`) spans almost the full width and wraps, so it
    runs under the mini-map and can grow into the bundle selector.
12. Status messages are never cleared after loading or saving; the message box (`main > .status`)
    sits above the footer across the canvas, covering the graph status line and controls.
13. The open grouping-details popover is fixed at 100 px from the top at narrow widths regardless
    of where its control is, so it can cover the header or toolbar.
14. Business-area titles (`.full-area-title`) are single-line and spill beyond narrow area boxes.
15. The sidebar "Model explorer" item is always styled as active and opens Neighborhood while the
    default tab is Graph; "Source editor" is never shown as active.
16. Neighborhood and Overview share one tab value (`tab==='graph'` plus `showAll`), which
    complicates active-tab state and navigation.

## Contract for the checks (scripts/responsive-ui-tests.ts, new "overlaps", "popovers",
## "status messages" and "navigation" checks)

- Overlays checked pairwise and against every visible control: `.react-flow__minimap`,
  `.react-flow__controls`, `.full-graph-status`, `.graph-bundle-choice`, `main > .status`,
  `.full-graph-tools`, `.neighborhood-tools`, `.inspector`. Covered means: the boxes intersect and
  the overlay is the element drawn at the centre of the intersection
  (`scripts/helpers/layout-geometry.ts`). Views: Graph, Neighborhood, Overview, Catalog, Source,
  Mappings, Metrics, Contract, Dataset page, Source control; with and without the inspector open
  (where an entity can be selected). Reasonable fixes: give the status line a bounded width and
  place it so it never reaches the mini-map; move the bundle selector away from the zoom controls
  (e.g. bottom-centre above the status line, or into the toolbar row); hide the mini-map (or move
  it) when the inspector overlays the canvas or the canvas is narrow; keep the inspector overlay
  clear of the toolbar.
- **Inspector** (the checks open it on an entity in Graph, Neighborhood, Overview and Catalog):
  findings today, at 1024–1366 px it overlays the page and covers toolbar buttons, the mini-map,
  the status line, Overview area cards and Catalog cards; at 390 px it covers the zoom controls.
  Required: in Graph and Neighborhood the overlay sits over the canvas only below the toolbar,
  and the mini-map / zoom controls / status line either move clear of it or are hidden while it
  is open; in Overview and Catalog (page content, not a canvas) the inspector is a side column
  that narrows the content instead of covering it, or, below 651 px, a modal sheet (the page
  behind it `inert`, so covered controls do not count; keep the "Close details" button and the
  `aside.inspector` with `aria-label="Definition details"`).
- Failures the new checks report today (before your work), for orientation: at 1280×720 the
  mini-map overlaps the status line and the zoom controls overlap the bundle selector; at 390×844
  the mini-map overlaps the status line; while a status message shows, it overlaps the zoom
  controls and the status line; messages never dismiss.
- Grouping details popover: opens below its `summary[aria-label="Grouping details"]`, inside the
  viewport, never above the header bottom, at every viewport.
- Area titles: inside their area node; a name too long for the area is truncated with an ellipsis
  or wrapped, and the full name is available as a `title` attribute on the title element (or an
  ancestor).
- Status messages (`main > .status`): auto-dismiss after at most 6 s; clear on the next action
  (any tab change, document open, or sidebar navigation); scoped to the document they refer to
  (switching project or document clears a message about another document — polish finding 6).
  Error messages that need action (validation failures shown in the same box) may stay while the
  error lasts, but must not cover controls. While shown, a message must not cover any control.
- Navigation: the active sidebar item has `aria-current="page"` and the selected tab has
  `aria-current="page"` (keep the existing `active` / `selected` classes too). "Model explorer"
  is current for every model view (Overview, Graph, Neighborhood, Catalog, Mappings, Metrics,
  Contract) and opens the **Graph** tab; "Source editor" is current on the Source tab; "Source
  control" on Source Control (no tab is current there). Exactly one sidebar item and at most one
  tab are current at a time.
- Neighborhood and Overview become separate tab values (for example `'neighborhood'` and
  `'overview'`), each keeping its own state: a neighborhood center survives a visit to Overview
  and back. Remove the `showAll` flag or reduce it to a derived value; keep every existing
  behaviour (Overview's "Neighborhood" button, selection moving to the neighborhood center,
  grouping controls in Overview and Graph, the F key full screen in Graph and Neighborhood).

## Polish findings (polish-findings.md)

1. Sidebar Projects section is a tiny scroll area (about three rows visible at 1280×720 and
   1440×900; the next row is cut mid-text). The Projects tree gets most of the sidebar height
   (at least eight rows at 720 px height); the example loaders become compact (one line each, no
   wrapped subtitle, or a two-column grid) below the tree. Keep every loader button and its
   accessible name ("Load UBL business model …" etc.) visible without extra clicks: the checks
   open the drawer and click them directly.
2. Clipped text: the "CENTER" badge on the neighborhood center node shows cut; the walk breadcrumb
   is cut off at the right edge (it should scroll or wrap); long project names truncate too early
   in the tree (give the name the free width; tooltips with the full name).
3. Neighborhood on UBL with labels and links between neighbors on: neighbors spread over two
   columns on the left, so the center is right of middle; balance the columns so the center sits
   near the middle (do not break `neighborhoodEdgeProblems` in `scripts/helpers/edge-geometry.ts`).
4. Definition details: the "Explore neighborhood" button and the entity-type chip collide; lay
   them out so they never overlap at any inspector width.
5. Grouping suggestions in the sidebar: compact, one line with a count, expandable; long IRIs
   truncate with a tooltip.
6. Stale status toast after switching project (see Status messages above).
7. KPI wizard "Built from" is a plain nested list; reuse the composition tree component from the
   Metrics explanation (`src/metrics/Explanation.tsx`) for consistency.
8. Wizard step chips wrap to a second line at 1440 px; use a compact stepper that stays on one
   line from 1024 px up (it may scroll or abbreviate below).

## Constitution rules that matter

- Derived views never rewrite documents; layout fixes change no behaviour.
- Honest labels; nothing executes.
- Layout work keeps geometry assertions green across the responsive matrix.

## Tests that must pass

`bun --bun run check`, `bun --bun run build`, `bun test`, and the browser suites
`bun run test:responsive` (new overlap, popover, status and navigation checks), `test:ui`,
`test:graph`, `test:edges`, `test:grouping-validation`, `test:metrics`, `test:item-edit`,
`test:examples:ui`. They need the Vite dev server on 127.0.0.1:5173. If the sandbox prevents
the dev server or Chromium, say so and report what you could run.

Final message: files changed, what you ran with results, and anything you were unsure about.
