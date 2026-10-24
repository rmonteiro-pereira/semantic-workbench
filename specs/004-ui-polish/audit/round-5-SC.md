# Round 5 — server, dark — reviewer C

Reviewed all 80 assigned frozen screenshots from `/tmp/polish-round5/server-dark/`.
Application source: `253165e`. The capture log reports 164 measurements with zero problems and no
skips. All 20 intended screens match their filenames at all four viewport widths: 390, 1280, 1440
and 2560 pixels. This review covers the assigned first 20 screens, not the entire capture matrix.

**Counts: S1: 0; S2: 0; S3: 2. No S1 or S2 defects found.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R5-SC-1 | S3 | `server-dark-file-move-390.png`, `server-dark-file-move-1280.png`, `server-dark-file-move-1440.png`, `server-dark-file-move-2560.png` | The destination field says “Path in that project”. Its existing filename suggests a file path, but the wording does not explicitly distinguish a destination folder from a complete destination filename. | Say “Destination file path” and add a short hint that includes the filename. |
| R5-SC-2 | S3 | `server-dark-catalog-1280.png`, `server-dark-mappings-1280.png`, `server-dark-metric-detail-1280.png`, `server-dark-metrics-list-1280.png` | At the bottom of the project list, around y=502, the fixed footer boundary slices through the first finance/revenue file row. Only the upper portion of its first filename line remains visible. This is a minor scroll-boundary presentation issue; the main content remains intact. | Make the list boundary finish before the next row or provide a clear scroll-boundary cue without fading text. |

All assigned views match their intended filename, including the Contract tab, table graph,
search result, Team and roles dialog, dataset tabs, metric detail and creation wizard. The dark
palette consistently covers the page shell, dialogs, drawer, graph canvas, cards, inputs, code
surfaces and table headers. No leftover white panel or light-theme patch was observed. Dialogs and
the edit drawer have opaque surfaces: background text and graph lines do not show through them.
Main text, hints, status badges, error text and graph card labels remain readable. The metric wizard
clearly distinguishes its current step from pending steps. Disabled actions remain identifiable.

The source-control branch holder, visible behind the clone dialog, now wraps beneath the selector.
The mapping summary uses two columns on the phone. Mapping counts use singular wording for one
item. Import describes the imported content as a definition consistently.

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
