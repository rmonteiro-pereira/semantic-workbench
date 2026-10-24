# Supplemental R11 proof A: fresh native review

Head: `d631e56e770ebf08d3b3d8901c61e1a2933897d6`.
Provenance: `/tmp/polish-r11-proof/A/manifest.json` and `files.txt`.
Suite PASS times on 2026-10-24 UTC: projects 21:05:44; trash 21:06:02;
editor 21:07:20; SQL 21:09:43.

Individually inspected all 10 originals at original detail under the strict visual brief.
The trash-row image is an intentional 300 × 500 crop, not a viewport-matrix capture.
S1: **0**. S2: **0**. S3: **2**. No S1 or S2 observed.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-A-1 | S3 | `workbench-editor-repair.png` | The import summary says “1 of 1 files need repair”; the diagnostic count says “1 errors · 1 warnings”. These singular counts read awkwardly. | Use singular file/error/warning labels when the count is one. |
| R11-A-2 | S3 | `workbench-editor-extension.png` | The sidebar list ends through the Commerce file subtitle immediately above the fixed actions near y675. Its filename remains legible. | Give the scrolling list a clear end treatment or align its visible ending with a whole row. |

## Acceptance evidence visible in the images

- `workbench-editor-yaml.png`: YAML keys and values have distinct colors, with line numbers and folding markers. The source and navigation remain clear.
- `workbench-editor-lint.png`: the invalid parent has a red underline and gutter marker; the opaque hover message identifies the missing parent, and the toolbar reports the line and validation failure.
- `workbench-editor-extension.png`: embedded extension JSON and SQL expression are visibly differentiated within YAML. Editor text remains readable at its scrolled position.
- `workbench-editor-repair.png`: the opaque repair dialog separates editable source from actionable diagnostic detail; footer actions fit. The singular-count wording is the minor defect above.
- `workbench-sql-colors.png`: embedded SQL shows distinct keywords, string literal and identifiers inside YAML; the full expression fits.
- `workbench-sql-item-editor.png`: SQL colors and a syntax warning are visible in the expression field. The opaque side editor has separated labels, fields and reachable footer actions.
- `workbench-sql-wizard.png`: the expression field is readable, the current step is distinct from completed and pending steps, and dialog controls fit without collisions.
- `workbench-sql-large-mode.png`: large-file mode is clearly labeled while YAML and SQL retain visible coloring. Normal editor scrolling accounts for the final partial source line.
- `workbench-trash-row-icons.png`: file and project rows show trash glyphs beside their menus; the project trash glyph has a clear red focus/hover treatment. The long filename is visibly ellipsized. The lower cutoff belongs to the intentional crop.
- `workbench-projects-tree.png`: expanded projects contain recognizable file rows and format subtitles, with adjacent row actions. The invalid file is identified and the main pane explains repair with a clear action.

These are visual observations from successful-suite artifacts. Static images alone cannot
establish interaction behavior beyond what their captured state demonstrates.

## Screens with no defects

- `workbench-editor-yaml.png`
- `workbench-editor-lint.png`
- `workbench-sql-colors.png`
- `workbench-sql-item-editor.png`
- `workbench-sql-wizard.png`
- `workbench-sql-large-mode.png`
- `workbench-trash-row-icons.png`
- `workbench-projects-tree.png`

Reviewed **10/10** originals. The two finding filenames and eight clean filenames
account for every assigned image. No repository files were changed.
