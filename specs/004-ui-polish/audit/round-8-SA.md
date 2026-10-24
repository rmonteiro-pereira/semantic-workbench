# Round 8 — server light, partition SA

Captured head: `6363a0e16699c6a891728de2d69acc4e4c78e4e9`.

Fresh independent inspection of all 68 assigned screenshots individually at native resolution: 17 screens at
390, 1280, 1440 and 2560 pixels. Every assigned image shows its intended view.
The phone Projects screenshot shows the project drawer; its desktop counterparts show the
workspace with the project list open.

The completed `/tmp/polish-round8/server/capture.log` contains 216 measurements,
all with `problems=0`, and no skips. `/tmp/polish-round8/progress.log` records
`PASS server 2026-10-24T06:49:37Z`.

**Counts: 0 S1, 0 S2, 1 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R8-SA-1 | S3 | 1280: `server-catalog-1280.png`, `server-contract-contract-1280.png`, `server-contract-graph-1280.png`, `server-ontology-catalog-1280.png`, `server-ontology-graph-1280.png`, `server-ontology-mappings-1280.png`, `server-ontology-metrics-1280.png`, `server-ontology-neighborhood-1280.png`, `server-ontology-overview-1280.png`, `server-ontology-source-1280.png`, `server-sidebar-projects-1280.png`, `server-source-control-1280.png`, `server-source-editor-1280.png` | The project file list ends through a row near y=502, immediately above its lower divider. A fragment of the next file name remains visible; the rest of that row is below the list viewport. Lower sidebar actions remain clear and readable. This small abrupt fragment makes the initial sidebar look unfinished. | Add a subtle scroll-edge affordance, or end the initial visible list at a complete row while retaining independent scrolling. |

The initial graph views use readable counted area cards at the narrower sizes and named
entity cards at the wider sizes. These are intentional first views, with an instruction
for opening areas. Visible graph routes avoid card text. Neighborhood cards, contract graph
fields, modal footers and editor actions remain readable within their containers. Phone
headers and tabs wrap without visible page overflow. The inspected dialogs are opaque. The React Flow attribution is visibly readable in each graph.
Empty states explain the available next step. Ordinary vertically scrolling content below
the main viewport is not counted as a defect.

## Screens with no defects

- `server-add-concept-390.png`
- `server-catalog-390.png`
- `server-contract-contract-390.png`
- `server-contract-graph-390.png`
- `server-import-390.png`
- `server-item-editor-390.png`
- `server-ontology-catalog-390.png`
- `server-ontology-graph-390.png`
- `server-ontology-mappings-390.png`
- `server-ontology-metrics-390.png`
- `server-ontology-neighborhood-390.png`
- `server-ontology-overview-390.png`
- `server-ontology-source-390.png`
- `server-sidebar-projects-390.png`
- `server-source-control-390.png`
- `server-source-editor-390.png`
- `server-trash-390.png`
- `server-add-concept-1280.png`
- `server-import-1280.png`
- `server-item-editor-1280.png`
- `server-trash-1280.png`
- `server-add-concept-1440.png`
- `server-catalog-1440.png`
- `server-contract-contract-1440.png`
- `server-contract-graph-1440.png`
- `server-import-1440.png`
- `server-item-editor-1440.png`
- `server-ontology-catalog-1440.png`
- `server-ontology-graph-1440.png`
- `server-ontology-mappings-1440.png`
- `server-ontology-metrics-1440.png`
- `server-ontology-neighborhood-1440.png`
- `server-ontology-overview-1440.png`
- `server-ontology-source-1440.png`
- `server-sidebar-projects-1440.png`
- `server-source-control-1440.png`
- `server-source-editor-1440.png`
- `server-trash-1440.png`
- `server-add-concept-2560.png`
- `server-catalog-2560.png`
- `server-contract-contract-2560.png`
- `server-contract-graph-2560.png`
- `server-import-2560.png`
- `server-item-editor-2560.png`
- `server-ontology-catalog-2560.png`
- `server-ontology-graph-2560.png`
- `server-ontology-mappings-2560.png`
- `server-ontology-metrics-2560.png`
- `server-ontology-neighborhood-2560.png`
- `server-ontology-overview-2560.png`
- `server-ontology-source-2560.png`
- `server-sidebar-projects-2560.png`
- `server-source-control-2560.png`
- `server-source-editor-2560.png`
- `server-trash-2560.png`

Reviewed: **68/68 screenshots**. Clean screenshots: **55**.

This report covers only the assigned server-light images. Closed menus, hover tooltips,
fullscreen states and other modes are outside this screenshot partition.
