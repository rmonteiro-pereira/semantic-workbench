# Definition attributes, governance and agent context: measured findings

12 images; measurements refer only to the stated crop at its recorded CSS size.

Attributes are cropped directly to their section, Governance to its section, and Agent context to its three input fields. The attribute error is an injected failed save. The read-only Governance view uses read-only project capabilities.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

- `agent-context-populated-long-text-light-1280.png`: `textarea. Prefer the published customer definition. Prefer the published customer definition. Prefer the publi: scroll 247×260, client 247×108`

All other pictured crops: none found.

## Visible ellipsis or three dots

none found.

## Text overlap or coverage measurements

none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. Deprecated has a visible word and strike-through; read-only values and form labels remain textual.

## Requested states without an image

The bounded matrix reached the 110-image limit across the eight folders. The following variants have no image or geometry/contrast measurement:

- Attributes: the empty state at light 360. Populated long names and save errors are pictured at 1280 and 360 in both themes.
- Governance: empty, error and long-text forms; populated dark 1280, light 360 and dark 360 variants. The light 1280 deprecated and read-only states are pictured.
- Agent context: empty and error states; populated dark 1280, light 360 and dark 360 variants. Its populated long-text fields are pictured at light 1280.
- Read-only and deprecated item views at light 360. The corresponding Governance views are pictured at light 1280.

## Judged from the images

- Fix: in the four `attribute-error` images the single-line Reading sentence input hides the long text. The measurement missed it because it does not check inputs. At 360 px, text also shows under the sticky footer.
- Fix: in `deprecated-light-1280.png` the Owner, Steward and Classification inputs have heavy black borders, unlike the other fields.
- Minor: the attribute row controls are icons only. The agent context textarea gives no cue that more text follows. The read-only image shows no values and has a large gap.
