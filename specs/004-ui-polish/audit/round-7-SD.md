# Round 7 — server dark, partition SD

Captured head: `31f4dbcbd1e8aa4a17a1e05719cc31232875a7c1`.

Reviewed all 68 assigned screenshots individually at native/original resolution: 17 screens
at 390, 1280, 1440 and 2560 pixels. Every image shows its intended view. The phone Projects
image shows the project drawer; desktop Projects images show the workspace and file list.

The completed `/tmp/polish-round7/server-dark/capture.log` contains 208 measurements,
all with `problems=0`, and no skips. `/tmp/polish-round7/progress.log` records
`PASS server-dark 2026-10-24T05:49:33Z`.

**Counts: 0 S1, 0 S2, 1 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-SD-1 | S3 | 1280: `server-dark-catalog-1280.png`, `server-dark-contract-contract-1280.png`, `server-dark-contract-graph-1280.png`, `server-dark-ontology-catalog-1280.png`, `server-dark-ontology-graph-1280.png`, `server-dark-ontology-mappings-1280.png`, `server-dark-ontology-metrics-1280.png`, `server-dark-ontology-neighborhood-1280.png`, `server-dark-ontology-overview-1280.png`, `server-dark-ontology-source-1280.png`, `server-dark-sidebar-projects-1280.png`, `server-dark-source-control-1280.png`, `server-dark-source-editor-1280.png` | The project file list ends through a row near y=502, just above its lower divider. In shared-reference views, a fragment of the finance/revenue file name peeks above the divider. In sales-contract views, the sales.mapping file row loses its lower type line. Fixed lower sidebar actions remain clear. This abrupt fragment makes the initial sidebar look unfinished. | Add a subtle scroll-edge affordance, or end the initial visible list at a complete row while retaining independent scrolling. |

Dark backgrounds remain consistent across the inspected screens, with no leftover light
panels. Visible dialog and editor drawer surfaces are opaque. Text, graph routes, selection
outlines and controls remain distinguishable against their backgrounds. Phone headers,
tabs and dialog footers fit without visible page overflow or collisions.

Counted graph area cards at 390 and 1280 are intentional first views and include an
instruction to open an area. Named entity cards at 1440 and 2560 remain readable, with
routes avoiding their text. Neighborhood cards and actions fit with visible gaps. Contract
graph fields and badges remain complete. Empty states explain their context or next step.
Ordinary vertical scrolling and source code extending inside the editor viewport are not
counted as broken page geometry.

## Screens with no defects

- `server-dark-add-concept-390.png`
- `server-dark-catalog-390.png`
- `server-dark-contract-contract-390.png`
- `server-dark-contract-graph-390.png`
- `server-dark-import-390.png`
- `server-dark-item-editor-390.png`
- `server-dark-ontology-catalog-390.png`
- `server-dark-ontology-graph-390.png`
- `server-dark-ontology-mappings-390.png`
- `server-dark-ontology-metrics-390.png`
- `server-dark-ontology-neighborhood-390.png`
- `server-dark-ontology-overview-390.png`
- `server-dark-ontology-source-390.png`
- `server-dark-sidebar-projects-390.png`
- `server-dark-source-control-390.png`
- `server-dark-source-editor-390.png`
- `server-dark-trash-390.png`
- `server-dark-add-concept-1280.png`
- `server-dark-import-1280.png`
- `server-dark-item-editor-1280.png`
- `server-dark-trash-1280.png`
- `server-dark-add-concept-1440.png`
- `server-dark-catalog-1440.png`
- `server-dark-contract-contract-1440.png`
- `server-dark-contract-graph-1440.png`
- `server-dark-import-1440.png`
- `server-dark-item-editor-1440.png`
- `server-dark-ontology-catalog-1440.png`
- `server-dark-ontology-graph-1440.png`
- `server-dark-ontology-mappings-1440.png`
- `server-dark-ontology-metrics-1440.png`
- `server-dark-ontology-neighborhood-1440.png`
- `server-dark-ontology-overview-1440.png`
- `server-dark-ontology-source-1440.png`
- `server-dark-sidebar-projects-1440.png`
- `server-dark-source-control-1440.png`
- `server-dark-source-editor-1440.png`
- `server-dark-trash-1440.png`
- `server-dark-add-concept-2560.png`
- `server-dark-catalog-2560.png`
- `server-dark-contract-contract-2560.png`
- `server-dark-contract-graph-2560.png`
- `server-dark-import-2560.png`
- `server-dark-item-editor-2560.png`
- `server-dark-ontology-catalog-2560.png`
- `server-dark-ontology-graph-2560.png`
- `server-dark-ontology-mappings-2560.png`
- `server-dark-ontology-metrics-2560.png`
- `server-dark-ontology-neighborhood-2560.png`
- `server-dark-ontology-overview-2560.png`
- `server-dark-ontology-source-2560.png`
- `server-dark-sidebar-projects-2560.png`
- `server-dark-source-control-2560.png`
- `server-dark-source-editor-2560.png`
- `server-dark-trash-2560.png`

Reviewed: **68/68 screenshots**. Clean screenshots: **55**.

This report covers only the assigned server-dark images. Closed menus, hover tooltips,
fullscreen states and other modes are outside this screenshot partition.
