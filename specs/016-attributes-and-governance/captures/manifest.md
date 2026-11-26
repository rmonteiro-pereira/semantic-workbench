# Definition attributes, governance and agent context: capture manifest

The images are not kept in the repository. They are named here by file name and live in the capture output folder (`out/` locally, which git ignores).

12 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| `agent-context-populated-long-text-light-1280.png` | Definition attributes, governance and agent context | agent-context-populated-long-text | light | 1280 | `.agent-context-fields` | 1 | 248.59 × 558 | C2 |
| `attribute-error-dark-1280.png` | Definition attributes, governance and agent context | attribute-error | dark | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 480 × 652.09 | C1 |
| `attribute-error-dark-360.png` | Definition attributes, governance and agent context | attribute-error | dark | 360 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 340 × 770.09 | C1 |
| `attribute-error-light-1280.png` | Definition attributes, governance and agent context | attribute-error | light | 1280 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 480 × 652.09 | C1 |
| `attribute-error-light-360.png` | Definition attributes, governance and agent context | attribute-error | light | 360 | `dialog[open]:last-of-type .workbench-dialog` | 1 | 340 × 770.09 | C1 |
| `attributes-empty-light-1280.png` | Definition attributes, governance and agent context | attributes-empty | light | 1280 | `section[aria-label="Attributes"]` | 1 | 248.59 × 128.09 | C1 |
| `attributes-populated-long-text-dark-1280.png` | Definition attributes, governance and agent context | attributes-populated-long-text | dark | 1280 | `section[aria-label="Attributes"]` | 1 | 248.59 × 448.95 | C1 |
| `attributes-populated-long-text-dark-360.png` | Definition attributes, governance and agent context | attributes-populated-long-text | dark | 360 | `section[aria-label="Attributes"]` | 1 | 314 × 378.56 | C1 |
| `attributes-populated-long-text-light-1280.png` | Definition attributes, governance and agent context | attributes-populated-long-text | light | 1280 | `section[aria-label="Attributes"]` | 1 | 248.59 × 448.95 | C1 |
| `attributes-populated-long-text-light-360.png` | Definition attributes, governance and agent context | attributes-populated-long-text | light | 360 | `section[aria-label="Attributes"]` | 1 | 314 × 378.56 | C1 |
| `deprecated-light-1280.png` | Definition attributes, governance and agent context | deprecated | light | 1280 | `section[aria-label="Governance"]` | 1 | 248.59 × 736 | C1 |
| `read-only-light-1280.png` | Definition attributes, governance and agent context | read-only | light | 1280 | `section[aria-label="Governance"]` | 1 | 248.59 × 254.17 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/016-attributes-and-governance/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/016-attributes-and-governance/captures attributes
```

C2:

```sh
sw-midgard-run --pull specs/016-attributes-and-governance/captures -- timeout --kill-after=10s 120s bun scripts/ui-review/feature-states.ts specs/016-attributes-and-governance/captures context
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

Attributes are cropped directly to their section, Governance to its section, and Agent context to its three input fields. The attribute error is an injected failed save. The read-only Governance view uses read-only project capabilities.
