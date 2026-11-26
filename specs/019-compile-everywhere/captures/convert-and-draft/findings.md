# Measured facts

46 PNGs cover all reachable requested states, plus eight scrolled diff views. The requested base-conversion loading state does not exist. No application changes are included.

The element measurements report 2 text overflow entries, 0 contrast entries, 8 text-run rectangle collision entries and 3 ellipsis entries. These are detector results, not design verdicts.

## Fixtures and state control

The standard conversion uses the compile capture’s Retail ontology, semantic model and mapping. The model’s existing metric status is changed from approved to the legacy draft value in the disposable fixture, so the base preview includes the explicit draft → proposed rename. The four 0.3 files come from tests/fixtures/ossie-0.3.

The standard loading check is held pending. Refused uses HTTP 422; changed uses HTTP 409 version-changed; error uses HTTP 500 with a visible message. Converting holds the convert response pending. Base refused is the post-confirmation HTTP 422 state. Review uses the ordinary preview. Done uses the real conversion API and workspace refresh in a temporary data root.

The base preview lists four changes: /version; /metrics/0/custom_extensions; /metrics/0/custom_extensions/0/data/status; /metrics/0/custom_extensions/0/data. The before/after diff and confirmation remain in the scrolling body; separate review-diff images expose the lower part.

## Version labels

The ready compile dialog for the 0.3 project displays “Ossie 0.3.0 draft”. The 0.2 semantic file’s Validation details offers “Convert to Ossie 0.3.0 draft”. The standard 0.3 sales.ontology.yaml Validation details displays its error/warning summary without a version label. It does not offer the 0.2-to-draft conversion button. All three cases have both themes at both widths. The post-conversion workspace retains the Mappings tab; the captures do not force Source. At 390 px its filename heading measures scroll width 159 px against client width 154 px and has CSS ellipsis in both themes.

## Measurement scope

Clipping compares scroll size with client size for text-bearing elements; it is not a glyph-by-glyph assessment of all scrolled content. Ellipsis entries include literal … or ... as well as active CSS ellipsis. Contrast uses the existing helper’s 4.5:1 threshold for normal text and 3:1 for large text. Disabled controls, CodeMirror editor/diff text, graphs, hidden text and some overlays are excluded by that helper; image and gradient backgrounds may be unmeasurable. Zero contrast entries therefore does not assert that every rendered pixel passes.

Overlap entries compare text-run bounding rectangles. A wrapped run can cover the rectangular area occupied by another inline run even when the visible letter shapes do not intersect. The exact detector entries are retained below.

## Measurements by image

