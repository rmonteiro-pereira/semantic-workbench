# Round 5 focused local graph review

Independent visual review of all 16 frozen light-theme captures in
`/tmp/polish-graph-green2` and `/tmp/polish-neighborhood-green2`.
Both adjacent `.log` files contain eight measurements and report zero geometry problems.
Normal and full-screen views were inspected at 390, 1280, 1440 and 2560 pixels.
This focused check does not establish a clean full audit round.

Counts: **2 S1, 2 S2, 1 S3**.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R5-LF-1 | S1 | `/tmp/polish-neighborhood-green2/local-ontology-neighborhood-fullscreen-390.png` | The open Controls panel clips its expansion direction selector at the right edge. The Both segment starts around x356 and its text is cut off at the panel boundary around x381. | Wrap the expansion label and segmented selector onto their own row so every segment fits inside the panel. |
| R5-LF-2 | S1 | `/tmp/polish-graph-green2/local-ontology-graph-fullscreen-390.png`; `/tmp/polish-neighborhood-green2/local-ontology-neighborhood-fullscreen-390.png` | Controls panels are detached far below their top-row triggers: graph panel begins around y265 and neighborhood around y228, while triggers end around y39. The graph panel covers all three top-row area headings, leaving only their entity counts visible. | Anchor each panel immediately below its Controls trigger, within the available viewport width. Keep its occupied area above the fitted graph content. |
| R5-LF-3 | S2 | `/tmp/polish-graph-green2/local-ontology-graph-2560.png`; `/tmp/polish-graph-green2/local-ontology-graph-fullscreen-2560.png` | The expanded first view has a dense mesh of inter-area lines through the interiors of Trading parties, Fulfillment & transport and Business documents. Numerous routes cross and double back through adjacent areas, making individual connections difficult to follow despite their stronger strokes. | Route inter-area connections through reserved gutters outside the area interiors and separate coincident paths. Preserve the readable entity names and heading backing. |
| R5-LF-4 | S2 | `/tmp/polish-neighborhood-green2/local-ontology-neighborhood-2560.png`; `/tmp/polish-neighborhood-green2/local-ontology-neighborhood-fullscreen-2560.png` | Full-detail neighbor cards directly abut vertically: Invoice/InvoiceLine/Item, the six-card middle column, and Address/Contact/FinancialAccount have no visible inter-card gap. Their rounded borders touch and the stacks read as crowded continuous panels. | Include the full-detail card height in vertical spacing and retain a visible gap between neighboring cards before fitting the view. |
| R5-LF-5 | S3 | `/tmp/polish-neighborhood-green2/local-ontology-neighborhood-1440.png` | DocumentReference wraps as “DocumentReferen” followed by “ce”, creating a stranded two-letter second line. | Prefer a wider compact card or a meaningful break between Document and Reference. |

The counted area first views at narrower sizes are intentional and are not reported as missing
entities. Their two-line headings are clear when unobscured. The stronger neighborhood edges are
visible without crossing card text, and compact cards do not overlap. The phone walk controls and
Other files action share a row successfully in both neighborhood captures. Full-screen exit actions
are legible; the phone panel placement and clipped selector remain the exceptions above.
Entity names appear readable at native capture size; no additional under-12-pixel name defect was
identified. This static review does not infer tooltip or click behavior.

Screens with no defects:

- local-ontology-graph-390.png
- local-ontology-graph-1280.png
- local-ontology-graph-1440.png
- local-ontology-graph-fullscreen-1280.png
- local-ontology-graph-fullscreen-1440.png
- local-ontology-neighborhood-390.png
- local-ontology-neighborhood-1280.png
- local-ontology-neighborhood-fullscreen-1280.png
- local-ontology-neighborhood-fullscreen-1440.png

**Screenshots reviewed: 16 of 16.** Every assigned screenshot shows its intended graph or
neighborhood view, with the expected normal or full-screen shell.
