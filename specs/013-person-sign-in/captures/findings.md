# Agent sign-in and connections: measured findings

13 images; measurements refer only to the stated crop at its recorded CSS size.

The consent/setup/error documents use the loopback identity-provider fixture. The long connection has a long program name; Admin has the initial empty connections and registered-program sections.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

- `person-loading-light-1280.png`: `p. Loading connections…`

All other pictured crops: none found.

## Text overlap or coverage measurements

- `consent-dark-1280.png`: `"Protocol reference client" overlaps "asks to connect as Dave Dias, "`
- `consent-light-1280.png`: `"Protocol reference client" overlaps "asks to connect as Dave Dias, "`
- `consent-light-390.png`: `"Protocol reference client" overlaps "asks to connect as Dave Dias, "`

All other pictured crops: none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found. Permissions use labelled checkboxes; connection states have status text.

## Requested states without an image

The bounded matrix reached the 110-image limit across the eight folders. The following variants have no image or geometry/contrast measurement:

- Admin Agent connections: loading, error and long text at light 1280. Only its empty view is pictured.
- Admin Agent programs: empty, loading, error and long text at light 1280. Only its registered-program view is pictured.
- Consent and setup credential: long-text variants. The consent uses the existing reference program; the setup page shows its initial form.
- Error pages beyond the invalid-client authorization page, including setup failure and a revealed setup result, are not pictured.
- Separate empty/loading consent and setup documents were not reached. These documents are rendered as pages; the asynchronous connection-list loading state is pictured instead.

## Judged from the images

- Fix: `person-loading-light-1280.png` says "Loading connections…" with an ellipsis.
- Minor: in the empty and error dialogs the text sits tight against the link and the Refresh button. The setup-credential link uses the default link style.
- Minor: `agent-programs-light-1280.png` uses multi-line text boxes for single-line fields.
- Minor: in `person-long-text-light-1280.png` the connection block is indented further than the heading.
- Minor: in `setup-credential-light-1280.png` the disabled Remote option shows a red push warning above "Your roles do not allow this".
- The consent overlap flags are false positives: wrapped inline text sits beside a bold name, and no glyphs overlap.
