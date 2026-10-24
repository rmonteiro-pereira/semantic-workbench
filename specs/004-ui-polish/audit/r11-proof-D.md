# R11 proof D — Fresh entity and relationship editing

Gate head: `d631e56e770ebf08d3b3d8901c61e1a2933897d6`.
Provenance: `/tmp/polish-r11-proof/D/manifest.json`, suite `r11-edit-walk`.
Fresh capture timestamps: 2026-10-24 22:52:27.410–22:52:29.594 UTC.
The assigned walkthrough passed all 16 states with geometry, contrast and no-error checks.

Reviewed all 16/16 originals individually at native resolution using original detail.
Coverage: Customer entity and places relationship, each at 390 × 844, 1280 × 720,
1440 × 900 and 2560 × 1440, in light and dark themes.
No sampling, contact sheets or previous verdict substitution.

S1: 0. S2: 0. S3: 1. No S1 or S2 found in this proof partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-D-1 | S3 | `workbench-click-entity-light-1280.png`, `workbench-click-entity-light-1440.png`, `workbench-click-relationship-light-1280.png`, `workbench-click-relationship-light-1440.png`, `workbench-click-entity-dark-1280.png`, `workbench-click-entity-dark-1440.png`, `workbench-click-relationship-dark-1280.png`, `workbench-click-relationship-dark-1440.png` | At the sidebar scroll boundary, the last visible file row is partly exposed immediately above the fixed Clear workspace and Trash actions. At 1280 px the OWL metadata beneath commerce.owl.ttl is clipped around y553; at 1440 px the mapping metadata beneath sales.mapping.yaml is clipped around y675. Foreground editing controls and sidebar actions remain usable. | Make the scrolling region terminate more clearly, or align its final visible row with the boundary. |

All intended editors and themes match their filenames. Entity Name, Type, Description,
Extends, IRI and relationship row are readable and separated. Relationship Name, Related
concept, Role name, Multiplicity, Reading and Description are likewise readable.
At 390 px the full-width editor retains its source link, complete labels and all three
footer actions without overlap. Desktop drawers retain an opaque surface and clear
separation from the dimmed workspace. Dark editors contain no leftover light surfaces.
No foreground clipping, collision, sideways overflow, unreadable small text or contrast
failure observed. No visible empty state requires additional guidance in these forms.
This review concerns the pictured edit states; it does not independently prove unseen behavior.

## Screens with no defects

- `workbench-click-entity-light-390.png`
- `workbench-click-entity-light-2560.png`
- `workbench-click-relationship-light-390.png`
- `workbench-click-relationship-light-2560.png`
- `workbench-click-entity-dark-390.png`
- `workbench-click-entity-dark-2560.png`
- `workbench-click-relationship-dark-390.png`
- `workbench-click-relationship-dark-2560.png`

## Other reviewed filenames

- `workbench-click-entity-light-1280.png` — minor sidebar boundary observation above.
- `workbench-click-entity-light-1440.png` — minor sidebar boundary observation above.
- `workbench-click-relationship-light-1280.png` — minor sidebar boundary observation above.
- `workbench-click-relationship-light-1440.png` — minor sidebar boundary observation above.
- `workbench-click-entity-dark-1280.png` — minor sidebar boundary observation above.
- `workbench-click-entity-dark-1440.png` — minor sidebar boundary observation above.
- `workbench-click-relationship-dark-1280.png` — minor sidebar boundary observation above.
- `workbench-click-relationship-dark-1440.png` — minor sidebar boundary observation above.

Reviewed coverage: 16/16; eight images with one grouped S3 observation, eight clean images.
