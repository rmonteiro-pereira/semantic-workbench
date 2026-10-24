# Round 6 server light visual audit

Captured application head: `5e3738a`.

Read the strict audit brief and capture log before reviewing the exact 68-image manifest.
The complete server log contains 208 geometry measurements, all reporting `problems=0`,
and no skipped captures. Every assigned image was inspected individually at native resolution,
using original-detail image views. The inspected scope is 17 screens at 390, 1280, 1440 and 2560 px.

**Counts: 0 S1, 0 S2, 1 S3. No S1 or S2 found in the assigned 68 images.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R6-SA-1 | S3 | `server-sidebar-projects-1280.png`; `server-ontology-overview-1280.png`; `server-ontology-graph-1280.png`; `server-ontology-neighborhood-1280.png`; `server-ontology-catalog-1280.png`; `server-ontology-source-1280.png`; `server-ontology-mappings-1280.png`; `server-ontology-metrics-1280.png`; `server-catalog-1280.png`; `server-source-control-1280.png`; `server-source-editor-1280.png`; `server-contract-graph-1280.png` | At 1280 px, the sidebar file-list viewport ends around y502 through a file row. In the shared-reference views only the first finance/revenue filename line peeks above the divider; in the sales-contract views the sales.mapping row is partly visible. The fixed lower actions are legible, but the abrupt row fragment looks unfinished. | Add a subtle scroll-edge affordance or stop the initial visible list on a complete row while keeping the list independently scrollable. |

All intended main views match their filenames. Graph first views have readable area headings or
entity names and no card/text collisions. The neighborhood center and both neighbors fit at every
size. The contract graph shows its complete table card, fields and classification badges.

Phone headers wrap within the viewport, catalog cards remain aligned, and the editor forms retain
visible footer actions. Import and Trash dialogs are opaque with readable copy and actions.
The metrics and source-control empty states explain their context and provide relevant actions
or instructions. No additional visible clipping, overlapping controls, sideways page scrollbars,
low-contrast text or obviously undersized product text was identified. Code lines extending beyond
the source editor viewport are editor content, not page-layout overflow. Ordinary vertical content
continuing below a scrollable panel is not classified as broken layout.

This report makes no claim about tooltip behavior, closed menus, other themes, other modes or
screens outside the assigned manifest.

Screens with no defects:

- server-sidebar-projects-390.png
- server-sidebar-projects-1440.png
- server-sidebar-projects-2560.png
- server-ontology-overview-390.png
- server-ontology-overview-1440.png
- server-ontology-overview-2560.png
- server-ontology-graph-390.png
- server-ontology-graph-1440.png
- server-ontology-graph-2560.png
- server-ontology-neighborhood-390.png
- server-ontology-neighborhood-1440.png
- server-ontology-neighborhood-2560.png
- server-ontology-catalog-390.png
- server-ontology-catalog-1440.png
- server-ontology-catalog-2560.png
- server-ontology-source-390.png
- server-ontology-source-1440.png
- server-ontology-source-2560.png
- server-ontology-mappings-390.png
- server-ontology-mappings-1440.png
- server-ontology-mappings-2560.png
- server-ontology-metrics-390.png
- server-ontology-metrics-1440.png
- server-ontology-metrics-2560.png
- server-contract-contract-390.png
- server-contract-contract-1280.png
- server-contract-contract-1440.png
- server-contract-contract-2560.png
- server-contract-graph-390.png
- server-contract-graph-1440.png
- server-contract-graph-2560.png
- server-source-control-390.png
- server-source-control-1440.png
- server-source-control-2560.png
- server-source-editor-390.png
- server-source-editor-1440.png
- server-source-editor-2560.png
- server-trash-390.png
- server-trash-1280.png
- server-trash-1440.png
- server-trash-2560.png
- server-import-390.png
- server-import-1280.png
- server-import-1440.png
- server-import-2560.png
- server-catalog-390.png
- server-catalog-1440.png
- server-catalog-2560.png
- server-item-editor-390.png
- server-item-editor-1280.png
- server-item-editor-1440.png
- server-item-editor-2560.png
- server-add-concept-390.png
- server-add-concept-1280.png
- server-add-concept-1440.png
- server-add-concept-2560.png

**Screenshots reviewed: 68 of 68.**
