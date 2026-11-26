# Agent panel: measured findings

8 images; measurements refer only to the stated crop at its recorded CSS size.

The dark 1280 and light 390 open-empty images show the waiting Agent panel itself. The light 1280 open-empty image shows Connect your agent. The connected conversation uses the loopback reference relay.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

- `closed-light-1280.png`: `div.full-graph-loading Arranging 10 graph nodes…`

All other pictured crops: none found.

## Text overlap or coverage measurements

- `closed-light-1280.png`: `"React Flow" is covered by div.full-graph-loading`; `"Color = area · Line = relation" is covered by div.full-graph-loading`

All other pictured crops: none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. The panel names Waiting for your agent, Connected and the error in text; conversation entries name You and Agent.

## Requested states without an image

None in the listed state matrix.

## Judged from the images

- Fix: in `long-text-light-1280.png` the long agent message is cut at the composer with no sign that more text follows.
- Fix: `connecting-light-1280.png` cannot be told apart from the waiting panel.
- Fix (capture): `closed-light-1280.png` was taken while the graph still showed "Arranging 10 graph nodes…".
- Minor: the error text has no emphasis, the bullet list uses a larger font, and the 390 px title is not centred with its close button.
