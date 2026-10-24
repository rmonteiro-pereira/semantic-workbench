# Round 16 — local light — LC

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Local capture PASS: 2026-10-24 19:39:06 UTC; 216 captured states, zero measurement problems.
Manifest: `/tmp/polish-round16-review-LC.txt`.

Reviewed **80/80** assigned fresh original PNGs individually at native resolution, including all four sizes. No sampling or previous-round verdict substitution. Review follows the strict audit brief: intended views, overlap, clipping, alignment, spacing, text legibility, contrast, wording, empty states, menu opacity and horizontal overflow.

**S1: 0; S2: 0; S3: 2.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-LC-1 | S3 | `local-clone-folder-1440.png`<br>`local-clone-folder-2560.png`<br>`local-clone-folder-refused-1440.png`<br>`local-clone-folder-refused-2560.png`<br>`local-file-move-1440.png`<br>`local-file-move-2560.png`<br>`local-project-export-1440.png`<br>`local-project-export-2560.png`<br>`local-project-export-history-1440.png`<br>`local-project-export-history-2560.png`<br>`local-remote-folder-1440.png`<br>`local-remote-folder-2560.png`<br>`local-remote-folder-preview-1440.png`<br>`local-remote-folder-preview-2560.png`<br>`local-mapping-graph-2560.png`<br>`local-ontology-neighborhood-labels-zoomed-1440.png`<br>`local-ontology-neighborhood-labels-zoomed-2560.png`<br>`local-ontology-neighborhood-hover-label-1440.png`<br>`local-ontology-neighborhood-hover-label-2560.png` | The last visible sidebar file row is partly hidden by the fixed footer. A fragment remains above the footer, rather than a whole row. This repeats the minor partial-row observation F118. | Leave only whole rows visible above the footer, or make the scroll boundary clearer. |
| R16-LC-2 | S3 | `local-ontology-neighborhood-fullscreen-1440.png`<br>`local-ontology-neighborhood-hover-label-1440.png` | At 1440 px, DocumentReference wraps with the final “ce” stranded on its own second line. The full name remains inside the card and readable. | Prefer balanced wrapping or a consistent ellipsis with the full name available. |

All intended views are present. Local Admin grants, users and sessions explain their local-mode absence; Settings explicitly names the unconfigured host policy. Audit contains actual records. Mapping scope counts and visible subsets are clear. Dialogs are opaque and contained; local folder preview lists paths. Fullscreen graph titles and counts remain readable. Neighborhood overview hover labels and zoomed labels are whole and readable; zoomed peripheral nodes continuing beyond the canvas are an intentional zoomed view. No serious overlap, clipping, low-contrast text, illegible labels or sideways page scrolling was observed.

## Clean filenames (60)

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

The 20 distinct affected filenames appear in the rows above; together with the clean list they account for all 80 assigned originals.

