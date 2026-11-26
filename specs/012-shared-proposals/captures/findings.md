# Proposals: measured findings

15 images; measurements refer only to the stated crop at its recorded CSS size.

The existing proposals component harness supplies these states. The list crop is the rendered main region, not the desktop viewport width.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

- [loading-light-1280.png](loading-light-1280.png): `p.scm-empty Loading proposals…`

All other pictured crops: none found.

## Text overlap or coverage measurements

none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. Proposal states and actions have visible words.

## Requested states without an image

None in the listed state matrix.
