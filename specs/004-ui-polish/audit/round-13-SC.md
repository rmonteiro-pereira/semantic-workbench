# Round 13 — SC — server light

Frozen head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Reviewed all 80 assigned original native screenshots individually at original detail, across
390, 1280, 1440 and 2560 pixels. The server capture passed at 2026-10-24T13:24:26Z:
216 screenshots, zero measured geometry problems. Evidence: `/tmp/polish-round13/progress.log`
and `/tmp/polish-round13/server/capture.log`. This review covers the exact manifest
`/tmp/polish-round13-review-SC.txt`, including all eight Admin views, mapping graph,
both full-screen graph views, dialogs, server folder refusal guidance, and Neighborhood
hover-label and explicitly zoomed label states. It does not substitute previous-round verdicts.

No S1 or S2 defects found. Totals: **S1: 0; S2: 0; S3: 1**.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-SC-1 | S3 | `server-clone-folder-1280.png`, `server-clone-folder-refused-1280.png`, `server-file-move-1280.png`, `server-project-export-1280.png`, `server-project-export-history-1280.png`, `server-remote-folder-1280.png`, `server-remote-folder-refused-1280.png`, `server-ontology-neighborhood-labels-zoomed-1280.png`, `server-ontology-neighborhood-hover-label-1280.png` | At the bottom of the 1280-pixel sidebar file list, a narrow fragment of the next `finance/revenue-…` row remains visible immediately above the fixed footer. This repeats the minor partial-row polish issue recorded as F118; readable rows and footer controls remain separate. | End the visible list on a complete row, or provide enough bottom inset to avoid the stranded text fragment at the resting scroll position. |

The explicitly zoomed Neighborhood label views show only part of the surrounding graph;
these are detail-zoom states rather than initial fitted views. Visible relationship labels are
whole, readable and separated from cards. The fitted and full-screen views were assessed
independently for initial content clipping.

## Screens with no defects

- `server-admin-access-check-390.png`
- `server-admin-audit-390.png`
- `server-admin-grants-390.png`
- `server-admin-policies-390.png`
- `server-admin-projects-390.png`
- `server-admin-roles-390.png`
- `server-admin-settings-390.png`
- `server-admin-users-390.png`
- `server-clone-folder-390.png`
- `server-clone-folder-refused-390.png`
- `server-file-move-390.png`
- `server-mapping-graph-390.png`
- `server-ontology-graph-fullscreen-390.png`
- `server-ontology-neighborhood-fullscreen-390.png`
- `server-project-export-390.png`
- `server-project-export-history-390.png`
- `server-remote-folder-390.png`
- `server-remote-folder-refused-390.png`
- `server-admin-access-check-1280.png`
- `server-admin-audit-1280.png`
- `server-admin-grants-1280.png`
- `server-admin-policies-1280.png`
- `server-admin-projects-1280.png`
- `server-admin-roles-1280.png`
- `server-admin-settings-1280.png`
- `server-admin-users-1280.png`
- `server-mapping-graph-1280.png`
- `server-ontology-graph-fullscreen-1280.png`
- `server-ontology-neighborhood-fullscreen-1280.png`
- `server-admin-access-check-1440.png`
- `server-admin-audit-1440.png`
- `server-admin-grants-1440.png`
- `server-admin-policies-1440.png`
- `server-admin-projects-1440.png`
- `server-admin-roles-1440.png`
- `server-admin-settings-1440.png`
- `server-admin-users-1440.png`
- `server-clone-folder-1440.png`
- `server-clone-folder-refused-1440.png`
- `server-file-move-1440.png`
- `server-mapping-graph-1440.png`
- `server-ontology-graph-fullscreen-1440.png`
- `server-ontology-neighborhood-fullscreen-1440.png`
- `server-project-export-1440.png`
- `server-project-export-history-1440.png`
- `server-remote-folder-1440.png`
- `server-remote-folder-refused-1440.png`
- `server-admin-access-check-2560.png`
- `server-admin-audit-2560.png`
- `server-admin-grants-2560.png`
- `server-admin-policies-2560.png`
- `server-admin-projects-2560.png`
- `server-admin-roles-2560.png`
- `server-admin-settings-2560.png`
- `server-admin-users-2560.png`
- `server-clone-folder-2560.png`
- `server-clone-folder-refused-2560.png`
- `server-file-move-2560.png`
- `server-mapping-graph-2560.png`
- `server-ontology-graph-fullscreen-2560.png`
- `server-ontology-neighborhood-fullscreen-2560.png`
- `server-project-export-2560.png`
- `server-project-export-history-2560.png`
- `server-remote-folder-2560.png`
- `server-remote-folder-refused-2560.png`
- `server-ontology-neighborhood-labels-zoomed-390.png`
- `server-ontology-neighborhood-labels-zoomed-1440.png`
- `server-ontology-neighborhood-labels-zoomed-2560.png`
- `server-ontology-neighborhood-hover-label-390.png`
- `server-ontology-neighborhood-hover-label-1440.png`
- `server-ontology-neighborhood-hover-label-2560.png`

Reviewed **80/80** screenshots: 71 without defects; nine covered by the single repeated S3 row.
