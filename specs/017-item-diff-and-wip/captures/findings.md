# Unpublished comparison: measured findings

12 images; measurements refer only to the stated crop at its recorded CSS size.

The baseline supplies the published and saved working definitions. Empty/loading/error/long-name comparison answers are injected at the existing item-diff route. The publication review opens with an ahead-count fixture; it does not publish.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

none found.

## Text overlap or coverage measurements

- `comparison-long-names-light-1280.png`: `"A_very_long_definition_name_A_" overlaps "Not published: changed"`; `"A_very_long_definition_name_A_" overlaps "Not published: added"`; `"A_very_long_definition_name_A_" overlaps "Not published: removed"`

All other pictured crops: none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. Added, changed and removed each have a visible Not published label and a dashed outline.

## Requested states without an image

None in the listed state matrix.
