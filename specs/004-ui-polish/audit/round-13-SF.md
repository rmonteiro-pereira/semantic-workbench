# Round 13 — SF — server dark

Frozen head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Individually inspected all 80 assigned fresh original native images at original detail,
across 390, 1280, 1440 and 2560 pixels. No sampling or earlier-round verdict substitution.
The server-dark capture passed at 2026-10-24T13:29:41Z with 216 screenshots and zero
measured problems. Read `/tmp/polish-round13/server-dark/capture.log` and confirmed PASS
in `/tmp/polish-round13/progress.log`. Exact coverage manifest:
`/tmp/polish-round13-review-SF.txt`.

Coverage includes all eight Admin views, mapping graph, both full-screen graph views,
clone/move/export/remote dialogs and refusals, and Neighborhood hover and zoomed labels.
Dark surfaces, dialog opacity, text contrast, spacing, labels, empty states, graph routing,
clipping and sideways overflow were checked visually in each image.

**No S1 or S2 defects found. Totals: S1: 0; S2: 0; S3: 1.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-SF-1 | S3 | `server-dark-clone-folder-1280.png`, `server-dark-clone-folder-refused-1280.png`, `server-dark-file-move-1280.png`, `server-dark-project-export-1280.png`, `server-dark-project-export-history-1280.png`, `server-dark-remote-folder-1280.png`, `server-dark-remote-folder-refused-1280.png`, `server-dark-ontology-neighborhood-labels-zoomed-1280.png`, `server-dark-ontology-neighborhood-hover-label-1280.png` | At 1280 pixels, the sidebar file list ends with a narrow fragment of the next `finance/revenue-…` row immediately above the fixed footer. This is the recurring partial-row polish issue F118. The complete rows and footer controls remain readable and separate. | Give the resting file list enough bottom inset, or end it on a whole row, so the next filename does not appear as a stranded fragment. |

The explicitly zoomed Neighborhood detail states show a portion of the surrounding graph,
including off-canvas neighbors at the narrow sizes. These are distinct from the fitted views;
visible relationship labels remain whole and clear. Fitted and full-screen graph images
were separately inspected for initial clipping and card or label collisions.

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

Reviewed **80/80** originals: 71 without defects; nine covered by the single repeated S3 row.
