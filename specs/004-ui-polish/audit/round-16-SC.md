# Round 16 — SC — server light

Head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Capture: `/tmp/polish-round16/server/`; server-light PASS at 19:27:44 UTC, 216 captured states, zero measurement problems.
Manifest: `/tmp/polish-round16-review-SC.txt`.

Reviewed 80/80 fresh original screenshots individually at native resolution, including all four viewport sizes. No sampling or prior-round verdict substitution. Applied the strict audit brief to intended views, clipping, overlap, alignment, spacing, type size, contrast, labels, empty states, opacity and horizontal overflow.

Severity totals: **S1: 0; S2: 0; S3: 1**. No serious visual defect found.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-SC-1 | S3 | `server-clone-folder-1280.png`, `server-clone-folder-refused-1280.png`, `server-file-move-1280.png`, `server-project-export-1280.png`, `server-project-export-history-1280.png`, `server-remote-folder-1280.png`, `server-remote-folder-refused-1280.png`, `server-ontology-neighborhood-labels-zoomed-1280.png`, `server-ontology-neighborhood-hover-label-1280.png` | At 1280 px the last visible project-file row is partially cut by the sidebar footer boundary. This is the recurring minor F118 issue; foreground dialogs and graph content remain readable and contained. | End the visible file-list area on a whole row, or provide a clearer scroll continuation at its boundary. |

The eight Admin views have readable navigation, fields, scope explanations and empty-state guidance. Native dialogs have opaque surfaces and contained actions. The real mapping view, fullscreen model and Neighborhood views show the intended graph states. Zoomed labels are whole and readable; partial graph nodes at the edges in the deliberately zoomed state are viewport continuation, with whole center node and legible labels. Hover labels remain readable in the overview. No sideways page scrollbar or new foreground clipping was observed.

## Clean screenshots (71)

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

## Screenshots with the minor row above (9)

- `server-clone-folder-1280.png`
- `server-clone-folder-refused-1280.png`
- `server-file-move-1280.png`
- `server-project-export-1280.png`
- `server-project-export-history-1280.png`
- `server-remote-folder-1280.png`
- `server-remote-folder-refused-1280.png`
- `server-ontology-neighborhood-labels-zoomed-1280.png`
- `server-ontology-neighborhood-hover-label-1280.png`
