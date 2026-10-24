# Round 7 — focused local-light follow-up SJ

Reviewed **28/28** assigned screenshots individually at original/native resolution: Admin access
grants, Projects access, Settings, and Neighborhood normal, fullscreen, hover-label and deliberately
zoomed Labels-on states at 390, 1280, 1440 and 2560 pixels. All show their intended view.
Only current `/tmp/polish-focus8` images are included; earlier diagnostic attempts are excluded.
These capture the uncommitted follow-up changes after the round-7 application head.

The completed `light-admin-.log` has 32 measurements and 32 PNGs; the completed
`light-ontology-neighborhood.log` has 16 measurements and 16 PNGs. Every measurement reports
`problems=0`. This review covers the exact 28-image manifest, not all Admin captures.

**Counts: 0 S1, 2 S2, 2 S3.** No S1 was found. Two S2 label-placement issues remain.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-SJ-1 | S2 | `local-ontology-neighborhood-hover-label-390.png` | The hover label “2 relationships” is placed at approximately x=68, y=701, below the lowest neighbor card. It has no visible leader or adjacent edge; the visible edge cluster ends around y=655. The floating count is readable but does not clearly identify which route it describes. | Keep the label adjacent to a visible segment of its highlighted route, or connect an offset label to that route with a clear leader. |
| R7-SJ-2 | S2 | `local-ontology-neighborhood-labels-zoomed-390.png` | In the deliberately zoomed Labels-on state, the left canvas boundary at x=7 cuts several relationship names into isolated fragments near y=458, 649 and 742, while the center Party card is fully visible. These fragments are confusing labels in the current detail view. | Place each visible label wholly inside the canvas beside its visible route segment; suppress labels with no suitable visible segment until panning reveals one. |
| R7-SJ-3 | S3 | `local-ontology-neighborhood-1440.png`, `local-ontology-neighborhood-2560.png`, `local-ontology-neighborhood-hover-label-1440.png`, `local-ontology-neighborhood-hover-label-2560.png`, `local-ontology-neighborhood-labels-zoomed-1440.png`, `local-ontology-neighborhood-labels-zoomed-2560.png` | The project list ends through the next file row above its fixed lower actions: a filename fragment near y=675 at 1440 and near y=1215 at 2560. Actions remain readable. | Add a subtle scroll-edge affordance or finish the initial viewport on a complete row while retaining independent scrolling. |
| R7-SJ-4 | S3 | `local-ontology-neighborhood-1440.png`, `local-ontology-neighborhood-hover-label-1440.png`, `local-ontology-neighborhood-fullscreen-1440.png` | DocumentReference wraps as “DocumentReferen” then “ce” in the bottom neighbor card. The full name remains readable, but its two-letter last line looks awkward. | Use word-aware display wrapping or reserve enough name width without reducing readable type. |

The Admin grants empty state now explains local full access and names Add grant as the next
step. Settings explains why provider settings and sessions differ in local mode. Projects access
uses distinct “Preview project access” and “Preview agent grants” actions with matching guidance.
These changes are clear and fit the phone layout. At larger widths, the inspected count labels
are readable and complete; label backgrounds keep route crossings out of the text. Normal and
fullscreen graphs have clear card separation and usable toolbar geometry. The deliberate detail
zoom can naturally move neighboring cards outside the canvas; the label-fragment row concerns
visible text fragments rather than requiring all cards to remain fitted at detail zoom.

## Screens with no defects

- `local-admin-grants-390.png`
- `local-admin-projects-390.png`
- `local-admin-settings-390.png`
- `local-ontology-neighborhood-390.png`
- `local-ontology-neighborhood-fullscreen-390.png`
- `local-admin-grants-1280.png`
- `local-admin-projects-1280.png`
- `local-admin-settings-1280.png`
- `local-ontology-neighborhood-1280.png`
- `local-ontology-neighborhood-fullscreen-1280.png`
- `local-admin-grants-1440.png`
- `local-admin-projects-1440.png`
- `local-admin-settings-1440.png`
- `local-admin-grants-2560.png`
- `local-admin-projects-2560.png`
- `local-admin-settings-2560.png`
- `local-ontology-neighborhood-fullscreen-2560.png`
- `local-ontology-neighborhood-labels-zoomed-1280.png`
- `local-ontology-neighborhood-hover-label-1280.png`

Reviewed: **28/28 screenshots**. Screens with no defects: **19**.
This focused follow-up does not establish a clean full audit round.
