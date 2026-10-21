# UI polish findings (input for Phase 12)

Observed in Phase 4 browser screenshots (neighborhood view, mall and UBL models, 1600×1000).

1. Sidebar Projects section is a tiny scroll area: about three file rows are visible and the next row is cut off mid-text. The Projects tree should get most of the sidebar height; example loaders should collapse or move below.
2. Clipped text: the "CENTER" badge on the center node shows as "OCENTER"/cut; the walk breadcrumb is cut off at the right edge; long project names ("UBL business ···") truncate too early.
3. Neighborhood on UBL with labels and links between neighbors on: neighbors spread over two columns on the left, so the center is right of middle; between-neighbor links and the dashed area box form dense crossings with overlapping labels.
4. Definition details: the "Explore neighborhood" button and the entity-type chip ("EntityType") collide.

Observed in Phase 6 screenshots (item editor and KPI wizard, 1440×900).

5. Sidebar crowding got worse: the Grouping suggestions panel takes a large fixed block with long wrapped IRIs, leaving the project tree two or three rows tall. Suggestions should be compact (one line + count, expandable) and the tree should own the remaining height.
6. A stale status toast ("Saved to commerce-business.ossie.yaml") persists after switching to another project. Status messages must expire and be scoped to the document they refer to.
7. KPI wizard "Built from" is a plain nested bullet list; it should reuse the composition tree component from the Metrics explanation for consistency.
8. Wizard step chips wrap to a second line at 1440 px; consider a compact stepper.