| File | Clipped | Ellipsis | Contrast | Overlap |
| --- | ---: | ---: | ---: | ---: |
| draft-validation-02-light-1440.png | 0 | 0 | 0 | 0 |
| draft-validation-02-dark-1440.png | 0 | 0 | 0 | 0 |
| draft-validation-02-light-390.png | 0 | 0 | 0 | 0 |
| draft-validation-02-dark-390.png | 0 | 0 | 0 | 0 |
| draft-validation-03-light-1440.png | 0 | 0 | 0 | 0 |
| draft-validation-03-dark-1440.png | 0 | 0 | 0 | 0 |
| draft-validation-03-light-390.png | 0 | 0 | 0 | 0 |
| draft-validation-03-dark-390.png | 0 | 0 | 0 | 0 |
| draft-compile-ready-light-1440.png | 0 | 0 | 0 | 0 |
| draft-compile-ready-dark-1440.png | 0 | 0 | 0 | 0 |
| draft-compile-ready-light-390.png | 0 | 0 | 0 | 2 |
| draft-compile-ready-dark-390.png | 0 | 0 | 0 | 2 |
| convert-loading-light-1440.png | 0 | 1 | 0 | 0 |
| convert-refused-light-1440.png | 0 | 0 | 0 | 0 |
| convert-review-light-1440.png | 0 | 0 | 0 | 0 |
| convert-review-diff-light-1440.png | 0 | 0 | 0 | 0 |
| convert-review-dark-1440.png | 0 | 0 | 0 | 0 |
| convert-review-diff-dark-1440.png | 0 | 0 | 0 | 0 |
| convert-review-light-390.png | 0 | 0 | 0 | 2 |
| convert-review-diff-light-390.png | 0 | 0 | 0 | 0 |
| convert-review-dark-390.png | 0 | 0 | 0 | 2 |
| convert-review-diff-dark-390.png | 0 | 0 | 0 | 0 |
| convert-converting-light-1440.png | 0 | 0 | 0 | 0 |
| convert-changed-light-1440.png | 0 | 0 | 0 | 0 |
| convert-error-light-1440.png | 0 | 0 | 0 | 0 |
| convert-done-light-1440.png | 0 | 0 | 0 | 0 |
| convert-done-dark-1440.png | 0 | 0 | 0 | 0 |
| convert-done-light-390.png | 0 | 0 | 0 | 0 |
| convert-done-dark-390.png | 0 | 0 | 0 | 0 |
| convert-editor-light-1440.png | 0 | 0 | 0 | 0 |
| convert-editor-dark-1440.png | 0 | 0 | 0 | 0 |
| convert-editor-light-390.png | 1 | 1 | 0 | 0 |
| convert-editor-dark-390.png | 1 | 1 | 0 | 0 |
| draft-base-refused-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-review-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-review-diff-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-review-dark-1440.png | 0 | 0 | 0 | 0 |
| draft-base-review-diff-dark-1440.png | 0 | 0 | 0 | 0 |
| draft-base-review-light-390.png | 0 | 0 | 0 | 0 |
| draft-base-review-diff-light-390.png | 0 | 0 | 0 | 0 |
| draft-base-review-dark-390.png | 0 | 0 | 0 | 0 |
| draft-base-review-diff-dark-390.png | 0 | 0 | 0 | 0 |
| draft-base-converting-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-changed-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-error-light-1440.png | 0 | 0 | 0 | 0 |
| draft-base-done-light-1440.png | 0 | 0 | 0 | 0 |

## Exact non-empty detector entries

### draft-compile-ready-light-390.png

- overlaps: "2 values" overlaps ". Your project is not changed;"
- overlaps: "will be dropped" overlaps ". Your project is not changed;"

### draft-compile-ready-dark-390.png

- overlaps: "2 values" overlaps ". Your project is not changed;"
- overlaps: "will be dropped" overlaps ". Your project is not changed;"

### convert-loading-light-1440.png

- ellipsis: div.compile-placeholder Reviewing the conversion…

### convert-review-light-390.png

- overlaps: "3 values" overlaps ". Your project is not changed;"
- overlaps: "will be dropped" overlaps ". Your project is not changed;"

### convert-review-dark-390.png

- overlaps: "3 values" overlaps ". Your project is not changed;"
- overlaps: "will be dropped" overlaps ". Your project is not changed;"

### convert-editor-light-390.png

- clipped: h1. retail.ontology.yaml: scroll 159×19, client 154×19
- ellipsis: h1. retail.ontology.yaml

### convert-editor-dark-390.png

- clipped: h1. retail.ontology.yaml: scroll 159×19, client 154×19
- ellipsis: h1. retail.ontology.yaml

## Colour and non-colour indicators

Dialog state indicators contain visible words such as Reviewing, Converting, Converted, Error or the explicit changed/refusal message. The base preview spells out each before → after value. The diff has Before/After labels on desktop and a Before → After label on phone. Those state and version distinctions have text equivalents.

Diff decoration samples are retained in diff-indicators.jsonl. Inserted/deleted line and token elements in these samples have null aria-label and role attributes. They use colour/background decorations; the samples alone cannot establish whether every individual change has a non-colour cue. In the phone diff, deleted text has a coloured background without strike-through; the merge styles set text-decoration to none for inserted/deleted lines. Inserted tokens have underlining, while the combined Before → After heading does not label each deleted line. These are colour-only indicator candidates at the deleted-run level, rather than a claim about the whole dialog. The ordinary contrast helper excludes CodeMirror, so diff text contrast and a complete token-level accessibility assessment remain outside its coverage.

