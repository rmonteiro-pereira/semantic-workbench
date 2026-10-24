# Round 13 — LC — local light

Frozen head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.

Reviewed every one of the 80 assigned fresh native originals individually at original detail,
with no sampling or substitution of prior verdicts. The local capture passed at
2026-10-24T13:35:44Z: 216 screenshots and zero measured problems. Read evidence in
`/tmp/polish-round13/local/capture.log` and `/tmp/polish-round13/progress.log`.
Exact manifest: `/tmp/polish-round13-review-LC.txt`.

All four widths (390, 1280, 1440, 2560) include eight Admin views with local empty-state
explanations, larger UBL graphs in both full-screen modes, real Commerce mappings, folder
move preview, clone refusal, exports, and Neighborhood hover and zoomed label states.

**No S1 or S2 defects found. Totals: S1: 0; S2: 0; S3: 2.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-LC-1 | S3 | `local-clone-folder-1440.png`, `local-clone-folder-refused-1440.png`, `local-file-move-1440.png`, `local-project-export-1440.png`, `local-project-export-history-1440.png`, `local-remote-folder-1440.png`, `local-remote-folder-preview-1440.png`, `local-clone-folder-2560.png`, `local-clone-folder-refused-2560.png`, `local-file-move-2560.png`, `local-mapping-graph-2560.png`, `local-project-export-2560.png`, `local-project-export-history-2560.png`, `local-remote-folder-2560.png`, `local-remote-folder-preview-2560.png`, `local-ontology-neighborhood-labels-zoomed-1440.png`, `local-ontology-neighborhood-labels-zoomed-2560.png`, `local-ontology-neighborhood-hover-label-1440.png`, `local-ontology-neighborhood-hover-label-2560.png` | The sidebar file list ends with a narrow fragment of its next row immediately above the fixed footer. At 1440, the first Commerce file is only partly exposed; at 2560, a subsequent mapped file or its type line is partly exposed. This repeats minor issue F118. | Add sufficient bottom inset or choose a whole-row resting boundary so the next filename/type does not appear as a stranded fragment. |
| R13-LC-2 | S3 | `local-ontology-neighborhood-fullscreen-1440.png`, `local-ontology-neighborhood-hover-label-1440.png` | The lower DocumentReference card wraps its final two letters `ce` onto a line of their own. The name remains readable, but the word break looks awkward beside the other single-line entity names. This repeats F119. | Break the name at its word boundary or give the title enough width to avoid a two-letter orphan. |

The explicitly zoomed label views intentionally display a detailed portion of the graph;
neighbor cards outside this detail viewport are not initial fitted-view clipping. Visible
relationship labels remain whole, legible and clear of cards. The fitted/full-screen graph
views were inspected separately for card containment and edge collisions.

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

Reviewed **80/80** originals: 60 without defects; 20 covered by the two repeated S3 rows.
