# Round 6 focused server light follow-up

Reviewed the strict audit brief and the three corresponding external capture logs first.
All 44 measurements report `problems=0`; no skips were recorded.
Every one of the 44 PNGs was inspected individually at native resolution with original detail.
These captures include uncommitted fixes after `5e3738a`; they are a focused follow-up,
not a complete clean round across every mode and theme.

Capture roots:

- `/tmp/polish-r6-admin-light/` — 32 images.
- `/tmp/polish-r6-mapping-light/` — 4 images.
- `/tmp/polish-r6-neighbor-server-light/` — 8 images.

**Counts: 0 S1, 2 S2, 2 S3. No S1 found.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R6-SG-1 | S2 | `server-admin-projects-1440.png`; `server-admin-projects-2560.png` | Below Listed Stewards, the explanatory text says “Assign roles in Roles & access.” The visible navigation names that destination “Access grants,” so the instruction points to a name absent from this screen. | Use the visible destination name “Access grants” in the instruction. |
| R6-SG-2 | S2 | `server-admin-access-check-390.png`; `server-admin-access-check-1280.png`; `server-admin-access-check-1440.png`; `server-admin-access-check-2560.png` | The first input is labeled only “Principal,” without an example or explanation of the expected identifier. Both action buttons are disabled and there is no visible required-field or completion guidance. A first-time user cannot tell what form of person identifier to enter or which blank fields are needed. | Use a plain person/identity label with an accepted-value example and a short instruction explaining what is needed to enable each action. |
| R6-SG-3 | S3 | `server-ontology-neighborhood-fullscreen-390.png` | The fullscreen phone graph makes the Order, Customer and Identifier card names visibly smaller than in the normal 390 px view and smaller than the “Center: Customer” toolbar text. Their appearance is closer to the neighbor-count metadata, despite the taller fullscreen canvas. The action icons remain distinct. This is a relative legibility concern; the screenshot alone does not establish an exact font size. | Consider retaining the normal phone card-name scale in fullscreen while preserving the existing minimum font-size assertion. |
| R6-SG-4 | S3 | `server-ontology-neighborhood-1280.png` | The 1280 px sidebar viewport ends around y502 through the first finance/revenue file row, leaving only a filename fragment above the fixed lower actions. | Add a subtle scroll-edge affordance or end the initially visible list at a complete row. |

The Roles matrix now uses natural row heights without giant empty rows. Admin lists retain
consistent baselines and spacing. Selected and neighboring phone tabs are readable and fit
between the navigation chevrons. The captured Roles page uses lock icons; a role-detail surface
showing the literal “Built-in role” label is not present, so that specific wording is unverified.

Mapping counts explicitly distinguish “2 reachable assets” from “3 total assets”; the phone
also distinguishes “1 of 2 cards shown.” Mapping cards and connectors are clear at all sizes.
Neighborhood cards have gaps, their connectors avoid text, and normal/fullscreen desktop
controls remain separated. No see-through surface, sideways page scrollbar or control overlap
was observed. Ordinary content continuing below the vertical page fold is not broken clipping.
Closed Controls menus and behavior beyond the captured states are outside this review.

Screens with no defects:

- server-admin-audit-1280.png
- server-admin-audit-1440.png
- server-admin-audit-2560.png
- server-admin-audit-390.png
- server-admin-grants-1280.png
- server-admin-grants-1440.png
- server-admin-grants-2560.png
- server-admin-grants-390.png
- server-admin-policies-1280.png
- server-admin-policies-1440.png
- server-admin-policies-2560.png
- server-admin-policies-390.png
- server-admin-projects-1280.png
- server-admin-projects-390.png
- server-admin-roles-1280.png
- server-admin-roles-1440.png
- server-admin-roles-2560.png
- server-admin-roles-390.png
- server-admin-settings-1280.png
- server-admin-settings-1440.png
- server-admin-settings-2560.png
- server-admin-settings-390.png
- server-admin-users-1280.png
- server-admin-users-1440.png
- server-admin-users-2560.png
- server-admin-users-390.png
- server-mapping-graph-1280.png
- server-mapping-graph-1440.png
- server-mapping-graph-2560.png
- server-mapping-graph-390.png
- server-ontology-neighborhood-1440.png
- server-ontology-neighborhood-2560.png
- server-ontology-neighborhood-390.png
- server-ontology-neighborhood-fullscreen-1280.png
- server-ontology-neighborhood-fullscreen-1440.png
- server-ontology-neighborhood-fullscreen-2560.png

**Screenshots reviewed: 44 of 44.**
