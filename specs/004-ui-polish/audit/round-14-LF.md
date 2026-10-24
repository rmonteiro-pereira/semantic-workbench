# Round 14 — LF: local dark

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Local-dark capture PASS: 2026-10-24 17:42:25 UTC. The mode produced 216 native originals
with zero measured problems. This partition independently inspected **80/80** assigned originals
individually at native resolution against the strict audit brief. No sampling or prior-round
verdict substitution was used. Manifest: `/tmp/polish-round14-review-LF.txt`.
Capture log: `/tmp/polish-round14/local-dark/capture.log`.

Severity totals: **S1: 0; S2: 0; S3: 2**. No S1 or S2 defects were observed.
Twenty distinct screenshots have a minor observation; 60 are clean.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-LF-1 | S3 | `local-dark-clone-folder-1440.png`<br>`local-dark-clone-folder-refused-1440.png`<br>`local-dark-file-move-1440.png`<br>`local-dark-project-export-1440.png`<br>`local-dark-project-export-history-1440.png`<br>`local-dark-remote-folder-1440.png`<br>`local-dark-remote-folder-preview-1440.png`<br>`local-dark-clone-folder-2560.png`<br>`local-dark-clone-folder-refused-2560.png`<br>`local-dark-file-move-2560.png`<br>`local-dark-mapping-graph-2560.png`<br>`local-dark-project-export-2560.png`<br>`local-dark-project-export-history-2560.png`<br>`local-dark-remote-folder-2560.png`<br>`local-dark-remote-folder-preview-2560.png`<br>`local-dark-ontology-neighborhood-labels-zoomed-1440.png`<br>`local-dark-ontology-neighborhood-labels-zoomed-2560.png`<br>`local-dark-ontology-neighborhood-hover-label-1440.png`<br>`local-dark-ontology-neighborhood-hover-label-2560.png` | A partial final sidebar file row peeks above the fixed footer divider at 1440 and 2560 px. The text fragment leaves a minor unfinished edge. Repeats F118. | Keep the final visible row whole, or end the list before the next row begins. |
| R14-LF-2 | S3 | `local-dark-ontology-neighborhood-fullscreen-1440.png`<br>`local-dark-ontology-neighborhood-hover-label-1440.png` | The compact DocumentReference card wraps the name with only “ce” on a second line. The text is readable, but the stranded fragment is awkward. Repeats F119. | Adjust compact name wrapping or available width to avoid a two-letter last line. |

Admin forms, navigation, role columns and local-mode empty-state explanations are readable.
Dark backgrounds remain consistent across inputs, tables, cards and dialogs. Phone dialog text
and actions fit on opaque surfaces. Mapping cards distinguish actual concepts, datasets, fields
and metrics. Model area cards and Neighborhood controls remain clear at all four sizes.
Hover and detail labels have readable contrast and opaque backgrounds above routes. Graph
continuation outside the canvas in explicit detail-zoom views is consistent with the enlarged
center view, rather than an initial-fit defect. No serious clipping, overlap, confusing label,
transparent menu or unintended sideways scrollbar was observed.

## Screens with no defects

- `local-dark-admin-access-check-390.png`
- `local-dark-admin-audit-390.png`
- `local-dark-admin-grants-390.png`
- `local-dark-admin-policies-390.png`
- `local-dark-admin-projects-390.png`
- `local-dark-admin-roles-390.png`
- `local-dark-admin-settings-390.png`
- `local-dark-admin-users-390.png`
- `local-dark-clone-folder-390.png`
- `local-dark-clone-folder-refused-390.png`
- `local-dark-file-move-390.png`
- `local-dark-mapping-graph-390.png`
- `local-dark-ontology-graph-fullscreen-390.png`
- `local-dark-ontology-neighborhood-fullscreen-390.png`
- `local-dark-project-export-390.png`
- `local-dark-project-export-history-390.png`
- `local-dark-remote-folder-390.png`
- `local-dark-remote-folder-preview-390.png`
- `local-dark-admin-access-check-1280.png`
- `local-dark-admin-audit-1280.png`
- `local-dark-admin-grants-1280.png`
- `local-dark-admin-policies-1280.png`
- `local-dark-admin-projects-1280.png`
- `local-dark-admin-roles-1280.png`
- `local-dark-admin-settings-1280.png`
- `local-dark-admin-users-1280.png`
- `local-dark-clone-folder-1280.png`
- `local-dark-clone-folder-refused-1280.png`
- `local-dark-file-move-1280.png`
- `local-dark-mapping-graph-1280.png`
- `local-dark-ontology-graph-fullscreen-1280.png`
- `local-dark-ontology-neighborhood-fullscreen-1280.png`
- `local-dark-project-export-1280.png`
- `local-dark-project-export-history-1280.png`
- `local-dark-remote-folder-1280.png`
- `local-dark-remote-folder-preview-1280.png`
- `local-dark-admin-access-check-1440.png`
- `local-dark-admin-audit-1440.png`
- `local-dark-admin-grants-1440.png`
- `local-dark-admin-policies-1440.png`
- `local-dark-admin-projects-1440.png`
- `local-dark-admin-roles-1440.png`
- `local-dark-admin-settings-1440.png`
- `local-dark-admin-users-1440.png`
- `local-dark-mapping-graph-1440.png`
- `local-dark-ontology-graph-fullscreen-1440.png`
- `local-dark-admin-access-check-2560.png`
- `local-dark-admin-audit-2560.png`
- `local-dark-admin-grants-2560.png`
- `local-dark-admin-policies-2560.png`
- `local-dark-admin-projects-2560.png`
- `local-dark-admin-roles-2560.png`
- `local-dark-admin-settings-2560.png`
- `local-dark-admin-users-2560.png`
- `local-dark-ontology-graph-fullscreen-2560.png`
- `local-dark-ontology-neighborhood-fullscreen-2560.png`
- `local-dark-ontology-neighborhood-labels-zoomed-390.png`
- `local-dark-ontology-neighborhood-labels-zoomed-1280.png`
- `local-dark-ontology-neighborhood-hover-label-390.png`
- `local-dark-ontology-neighborhood-hover-label-1280.png`
