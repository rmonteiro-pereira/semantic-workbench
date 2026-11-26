# Proposals: capture manifest

The images are not kept in the repository. They are named here by file name and live in the capture output folder (`out/` locally, which git ignores).

15 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| `check-light-1280.png` | Proposals | check | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 423.56 | C1 |
| `close-light-1280.png` | Proposals | close | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 375.47 | C1 |
| `create-light-1280.png` | Proposals | create | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 449.39 | C1 |
| `detail-dark-1280.png` | Proposals | detail | dark | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 403.86 | C1 |
| `detail-light-1280.png` | Proposals | detail | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 403.86 | C1 |
| `detail-light-390.png` | Proposals | detail | light | 390 | `dialog[open] .workbench-dialog` | 1 | 370 × 485.05 | C1 |
| `empty-light-1280.png` | Proposals | empty | light | 1280 | `main` | 1 | 360 × 900 | C1 |
| `error-light-1280.png` | Proposals | error | light | 1280 | `main` | 1 | 360 × 900 | C1 |
| `list-dark-1280.png` | Proposals | list | dark | 1280 | `main` | 1 | 360 × 900 | C1 |
| `list-light-1280.png` | Proposals | list | light | 1280 | `main` | 1 | 360 × 900 | C1 |
| `list-light-390.png` | Proposals | list | light | 390 | `main` | 1 | 360 × 900 | C1 |
| `loading-light-1280.png` | Proposals | loading | light | 1280 | `main` | 1 | 360 × 900 | C1 |
| `long-text-light-1280.png` | Proposals | long-text | light | 1280 | `main` | 1 | 360 × 900 | C1 |
| `promote-light-1280.png` | Proposals | promote | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 384.56 | C1 |
| `restore-light-1280.png` | Proposals | restore | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 880 × 375.47 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/012-shared-proposals/captures -- timeout --kill-after=10s 240s bun scripts/ui-review/feature-states.ts specs/012-shared-proposals/captures proposals
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The existing proposals component harness supplies these states. The list crop is the rendered main region, not the desktop viewport width.
