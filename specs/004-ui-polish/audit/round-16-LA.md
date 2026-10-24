# Round 16 — local light — LA

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Capture PASS: 2026-10-24 19:39:06 UTC, recorded in
`/tmp/polish-round16/progress.log`.
Capture log: `/tmp/polish-round16/local/capture.log`:
216 measurements, zero geometry problems, zero skips.

Reviewed **68/68** fresh originals individually using original image detail:
17 screens at 390, 1280, 1440 and 2560 px. No sampling or prior verdict substitution.
Every assigned image shows its intended local view and light theme.

Counts: **S1: 0; S2: 0; S3: 2**. No S1 or S2 found in this partition.
42 screenshots have no observed defects; 26 share the sidebar row below.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-LA-1 | S3 | `local-catalog-1440.png`, `local-contract-contract-1440.png`, `local-contract-graph-1440.png`, `local-ontology-catalog-1440.png`, `local-ontology-graph-1440.png`, `local-ontology-mappings-1440.png`, `local-ontology-metrics-1440.png`, `local-ontology-neighborhood-1440.png`, `local-ontology-overview-1440.png`, `local-ontology-source-1440.png`, `local-sidebar-projects-1440.png`, `local-source-control-1440.png`, `local-source-editor-1440.png`, `local-catalog-2560.png`, `local-contract-contract-2560.png`, `local-contract-graph-2560.png`, `local-ontology-catalog-2560.png`, `local-ontology-graph-2560.png`, `local-ontology-mappings-2560.png`, `local-ontology-metrics-2560.png`, `local-ontology-neighborhood-2560.png`, `local-ontology-overview-2560.png`, `local-ontology-source-2560.png`, `local-sidebar-projects-2560.png`, `local-source-control-2560.png`, `local-source-editor-2560.png` | The sidebar scroll boundary leaves a partial next row immediately above its fixed actions. At 1440 px, the list ends near y=675, cutting the first Commerce filename in UBL views or the SHACL subtitle in Commerce views. At 2560 px, it cuts the next mapped-commerce filename near y=1215. Main content and actions remain clear. | Align the initial scroll boundary with complete rows or use a clearer scroll-edge treatment. |
| R16-LA-2 | S3 | `local-ontology-neighborhood-1440.png` | The bottom-left DocumentReference card wraps its name as “DocumentReferen” followed by “ce”, leaving a two-letter orphan above its actions. The complete name remains visible and there is no collision. | Allow a slightly wider name area or break the name at its domain-word boundary. |

Model Graph has eight readable counted area cards, explains how to open an area,
and keeps routes clear of headings and counts at all sizes. Neighborhood shows its
visible and hidden neighbor counts, keeps controls separate, and has no overlapping
cards. Narrow truncated graph names use ellipses; the 1440 px wrap noted above is
minor. The wide Commerce Graph shows tables, semantic dataset and two metrics with
clear routed links. The phone contract graph explicitly reports its reduced first
view and offers Show all. The UBL sidebar-projects captures show the intended UBL
contract Graph, including the readable column and table summaries.

Catalog and metric lists use their normal vertical content viewports. Source editors
have readable syntax colors and contained code viewports. The empty mapping state
explains that bindings are absent and offers Open Source on desktop. Phone mappings
shows the project scope and concept summary within its vertical content viewport.
Dialogs and navigation drawer are opaque, with clear labels and visible footer
actions. No page-level sideways scrollbar or visibly undersized text was observed.
This report covers only the assigned partition.

## Screens with no defects

- `local-add-concept-390.png`
- `local-catalog-390.png`
- `local-contract-contract-390.png`
- `local-contract-graph-390.png`
- `local-import-390.png`
- `local-item-editor-390.png`
- `local-ontology-catalog-390.png`
- `local-ontology-graph-390.png`
- `local-ontology-mappings-390.png`
- `local-ontology-metrics-390.png`
- `local-ontology-neighborhood-390.png`
- `local-ontology-overview-390.png`
- `local-ontology-source-390.png`
- `local-sidebar-projects-390.png`
- `local-source-control-390.png`
- `local-source-editor-390.png`
- `local-trash-390.png`
- `local-add-concept-1280.png`
- `local-catalog-1280.png`
- `local-contract-contract-1280.png`
- `local-contract-graph-1280.png`
- `local-import-1280.png`
- `local-item-editor-1280.png`
- `local-ontology-catalog-1280.png`
- `local-ontology-graph-1280.png`
- `local-ontology-mappings-1280.png`
- `local-ontology-metrics-1280.png`
- `local-ontology-neighborhood-1280.png`
- `local-ontology-overview-1280.png`
- `local-ontology-source-1280.png`
- `local-sidebar-projects-1280.png`
- `local-source-control-1280.png`
- `local-source-editor-1280.png`
- `local-trash-1280.png`
- `local-add-concept-1440.png`
- `local-import-1440.png`
- `local-item-editor-1440.png`
- `local-trash-1440.png`
- `local-add-concept-2560.png`
- `local-import-2560.png`
- `local-item-editor-2560.png`
- `local-trash-2560.png`

Reviewed: **68/68**. The 26 exact filenames in the sidebar finding and 42 clean
filenames account for all assigned images. The Neighborhood finding overlaps one
sidebar-affected image.
