# Compile and entry points: measured findings

14 images; measurements refer only to the stated crop at its recorded CSS size.

The 1-loss, 200-loss, refused and nothing-to-do check answers are derived from the existing Retail fixture. The 1-loss and 200-loss groups are expanded. Released uses the real three-loss Retail compile acceptance. The export and validation entry points are pictured. The convert dialog is excluded.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

- [loading-light-1280.png](loading-light-1280.png): `div.compile-placeholder Checking the project…`

All other pictured crops: none found.

## Text overlap or coverage measurements

- [loss-200-dark-1280.png](loss-200-dark-1280.png): `"200 values" overlaps ". Your project is not changed;"`; `"will be dropped" overlaps ". Your project is not changed;"`
- [loss-200-light-1280.png](loss-200-light-1280.png): `"200 values" overlaps ". Your project is not changed;"`; `"will be dropped" overlaps ". Your project is not changed;"`
- [loss-200-light-390.png](loss-200-light-390.png): `"200 values" overlaps ". Your project is not changed;"`; `"will be dropped" overlaps ". Your project is not changed;"`

All other pictured crops: none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. Compile outcomes have explicit text and symbols; acceptance and download actions are labelled.

## Requested states without an image

None in the listed state matrix.
