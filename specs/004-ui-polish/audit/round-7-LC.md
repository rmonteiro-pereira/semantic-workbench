# Round 7 — local light, partition LC

Reviewed all 72 assigned screenshots individually at native resolution with original-detail image
viewing. This covers 18 intended views at 390, 1280, 1440 and 2560 pixels, including all eight Admin
views, the real mapping graph, and both graph full-screen views.

The complete retry was captured from `8238230f37d34466aed550c3dc930b7cd71478a7`.
Its application UI is identical to `31f4dbcbd1e8aa4a17a1e05719cc31232875a7c1`.
The initial partial local capture lacked the mapping fixture and was excluded completely.
This review restarted from zero against the replacement `/tmp/polish-round7/local` capture,
started at 05:53:42 UTC. No images from `local-diagnostic` count toward this review.

The final capture log records 208 measurements, zero geometry problems and no skipped views.
`progress.log` records `PASS local 2026-10-24T05:59:32Z`.
Findings below are based on visible screenshots; the automatic geometry result does not override
visual legibility or wording defects. The Audit view has populated rows in all four sizes and has
no empty-state finding.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-LC-1 | S1 | `local-ontology-neighborhood-fullscreen-1280.png` | The loop edge above Consignment has a microscopic “3 relationships” label, roughly 4–5 screen pixels high beside the readable toolbar. The relationship count cannot be read at normal zoom. | Compensate the edge-label size for zoom, or hide this detail when it cannot remain at least 12 screen pixels. |
| R7-LC-2 | S2 | `local-admin-grants-390.png`<br>`local-admin-grants-1280.png`<br>`local-admin-grants-1440.png`<br>`local-admin-grants-2560.png` | Access grants has no empty-state explanation. At 390 the area below Add grant and History is blank; desktop sizes show table headings over an empty body. The page does not explain whether access is absent or inherited in local mode. | Add an explicit empty state explaining the absence of configured grants, the local access context, and when to use Add grant. |
| R7-LC-3 | S2 | `local-admin-settings-390.png`<br>`local-admin-settings-1280.png`<br>`local-admin-settings-1440.png`<br>`local-admin-settings-2560.png` | Allowed hosts ends with a colon and no value. Nothing distinguishes no configuration from unrestricted access or unavailable information. | Render an explicit, accurate value such as None configured, with a short explanation if needed. |
| R7-LC-4 | S2 | `local-admin-settings-390.png`<br>`local-admin-settings-1280.png`<br>`local-admin-settings-1440.png`<br>`local-admin-settings-2560.png` | Active sessions is a heading followed by blank space. Unlike Provider status, it gives no local-mode explanation or empty-state message. | Show an explicit no-sessions state or the applicable local-mode explanation. |
| R7-LC-5 | S2 | `local-admin-projects-390.png`<br>`local-admin-projects-1280.png`<br>`local-admin-projects-1440.png`<br>`local-admin-projects-2560.png` | Two enabled buttons both say Dry run: one below the empty Domains area and another below Agent client grants. Neither label identifies the access scope or what result the preview will explain. | Give each action a scope-specific preview label and briefly explain its result. |
| R7-LC-6 | S3 | `local-ontology-neighborhood-fullscreen-1440.png` | DocumentReference wraps as DocumentReferen followed by a stranded ce on the second line. The name is readable but the two-letter continuation looks accidental. | Break at the word boundary or give this card enough room to avoid the stranded suffix. |

## Screens with no defects

- `local-admin-access-check-390.png`
- `local-admin-audit-390.png`
- `local-admin-policies-390.png`
- `local-admin-roles-390.png`
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
- `local-admin-policies-1280.png`
- `local-admin-roles-1280.png`
- `local-admin-users-1280.png`
- `local-clone-folder-1280.png`
- `local-clone-folder-refused-1280.png`
- `local-file-move-1280.png`
- `local-mapping-graph-1280.png`
- `local-ontology-graph-fullscreen-1280.png`
- `local-project-export-1280.png`
- `local-project-export-history-1280.png`
- `local-remote-folder-1280.png`
- `local-remote-folder-preview-1280.png`
- `local-admin-access-check-1440.png`
- `local-admin-audit-1440.png`
- `local-admin-policies-1440.png`
- `local-admin-roles-1440.png`
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
- `local-admin-policies-2560.png`
- `local-admin-roles-2560.png`
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

Reviewed: **72/72 screenshots**. Clean screenshots: **58**.

Findings: **1 S1, 4 S2, 1 S3**.
