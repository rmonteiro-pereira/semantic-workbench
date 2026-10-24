# Round 16 — SF — server dark

Head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Capture: `/tmp/polish-round16/server-dark/`; PASS at 19:33:00 UTC, 216 captured states, zero measurement problems.
Manifest: `/tmp/polish-round16-review-SF.txt`.

Reviewed 80/80 fresh original images individually at native resolution. No sampling or reused earlier verdict. Applied the strict audit brief across 390, 1280, 1440 and 2560 px: intended views, clipping, overlaps, alignment, spacing, type, contrast, wording, empty states, opacity and sideways overflow.

Severity totals: **S1: 0; S2: 0; S3: 1**.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-SF-1 | S3 | `server-dark-clone-folder-1280.png`, `server-dark-clone-folder-refused-1280.png`, `server-dark-file-move-1280.png`, `server-dark-project-export-1280.png`, `server-dark-project-export-history-1280.png`, `server-dark-remote-folder-1280.png`, `server-dark-remote-folder-refused-1280.png`, `server-dark-ontology-neighborhood-labels-zoomed-1280.png`, `server-dark-ontology-neighborhood-hover-label-1280.png` | At 1280 px the last visible project-file row is partly cut at the sidebar footer boundary. Recurring minor F118; foreground controls and graph labels remain readable and contained. | End the visible list on a whole row or clarify its scroll continuation. |

All eight Admin views present readable navigation and controls. Long pages continue vertically without sideways overflow. Role definitions and access scopes are clear. Policies explain the empty custom-rule state. All dialogs use opaque dark surfaces with readable help, validation and footer actions. Real mapping cards and routes are readable. Fullscreen model and Neighborhood views show whole intended initial graphs. The deliberate detail-zoom state shows a whole center card and whole labels; edge-of-canvas neighbor continuation is consistent with zoom. Hover labels remain readable at overview. No new serious contrast, clipping or overlap defect was observed.

## Clean screenshots (71)

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

## Screenshots with the minor row above (9)

- `server-dark-clone-folder-1280.png`
- `server-dark-clone-folder-refused-1280.png`
- `server-dark-file-move-1280.png`
- `server-dark-project-export-1280.png`
- `server-dark-project-export-history-1280.png`
- `server-dark-remote-folder-1280.png`
- `server-dark-remote-folder-refused-1280.png`
- `server-dark-ontology-neighborhood-labels-zoomed-1280.png`
- `server-dark-ontology-neighborhood-hover-label-1280.png`
