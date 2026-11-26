# Unpublished comparison: capture manifest

12 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| [added-light-1280.png](added-light-1280.png) | Unpublished comparison | added | light | 1280 | `[data-capture-state=selected]` | 1 | 154.59 × 50.41 | C1 |
| [branch-control-light-1280.png](branch-control-light-1280.png) | Unpublished comparison | branch-control | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 480 × 291 | C1 |
| [changed-light-1280.png](changed-light-1280.png) | Unpublished comparison | changed | light | 1280 | `[data-capture-state=selected]` | 1 | 154.59 × 50.41 | C1 |
| [comparison-empty-light-1280.png](comparison-empty-light-1280.png) | Unpublished comparison | comparison-empty | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 252.48 | C1 |
| [comparison-error-light-1280.png](comparison-error-light-1280.png) | Unpublished comparison | comparison-error | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 280.48 | C1 |
| [comparison-loading-light-1280.png](comparison-loading-light-1280.png) | Unpublished comparison | comparison-loading | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 252.48 | C1 |
| [comparison-long-names-light-1280.png](comparison-long-names-light-1280.png) | Unpublished comparison | comparison-long-names | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 792 | C1 |
| [overlay-dark-1280.png](overlay-dark-1280.png) | Unpublished comparison | overlay | dark | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [overlay-light-1280.png](overlay-light-1280.png) | Unpublished comparison | overlay | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [overlay-light-390.png](overlay-light-390.png) | Unpublished comparison | overlay | light | 390 | `.full-graph` | 1 | 376 × 719 | C1 |
| [publication-review-light-1280.png](publication-review-light-1280.png) | Unpublished comparison | publication-review | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 480 × 266.38 | C1 |
| [removed-light-1280.png](removed-light-1280.png) | Unpublished comparison | removed | light | 1280 | `[data-capture-state=selected]` | 1 | 154.59 × 50.41 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/017-item-diff-and-wip/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/017-item-diff-and-wip/captures diff
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The baseline supplies the published and saved working definitions. Empty/loading/error/long-name comparison answers are injected at the existing item-diff route. The publication review opens with an ahead-count fixture; it does not publish.
