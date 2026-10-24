# Round 14 — SC server light native visual audit

Head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Capture: server light, PASS 2026-10-24 17:24:53 UTC in
`/tmp/polish-round14/progress.log`. Read `/tmp/polish-round14/server/capture.log`;
the completed mode contains 216 measured captures with zero reported geometry problems.
This partition reviewed all 80 exact originals in `/tmp/polish-round14-review-SC.txt`
individually at native original detail, including every assigned view at all four sizes.
No sampling, contact sheets, or earlier audit verdict substitution.

**S1: 0; S2: 0; S3: 1.** Nine affected images; 71 clean images.
No S1 or S2 defect was observed.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-SC-1 | S3 | `server-clone-folder-1280.png`; `server-clone-folder-refused-1280.png`; `server-file-move-1280.png`; `server-project-export-1280.png`; `server-project-export-history-1280.png`; `server-remote-folder-1280.png`; `server-remote-folder-refused-1280.png`; `server-ontology-neighborhood-labels-zoomed-1280.png`; `server-ontology-neighborhood-hover-label-1280.png` | At the bottom of the sidebar file list, the top of the next file row is exposed immediately above the footer divider. This repeats the minor partial-row polish issue F118. | End the visible list on a complete row boundary or provide clearance above the fixed footer. |

The eight Admin sections are present and their phone navigation labels are whole.
Forms, permission tables and explanatory text remain readable. Clone, Move, Export
and remote dialogs have opaque surfaces, consistent spacing and visible actions.
The refusal variants explain the folder restriction. Mapping cards show the actual
concept, dataset and field connection. Fullscreen graph and Neighborhood views fit
their cards. Hover and detail-zoom relationship labels remain readable and clear of
card text. The explicit detail-zoom state is a zoomed canvas portion; the separate
fitted and fullscreen views establish the initial whole-graph presentation.
No sideways page scrollbar or serious contrast issue was observed.

Screens with no defects (71):

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

Reviewed: **80/80**. The nine filenames in the finding and 71 clean filenames
account for every assigned original exactly once.
