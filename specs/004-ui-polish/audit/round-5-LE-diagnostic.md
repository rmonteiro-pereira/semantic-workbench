# Round 5 LE: incomplete local-light diagnostic

The coordinator inspected these two phone images before stopping the incomplete local batch.
This is diagnostic evidence, not an independent or complete local review. The complete server
reviews are recorded separately in round-5-SA through SD.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R5-LE-1 | S1 | local-ontology-graph-390.png | Wrapped Business documents, Products & pricing, Fulfillment & transport and Payment & finance headings collide with their count cards. The count card covers the second title line. | Reserve two title lines in the group layout, bound title wrapping and retain the full-title tooltip. |
| R5-LE-2 | S2 | local-ontology-neighborhood-390.png | The phone toolbar separates the walk controls and Other files onto different rows. The resulting canvas occupies only about 54% of the screen, below its existing 55% geometry floor. | Let the walk controls and Other files share a row. |

The apparent touching Neighborhood cards did not reproduce as overlapping card rectangles.
Their existing non-overlap assertion passed; no card-placement change is justified by this image.
The graph title and edge checks were previously absent from generic capture measurement. The
strengthened capture reproduced four heading collisions plus insufficient edge contrast, then
stopped as intended. The Neighborhood capture reproduced the canvas-height failure.

Screens with no defects: none in this diagnostic subset.

Reviewed: 2 images. Rows: 1 S1, 1 S2, 0 S3. The full round remains open, also because the independent
dark-server review found insufficient relationship-line contrast. A new full capture is required.
