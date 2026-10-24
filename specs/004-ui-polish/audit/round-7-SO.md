# Round 7 — attribution legibility diagnostic

Inspected the native phone Neighborhood image
`/tmp/polish-focus11/light/local-ontology-neighborhood-390.png`. This one-image diagnostic
is not a complete round.

| # | Severity | Screen and size | Defect | Fix |
| --- | --- | --- | --- | --- |
| R7-SO-1 | S2 | Neighborhood, 390 | The React Flow attribution at the lower right is visibly smaller than interface text. Its library stylesheet sets 10 px, below the 12 px floor. | Use the shared small-text and muted tokens, with an opaque theme background; include attribution in ordinary legibility checks. |
