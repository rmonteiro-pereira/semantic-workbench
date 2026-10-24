# Round 5 — server, light — reviewer A

Reviewed all 80 assigned frozen screenshots from `/tmp/polish-round5/server/`.
Application source: `253165e`. The capture log reports 164 measurements with zero problems and no
skips. All 20 intended screens match their filenames at all four viewport widths: 390, 1280, 1440
and 2560 pixels. This review covers the assigned first 20 screens, not the entire capture matrix.

**Counts: S1: 0; S2: 0; S3: 2. No S1 or S2 defects found.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R5-SA-1 | S3 | `server-file-move-390.png`, `server-file-move-1280.png`, `server-file-move-1440.png`, `server-file-move-2560.png` | The destination field says “Path in that project”. Its existing filename suggests a file path, but the wording does not explicitly distinguish a destination folder from a complete destination filename. | Say “Destination file path” and add a short hint that includes the filename. |
| R5-SA-2 | S3 | `server-catalog-1280.png`, `server-mappings-1280.png`, `server-metric-detail-1280.png`, `server-metrics-list-1280.png` | At the bottom of the project list, around y=502, the fixed footer boundary slices through the first finance/revenue file row. Only the upper portion of its first filename line remains visible. This is a minor scroll-boundary presentation issue; the main content remains intact. | Make the list boundary finish before the next row or provide a clear scroll-boundary cue without fading text. |

The branch selector now shows “main” independently of the fully visible published-state sentence
beneath it. The mapping summary uses two columns on the phone and its shorter introduction leaves
room for the concept filter and concept choices. “1 dataset” and “1 resolved binding” are singular.
The Import dialog now consistently says “definition”. The metric wizard distinguishes its filled
current step from plain pending steps, and its phone layout shows the current step once in the
selector. Dialog surfaces are opaque, with readable text and fully visible action buttons.

Normal vertical scrolling in long catalogs, mapping evidence and dataset histories is not treated as
unreachable content. No sideways scrollbar, overlapping controls, clipped dialog actions or unreadable
graph card labels were observed. Screenshots cannot establish hover tooltip behavior or precise
computed font sizes; no unsupported interaction or numeric font-size claim is made here.

## Screens with no defects

- add-concept
- clone-folder
- clone-folder-refused
- clone-repository
- contract-contract
- contract-graph
- import
- item-editor
- metric-wizard
- metrics-filters
- odcs-contract-search
- odcs-contract-section
- odcs-dataset-history
- odcs-dataset-properties
- odcs-dataset-quality

Screenshots reviewed: **80 of 80 assigned**.
