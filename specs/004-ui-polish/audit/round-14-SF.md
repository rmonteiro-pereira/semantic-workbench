# Round 14 — SF: server dark

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Server-dark capture PASS: 2026-10-24 17:30:08 UTC. The mode produced 216 originals
with zero measured problems. This partition independently reviewed all 80 assigned originals
at native resolution, individually, using the strict audit brief. No sampling or earlier
round verdicts were substituted. Manifest: `/tmp/polish-round14-review-SF.txt`.
Capture log: `/tmp/polish-round14/server-dark/capture.log`.

Reviewed: **80/80**. Severity totals: **S1: 0; S2: 0; S3: 1**.
One repeated minor finding affects nine screenshots; the remaining 71 have no observed defect.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-SF-1 | S3 | `server-dark-clone-folder-1280.png`<br>`server-dark-clone-folder-refused-1280.png`<br>`server-dark-file-move-1280.png`<br>`server-dark-project-export-1280.png`<br>`server-dark-project-export-history-1280.png`<br>`server-dark-remote-folder-1280.png`<br>`server-dark-remote-folder-refused-1280.png`<br>`server-dark-ontology-neighborhood-labels-zoomed-1280.png`<br>`server-dark-ontology-neighborhood-hover-label-1280.png` | At 1280 px, the next sidebar file row is partly exposed immediately above the fixed footer divider. Its cut-off text leaves a minor unfinished edge. This repeats the existing F118 observation. | Keep the final visible row whole, or clip the scrolling list before that row starts. |

Admin navigation, tables, forms and access guidance remain readable in dark mode at all four
sizes. Phone dialogs have opaque surfaces and contained actions. The mapping graph shows the
actual concept and dataset mappings with readable labels. Both fullscreen graphs retain clear
cards, titles and controls. Neighborhood detail and hover labels have opaque backgrounds and
remain legible above routes. Deliberately zoomed views show graph continuation beyond the canvas;
this is not an initial-fit defect. No serious overlap, clipping, small text, contrast, misleading
empty state, transparent menu or unintended sideways scrollbar was observed.

## Screens with no defects

- `server-dark-admin-access-check-390.png`
- `server-dark-admin-audit-390.png`
- `server-dark-admin-grants-390.png`
- `server-dark-admin-policies-390.png`
- `server-dark-admin-projects-390.png`
- `server-dark-admin-roles-390.png`
- `server-dark-admin-settings-390.png`
- `server-dark-admin-users-390.png`
- `server-dark-clone-folder-390.png`
- `server-dark-clone-folder-refused-390.png`
- `server-dark-file-move-390.png`
- `server-dark-mapping-graph-390.png`
- `server-dark-ontology-graph-fullscreen-390.png`
- `server-dark-ontology-neighborhood-fullscreen-390.png`
- `server-dark-project-export-390.png`
- `server-dark-project-export-history-390.png`
- `server-dark-remote-folder-390.png`
- `server-dark-remote-folder-refused-390.png`
- `server-dark-admin-access-check-1280.png`
- `server-dark-admin-audit-1280.png`
- `server-dark-admin-grants-1280.png`
- `server-dark-admin-policies-1280.png`
- `server-dark-admin-projects-1280.png`
- `server-dark-admin-roles-1280.png`
- `server-dark-admin-settings-1280.png`
- `server-dark-admin-users-1280.png`
- `server-dark-mapping-graph-1280.png`
- `server-dark-ontology-graph-fullscreen-1280.png`
- `server-dark-ontology-neighborhood-fullscreen-1280.png`
- `server-dark-admin-access-check-1440.png`
- `server-dark-admin-audit-1440.png`
- `server-dark-admin-grants-1440.png`
- `server-dark-admin-policies-1440.png`
- `server-dark-admin-projects-1440.png`
- `server-dark-admin-roles-1440.png`
- `server-dark-admin-settings-1440.png`
- `server-dark-admin-users-1440.png`
- `server-dark-clone-folder-1440.png`
- `server-dark-clone-folder-refused-1440.png`
- `server-dark-file-move-1440.png`
- `server-dark-mapping-graph-1440.png`
- `server-dark-ontology-graph-fullscreen-1440.png`
- `server-dark-ontology-neighborhood-fullscreen-1440.png`
- `server-dark-project-export-1440.png`
- `server-dark-project-export-history-1440.png`
- `server-dark-remote-folder-1440.png`
- `server-dark-remote-folder-refused-1440.png`
- `server-dark-admin-access-check-2560.png`
- `server-dark-admin-audit-2560.png`
- `server-dark-admin-grants-2560.png`
- `server-dark-admin-policies-2560.png`
- `server-dark-admin-projects-2560.png`
- `server-dark-admin-roles-2560.png`
- `server-dark-admin-settings-2560.png`
- `server-dark-admin-users-2560.png`
- `server-dark-clone-folder-2560.png`
- `server-dark-clone-folder-refused-2560.png`
- `server-dark-file-move-2560.png`
- `server-dark-mapping-graph-2560.png`
- `server-dark-ontology-graph-fullscreen-2560.png`
- `server-dark-ontology-neighborhood-fullscreen-2560.png`
- `server-dark-project-export-2560.png`
- `server-dark-project-export-history-2560.png`
- `server-dark-remote-folder-2560.png`
- `server-dark-remote-folder-refused-2560.png`
- `server-dark-ontology-neighborhood-labels-zoomed-390.png`
- `server-dark-ontology-neighborhood-labels-zoomed-1440.png`
- `server-dark-ontology-neighborhood-labels-zoomed-2560.png`
- `server-dark-ontology-neighborhood-hover-label-390.png`
- `server-dark-ontology-neighborhood-hover-label-1440.png`
- `server-dark-ontology-neighborhood-hover-label-2560.png`