| Review | Width | Indicator selector | Count |
| --- | ---: | --- | ---: |
| convert-review | 1440 | .cm-changedLine | 4 |
| convert-review | 1440 | .cm-deletedLine | 4 |
| convert-review | 1440 | .cm-changedLine | 4 |
| convert-review | 1440 | .cm-deletedLine | 4 |
| convert-review | 390 | .cm-deletedLine | 4 |
| convert-review | 390 | .cm-deletedChunk | 4 |
| convert-review | 390 | .cm-deletedText | 14 |
| convert-review | 390 | .cm-deletedLine | 4 |
| convert-review | 390 | .cm-deletedChunk | 4 |
| convert-review | 390 | .cm-deletedText | 14 |
| draft-base-review | 1440 | .cm-changedLine | 24 |
| draft-base-review | 1440 | .cm-insertedLine | 11 |
| draft-base-review | 1440 | .cm-deletedLine | 13 |
| draft-base-review | 1440 | .cm-changedLine | 24 |
| draft-base-review | 1440 | .cm-insertedLine | 11 |
| draft-base-review | 1440 | .cm-deletedLine | 13 |
| draft-base-review | 390 | .cm-changedLine | 8 |
| draft-base-review | 390 | .cm-insertedLine | 8 |
| draft-base-review | 390 | .cm-deletedLine | 13 |
| draft-base-review | 390 | .cm-deletedChunk | 3 |
| draft-base-review | 390 | .cm-deletedText | 32 |
| draft-base-review | 390 | .cm-changedLine | 11 |
| draft-base-review | 390 | .cm-insertedLine | 11 |
| draft-base-review | 390 | .cm-deletedLine | 13 |
| draft-base-review | 390 | .cm-deletedChunk | 3 |
| draft-base-review | 390 | .cm-deletedText | 32 |

Rows at the same width follow light, then dark capture order.

## Requested states not reached

- draft-base-loading: BaseConvertView has no loading state. startBaseReview runs synchronously without an API request.

Every other requested state/viewport is represented in manifest.md. No design judgement or app fix is included.

## Judged from the images

- Fix: in `convert-loading-light-1440.png` the conversion review says "Reviewing the conversion…" with an ellipsis.
- Fix: in the four `draft-validation-02` images, the "Convert to Ossie 0.3.0 draft" button in Validation details has no line saying what it does or naming the file's current version.
- Finding: the four `draft-validation-03` images show that a 0.3.0.dev0 file has no version label in Validation details. The draft base is named only in the compile and convert dialogs, so nothing in the editor says a file is on the draft base.
- Fix, outside the compile area: in the 390 px `convert-editor` images the header cuts the file name with an ellipsis ("retail.ontology.ya…"). At 1440 px the Find concept placeholder is clipped ("synonyn").
- Minor: on phone width the diffs of both conversions mark deleted lines by colour only. On desktop the deleted lines are also underlined and the columns are labelled.
- Minor: in `convert-refused-light-1440.png` the finding location reads "retail.ontology.yaml · /".
- Minor: during converting, the disabled button is the only sign of progress.
- Minor: the compile title "Standard Ossie for Sales draft" can read as though "draft" were part of the project name.
- The base conversion has no loading state, because it builds its preview without a request.
- The previewed hash is sent with the confirmation and is not meant to be displayed.
- Everything else shows its state with nothing clipped: convert review, converting, changed, error and done; base-conversion review, changed, error, refused and done; and the compile dialog's "Ossie 0.3.0 draft" label in all four viewports.
- The measured overlap flags on the 390 px review and compile images are false positives: wrapped inline text, with no glyphs touching.
