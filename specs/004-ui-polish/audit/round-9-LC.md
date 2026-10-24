# Round 9 — local light, partition LC

Frozen capture head: `a5c45ee`. Reviewed all 80 assigned original images individually at native
resolution, without sampling, montages or reused round-8 verdicts. Coverage is 20 views at 390,
1280, 1440 and 2560 pixels, including eight Admin pages, real mappings, full-screen graphs,
zoomed Neighborhood labels and hovered labels.

Read `/tmp/polish-round9/local/capture.log`: 216 measurements, zero geometry problems and no
skipped views or reported uncaught browser errors. `progress.log` records
`PASS local 2026-10-24T07:51:24Z`. Admin empty states explain local-mode access and sessions.
Outer cards outside deliberately zoomed views are normal pan/zoom content; visible relationship
labels remain whole and readable. Long Admin pages continue vertically beneath the viewport.

Findings: 0 S1, 0 S2, 1 S3. No S1 or S2 defects found.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R9-LC-1 | S3 | Neighborhood, 1440: `local-ontology-neighborhood-fullscreen-1440.png`, `local-ontology-neighborhood-hover-label-1440.png` | Bottom DocumentReference card strands “ce” on a second line. The complete name is readable, but the two-letter line makes the card awkward. | Prefer a single-line ellipsis or a balanced word break for compact names. |

## Screens with no defects

- `local-admin-access-check-390.png`
- `local-admin-audit-390.png`
- `local-admin-grants-390.png`
- `local-admin-policies-390.png`
- `local-admin-projects-390.png`
- `local-admin-roles-390.png`
- `local-admin-settings-390.png`
- `local-admin-users-390.png`
- `local-clone-folder-390.png`
- `local-clone-folder-refused-390.png`
- `local-file-move-390.png`
- `local-mapping-graph-390.png`
- `local-ontology-graph-fullscreen-390.png`
- `local-ontology-neighborhood-fullscreen-390.png`
- `local-project-export-390.png`
- `local-project-export-history-390.png`
- `local-remote-folder-390.png`
- `local-remote-folder-preview-390.png`
- `local-admin-access-check-1280.png`
- `local-admin-audit-1280.png`
- `local-admin-grants-1280.png`
- `local-admin-policies-1280.png`
- `local-admin-projects-1280.png`
- `local-admin-roles-1280.png`
- `local-admin-settings-1280.png`
- `local-admin-users-1280.png`
- `local-clone-folder-1280.png`
- `local-clone-folder-refused-1280.png`
- `local-file-move-1280.png`
- `local-mapping-graph-1280.png`
- `local-ontology-graph-fullscreen-1280.png`
- `local-ontology-neighborhood-fullscreen-1280.png`
- `local-project-export-1280.png`
- `local-project-export-history-1280.png`
- `local-remote-folder-1280.png`
- `local-remote-folder-preview-1280.png`
- `local-admin-access-check-1440.png`
- `local-admin-audit-1440.png`
- `local-admin-grants-1440.png`
- `local-admin-policies-1440.png`
- `local-admin-projects-1440.png`
- `local-admin-roles-1440.png`
- `local-admin-settings-1440.png`
- `local-admin-users-1440.png`
- `local-clone-folder-1440.png`
- `local-clone-folder-refused-1440.png`
- `local-file-move-1440.png`
- `local-mapping-graph-1440.png`
- `local-ontology-graph-fullscreen-1440.png`
- `local-project-export-1440.png`
- `local-project-export-history-1440.png`
- `local-remote-folder-1440.png`
- `local-remote-folder-preview-1440.png`
- `local-admin-access-check-2560.png`
- `local-admin-audit-2560.png`
- `local-admin-grants-2560.png`
- `local-admin-policies-2560.png`
- `local-admin-projects-2560.png`
- `local-admin-roles-2560.png`
- `local-admin-settings-2560.png`
- `local-admin-users-2560.png`
- `local-clone-folder-2560.png`
- `local-clone-folder-refused-2560.png`
- `local-file-move-2560.png`
- `local-mapping-graph-2560.png`
- `local-ontology-graph-fullscreen-2560.png`
- `local-ontology-neighborhood-fullscreen-2560.png`
- `local-project-export-2560.png`
- `local-project-export-history-2560.png`
- `local-remote-folder-2560.png`
- `local-remote-folder-preview-2560.png`
- `local-ontology-neighborhood-labels-zoomed-390.png`
- `local-ontology-neighborhood-labels-zoomed-1280.png`
- `local-ontology-neighborhood-labels-zoomed-1440.png`
- `local-ontology-neighborhood-labels-zoomed-2560.png`
- `local-ontology-neighborhood-hover-label-390.png`
- `local-ontology-neighborhood-hover-label-1280.png`
- `local-ontology-neighborhood-hover-label-2560.png`

Reviewed: 80/80 originals. Clean screens: 78. Only one minor defect; no serious defects.
