# Codex brief: Phase 5, T109 (mapping card styling)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or checks to make them pass.

## Task

T109 [US11]: styling of the concept-mapping canvas (concept vs dataset cards, Identifying and
Unmapped badges, warning markers, the Selected path panel's binding list, the toolbar additions)
in `src/odcs/odcs.css` (the block `/* Mapping canvas (v0.3.0 ...` at the end, plus the lineage
card rules it builds on) and `src/property-badges.css`. Small markup changes in
`src/mappings/MappingCanvas.tsx`, `src/odcs/LineageCard.tsx`, `src/odcs/LineageCanvas.tsx` are
allowed when CSS alone cannot do it, but keep every role, accessible name, `data-*` attribute
and class the checks use (see ui-contracts "Mapping canvas" and "Lineage canvas" in
specs/002-lineage-and-ux/contracts/ui-contracts.md).

Geometry contract: card sizes come from `src/odcs/lineage-layout.ts` (CARD_W=400, HEADER_H=64,
ROW_H=30, PAGER_H=32, MORE_H=28); the rendered header, rows, pager and "more" row must keep these
exact heights (ELK places ports at row centres). Column names are 13 px and types/badges 11 px so
that the first view (zoom ≥ 0.93) renders names at 12 px or more: do not shrink them.

## Requirements (spec FR-029–FR-032)

- Concept cards (accent #a3532b, `k-concept`) are visibly different from dataset cards
  (`k-dataset`) and metric cards (`k-metric`), with the same structure as lineage cards.
- Identifying and Unmapped badges are readable and consistent with the other property badges;
  the Unmapped badge in a card header sits beside the title without crowding the actions.
- Warning markers (`.lineage-finding`, button named `Mapping finding: <message>`) are clearly
  warnings, with a comfortable hit area, and never overlap the title or the actions.
- Selected path panel: the steps list (`ol`) and the bindings list (`ul.lineage-bindings`,
  aria-label "Bindings") should read as two sections: give the bindings a small "Bindings"
  heading (visually; keep the list's aria-label), each binding one tidy row (kind chip, the
  concept path, the expression in monospace under it, Edit item button aligned right, same
  button style as the rest of the app).
- Toolbar: the "Unmapped only" checkbox and, for consolidated files, the `Mapping graph` /
  `Ontology graph` switch (`.graph-view-switch`, role group "Graph view") align with the other
  toolbar controls (same height, 34 px), wrap neatly at 390 px, nothing clipped.
- Owner's principles: "use more modals and don't cram the UI"; nothing overlapping, clipped or
  cramped; consistent spacing, type sizes, button styles and icons.

## Findings from the current build (screenshots)

1. /tmp/workbench-mapping-graph-path-1280.png: the binding list follows the steps list with no
   heading; binding rows are dense; expression text wraps under the name without spacing.
2. /tmp/workbench-mapping-graph-path-390.png: the panel at 390 px leaves the canvas short; keep the
   panel at most ~40% of the stage and scrolling inside, toolbar compact.
3. /tmp/workbench-mapping-graph-mall-1440.png: two lines between the same ports (object mapping
   and KPI `measures`) are offset by 7 px lanes; check they read as two lines.
4. /tmp/workbench-mapping-graph-commerce-1440.png and -flights-390.png: check concept vs dataset
   distinction and badge legibility.

## Checks that must pass (dev server at http://127.0.0.1:5173)

- `bun --bun run check`, `bun test tests/mapping-graph.test.ts tests/lineage*.test.ts`
- `bun run test:mapping-graph` (11 checks) and `bun run test:lineage` (10 checks)
- `RESPONSIVE_ONLY="mapping graph" bun run test:responsive` and `RESPONSIVE_ONLY=lineage bun run test:responsive`
If your sandbox cannot open ports, say so; the reviewer will run them. Report briefly what you changed.
