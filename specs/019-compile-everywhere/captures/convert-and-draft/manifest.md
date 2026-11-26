# Convert and draft capture manifest

The images are not kept in the repository. They are named here by file name and live in the capture output folder (`out/` locally, which git ignores).

46 PNGs. Every crop uses device scale factor 1. View at 100%: the CSS dimensions below are the viewing scale; fractional CSS edges round outward in the PNG.

Viewport heights are 900 CSS px. Widths are 1440 and 390 CSS px. All PNG dimensions are at most 1600 px on their longest side.

C1:

```sh
sw-midgard-run --pull out/captures/019-convert-and-draft -- bun scripts/ui-review/feature-states.ts out/captures/019-convert-and-draft convert
```

Review images show the dialog body at its top. Review-diff images show the same dialog body scrolled to its bottom, preserving the title and footer. The editor images show the view the app retains after Done and Close on Validation details; no tab is forced.

| File | Screen | State | Theme | Viewport width | Crop | CSS crop size at 1× | PNG px | Command |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| draft-validation-02-light-1440.png | Validation details | draft-validation-02 | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 220.09375 CSS px | 880 × 222 | C1 |
| draft-validation-02-dark-1440.png | Validation details | draft-validation-02 | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 220.09375 CSS px | 880 × 222 | C1 |
| draft-validation-02-light-390.png | Validation details | draft-validation-02 | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 212.09375 CSS px | 370 × 214 | C1 |
| draft-validation-02-dark-390.png | Validation details | draft-validation-02 | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 212.09375 CSS px | 370 × 214 | C1 |
| draft-validation-03-light-1440.png | Validation details | draft-validation-03 | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 178.09375 CSS px | 880 × 180 | C1 |
| draft-validation-03-dark-1440.png | Validation details | draft-validation-03 | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 178.09375 CSS px | 880 × 180 | C1 |
| draft-validation-03-light-390.png | Validation details | draft-validation-03 | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 170.09375 CSS px | 370 × 172 | C1 |
| draft-validation-03-dark-390.png | Validation details | draft-validation-03 | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 170.09375 CSS px | 370 × 172 | C1 |
| draft-compile-ready-light-1440.png | Compile dialog | draft-compile-ready | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 454.28125 CSS px | 880 × 456 | C1 |
| draft-compile-ready-dark-1440.png | Compile dialog | draft-compile-ready | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 454.28125 CSS px | 880 × 456 | C1 |
| draft-compile-ready-light-390.png | Compile dialog | draft-compile-ready | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 608.25 CSS px | 370 × 610 | C1 |
| draft-compile-ready-dark-390.png | Compile dialog | draft-compile-ready | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 608.25 CSS px | 370 × 610 | C1 |
| convert-loading-light-1440.png | ConvertDialog | convert-loading | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 212 CSS px | 880 × 212 | C1 |
| convert-refused-light-1440.png | ConvertDialog | convert-refused | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 242.09375 CSS px | 880 × 244 | C1 |
| convert-review-light-1440.png | ConvertDialog | convert-review | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| convert-review-diff-light-1440.png | ConvertDialog | convert-review-diff | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| convert-review-dark-1440.png | ConvertDialog | convert-review | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| convert-review-diff-dark-1440.png | ConvertDialog | convert-review-diff | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| convert-review-light-390.png | ConvertDialog | convert-review | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| convert-review-diff-light-390.png | ConvertDialog | convert-review-diff | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| convert-review-dark-390.png | ConvertDialog | convert-review | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| convert-review-diff-dark-390.png | ConvertDialog | convert-review-diff | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| convert-converting-light-1440.png | ConvertDialog | convert-converting | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| convert-changed-light-1440.png | ConvertDialog | convert-changed | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 186.09375 CSS px | 880 × 188 | C1 |
| convert-error-light-1440.png | ConvertDialog | convert-error | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 162.09375 CSS px | 880 × 164 | C1 |
| convert-done-light-1440.png | ConvertDialog | convert-done | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 184.1875 CSS px | 880 × 186 | C1 |
| convert-done-dark-1440.png | ConvertDialog | convert-done | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 184.1875 CSS px | 880 × 186 | C1 |
| convert-done-light-390.png | ConvertDialog | convert-done | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 219.28125 CSS px | 370 × 220 | C1 |
| convert-done-dark-390.png | ConvertDialog | convert-done | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 219.28125 CSS px | 370 × 220 | C1 |
| convert-editor-light-1440.png | Converted ontology workspace | convert-editor | light | 1440 | main | 1140 × 900 CSS px | 1140 × 900 | C1 |
| convert-editor-dark-1440.png | Converted ontology workspace | convert-editor | dark | 1440 | main | 1140 × 900 CSS px | 1140 × 900 | C1 |
| convert-editor-light-390.png | Converted ontology workspace | convert-editor | light | 390 | main | 390 × 900 CSS px | 390 × 900 | C1 |
| convert-editor-dark-390.png | Converted ontology workspace | convert-editor | dark | 390 | main | 390 × 900 CSS px | 390 × 900 | C1 |
| draft-base-refused-light-1440.png | BaseConvertDialog | draft-base-refused | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 242.09375 CSS px | 880 × 244 | C1 |
| draft-base-review-light-1440.png | BaseConvertDialog | draft-base-review | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| draft-base-review-diff-light-1440.png | BaseConvertDialog | draft-base-review-diff | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| draft-base-review-dark-1440.png | BaseConvertDialog | draft-base-review | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| draft-base-review-diff-dark-1440.png | BaseConvertDialog | draft-base-review-diff | dark | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| draft-base-review-light-390.png | BaseConvertDialog | draft-base-review | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| draft-base-review-diff-light-390.png | BaseConvertDialog | draft-base-review-diff | light | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| draft-base-review-dark-390.png | BaseConvertDialog | draft-base-review | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| draft-base-review-diff-dark-390.png | BaseConvertDialog | draft-base-review-diff | dark | 390 | dialog[open]:last-of-type .workbench-dialog | 370 × 880 CSS px | 370 × 880 | C1 |
| draft-base-converting-light-1440.png | BaseConvertDialog | draft-base-converting | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 792 CSS px | 880 × 792 | C1 |
| draft-base-changed-light-1440.png | BaseConvertDialog | draft-base-changed | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 186.09375 CSS px | 880 × 188 | C1 |
| draft-base-error-light-1440.png | BaseConvertDialog | draft-base-error | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 162.09375 CSS px | 880 × 164 | C1 |
| draft-base-done-light-1440.png | BaseConvertDialog | draft-base-done | light | 1440 | dialog[open]:last-of-type .workbench-dialog | 880 × 184.1875 CSS px | 880 × 186 | C1 |

## Requested states without an image

- draft-base-loading: BaseConvertView has no loading state. startBaseReview runs synchronously without an API request.
