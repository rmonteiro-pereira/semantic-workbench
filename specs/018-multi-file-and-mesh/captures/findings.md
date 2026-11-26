# Imports and ontology mesh: measured findings

21 images; measurements refer only to the stated crop at its recorded CSS size.

The existing separate-repository mesh fixture supplies finance, units and retail. Mesh populated means populated project tiles; the fixture has no published import links. The populated Imports section is an unpublished saved import.

The clipping predicate is scrollWidth > clientWidth or scrollHeight > clientHeight on visible text-bearing elements. Text hidden with clip-path inset(50%) is excluded. A scrollable textarea meeting the predicate is listed.

Overlap entries are text-range bounding-rectangle or hit-test results from the existing geometry helper. A multiline text range can intersect an adjacent inline label without overlapping glyphs. The consent and long-name comparison entries retain that distinction.

## Clipped text

none found.

## Visible ellipsis or three dots

none found.

## Text overlap or coverage measurements

- `import-editor-populated-dark-768.png`: `"Imports" is covered by div.section-label`
- `import-editor-populated-light-768.png`: `"Imports" is covered by div.section-label`
- `imports-populated-light-1280.png`: `"fin" overlaps "/ ontology.yaml"`

All other pictured crops: none found.

## Text contrast below 4.5:1, or 3:1 for large text

none found.

## Contrast measurement limits

The existing contrast helper measures enabled interface text against resolvable flat ancestor backgrounds. It excludes graph-node labels, SVG, source-editor text and disabled controls, and does not resolve gradient/image backgrounds. Contrast in those excluded surfaces is unmeasured; “none found” above applies only to the sampled interface text.

## Colour as the only sign of meaning

none found in the pictured state indicators. Provider choices use radio/check marks; dependency state and disclosure are textual; the selected Mesh project has its own details.

## Requested states without an image

The bounded matrix reached the 110-image limit across the eight folders. The following variants have no image or geometry/contrast measurement:

- Imports section: empty, populated and error at light 768 and light 390. These states are pictured at light 1280.
- Import editor: empty in all six width/theme combinations; error at light 768, light 390, dark 1280, dark 768 and dark 390. Populated is pictured in all six combinations and error at light 1280.
- Mesh: empty and error at light 768, light 390, dark 1280, dark 768 and dark 390. Populated project tiles are pictured in all six combinations.
- Used by: populated and error at light 1280, 768 and 390; empty at light 768 and 390. The fixture has no published import links; its empty Used by list is pictured at light 1280.
- Part picker: populated at light 768 and 390; empty and error variants. The existing valid root/part fixture supplies the pictured light 1280 picker, and no picker-specific failure was injected.
- Disclosure notice: light 768 and 390. Its light 1280 notice is pictured. No separate empty/error notice was reached; it is static explanatory text in the import form.

## Judged from the images

- Fix: at 768 px, light and dark, the sticky Definition details header covers the Imports heading.
- Minor: "No imports in this ontology." stays above an open import editor and contradicts the provider error.
- Minor: the import list lines carry no labels.
- Minor: the pin option wraps under its checkbox.
- Minor: the Used by button in the Mesh view has no gap above it.
- Minor: the part picker does not show which part is open.
- Minor: the loading texts in this area end with an ellipsis.
- The overlap flag in `imports-populated-light-1280.png` is a false positive.
