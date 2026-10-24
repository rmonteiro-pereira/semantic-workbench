# Round 6 server dark visual audit

Captured application head: `5e3738a`.

Read the strict audit brief and the completed retry capture log before reviewing the exact
68-image manifest. The retry log contains 208 geometry measurements, all reporting `problems=0`,
and no skipped captures. The earlier interrupted attempt is outside this review.
Every assigned image was inspected individually at native resolution using original-detail views.
The inspected scope is 17 screens at 390, 1280, 1440 and 2560 px, stored in
`/tmp/polish-round6/server-dark-retry/`.

**Counts: 0 S1, 0 S2, 1 S3. No S1 or S2 found in the assigned 68 images.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R6-SD-1 | S3 | `server-dark-catalog-1280.png`; `server-dark-contract-contract-1280.png`; `server-dark-contract-graph-1280.png`; `server-dark-ontology-catalog-1280.png`; `server-dark-ontology-graph-1280.png`; `server-dark-ontology-mappings-1280.png`; `server-dark-ontology-metrics-1280.png`; `server-dark-ontology-neighborhood-1280.png`; `server-dark-ontology-overview-1280.png`; `server-dark-ontology-source-1280.png`; `server-dark-sidebar-projects-1280.png`; `server-dark-source-control-1280.png`; `server-dark-source-editor-1280.png` | At 1280 px, the sidebar file-list viewport ends around y502 through a file row. In the shared-reference views only the first finance/revenue filename line peeks above the divider; in the sales-contract views the sales.mapping row is partly visible. The fixed lower actions remain readable, but the abrupt row fragment looks unfinished. | Add a subtle scroll-edge affordance or stop the initial visible list on a complete row while keeping the list independently scrollable. |

All intended main views match their filenames. The graph has readable counted area cards at
narrow sizes and readable entity cards at larger sizes, without crossed card text or a dense mesh.
The neighborhood center and both neighbors fit at every size. The contract graph retains its
complete table card, field names and classification badges.

The theme is consistently dark: dialogs and the item editor are opaque, with no light patches
or background text showing through their surfaces. Phone headers wrap within the viewport.
Catalog cards align, form fields remain separated, and footer actions remain visible.
The Import dialog explains the destination choice; the Trash empty state explains what belongs
there. Metrics and source control provide context and next steps. The source editor has readable
highlighting, line numbers and toolbar controls.

No additional visible clipping, overlapping controls, sideways page scrollbars, low-contrast text
or obviously undersized product text was identified. Long source-code lines belong to the editor
viewport. Ordinary vertical content continuing below a scrollable panel is not classified as broken
layout. This report makes no claim about tooltip behavior, closed menus, other modes or themes,
or screens outside the assigned manifest.

Screens with no defects:

- server-dark-sidebar-projects-390.png
- server-dark-sidebar-projects-1440.png
- server-dark-sidebar-projects-2560.png
- server-dark-ontology-overview-390.png
- server-dark-ontology-overview-1440.png
- server-dark-ontology-overview-2560.png
- server-dark-ontology-graph-390.png
- server-dark-ontology-graph-1440.png
- server-dark-ontology-graph-2560.png
- server-dark-ontology-neighborhood-390.png
- server-dark-ontology-neighborhood-1440.png
- server-dark-ontology-neighborhood-2560.png
- server-dark-ontology-catalog-390.png
- server-dark-ontology-catalog-1440.png
- server-dark-ontology-catalog-2560.png
- server-dark-ontology-source-390.png
- server-dark-ontology-source-1440.png
- server-dark-ontology-source-2560.png
- server-dark-ontology-mappings-390.png
- server-dark-ontology-mappings-1440.png
- server-dark-ontology-mappings-2560.png
- server-dark-ontology-metrics-390.png
- server-dark-ontology-metrics-1440.png
- server-dark-ontology-metrics-2560.png
- server-dark-contract-contract-390.png
- server-dark-contract-contract-1440.png
- server-dark-contract-contract-2560.png
- server-dark-contract-graph-390.png
- server-dark-contract-graph-1440.png
- server-dark-contract-graph-2560.png
- server-dark-source-control-390.png
- server-dark-source-control-1440.png
- server-dark-source-control-2560.png
- server-dark-source-editor-390.png
- server-dark-source-editor-1440.png
- server-dark-source-editor-2560.png
- server-dark-trash-390.png
- server-dark-trash-1280.png
- server-dark-trash-1440.png
- server-dark-trash-2560.png
- server-dark-import-390.png
- server-dark-import-1280.png
- server-dark-import-1440.png
- server-dark-import-2560.png
- server-dark-catalog-390.png
- server-dark-catalog-1440.png
- server-dark-catalog-2560.png
- server-dark-item-editor-390.png
- server-dark-item-editor-1280.png
- server-dark-item-editor-1440.png
- server-dark-item-editor-2560.png
- server-dark-add-concept-390.png
- server-dark-add-concept-1280.png
- server-dark-add-concept-1440.png
- server-dark-add-concept-2560.png

**Screenshots reviewed: 68 of 68.**
