# Traffic: capture manifest

15 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| [details-1200000-light-1280.png](details-1200000-light-1280.png) | Traffic | details-1200000 | light | 1280 | `.inspector` | 1 | 281.59 × 755 | C1 |
| [graph-empty-light-1280.png](graph-empty-light-1280.png) | Traffic | graph-empty | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-error-light-1280.png](graph-error-light-1280.png) | Traffic | graph-error | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-loading-light-1280.png](graph-loading-light-1280.png) | Traffic | graph-loading | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-long-names-light-1280.png](graph-long-names-light-1280.png) | Traffic | graph-long-names | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-off-light-1280.png](graph-off-light-1280.png) | Traffic | graph-off | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-off-non-admin-light-1280.png](graph-off-non-admin-light-1280.png) | Traffic | graph-off-non-admin | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-on-dark-1280.png](graph-on-dark-1280.png) | Traffic | graph-on | dark | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-on-dark-360.png](graph-on-dark-360.png) | Traffic | graph-on | dark | 360 | `.full-graph` | 1 | 346 × 719 | C1 |
| [graph-on-dark-768.png](graph-on-dark-768.png) | Traffic | graph-on | dark | 768 | `.full-graph` | 1 | 742 × 723 | C1 |
| [graph-on-light-1280.png](graph-on-light-1280.png) | Traffic | graph-on | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [graph-on-light-360.png](graph-on-light-360.png) | Traffic | graph-on | light | 360 | `.full-graph` | 1 | 346 × 719 | C1 |
| [graph-on-light-768.png](graph-on-light-768.png) | Traffic | graph-on | light | 768 | `.full-graph` | 1 | 742 × 723 | C1 |
| [graph-partial-light-1280.png](graph-partial-light-1280.png) | Traffic | graph-partial | light | 1280 | `.full-graph` | 1 | 954 × 755 | C1 |
| [neighbourhood-on-light-1280.png](neighbourhood-on-light-1280.png) | Traffic | neighbourhood-on | light | 1280 | `.neighborhood-graph` | 1 | 954 × 755 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/014-usage-counters/captures -- timeout --kill-after=10s 180s bun scripts/ui-review/feature-states.ts specs/014-usage-counters/captures traffic
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

Usage responses come from the existing usage fixture. The ready details crop reads 1,200,000 requests through this workbench in the last 30 days. Full Graph ready is pictured at 360, 768 and 1280 in both themes. The counters-off baseline uses local Admin capabilities; the non-Admin crop uses read-only server capabilities.
