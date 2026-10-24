# Round 13 — LF — local dark

Frozen head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Reviewed all 80 fresh assigned originals individually at original detail, without sampling
or substituting a previous verdict. Local-dark capture passed at 2026-10-24T13:41:48Z:
216 screenshots and zero measured problems. Evidence was read in
`/tmp/polish-round13/local-dark/capture.log` and `/tmp/polish-round13/progress.log`.
Exact manifest: `/tmp/polish-round13-review-LF.txt`.

The four widths are 390, 1280, 1440 and 2560. All intended views are present: eight Admin
pages at each width, clone and refusal, local file move and preview, remote setup,
exports, real Commerce mapping graph, both ontology full-screen graphs, Neighborhood
hover labels and manually zoomed relationship labels. Local Admin empty states explain
local access and the absence of server users, grants and sessions.

**No S1 or S2 defects found. Totals: S1: 0; S2: 0; S3: 2.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-LF-1 | S3 | `local-dark-clone-folder-1440.png`, `local-dark-clone-folder-refused-1440.png`, `local-dark-file-move-1440.png`, `local-dark-project-export-1440.png`, `local-dark-project-export-history-1440.png`, `local-dark-remote-folder-1440.png`, `local-dark-remote-folder-preview-1440.png`, `local-dark-clone-folder-2560.png`, `local-dark-clone-folder-refused-2560.png`, `local-dark-file-move-2560.png`, `local-dark-mapping-graph-2560.png`, `local-dark-project-export-2560.png`, `local-dark-project-export-history-2560.png`, `local-dark-remote-folder-2560.png`, `local-dark-remote-folder-preview-2560.png`, `local-dark-ontology-neighborhood-labels-zoomed-1440.png`, `local-dark-ontology-neighborhood-labels-zoomed-2560.png`, `local-dark-ontology-neighborhood-hover-label-1440.png`, `local-dark-ontology-neighborhood-hover-label-2560.png` | A thin fragment of the next sidebar file row remains visible directly above the fixed footer. At 1440 the first Commerce filename is partly exposed; at 2560 a mapped filename or type line is partly exposed. This repeats F118. | Reserve bottom inset or stop at a whole-row boundary so a filename or type is not exposed as a stranded fragment. |
| R13-LF-2 | S3 | `local-dark-ontology-neighborhood-fullscreen-1440.png`, `local-dark-ontology-neighborhood-hover-label-1440.png` | The lower DocumentReference card wraps its final `ce` onto a separate line. The name remains readable but the two-letter orphan is awkward beside neighboring names. This repeats F119. | Wrap at the word boundary or provide enough title width to keep the final letters together. |

The manually zoomed label screenshots show a detailed portion of the graph, rather than
an initial fitted view. Neighbor cards outside that viewport are consistent with this
explicit zoom state. Visible relationship labels are whole and legible; their opaque
backgrounds keep routes from painting through text. Fitted and full-screen views were
separately inspected for card containment and edge collisions. No sideways page scrollbar,
see-through menu or unreadable foreground dialog was found.

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

Reviewed **80/80** originals: 60 without defects; 20 covered by the two repeated S3 rows.
