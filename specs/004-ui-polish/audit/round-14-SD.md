# Round 14 — server dark, partition SD

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Server-dark capture passed at 2026-10-24 17:30:08 UTC. The capture log records
216 measurements, zero measured problems and zero skipped captures.

Reviewed **68/68** fresh assigned originals individually at native/original detail:
17 screens at 390, 1280, 1440 and 2560 pixels. This report covers only SD.
Every intended view matches its filename. All images are genuinely dark, with decoded
branding, readable foreground text and opaque dialogs/drawers. No leftover light patches
were observed.

Severity counts: **S1: 0; S2: 0; S3: 1**. No S1 or S2 defects were observed.
There are 55 clean screenshots and 13 affected by the single minor row below.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-SD-1 | S3 | `server-dark-catalog-1280.png`, `server-dark-contract-contract-1280.png`, `server-dark-contract-graph-1280.png`, `server-dark-ontology-catalog-1280.png`, `server-dark-ontology-graph-1280.png`, `server-dark-ontology-mappings-1280.png`, `server-dark-ontology-metrics-1280.png`, `server-dark-ontology-neighborhood-1280.png`, `server-dark-ontology-overview-1280.png`, `server-dark-ontology-source-1280.png`, `server-dark-sidebar-projects-1280.png`, `server-dark-source-control-1280.png`, `server-dark-source-editor-1280.png` | At 1280 px, the initial sidebar file-list boundary around y=502 leaves a partial row. Model views cut through the finance/revenue-recognition filename; contract views show sales.mapping above its hidden type subtitle. Controls below remain clear, and the content is within the scrollable list. | Add a subtle scroll-edge affordance or align the initial list boundary with a complete row. |

The phone dialogs fit with readable footer actions. Catalog cards follow a consistent grid
and normal content scroll. Contract graphs show the complete centered orders card at every
width. Counted model areas at narrower widths explain how to open their contents; expanded
wide model cards and Neighborhood cards have readable names and clear routes that avoid
text. The mapping chain is legible, metrics and source-control empty states explain the
next step, and editor long lines remain contained in the editor. No sideways page overflow,
control collisions or see-through foreground panels were observed.

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
