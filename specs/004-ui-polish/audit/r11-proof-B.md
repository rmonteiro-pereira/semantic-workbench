# R11 proof B — Final gate native visual review

Gate head: `d631e56e770ebf08d3b3d8901c61e1a2933897d6`.
Provenance: `/tmp/polish-r11-proof/B/manifest.json`.
Item-edit suite PASS: 2026-10-24 21:07:39 UTC (nine images).
RDF-edit suite PASS: 2026-10-24 21:07:49 UTC (seven images).

Reviewed every one of the 16 fresh originals individually at native resolution with original detail.
All captures are 1440 × 900, light theme. No sampling or earlier verdict substitution.
Applied the strict audit brief to geometry, type, contrast, opacity, labels and empty states.

S1: 0. S2: 0. S3: 3. No S1 or S2 defects found in this proof partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-B-1 | S3 | `workbench-item-rename.png`, 1440 × 900 | At x825–1416, y98–121, the rename validation banner says “Define it before importing.” The current operation is editing a concept name, and the reference rewrite panel below already describes the affected references. The import-specific ending is misplaced here. | Use wording about updating the remaining reference or defining the concept, without referring to import. |
| R11-B-2 | S3 | `workbench-rdf-refused.png`, 1440 × 900 | The same refusal sentence is shown in the editor banner at approximately y205–232 and again below the editor at y763–799. Both remain readable, but the repeated message adds visual noise. | Keep one full refusal explanation, with a shorter status in the other location. |
| R11-B-3 | S3 | `workbench-rdf-turtle.png`, `workbench-rdf-xml.png`, `workbench-rdf-add.png`, `workbench-rdf-delete.png`, all 1440 × 900 | At the sidebar scroll boundary around y675, the next file metadata or project row is partly visible directly above the fixed Clear workspace and Trash actions. In Turtle/XML the sales mapping metadata is clipped; in Add/Delete the Shopping center project row is only partly exposed. Actions and foreground editors remain usable. | Give the scroll boundary a clearer visual termination or align the last visible row with the boundary. |

Foreground edit drawers and dialogs are opaque, with separated controls and visible footer actions.
Concept, contract property, metric, Turtle, XML and SHACL editing views match their filenames.
The invalid source view identifies the unknown parent; the N3 refusal explains its restriction and
gives a Source action.
Add previews and delete dependency lists remain readable with complete actions.
No foreground collisions, unintentionally clipped controls, sub-12-pixel type or visible contrast
failures observed.
Long source lines and lists use their editor or list scrolling regions intentionally.
This partition supplements the full tour; these images alone do not prove all seven R11 asks.

## Screens with no defects

- `workbench-item-concept.png`
- `workbench-item-source-invalid.png`
- `workbench-item-odcs-property.png`
- `workbench-item-add.png`
- `workbench-item-delete.png`
- `workbench-item-wizard-preview.png`
- `workbench-item-wizard-saved.png`
- `workbench-item-kpi-edit.png`
- `workbench-rdf-n3-refused.png`
- `workbench-rdf-shacl.png`

Reviewed coverage: 16/16; six images have the three grouped minor observations above, ten have no
observed defects.
