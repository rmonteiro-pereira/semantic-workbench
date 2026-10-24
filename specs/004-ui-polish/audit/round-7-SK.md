# Round 7 — focused local dark follow-up SK

Reviewed **28/28** assigned screenshots individually at native resolution with original image detail.
Only the current `/tmp/polish-focus8` captures were used. No diagnostic directories were reviewed.
This captures the uncommitted fixes after `8238230f37d34466aed550c3dc930b7cd71478a7`.
The assignment covers Admin grants, projects and settings, plus Neighborhood normal, full-screen,
detail-zoom labels and hover labels at 390, 1280, 1440 and 2560 pixels.
All screenshots show their intended view. The completed Admin log has 32 measurements and the
Neighborhood log has 16 measurements, all with zero problems. The runner status is zero.

The earlier five serious defects are visibly improved: the full-screen 1280 relationship count is
readable; Access grants explains local access and the next step; Allowed hosts has an explicit
None configured value; Active sessions has guidance; and project and agent previews name their
scope and explain what they preview. Remaining label placement defects are recorded below.
No additional dark-theme contrast defect was observed. This focused result is not a clean round.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-SK-1 | S1 | `local-dark-ontology-neighborhood-labels-zoomed-1280.png`<br>`local-dark-ontology-neighborhood-labels-zoomed-1440.png` | In detail zoom, adjacent vertical purple edges cross relationship-count text. At 1280 this affects the top “2 relationships” and bottom “3 relationships”. At 1440 it affects the top “17 relationships”, middle “2 relationships” and bottom “3 relationships”. The line strokes visibly pass through the letters instead of clearing the labels. | Give each count an opaque background that clears every crossing edge, or place it in a clear lane while preserving an explicit edge association. |
| R7-SK-2 | S2 | `local-dark-ontology-neighborhood-hover-label-390.png` | The hovered “2 relationships” count sits by itself below the graph, near y=702, around 50 pixels below the nearest card. No visible edge or leader reaches the count. Its association with a relationship is unclear. | Keep the hover count beside its edge, or connect the displaced label to that edge with a visible leader. |
| R7-SK-3 | S3 | `local-dark-ontology-neighborhood-1440.png`<br>`local-dark-ontology-neighborhood-fullscreen-1440.png`<br>`local-dark-ontology-neighborhood-hover-label-1440.png` | DocumentReference wraps as DocumentReferen followed by a stranded ce. The name remains readable, but the two-letter continuation looks accidental. | Break at the word boundary or give the name enough room to avoid the stranded suffix. |

## Screens with no defects

- `local-dark-admin-grants-390.png`
- `local-dark-admin-projects-390.png`
- `local-dark-admin-settings-390.png`
- `local-dark-ontology-neighborhood-390.png`
- `local-dark-ontology-neighborhood-fullscreen-390.png`
- `local-dark-admin-grants-1280.png`
- `local-dark-admin-projects-1280.png`
- `local-dark-admin-settings-1280.png`
- `local-dark-ontology-neighborhood-1280.png`
- `local-dark-ontology-neighborhood-fullscreen-1280.png`
- `local-dark-admin-grants-1440.png`
- `local-dark-admin-projects-1440.png`
- `local-dark-admin-settings-1440.png`
- `local-dark-admin-grants-2560.png`
- `local-dark-admin-projects-2560.png`
- `local-dark-admin-settings-2560.png`
- `local-dark-ontology-neighborhood-2560.png`
- `local-dark-ontology-neighborhood-fullscreen-2560.png`
- `local-dark-ontology-neighborhood-labels-zoomed-390.png`
- `local-dark-ontology-neighborhood-labels-zoomed-2560.png`
- `local-dark-ontology-neighborhood-hover-label-1280.png`
- `local-dark-ontology-neighborhood-hover-label-2560.png`

Reviewed: **28/28 screenshots**. Clean screenshots: **22**.

Findings: **1 S1, 1 S2, 1 S3**.
