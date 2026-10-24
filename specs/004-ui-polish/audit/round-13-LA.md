# Round 13 — local light, partition LA

Captured head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Fresh independent review of all 68 assigned originals individually at native resolution,
covering 17 screens at 390, 1280, 1440 and 2560 pixels. Every image matches its intended
view. Phone Projects shows the opaque drawer; desktop Projects shows the selected UBL
contract graph beside its project file list.

The completed `/tmp/polish-round13/local/capture.log` contains 216 measurements with
`problems=0`, no skips. `/tmp/polish-round13/progress.log` records
`PASS local 2026-10-24T13:35:44Z`.

**Counts: 0 S1, 0 S2, 2 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-LA-1 | S3 | `local-catalog-1440.png`, `local-contract-contract-1440.png`, `local-contract-graph-1440.png`, `local-ontology-catalog-1440.png`, `local-ontology-graph-1440.png`, `local-ontology-mappings-1440.png`, `local-ontology-metrics-1440.png`, `local-ontology-neighborhood-1440.png`, `local-ontology-overview-1440.png`, `local-ontology-source-1440.png`, `local-sidebar-projects-1440.png`, `local-source-control-1440.png`, `local-source-editor-1440.png`, `local-catalog-2560.png`, `local-contract-contract-2560.png`, `local-contract-graph-2560.png`, `local-ontology-catalog-2560.png`, `local-ontology-graph-2560.png`, `local-ontology-mappings-2560.png`, `local-ontology-metrics-2560.png`, `local-ontology-neighborhood-2560.png`, `local-ontology-overview-2560.png`, `local-ontology-source-2560.png`, `local-sidebar-projects-2560.png`, `local-source-control-2560.png`, `local-source-editor-2560.png` | At 1440 the sidebar list ends near y=675 through the next file/type row; at 2560 it ends through a mapped-commerce filename near y=1216. This leaves a small text fragment above the lower sidebar controls. The controls themselves remain clear. | Add a subtle scroll-edge affordance or finish the initially visible list at a complete row while retaining scrolling. |
| R13-LA-2 | S3 | `local-ontology-neighborhood-1440.png` | The lower-left DocumentReference card breaks its name into “DocumentReferen” and “ce”. The text is readable and avoids the controls, but the two-letter orphan is awkward. | Prefer a wider name slot or consistent ellipsis with the existing full-name disclosure. |

The larger UBL model uses eight readable counted area cards and an explicit opening instruction.
Its visible routes avoid heading and card text. Neighborhood first views keep node names and
controls readable with clear visible/hidden counts; intentional ellipses are distinct from clipping.
Commerce graph fields, relationship labels and the wide semantic/metric cards are readable.
Mapping empty-state guidance names the file and offers Open Source; phone content continues
within its scrolling pane. Source editor overflow stays within the editor. Dialogs have opaque
surfaces and readable footer actions. No page-level sideways overflow is visible.

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

Reviewed: **68/68 screenshots**. Clean screenshots: **42**.

This report covers only the assigned local-light images; hover, fullscreen and other modes
are outside this partition.
