# Round 16 local dark: partition LD

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Local-dark capture PASS: 2026-10-24 19:45:13 UTC.
Capture log: `/tmp/polish-round16/local-dark/capture.log`: 216 measurements,
zero reported geometry problems and zero skipped states.
Manifest: `/tmp/polish-round16-review-LD.txt`.

Independently inspected all 68 fresh originals individually at original detail across
390, 1280, 1440 and 2560 pixels. Every assigned image shows the intended view and dark
appearance. This report covers this partition only.

S1: **0**. S2: **0**. S3: **2**. No S1 or S2 observed.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-LD-1 | S3 | `local-dark-catalog-1440.png`, `local-dark-contract-contract-1440.png`, `local-dark-contract-graph-1440.png`, `local-dark-ontology-catalog-1440.png`, `local-dark-ontology-graph-1440.png`, `local-dark-ontology-mappings-1440.png`, `local-dark-ontology-metrics-1440.png`, `local-dark-ontology-neighborhood-1440.png`, `local-dark-ontology-overview-1440.png`, `local-dark-ontology-source-1440.png`, `local-dark-sidebar-projects-1440.png`, `local-dark-source-control-1440.png`, `local-dark-source-editor-1440.png`, `local-dark-catalog-2560.png`, `local-dark-contract-contract-2560.png`, `local-dark-contract-graph-2560.png`, `local-dark-ontology-catalog-2560.png`, `local-dark-ontology-graph-2560.png`, `local-dark-ontology-mappings-2560.png`, `local-dark-ontology-metrics-2560.png`, `local-dark-ontology-neighborhood-2560.png`, `local-dark-ontology-overview-2560.png`, `local-dark-ontology-source-2560.png`, `local-dark-sidebar-projects-2560.png`, `local-dark-source-control-2560.png`, `local-dark-source-editor-2560.png` | The project file-list viewport ends through a row above the fixed sidebar actions. At 1440 the boundary near y675 cuts a Commerce filename or SHACL subtitle; at 2560 the boundary near y1215 cuts the next mapped-commerce filename. The main content remains clear. | Align the last visible row with the list boundary or give the scrolling list a clearer end treatment. |
| R16-LD-2 | S3 | `local-dark-ontology-neighborhood-1440.png` | The bottom-left DocumentReference card wraps its name as “DocumentReferen” followed by “ce”, leaving a two-letter orphan. The complete name remains visible and does not collide with its actions. | Widen the name area or use a consistent compact name treatment to avoid the orphan. |

The graph area summaries explain their counted first views, with clear headings and
separated routes. Neighborhood cards and controls fit the assigned canvases; the
2560 DocumentReference name fits on one line. Metrics rows, source-control guidance,
source editor, mappings explanation and opaque dialogs remain readable. No unintended
horizontal page overflow, edge-through-text collision or leftover light panel was observed.
Normal vertical content scrolling and editor viewport boundaries are intentional.

## Screens with no defects

- `local-dark-add-concept-390.png`
- `local-dark-catalog-390.png`
- `local-dark-contract-contract-390.png`
- `local-dark-contract-graph-390.png`
- `local-dark-import-390.png`
- `local-dark-item-editor-390.png`
- `local-dark-ontology-catalog-390.png`
- `local-dark-ontology-graph-390.png`
- `local-dark-ontology-mappings-390.png`
- `local-dark-ontology-metrics-390.png`
- `local-dark-ontology-neighborhood-390.png`
- `local-dark-ontology-overview-390.png`
- `local-dark-ontology-source-390.png`
- `local-dark-sidebar-projects-390.png`
- `local-dark-source-control-390.png`
- `local-dark-source-editor-390.png`
- `local-dark-trash-390.png`
- `local-dark-add-concept-1280.png`
- `local-dark-catalog-1280.png`
- `local-dark-contract-contract-1280.png`
- `local-dark-contract-graph-1280.png`
- `local-dark-import-1280.png`
- `local-dark-item-editor-1280.png`
- `local-dark-ontology-catalog-1280.png`
- `local-dark-ontology-graph-1280.png`
- `local-dark-ontology-mappings-1280.png`
- `local-dark-ontology-metrics-1280.png`
- `local-dark-ontology-neighborhood-1280.png`
- `local-dark-ontology-overview-1280.png`
- `local-dark-ontology-source-1280.png`
- `local-dark-sidebar-projects-1280.png`
- `local-dark-source-control-1280.png`
- `local-dark-source-editor-1280.png`
- `local-dark-trash-1280.png`
- `local-dark-add-concept-1440.png`
- `local-dark-import-1440.png`
- `local-dark-item-editor-1440.png`
- `local-dark-trash-1440.png`
- `local-dark-add-concept-2560.png`
- `local-dark-import-2560.png`
- `local-dark-item-editor-2560.png`
- `local-dark-trash-2560.png`

Reviewed **68/68** screenshots. The 26 filenames in the first row and 42 clean
filenames above account for every assigned image; the second row overlaps that set.
