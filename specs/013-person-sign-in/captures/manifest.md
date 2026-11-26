# Agent sign-in and connections: capture manifest

13 PNG images. Device scale factor is 1; the CSS crop dimensions below are the viewing scale. PNG pixel dimensions are retained in records.jsonl.

| File | Screen | State | Theme | Width (CSS px) | Crop region | Device scale factor | Crop size (CSS px) | Command |
| --- | --- | --- | --- | ---: | --- | ---: | --- | --- |
| [agent-connections-light-1280.png](agent-connections-light-1280.png) | Agent sign-in and connections | agent-connections | light | 1280 | `.admin-page` | 1 | 1280 × 900 | C1 |
| [agent-programs-light-1280.png](agent-programs-light-1280.png) | Agent sign-in and connections | agent-programs | light | 1280 | `.admin-page` | 1 | 1280 × 900 | C1 |
| [authorize-error-light-1280.png](authorize-error-light-1280.png) | Agent sign-in and connections | authorize-error | light | 1280 | `main` | 1 | 448 × 256.5 | C1 |
| [consent-dark-1280.png](consent-dark-1280.png) | Agent sign-in and connections | consent | dark | 1280 | `main` | 1 | 448 × 834.5 | C1 |
| [consent-light-1280.png](consent-light-1280.png) | Agent sign-in and connections | consent | light | 1280 | `main` | 1 | 448 × 834.5 | C1 |
| [consent-light-390.png](consent-light-390.png) | Agent sign-in and connections | consent | light | 390 | `main` | 1 | 358 × 959 | C1 |
| [person-empty-dark-1280.png](person-empty-dark-1280.png) | Agent sign-in and connections | person-empty | dark | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 264.28 | C1 |
| [person-empty-light-1280.png](person-empty-light-1280.png) | Agent sign-in and connections | person-empty | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 264.28 | C1 |
| [person-empty-light-390.png](person-empty-light-390.png) | Agent sign-in and connections | person-empty | light | 390 | `dialog[open] .workbench-dialog` | 1 | 370 × 278.38 | C1 |
| [person-error-light-1280.png](person-error-light-1280.png) | Agent sign-in and connections | person-error | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 264.28 | C1 |
| [person-loading-light-1280.png](person-loading-light-1280.png) | Agent sign-in and connections | person-loading | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 264.28 | C1 |
| [person-long-text-light-1280.png](person-long-text-light-1280.png) | Agent sign-in and connections | person-long-text | light | 1280 | `dialog[open] .workbench-dialog` | 1 | 480 × 706.19 | C1 |
| [setup-credential-light-1280.png](setup-credential-light-1280.png) | Agent sign-in and connections | setup-credential | light | 1280 | `main` | 1 | 448 × 1250 | C1 |

Commands:

C1:

```sh
sw-midgard-run --pull specs/013-person-sign-in/captures -- timeout --kill-after=10s 240s bun scripts/ui-review/feature-states.ts specs/013-person-sign-in/captures connections
```

Existing PNGs are retained when the driver revisits a state; records are refreshed. A fresh captures folder produces the images.

The consent/setup/error documents use the loopback identity-provider fixture. The long connection has a long program name; Admin has the initial empty connections and registered-program sections.
