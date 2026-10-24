# Round 7 — leader diagnostic

Inspected the native phone hover capture from the label-layer diagnostic at
`/tmp/polish-label-layer-diagnostic/local-ontology-neighborhood-hover-label-390.png`.
This is one diagnostic image, not a complete round.

| # | Severity | Screen and size | Defect | Fix |
| --- | --- | --- | --- | --- |
| R7-SL-1 | S2 | Neighborhood hover label, 390 | The leader exists geometrically, but scaled short dashes almost disappear beside the count. Pixel inspection confirms mostly near-background paint. | Use a solid, non-scaling 1.5 px leader and assert its screen width and dash legibility. |
