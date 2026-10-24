# Round 14 — local dark, partition LD

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Local-dark capture passed at 2026-10-24 17:42:25 UTC: 216 measurements, zero measured
problems and zero skipped captures.

Reviewed **68/68** fresh originals individually at native/original detail, covering
17 screens at 390, 1280, 1440 and 2560 pixels. All intended views match their filenames,
including the UBL contract graph for sidebar-projects. Branding is decoded and the dark
theme is consistent, including opaque dialogs without leftover light patches. This report covers only the LD manifest.

Severity counts: **S1: 0; S2: 0; S3: 2**. No S1 or S2 defects were observed.
42 screenshots are clean; 26 have the minor sidebar issue, including the screenshot
also affected by the second row.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-LD-1 | S3 | `local-dark-catalog-1440.png`, `local-dark-contract-contract-1440.png`, `local-dark-contract-graph-1440.png`, `local-dark-ontology-catalog-1440.png`, `local-dark-ontology-graph-1440.png`, `local-dark-ontology-mappings-1440.png`, `local-dark-ontology-metrics-1440.png`, `local-dark-ontology-neighborhood-1440.png`, `local-dark-ontology-overview-1440.png`, `local-dark-ontology-source-1440.png`, `local-dark-sidebar-projects-1440.png`, `local-dark-source-control-1440.png`, `local-dark-source-editor-1440.png`, `local-dark-catalog-2560.png`, `local-dark-contract-contract-2560.png`, `local-dark-contract-graph-2560.png`, `local-dark-ontology-catalog-2560.png`, `local-dark-ontology-graph-2560.png`, `local-dark-ontology-mappings-2560.png`, `local-dark-ontology-metrics-2560.png`, `local-dark-ontology-neighborhood-2560.png`, `local-dark-ontology-overview-2560.png`, `local-dark-ontology-source-2560.png`, `local-dark-sidebar-projects-2560.png`, `local-dark-source-control-2560.png`, `local-dark-source-editor-2560.png` | At 1440 px, the sidebar list boundary around y=675 leaves a fragment of the next Commerce filename or cuts the commerce.shacl type subtitle. At 2560 px, the bottom boundary around y=1215 cuts the next Mapped commerce filename. The separate controls below remain clear. | Add a subtle scroll-edge affordance or align the initial list boundary with a complete row. |
| R14-LD-2 | S3 | `local-dark-ontology-neighborhood-1440.png` | The bottom DocumentReference neighbor wraps as “DocumentReferen” followed by “ce”, leaving a two-letter orphan above its actions. The full name is visible and no controls overlap. | Give the name slightly more width or wrap the display name at a word boundary. |

The counted eight-area model first view explains how to open areas, and routes avoid
headings and count text. Neighborhood cards and controls fit; narrower views visibly
state how many neighbors are hidden. The Commerce contract graph shows legible cards,
foreign-key labels and the connected semantic/metric chain in its wide view. Mapping
empty-state wording names the mapping file and provides an Open Source action. Phone
forms and opaque dialogs fit with clear footer actions. Editor long lines stay inside
the editor; no sideways page overflow was observed. Normal vertical content scrolling
is not counted as a defect.

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
