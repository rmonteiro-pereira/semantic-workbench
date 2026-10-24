# Round 14 — LC: local light

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Local-light capture PASS: 2026-10-24 17:36:14 UTC. The complete mode produced 216 originals
with zero measured problems. This partition reviewed **80/80** assigned native originals
individually against the strict audit brief, without sampling or substituting earlier verdicts.
Manifest: `/tmp/polish-round14-review-LC.txt`.
Capture log: `/tmp/polish-round14/local/capture.log`.

Severity totals: **S1: 0; S2: 0; S3: 2**. No S1 or S2 defects were observed.
Twenty distinct screenshots have a minor observation; 60 are clean.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-LC-1 | S3 | `local-clone-folder-1440.png`<br>`local-clone-folder-refused-1440.png`<br>`local-file-move-1440.png`<br>`local-project-export-1440.png`<br>`local-project-export-history-1440.png`<br>`local-remote-folder-1440.png`<br>`local-remote-folder-preview-1440.png`<br>`local-clone-folder-2560.png`<br>`local-clone-folder-refused-2560.png`<br>`local-file-move-2560.png`<br>`local-mapping-graph-2560.png`<br>`local-project-export-2560.png`<br>`local-project-export-history-2560.png`<br>`local-remote-folder-2560.png`<br>`local-remote-folder-preview-2560.png`<br>`local-ontology-neighborhood-labels-zoomed-1440.png`<br>`local-ontology-neighborhood-labels-zoomed-2560.png`<br>`local-ontology-neighborhood-hover-label-1440.png`<br>`local-ontology-neighborhood-hover-label-2560.png` | The final sidebar file row is only partly exposed above the fixed footer divider at 1440 and 2560 px. Its cut-off text leaves an unfinished edge. Repeats F118. | Keep the last visible row whole, or clip the list before that row begins. |
| R14-LC-2 | S3 | `local-ontology-neighborhood-fullscreen-1440.png`<br>`local-ontology-neighborhood-hover-label-1440.png` | The DocumentReference name wraps with only “ce” on its second line in the compact card. The word remains readable, but the stranded fragment is awkward. Repeats F119. | Adjust the compact name wrapping or available width to avoid a two-letter final line. |

The local Admin empty states explain grants, provider settings and sessions. Admin navigation,
forms and role columns fit the phone and desktop widths. Dialogs have opaque surfaces, readable
instructions and contained buttons. The mapping graph displays real concept, dataset, field and
metric connections. Fullscreen model area titles and counts are readable; Neighborhood cards,
actions and hover labels remain clear. Explicit detail zoom shows graph continuation outside the
canvas, rather than a cropped initial fit. No serious overlap, contrast problem, confusing empty
state, transparent menu or unintended horizontal scrollbar was observed.

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
- `local-mapping-graph-1440.png`
- `local-ontology-graph-fullscreen-1440.png`
- `local-admin-access-check-2560.png`
- `local-admin-audit-2560.png`
- `local-admin-grants-2560.png`
- `local-admin-policies-2560.png`
- `local-admin-projects-2560.png`
- `local-admin-roles-2560.png`
- `local-admin-settings-2560.png`
- `local-admin-users-2560.png`
- `local-ontology-graph-fullscreen-2560.png`
- `local-ontology-neighborhood-fullscreen-2560.png`
- `local-ontology-neighborhood-labels-zoomed-390.png`
- `local-ontology-neighborhood-labels-zoomed-1280.png`
- `local-ontology-neighborhood-hover-label-390.png`
- `local-ontology-neighborhood-hover-label-1280.png`
