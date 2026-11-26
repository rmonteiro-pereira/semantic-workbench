# Traffic: measured findings

15 images; measurements refer only to the stated crop at its recorded CSS size.

Usage responses come from the existing usage fixture. The ready details crop reads 1,200,000 requests through this workbench in the last 30 days. Full Graph ready is pictured at 360, 768 and 1280 in both themes. The counters-off baseline uses local Admin capabilities; the non-Admin crop uses read-only server capabilities.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

- `graph-loading-light-1280.png`: `p.traffic-legend traffic-loading Loading requests through this workbench…`

All other pictured crops: none found.

## Text overlap or coverage measurements

none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

Neighbourhood card group membership is shown by differently coloured border strips without a visible group name on each card in neighbourhood-on-light-1280.png. Traffic itself also varies ring thickness and bar length, and the details crop gives the count in words.

## Requested states without an image

The bounded matrix reached the 110-image limit across the eight folders. The following variants have no image or geometry/contrast measurement:

- Neighbourhood: empty, counters off for Admin and non-Admin, loading, error, partial and long names at light 1280. Its ready Traffic view is pictured.
- Details: empty, counters off for Admin and non-Admin, loading, error, partial and long names at light 1280. Its 1,200,000-request view is pictured.
