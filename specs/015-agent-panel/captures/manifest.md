# Agent panel: capture manifest

The images are not kept in the repository. They are named here by file name and live in the capture output folder (`out/` locally, which git ignores).
8 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| `closed-light-1280.png` | Agent panel | closed | light | 1280 | `body` | 1 | 1280 × 900 | C2 |
| `connected-conversation-light-1280.png` | Agent panel | connected-conversation | light | 1280 | `.agent-panel` | 1 | 380.59 × 755 | C1 |
| `connecting-light-1280.png` | Agent panel | connecting | light | 1280 | `.agent-panel` | 1 | 380.59 × 755 | C1 |
| `error-light-1280.png` | Agent panel | error | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 358.66 | C1 |
| `long-text-light-1280.png` | Agent panel | long-text | light | 1280 | `.agent-panel` | 1 | 380.59 × 755 | C1 |
| `open-empty-dark-1280.png` | Agent panel | open-empty | dark | 1280 | `.agent-panel` | 1 | 380.59 × 755 | C3 |
| `open-empty-light-1280.png` | Agent panel | open-empty | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 336.56 | C1 |
| `open-empty-light-390.png` | Agent panel | open-empty | light | 390 | `.agent-panel` | 1 | 390 × 900 | C3 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/015-agent-panel/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/015-agent-panel/captures agent
```

C2:

```sh
sw-midgard-run --pull specs/015-agent-panel/captures -- timeout --kill-after=10s 120s bun scripts/ui-review/feature-states.ts specs/015-agent-panel/captures closed
```

C3:

```sh
sw-midgard-run --pull specs/015-agent-panel/captures -- timeout --kill-after=10s 120s bun scripts/ui-review/feature-states.ts specs/015-agent-panel/captures open
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The dark 1280 and light 390 open-empty images show the waiting Agent panel itself. The light 1280 open-empty image shows Connect your agent. The connected conversation uses the loopback reference relay.
