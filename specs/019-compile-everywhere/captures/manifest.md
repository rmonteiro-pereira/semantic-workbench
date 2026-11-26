# Compile and entry points: capture manifest

14 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| [error-light-1280.png](error-light-1280.png) | Compile and entry points | error | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 277.09 | C1 |
| [export-entry-light-1280.png](export-entry-light-1280.png) | Compile and entry points | export-entry | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 480 × 355.33 | C1 |
| [loading-light-1280.png](loading-light-1280.png) | Compile and entry points | loading | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 327 | C1 |
| [loss-1-light-1280.png](loss-1-light-1280.png) | Compile and entry points | loss-1 | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 565.47 | C1 |
| [loss-200-dark-1280.png](loss-200-dark-1280.png) | Compile and entry points | loss-200 | dark | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 792 | C1 |
| [loss-200-light-1280.png](loss-200-light-1280.png) | Compile and entry points | loss-200 | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 792 | C1 |
| [loss-200-light-390.png](loss-200-light-390.png) | Compile and entry points | loss-200 | light | 390 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 370 × 880 | C1 |
| [nothing-to-do-light-1280.png](nothing-to-do-light-1280.png) | Compile and entry points | nothing-to-do | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 323.19 | C1 |
| [refused-light-1280.png](refused-light-1280.png) | Compile and entry points | refused | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 357.09 | C1 |
| [released-dark-1280.png](released-dark-1280.png) | Compile and entry points | released | dark | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 357.19 | C1 |
| [released-light-1280.png](released-light-1280.png) | Compile and entry points | released | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 357.19 | C1 |
| [released-light-390.png](released-light-390.png) | Compile and entry points | released | light | 390 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 370 × 404.78 | C1 |
| [unavailable-light-1280.png](unavailable-light-1280.png) | Compile and entry points | unavailable | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 323.19 | C1 |
| [validation-entry-light-1280.png](validation-entry-light-1280.png) | Compile and entry points | validation-entry | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 880 × 220.09 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/019-compile-everywhere/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/019-compile-everywhere/captures compile
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The 1-loss, 200-loss, refused and nothing-to-do check answers are derived from the existing Retail fixture. The 1-loss and 200-loss groups are expanded. Released uses the real three-loss Retail compile acceptance. The export and validation entry points are pictured. The convert dialog is excluded.
