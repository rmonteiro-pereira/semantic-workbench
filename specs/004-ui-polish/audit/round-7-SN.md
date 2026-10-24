# Round 7 — focused dark label follow-up SN

Reviewed **16/16** assigned PNGs individually at native resolution with original image detail.
Only `/tmp/polish-focus10/dark` was inspected. Earlier diagnostic captures were excluded.
These images contain the current uncommitted label fixes after the round 7 application capture.
Coverage is Neighborhood normal, hover label, detail-zoom labels and full-screen at widths 390,
1280, 1440 and 2560. Every image shows its intended state. The completed dark log records
16 measurements, all with zero problems. The capture runner status is zero.

The earlier S1 edge-through-text defect is resolved in the inspected detail-zoom images:
relationship counts have opaque clearance across adjacent paths. No cropped label fragments were
observed at the graph boundary. The phone hover count has a visible solid leader back to its route,
which resolves the earlier detached-count defect. Counts are readable with sufficient dark-theme
contrast. The deliberate detail zoom crops distant graph nodes as expected in a pan-and-zoom canvas.

**No S1 or S2 defects were found.** One existing S3 name-wrapping defect remains.
This focused review does not establish a clean full audit round.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-SN-1 | S3 | `local-dark-ontology-neighborhood-1440.png`<br>`local-dark-ontology-neighborhood-hover-label-1440.png`<br>`local-dark-ontology-neighborhood-fullscreen-1440.png` | DocumentReference wraps as DocumentReferen followed by a stranded ce. The name remains readable, but the two-letter continuation looks accidental. | Break at the word boundary or give the name enough room to avoid the stranded suffix. |

## Screens with no defects

- `local-dark-ontology-neighborhood-390.png`
- `local-dark-ontology-neighborhood-hover-label-390.png`
- `local-dark-ontology-neighborhood-labels-zoomed-390.png`
- `local-dark-ontology-neighborhood-fullscreen-390.png`
- `local-dark-ontology-neighborhood-1280.png`
- `local-dark-ontology-neighborhood-hover-label-1280.png`
- `local-dark-ontology-neighborhood-labels-zoomed-1280.png`
- `local-dark-ontology-neighborhood-fullscreen-1280.png`
- `local-dark-ontology-neighborhood-labels-zoomed-1440.png`
- `local-dark-ontology-neighborhood-2560.png`
- `local-dark-ontology-neighborhood-hover-label-2560.png`
- `local-dark-ontology-neighborhood-labels-zoomed-2560.png`
- `local-dark-ontology-neighborhood-fullscreen-2560.png`

Reviewed: **16/16 screenshots**. Clean screenshots: **13**.

Findings: **0 S1, 0 S2, 1 S3**.
