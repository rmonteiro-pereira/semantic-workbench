# Round 6 SF — server, dark

Head: `5e3738a`.

Reviewed the complete retry capture log first: 208 measurements, zero geometry problems,
and no skipped views. Then reviewed all 72 assigned screenshots individually at native
resolution. The retry screenshots use the frozen build at the head above. The interrupted
first dark capture was not used. The server existing-folder state is `remote-folder-refused`, showing the
server restriction rather than a local move preview. This review judges visible images only. No additional defect specific to the dark theme
was visible in these 72 images; the six rows below repeat defects visible in the light set.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R6-SF-1 | S1 | `server-dark-admin-roles-1440.png`<br>`server-dark-admin-roles-2560.png` | The permissions matrix ends through text before the Viewer section. At 1440 it has only its header and the top slice of Read / Allowed; at 2560 the Approve metric row is sliced at the bottom. The next section starts normally below this clipped region. | Give the matrix a usable minimum height and a visible scroll affordance, or let the page scroll the complete table. Do not cut a row through its text. |
| R6-SF-2 | S1 | `server-dark-admin-policies-390.png`<br>`server-dark-admin-audit-390.png`<br>`server-dark-admin-settings-390.png`<br>`server-dark-admin-access-check-390.png` | The left edge of the horizontal Admin navigation exposes chopped label fragments beside the back chevron: rants, roups, licies and s access respectively. These look like damaged tab names. | Hide the entire label of a partially clipped neighboring tab, while keeping the current tab and navigation arrows fully visible. |
| R6-SF-3 | S1 | `server-dark-ontology-neighborhood-fullscreen-390.png` | The fullscreen canvas reduces Order, Customer and Identifier to a thin row of roughly 85-by-40-pixel cards. Their labels are visibly smaller than the 12-pixel toolbar text, and the tiny plus/arrow buttons are difficult to distinguish. Most of the canvas remains empty above and below. | Keep card labels at least 12 screen pixels and controls legible at the initial phone zoom; use the available vertical space when placing the neighborhood. |
| R6-SF-4 | S1 | `server-dark-admin-audit-390.png`<br>`server-dark-admin-audit-1280.png`<br>`server-dark-admin-audit-2560.png`<br>`server-dark-admin-grants-1280.png` | The list region cuts its last visible record through text above the bottom gutter. Audit390 slices the Decision label immediately above pagination; Audit1280 slices the next Dave Dias record; Audit2560 cuts the final record before pagination. Grants1280 slices Carol’s project scope and added date above a blank bottom gutter. No visible scrollbar explains the clipped region. | Size the scrollable list to complete rows/cards where possible and show a clear vertical scroll affordance. Keep pagination outside the list without concealing record text. |
| R6-SF-5 | S2 | `server-dark-mapping-graph-390.png` | The graph toolbar says 1 of 2 cards shown, while the footer says 2 of 3 cards. Only Employee is visible. The two simultaneous card totals have no explanation of what each counts. | Use one visible-card count, or explicitly label the different scopes so the toolbar and footer cannot appear to contradict each other. |
| R6-SF-6 | S2 | `server-dark-admin-roles-390.png`<br>`server-dark-admin-roles-1280.png`<br>`server-dark-admin-roles-1440.png`<br>`server-dark-admin-roles-2560.png` | Editor, Steward and Admin each carry a read-only suffix, although their descriptions immediately explain editing, publishing or every action. The suffix appears to describe their permissions rather than the role definition. | Label these definitions Built-in role or Definition is read-only, separating definition editability from the permissions the role grants. |

Screens with no defects

- `server-dark-project-export-390.png`
- `server-dark-project-export-1280.png`
- `server-dark-project-export-1440.png`
- `server-dark-project-export-2560.png`
- `server-dark-project-export-history-390.png`
- `server-dark-project-export-history-1280.png`
- `server-dark-project-export-history-1440.png`
- `server-dark-project-export-history-2560.png`
- `server-dark-file-move-390.png`
- `server-dark-file-move-1280.png`
- `server-dark-file-move-1440.png`
- `server-dark-file-move-2560.png`
- `server-dark-clone-folder-390.png`
- `server-dark-clone-folder-1280.png`
- `server-dark-clone-folder-1440.png`
- `server-dark-clone-folder-2560.png`
- `server-dark-clone-folder-refused-390.png`
- `server-dark-clone-folder-refused-1280.png`
- `server-dark-clone-folder-refused-1440.png`
- `server-dark-clone-folder-refused-2560.png`
- `server-dark-remote-folder-390.png`
- `server-dark-remote-folder-1280.png`
- `server-dark-remote-folder-1440.png`
- `server-dark-remote-folder-2560.png`
- `server-dark-remote-folder-refused-390.png`
- `server-dark-remote-folder-refused-1280.png`
- `server-dark-remote-folder-refused-1440.png`
- `server-dark-remote-folder-refused-2560.png`
- `server-dark-mapping-graph-1280.png`
- `server-dark-mapping-graph-1440.png`
- `server-dark-mapping-graph-2560.png`
- `server-dark-ontology-graph-fullscreen-390.png`
- `server-dark-ontology-graph-fullscreen-1280.png`
- `server-dark-ontology-graph-fullscreen-1440.png`
- `server-dark-ontology-graph-fullscreen-2560.png`
- `server-dark-ontology-neighborhood-fullscreen-1280.png`
- `server-dark-ontology-neighborhood-fullscreen-1440.png`
- `server-dark-ontology-neighborhood-fullscreen-2560.png`
- `server-dark-admin-grants-390.png`
- `server-dark-admin-grants-1440.png`
- `server-dark-admin-grants-2560.png`
- `server-dark-admin-users-390.png`
- `server-dark-admin-users-1280.png`
- `server-dark-admin-users-1440.png`
- `server-dark-admin-users-2560.png`
- `server-dark-admin-policies-1280.png`
- `server-dark-admin-policies-1440.png`
- `server-dark-admin-policies-2560.png`
- `server-dark-admin-projects-390.png`
- `server-dark-admin-projects-1280.png`
- `server-dark-admin-projects-1440.png`
- `server-dark-admin-projects-2560.png`
- `server-dark-admin-audit-1440.png`
- `server-dark-admin-settings-1280.png`
- `server-dark-admin-settings-1440.png`
- `server-dark-admin-settings-2560.png`
- `server-dark-admin-access-check-1280.png`
- `server-dark-admin-access-check-1440.png`
- `server-dark-admin-access-check-2560.png`

Reviewed: **72/72 screenshots**. Findings: **4 S1, 2 S2, 0 S3**.
