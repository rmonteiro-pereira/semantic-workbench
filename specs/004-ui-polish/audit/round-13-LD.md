# Round 13 — local dark, partition LD

Captured head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Fresh independent review of all 68 assigned originals individually at native resolution,
covering 17 screens at 390, 1280, 1440 and 2560 pixels. Every image matches its intended
view. All 68 images use dark surfaces consistently; no leftover light patches or
see-through foreground dialogs were observed. Phone Projects shows the opaque drawer; desktop Projects shows the selected UBL
contract graph beside its project file list.

The completed `/tmp/polish-round13/local-dark/capture.log` contains 216 measurements with
`problems=0`, no skips. `/tmp/polish-round13/progress.log` records
`PASS local-dark 2026-10-24T13:41:48Z`.

**Counts: 0 S1, 0 S2, 2 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-LD-1 | S3 | `local-dark-catalog-1440.png`, `local-dark-contract-contract-1440.png`, `local-dark-contract-graph-1440.png`, `local-dark-ontology-catalog-1440.png`, `local-dark-ontology-graph-1440.png`, `local-dark-ontology-mappings-1440.png`, `local-dark-ontology-metrics-1440.png`, `local-dark-ontology-neighborhood-1440.png`, `local-dark-ontology-overview-1440.png`, `local-dark-ontology-source-1440.png`, `local-dark-sidebar-projects-1440.png`, `local-dark-source-control-1440.png`, `local-dark-source-editor-1440.png`, `local-dark-catalog-2560.png`, `local-dark-contract-contract-2560.png`, `local-dark-contract-graph-2560.png`, `local-dark-ontology-catalog-2560.png`, `local-dark-ontology-graph-2560.png`, `local-dark-ontology-mappings-2560.png`, `local-dark-ontology-metrics-2560.png`, `local-dark-ontology-neighborhood-2560.png`, `local-dark-ontology-overview-2560.png`, `local-dark-ontology-source-2560.png`, `local-dark-sidebar-projects-2560.png`, `local-dark-source-control-2560.png`, `local-dark-source-editor-2560.png` | At 1440 the sidebar list ends near y=675 through the next file/type row; at 2560 it ends through a mapped-commerce filename near y=1216. This leaves a small text fragment above the lower sidebar controls. The controls themselves remain clear. | Add a subtle scroll-edge affordance or finish the initially visible list at a complete row while retaining scrolling. |
| R13-LD-2 | S3 | `local-dark-ontology-neighborhood-1440.png` | The lower-left DocumentReference card breaks its name into “DocumentReferen” and “ce”. The text is readable and avoids the controls, but the two-letter orphan is awkward. | Prefer a wider name slot or consistent ellipsis with the existing full-name disclosure. |

The larger UBL model uses eight readable counted area cards and an explicit opening instruction.
Its visible routes avoid heading and card text. Neighborhood first views keep node names and
controls readable with clear visible/hidden counts; intentional ellipses are distinct from clipping.
Commerce graph fields, relationship labels and the wide semantic/metric cards are readable.
Mapping empty-state guidance names the file and offers Open Source; phone content continues
within its scrolling pane. Source editor overflow stays within the editor. Dialogs have opaque
surfaces and readable footer actions. No page-level sideways overflow is visible.

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

Reviewed: **68/68 screenshots**. Clean screenshots: **42**.

This report covers only the assigned local-dark images; hover, fullscreen and other modes
are outside this partition.
