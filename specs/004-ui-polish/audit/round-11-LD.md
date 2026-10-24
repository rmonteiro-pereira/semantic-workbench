# Round 11 — local dark, partition LD

Captured head: `f648e4aaaa07a4ce82c340cafa84baefad71328a`.

Fresh independent inspection of all 68 assigned screenshots individually at native resolution:
17 screens at 390, 1280, 1440 and 2560 pixels. Every image shows its intended view.
The phone Projects screenshot shows the project drawer; desktop counterparts show the UBL
contract graph with the project list open. Model views show the larger local UBL ontology;
contract views show the Commerce contract.

The completed `/tmp/polish-round11/local-dark/capture.log` contains 216 measurements,
all with `problems=0`, and no skips. `/tmp/polish-round11/progress.log` records
`PASS local-dark 2026-10-24T09:15:48Z`.

**Counts: 0 S1, 0 S2, 2 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-LD-1 | S3 | 1440: `local-dark-catalog-1440.png`, `local-dark-contract-contract-1440.png`, `local-dark-contract-graph-1440.png`, `local-dark-ontology-catalog-1440.png`, `local-dark-ontology-graph-1440.png`, `local-dark-ontology-mappings-1440.png`, `local-dark-ontology-metrics-1440.png`, `local-dark-ontology-neighborhood-1440.png`, `local-dark-ontology-overview-1440.png`, `local-dark-ontology-source-1440.png`, `local-dark-sidebar-projects-1440.png`, `local-dark-source-control-1440.png`, `local-dark-source-editor-1440.png`; 2560: `local-dark-catalog-2560.png`, `local-dark-contract-contract-2560.png`, `local-dark-contract-graph-2560.png`, `local-dark-ontology-catalog-2560.png`, `local-dark-ontology-graph-2560.png`, `local-dark-ontology-mappings-2560.png`, `local-dark-ontology-metrics-2560.png`, `local-dark-ontology-neighborhood-2560.png`, `local-dark-ontology-overview-2560.png`, `local-dark-ontology-source-2560.png`, `local-dark-sidebar-projects-2560.png`, `local-dark-source-control-2560.png`, `local-dark-source-editor-2560.png` | The independently scrolling project list ends through a file row above the fixed actions. At 1440, the lower edge near y=675 exposes a fragment of the next Commerce filename in UBL views, or part of the SHACL type line in Commerce views. At 2560, the edge near y=1215 exposes a fragment of the next commerce.mapped filename. The lower actions remain readable. This small initial scroll-edge fragment looks unfinished. | Add a subtle scroll-edge affordance, or end the initial visible list at a complete row while retaining independent scrolling. |
| R11-LD-2 | S3 | `local-dark-ontology-neighborhood-1440.png` | The lower left DocumentReference card wraps its name as “DocumentReferen” then “ce”, near x=615, y=756–772. The name is complete and readable, but the stranded two-letter line makes the label awkward to scan. | Use word-aware display wrapping, or reserve enough label width to avoid the two-letter final line while preserving readable type. |

The counted ontology area cards explain how to open areas and keep their names and counts
readable at every assigned size. Neighborhood controls are distinct and its routes avoid
card text. Contract graph first views explicitly state how many tables are shown; collapsed
fields and additional tables are counted. These deliberate initial views are not defects.
The mapping empty state explains the absence of bindings and gives a source-editing next step.
All 68 assigned states are genuinely dark, with no leftover light panels.
The React Flow attribution is visibly readable. Visible dialogs are opaque, their actions fit, and editor overflow stays inside the editor.
No page-wide sideways scrollbar, serious overlap, unreadable default graph view, or confusing
empty state was observed. Screenshots do not establish hidden tooltip or interaction behavior.

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

Reviewed: **68/68 screenshots**. Screens with no defects: **42**.
This report covers only the assigned local-dark partition.
