# Round 7 — focused local-light label follow-up SM

Reviewed **16/16** replacement images individually at native/original resolution from
`/tmp/polish-focus11/light`, following the exact `polish-focus11-review-light.txt` manifest.
All four states (normal, hover label, deliberately zoomed Labels-on, fullscreen) were reviewed
at 390, 1280, 1440 and 2560 pixels. Every image shows its intended Neighborhood view.
Earlier capture directories are excluded from this report's evidence and counts.

The completed `/tmp/polish-focus11/light.log` contains 16 measurements, all reporting
`problems=0`, with no skips. These images capture the current frozen follow-up source.

**Counts: 0 S1, 0 S2, 2 S3.** No S1 or S2 defects were observed in this focused set.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R7-SM-1 | S3 | `local-ontology-neighborhood-1440.png`, `local-ontology-neighborhood-2560.png`, `local-ontology-neighborhood-hover-label-1440.png`, `local-ontology-neighborhood-hover-label-2560.png`, `local-ontology-neighborhood-labels-zoomed-1440.png`, `local-ontology-neighborhood-labels-zoomed-2560.png` | The project list ends through a file row above its fixed lower actions, showing a filename fragment near y=675 at 1440 and y=1215 at 2560. Fixed actions remain readable. | Use a subtle scroll-edge affordance or end the initial visible list on a complete row while retaining scrolling. |
| R7-SM-2 | S3 | `local-ontology-neighborhood-1440.png`, `local-ontology-neighborhood-hover-label-1440.png`, `local-ontology-neighborhood-fullscreen-1440.png` | The bottom DocumentReference card wraps its name as “DocumentReferen” then “ce”. The complete name remains readable, but the two-letter final line is awkward. | Use word-aware display wrapping or reserve enough label width without shrinking readable type. |

The phone hover count has a visible solid vertical leader near x=115 connecting the route
around y=649 to the label above y=701. Its association is now visible. The phone zoomed view
shows complete “3 relationships” and “AgentParty” labels; isolated clipped relationship-name
fragments are absent. At larger widths, count and relationship labels have opaque backgrounds
that interrupt crossing paths before the text. All visible labels remain complete, readable
and separated from cards. No edge-through-text overlap was observed. Detail zoom intentionally
moves neighboring cards outside the viewport; complete visible labels remain interpretable.
Normal and fullscreen first views keep readable names, separated controls and card spacing.

## Screens with no defects

- `local-ontology-neighborhood-390.png`
- `local-ontology-neighborhood-hover-label-390.png`
- `local-ontology-neighborhood-labels-zoomed-390.png`
- `local-ontology-neighborhood-fullscreen-390.png`
- `local-ontology-neighborhood-1280.png`
- `local-ontology-neighborhood-hover-label-1280.png`
- `local-ontology-neighborhood-labels-zoomed-1280.png`
- `local-ontology-neighborhood-fullscreen-1280.png`
- `local-ontology-neighborhood-fullscreen-2560.png`

Reviewed: **16/16 screenshots**. Screens with no defects: **9**.
This focused review does not establish a clean full audit round.
