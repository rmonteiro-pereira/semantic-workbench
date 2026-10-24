# Round 16 — server dark — SD

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Capture PASS: 2026-10-24 19:33:00 UTC, recorded in
`/tmp/polish-round16/progress.log`.
Capture log: `/tmp/polish-round16/server-dark/capture.log`:
216 measurements, zero reported geometry problems, zero skips.

Independently inspected every assigned fresh original using original image detail,
without sampling or substituting a previous round verdict. Reviewed 68/68 images:
17 screens at 390, 1280, 1440 and 2560 px. All images show the intended view and dark theme.

Counts: **S1: 0; S2: 0; S3: 1**. No S1 or S2 found in this partition.
55 screenshots have no observed defects; 13 share the minor row below.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-SD-1 | S3 | `server-dark-catalog-1280.png`, `server-dark-contract-contract-1280.png`, `server-dark-contract-graph-1280.png`, `server-dark-ontology-catalog-1280.png`, `server-dark-ontology-graph-1280.png`, `server-dark-ontology-mappings-1280.png`, `server-dark-ontology-metrics-1280.png`, `server-dark-ontology-neighborhood-1280.png`, `server-dark-ontology-overview-1280.png`, `server-dark-ontology-source-1280.png`, `server-dark-sidebar-projects-1280.png`, `server-dark-source-control-1280.png`, `server-dark-source-editor-1280.png` | At 1280 px, the project list ends around y=502 with part of the next file row visible immediately above the Clear workspace/Trash divider. In reference-model views this cuts the finance filename; in contract views it leaves the sales.mapping.yaml filename without its subtitle. This is a minor scroll-boundary presentation issue; the main content and sidebar actions remain clear. | End the initial list viewport on a whole row, or add a clearer scroll-edge treatment. |

The phone navigation drawer is opaque and its file rows and bottom controls fit.
The model Graph shows three readable counted area cards at 390 and 1280 px, with
an explicit explanation that areas open on selection; at 1440 and 2560 px the
seven entity names and routed connections are clear. Neighborhood shows Customer,
Order and Identifier without collisions. Contract Graph has a fully visible orders
card and clear legend. Dialogs and the item editor are opaque with visible actions.
Mappings shows one resolved binding and a readable chain, wrapping within the
content at 1280 px. Metrics explains the empty project and presents New metric.
Source-control branch information fits on its own row. Source editors retain their
normal code viewport; no page-level sideways scrollbar is visible. No leftover
light patches, edge-through-text, overlapping controls or visibly undersized text
were observed in these assigned images. These conclusions cover this partition only.

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

Reviewed: **68/68** exact assigned screenshots. The 13 filenames in the finding table
and 55 clean filenames above account for every manifest entry once.
