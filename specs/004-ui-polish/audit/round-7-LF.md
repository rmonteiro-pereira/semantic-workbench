# Round 7 — local dark, partition LF

Reviewed all 72 assigned screenshots individually at native resolution with original-detail image
viewing. This covers 18 intended views at 390, 1280, 1440 and 2560 pixels, including all eight Admin
views, the real mapping graph, and both graph full-screen views.

Capture head: `8238230f37d34466aed550c3dc930b7cd71478a7`.
Application UI head: `31f4dbcbd1e8aa4a17a1e05719cc31232875a7c1`.
The capture is `/tmp/polish-round7/local-dark`, started at 05:59:32 UTC.
The final capture log records 208 measurements, zero geometry problems and no skipped views.
`progress.log` records `PASS local-dark 2026-10-24T06:05:23Z`.

Each finding below was independently observed in these dark screenshots. The automatic geometry
result does not override visual legibility or wording defects. Audit has populated rows in all
four sizes. No additional dark-theme contrast defect was observed in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-LF-1 | S1 | `local-dark-ontology-neighborhood-fullscreen-1280.png` | The loop edge above Consignment has a microscopic “3 relationships” label, roughly 4–5 screen pixels high beside the readable toolbar. The relationship count cannot be read at normal zoom. | Compensate the edge-label size for zoom, or hide this detail when it cannot remain at least 12 screen pixels. |
| R7-LF-2 | S2 | `local-dark-admin-grants-390.png`<br>`local-dark-admin-grants-1280.png`<br>`local-dark-admin-grants-1440.png`<br>`local-dark-admin-grants-2560.png` | Access grants has no empty-state explanation. At 390 the area below Add grant and History is blank; desktop sizes show table headings over an empty body. The page does not explain whether access is absent or inherited in local mode. | Add an explicit empty state explaining the absence of configured grants, the local access context, and when to use Add grant. |
| R7-LF-3 | S2 | `local-dark-admin-settings-390.png`<br>`local-dark-admin-settings-1280.png`<br>`local-dark-admin-settings-1440.png`<br>`local-dark-admin-settings-2560.png` | Allowed hosts ends with a colon and no value. Nothing distinguishes no configuration from unrestricted access or unavailable information. | Render an explicit, accurate value such as None configured, with a short explanation if needed. |
| R7-LF-4 | S2 | `local-dark-admin-settings-390.png`<br>`local-dark-admin-settings-1280.png`<br>`local-dark-admin-settings-1440.png`<br>`local-dark-admin-settings-2560.png` | Active sessions is a heading followed by blank space. Unlike Provider status, it gives no local-mode explanation or empty-state message. | Show an explicit no-sessions state or the applicable local-mode explanation. |
| R7-LF-5 | S2 | `local-dark-admin-projects-390.png`<br>`local-dark-admin-projects-1280.png`<br>`local-dark-admin-projects-1440.png`<br>`local-dark-admin-projects-2560.png` | Two enabled buttons both say Dry run: one below the empty Domains area and another below Agent client grants. Neither label identifies the access scope or what result the preview will explain. | Give each action a scope-specific preview label and briefly explain its result. |
| R7-LF-6 | S3 | `local-dark-ontology-neighborhood-fullscreen-1440.png` | DocumentReference wraps as DocumentReferen followed by a stranded ce on the second line. The name is readable but the two-letter continuation looks accidental. | Break at the word boundary or give this card enough room to avoid the stranded suffix. |

## Screens with no defects

- `local-dark-admin-access-check-390.png`
- `local-dark-admin-audit-390.png`
- `local-dark-admin-policies-390.png`
- `local-dark-admin-roles-390.png`
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
- `local-dark-admin-policies-1280.png`
- `local-dark-admin-roles-1280.png`
- `local-dark-admin-users-1280.png`
- `local-dark-clone-folder-1280.png`
- `local-dark-clone-folder-refused-1280.png`
- `local-dark-file-move-1280.png`
- `local-dark-mapping-graph-1280.png`
- `local-dark-ontology-graph-fullscreen-1280.png`
- `local-dark-project-export-1280.png`
- `local-dark-project-export-history-1280.png`
- `local-dark-remote-folder-1280.png`
- `local-dark-remote-folder-preview-1280.png`
- `local-dark-admin-access-check-1440.png`
- `local-dark-admin-audit-1440.png`
- `local-dark-admin-policies-1440.png`
- `local-dark-admin-roles-1440.png`
- `local-dark-admin-users-1440.png`
- `local-dark-clone-folder-1440.png`
- `local-dark-clone-folder-refused-1440.png`
- `local-dark-file-move-1440.png`
- `local-dark-mapping-graph-1440.png`
- `local-dark-ontology-graph-fullscreen-1440.png`
- `local-dark-project-export-1440.png`
- `local-dark-project-export-history-1440.png`
- `local-dark-remote-folder-1440.png`
- `local-dark-remote-folder-preview-1440.png`
- `local-dark-admin-access-check-2560.png`
- `local-dark-admin-audit-2560.png`
- `local-dark-admin-policies-2560.png`
- `local-dark-admin-roles-2560.png`
- `local-dark-admin-users-2560.png`
- `local-dark-clone-folder-2560.png`
- `local-dark-clone-folder-refused-2560.png`
- `local-dark-file-move-2560.png`
- `local-dark-mapping-graph-2560.png`
- `local-dark-ontology-graph-fullscreen-2560.png`
- `local-dark-ontology-neighborhood-fullscreen-2560.png`
- `local-dark-project-export-2560.png`
- `local-dark-project-export-history-2560.png`
- `local-dark-remote-folder-2560.png`
- `local-dark-remote-folder-preview-2560.png`

Reviewed: **72/72 screenshots**. Clean screenshots: **58**.

Findings: **1 S1, 4 S2, 1 S3**.
