# Codex brief: Phase 4, T038 (lineage card and canvas styling)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or checks to make them pass.

## Task

T038 [US1]: card and canvas styling for the column-level lineage canvas (card widths, row
density, badges, dimming, 390 px layout) in `src/odcs/odcs.css` (the block starting at
`/* Lineage canvas (v0.3.0` and the `@media(max-width:700px)` line after it). You may make small
markup changes in `src/odcs/LineageCanvas.tsx` and `src/odcs/LineageCard.tsx` when CSS alone
cannot do it, but keep every role, accessible name, `data-*` attribute and class used by checks
(`lineage-view`, `lineage-toolbar`, `lineage-trail`, `lineage-flow`, `lineage-path`, `lineage-foot`,
`lineage-card`, `k-<kind>`, `center`, `dim`, `lineage-card-head`, `lineage-card-title`,
`lineage-rows`, `lineage-row`, `lineage-row-name`, `lineage-more`, `lineage-pager`,
`property-badge`, `on-path`).

Geometry contract: card height is computed in `src/odcs/lineage-layout.ts` (CARD_W=272, HEADER_H=58,
ROW_H=26, PAGER_H=30, MORE_H=26) and ELK lays the cards out with those numbers and ports at row
centres. The rendered card must match them exactly (header exactly HEADER_H tall, each row ROW_H,
pager PAGER_H, "N more" row MORE_H, no extra padding in `.lineage-rows` that shifts rows away from
their port). If a different width or row height reads better, change the constants in
lineage-layout.ts too, consistently. Currently `.lineage-rows{padding:3px 0}` shifts rows 3 px from
their ports: fix that.

## Requirements (spec FR-001–FR-010; ui-contracts "Lineage canvas")

- Cards like the reference (Marquez/DataHub style): a header with kind, name, physical name or
  expression; one row per column with name, type, and badges (PK, FK, Required, Unique,
  classification) right-aligned; a numbered pager when there are more than 10 columns.
- Selected column's whole path is emphasised (amber), everything else dims; dimming must stay
  readable (names still legible) but clearly secondary.
- Owner's design principles: "use more modals and don't cram the UI". Nothing overlapping,
  clipped or cramped; consistent spacing, type sizes, button styles and icons with the rest of the
  app (see `src/style.css` for the app's buttons and colors; `src/property-badges.css`).

## Findings to fix (screenshots from the current build)

1. 390×844: the Selected path panel is absolutely positioned over the bottom of the canvas
   (/tmp/workbench-lineage-path-390.png). It must not cover the canvas: at narrow widths stack it
   below the canvas (canvas shrinks, panel max ~40% of the stage, scrolls inside), or make it a
   compact collapsible bottom sheet that takes its own space.
2. The Selected path panel looks broken at every size (/tmp/workbench-lineage-path-1280.png): the
   header has large stray padding with the title centred (a global `header` style probably leaks
   in; scope it), and the numbered list puts the number on the kind line with the label below.
   Make each step one tidy item: a small kind chip (Contract object / Field / Metric / External)
   and the `card.column` label, aligned, with consistent spacing; current step bold.
3. Rows: the column type (`small`) and badges compete for space on 272 px cards; long names must
   ellipsize (already) and never overlap badges; keep badges on one line.
4. Toolbar at 390 px (/tmp/workbench-lineage-commerce-390.png): search on its own line, then Steps
   and the icon buttons on one line, consistent button heights (same as the rest of the app),
   no wasted vertical space; the trail row stays one line and scrolls sideways.
5. Footer (legend + "Workbench reading…" note) must wrap neatly at 390 px and not overflow.
6. Card header actions (Walk here, Expand, Open asset page) are tiny; give them a comfortable hit
   area without changing HEADER_H.

## Components to reuse

`src/graph/LineageLegend.tsx` (legend), `src/PropertyBadges.tsx` (badges), `src/projects/Modal.tsx`
(options modal already uses it), lucide icons as elsewhere.

## Checks that must pass (run them; the dev server runs at http://127.0.0.1:5173)

- `bun --bun run check` and `bun test tests/lineage*.test.ts`
- `bun run test:lineage`
- `RESPONSIVE_ONLY=lineage bun run test:responsive` (geometry: `lineageProblems` in
  scripts/helpers/layout-geometry.ts; currently fails with "390×844 with a path: the Selected path
  panel covers the canvas")
- `RESPONSIVE_ONLY="resize sweep: Lineage" bun run test:responsive`
- `bun run test:odcs`

Look at the screenshots these write (/tmp/workbench-lineage-*.png) at 390, 1280, 1440 and 2560 px
before finishing. Report what you changed and why, briefly.
