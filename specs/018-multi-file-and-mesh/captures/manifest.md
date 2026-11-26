# Imports and ontology mesh: capture manifest

21 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| [disclosure-light-1280.png](disclosure-light-1280.png) | Imports and ontology mesh | disclosure | light | 1280 | `.mesh-disclosure` | 1 | 248.59 × 110.47 | C1 |
| [import-editor-error-light-1280.png](import-editor-error-light-1280.png) | Imports and ontology mesh | import-editor-error | light | 1280 | `section[aria-label="Imports"]` | 1 | 248.59 × 234.72 | C1 |
| [import-editor-populated-dark-1280.png](import-editor-populated-dark-1280.png) | Imports and ontology mesh | import-editor-populated | dark | 1280 | `.mesh-imports` | 1 | 248.59 × 685.19 | C1 |
| [import-editor-populated-dark-390.png](import-editor-populated-dark-390.png) | Imports and ontology mesh | import-editor-populated | dark | 390 | `.mesh-imports` | 1 | 344 × 571.09 | C1 |
| [import-editor-populated-dark-768.png](import-editor-populated-dark-768.png) | Imports and ontology mesh | import-editor-populated | dark | 768 | `.mesh-imports` | 1 | 217 × 707.28 | C1 |
| [import-editor-populated-light-1280.png](import-editor-populated-light-1280.png) | Imports and ontology mesh | import-editor-populated | light | 1280 | `.mesh-imports` | 1 | 248.59 × 685.19 | C1 |
| [import-editor-populated-light-390.png](import-editor-populated-light-390.png) | Imports and ontology mesh | import-editor-populated | light | 390 | `.mesh-imports` | 1 | 344 × 571.09 | C1 |
| [import-editor-populated-light-768.png](import-editor-populated-light-768.png) | Imports and ontology mesh | import-editor-populated | light | 768 | `.mesh-imports` | 1 | 217 × 707.28 | C1 |
| [imports-empty-light-1280.png](imports-empty-light-1280.png) | Imports and ontology mesh | imports-empty | light | 1280 | `.mesh-imports` | 1 | 248.59 × 182.53 | C1 |
| [imports-error-light-1280.png](imports-error-light-1280.png) | Imports and ontology mesh | imports-error | light | 1280 | `section[aria-label="Imports"]` | 1 | 248.59 × 157.62 | C1 |
| [imports-populated-light-1280.png](imports-populated-light-1280.png) | Imports and ontology mesh | imports-populated | light | 1280 | `section[aria-label="Imports"]` | 1 | 248.59 × 341.44 | C1 |
| [mesh-empty-light-1280.png](mesh-empty-light-1280.png) | Imports and ontology mesh | mesh-empty | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 162.09 | C1 |
| [mesh-error-light-1280.png](mesh-error-light-1280.png) | Imports and ontology mesh | mesh-error | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 162.09 | C1 |
| [mesh-populated-dark-1280.png](mesh-populated-dark-1280.png) | Imports and ontology mesh | mesh-populated | dark | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 529.47 | C1 |
| [mesh-populated-dark-390.png](mesh-populated-dark-390.png) | Imports and ontology mesh | mesh-populated | dark | 390 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 370 × 521.47 | C1 |
| [mesh-populated-dark-768.png](mesh-populated-dark-768.png) | Imports and ontology mesh | mesh-populated | dark | 768 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 720 × 529.47 | C1 |
| [mesh-populated-light-1280.png](mesh-populated-light-1280.png) | Imports and ontology mesh | mesh-populated | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 529.47 | C1 |
| [mesh-populated-light-390.png](mesh-populated-light-390.png) | Imports and ontology mesh | mesh-populated | light | 390 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 370 × 521.47 | C1 |
| [mesh-populated-light-768.png](mesh-populated-light-768.png) | Imports and ontology mesh | mesh-populated | light | 768 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 720 × 529.47 | C1 |
| [part-picker-light-1280.png](part-picker-light-1280.png) | Imports and ontology mesh | part-picker | light | 1280 | `.mesh-unit-files` | 1 | 954 × 69.09 | C1 |
| [used-by-empty-light-1280.png](used-by-empty-light-1280.png) | Imports and ontology mesh | used-by-empty | light | 1280 | `section[aria-label="Used by"]` | 1 | 830 × 69.09 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/018-multi-file-and-mesh/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/018-multi-file-and-mesh/captures mesh
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The existing separate-repository mesh fixture supplies finance, units and retail. Mesh populated means populated project tiles; the fixture has no published import links. The populated Imports section is an unpublished saved import.
