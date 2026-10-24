# Round 6 — focused server dark follow-up

Reviewed **44/44** PNGs individually at native resolution using original image detail.
These captures show uncommitted fixes after `5e3738a`; they are distinct from the frozen tour.
Read the audit brief and all three external capture logs before reviewing the images.
The logs report 32 admin, 4 mapping and 8 Neighborhood measurements, all with zero problems.
No skipped capture was reported. All intended views match their filenames.

Found **0 S1, 2 S2 and 0 S3** rows. This focused review does not establish a complete clean round.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R6-SH-1 | S2 | `server-dark-admin-access-check-1280.png`, `server-dark-admin-access-check-1440.png`, `server-dark-admin-access-check-2560.png`, `server-dark-admin-access-check-390.png` | The access form labels an empty field only “Principal”. No example explains which identifier to enter. Both actions are disabled, and no visible guidance says which fields each action requires. A first-time administrator cannot determine how to begin from this screen. | Use a plain-language label with identifier guidance, mark required fields and explain what enables each action. |
| R6-SH-2 | S2 | `server-dark-admin-projects-1440.png`, `server-dark-admin-projects-2560.png` | Beneath Listed Stewards, the help text directs the user to “Assign roles in Roles & access.” The visible navigation contains Access grants and Roles, with no Roles & access destination. | Name the existing Access grants destination consistently in this instruction. |

Mapping cards, connecting lines, toolbar and legend remain legible at all four sizes.
Neighborhood cards and edges remain distinct with no collisions. The fullscreen phone view
has smaller names than the ordinary view, but all three names remain readable at native size;
this relative scale difference alone did not warrant a defect row. Phone Controls remains clear.
The admin tables and phone cards have consistent dark surfaces and readable text. Ordinary
vertical scrolling at the viewport bottom was not treated as clipping.

Image roots and corresponding logs:

- `/tmp/polish-r6-admin-dark` and `/tmp/polish-r6-admin-dark.log`
- `/tmp/polish-r6-mapping-dark` and `/tmp/polish-r6-mapping-dark.log`
- `/tmp/polish-r6-neighbor-server-dark` and `/tmp/polish-r6-neighbor-server-dark.log`

Screens with no defects:

- `server-dark-admin-audit-1280.png`
- `server-dark-admin-audit-1440.png`
- `server-dark-admin-audit-2560.png`
- `server-dark-admin-audit-390.png`
- `server-dark-admin-grants-1280.png`
- `server-dark-admin-grants-1440.png`
- `server-dark-admin-grants-2560.png`
- `server-dark-admin-grants-390.png`
- `server-dark-admin-policies-1280.png`
- `server-dark-admin-policies-1440.png`
- `server-dark-admin-policies-2560.png`
- `server-dark-admin-policies-390.png`
- `server-dark-admin-projects-1280.png`
- `server-dark-admin-projects-390.png`
- `server-dark-admin-roles-1280.png`
- `server-dark-admin-roles-1440.png`
- `server-dark-admin-roles-2560.png`
- `server-dark-admin-roles-390.png`
- `server-dark-admin-settings-1280.png`
- `server-dark-admin-settings-1440.png`
- `server-dark-admin-settings-2560.png`
- `server-dark-admin-settings-390.png`
- `server-dark-admin-users-1280.png`
- `server-dark-admin-users-1440.png`
- `server-dark-admin-users-2560.png`
- `server-dark-admin-users-390.png`
- `server-dark-mapping-graph-1280.png`
- `server-dark-mapping-graph-1440.png`
- `server-dark-mapping-graph-2560.png`
- `server-dark-mapping-graph-390.png`
- `server-dark-ontology-neighborhood-1280.png`
- `server-dark-ontology-neighborhood-1440.png`
- `server-dark-ontology-neighborhood-2560.png`
- `server-dark-ontology-neighborhood-390.png`
- `server-dark-ontology-neighborhood-fullscreen-1280.png`
- `server-dark-ontology-neighborhood-fullscreen-1440.png`
- `server-dark-ontology-neighborhood-fullscreen-2560.png`
- `server-dark-ontology-neighborhood-fullscreen-390.png`

Clean screenshots: **38/44**. Reviewed screenshots: **44/44**.
