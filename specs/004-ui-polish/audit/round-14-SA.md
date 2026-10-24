# Round 14 — server light, partition SA

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Server capture passed at 2026-10-24 17:24:53 UTC. Its capture log records 216
measurements, zero measured problems and zero skipped captures.

Reviewed **68/68** assigned fresh original PNGs individually at native/original detail,
covering 17 screens at 390, 1280, 1440 and 2560 pixels. This report covers only the
SA manifest, not the entire capture round. Intended views match their filenames;
all images show the expected light theme and decoded branding.

Severity counts: **S1: 0; S2: 0; S3: 1**. There are 55 clean screenshots and 13
screenshots affected by the single minor row below.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-SA-1 | S3 | `server-catalog-1280.png`, `server-contract-contract-1280.png`, `server-contract-graph-1280.png`, `server-ontology-catalog-1280.png`, `server-ontology-graph-1280.png`, `server-ontology-mappings-1280.png`, `server-ontology-metrics-1280.png`, `server-ontology-neighborhood-1280.png`, `server-ontology-overview-1280.png`, `server-ontology-source-1280.png`, `server-sidebar-projects-1280.png`, `server-source-control-1280.png`, `server-source-editor-1280.png` | At 1280 px, the initial sidebar file-list viewport ends around y=502 through a row. Model views cut the finance/revenue-recognition filename; contract views leave the sales.mapping filename separated from its partially hidden type subtitle. The list remains scrollable and the controls below it are clear. | Add a subtle scroll-edge affordance or align the initial list boundary with a complete row. |

## Clean screenshots

No observed overlap, obstructed controls, serious clipping, unreadable text, low-contrast
labels, transparent menus or sideways page overflow in these screenshots. Normal content
scrolling and the explicitly explained counted graph area cards are intentional views.
Phone dialogs fit with readable actions. Contract graph cards are centered and fully
visible. Model and Neighborhood cards remain readable, and routes avoid their text.
Mappings show the actual mapping chain; metric and source-control empty states explain
the next action. Editor long lines stay within the editor scroll region.

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
