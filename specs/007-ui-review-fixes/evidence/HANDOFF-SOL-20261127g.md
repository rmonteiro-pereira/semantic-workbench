# Settled collapsed Network regression gate

The six requested settled UBL states show no label regression at product revision `557c7345` on `007-option-b`. The graph suite remains red at the same neighborhood-height assertion as round f. T076 remains open.

## Suite and main comparison

`bun run test:graph` exits 1 at `scripts/helpers/graph-review-checks.ts:90`: neighborhood canvas height is 458.609375 px; minimum is 480 px. This matches HANDOFF-SOL-20261127f.md exactly. The journey stops there, so later assertions have no result.

The Batch 2 gate in `git show da54cf17:GATE.md` also records a failing graph suite, but for longest pierce task (334 ms against at most 100 ms). It lists responsive, editor, lineage and back-history failures as well. That record does not establish that this neighborhood-height failure is inherited from main. No new main suite run was performed.

## Per-state evidence

Every row has all ten visible counts in DOM order: **33, 26, 6, 18, 7, 2, 7, 5, 6, 10**, plus the complete **IdentityDocumentReference** name. All states use UBL full graph, Network, areas collapsed, Labels and Mini-map on, device scale 1, and no pan in progress.

| State            | Visible labels   | Changed pixels | Card/header/map/label collisions | Clipped labels | Max leader-to-stroke distance |
| ---------------- | ---------------- | -------------- | -------------------------------- | -------------- | ----------------------------- |
| 1440×900, light  | 10 counts + name | 104            | 0 / 0 / 0 / 0                    | 0              | 0.118443 graph units          |
| 1920×1080, light | 10 counts + name | 286            | 0 / 0 / 0 / 0                    | 0              | 0.120516 graph units          |
| 2560×1440, light | 10 counts + name | 140            | 0 / 0 / 0 / 0                    | 0              | 0.120516 graph units          |
| 1440×900, dark   | 10 counts + name | 81             | 0 / 0 / 0 / 0                    | 0              | 0.118443 graph units          |
| 1920×1080, dark  | 10 counts + name | 291            | 0 / 0 / 0 / 0                    | 0              | 0.118050 graph units          |
| 2560×1440, dark  | 10 counts + name | 506            | 0 / 0 / 0 / 0                    | 0              | 0.107673 graph units          |

Distance uses the round-f probe: nearest SVG path point sampled every 0.25 graph units, over ten leaders per state. It is a sampling estimate, not an exact endpoint error. All leaders visibly reach their painted strokes.

Pixel comparison preceded visual inspection. The four 1440/2560 references are unchanged copies of `round-f/fixed`. Round f has no 1920 captures; the two 1920 references were generated from its product revision `ff92022c`, using the copied capture setup and the same actions. They reside separately in `out/round-g/reference-1920`, not in the original round-f directory.

All six changed captures were personally inspected at native resolution in one batch of ten canvas tiles, each no larger than 1500 px on its longest side. Counts and the full relationship name remain readable, with no card, header, mini-map or label collision and no clipping. Minor pixel differences do not reveal a visual regression. Cropped tile boundaries are review boundaries, not application clipping.

## Commands and exit codes

| Command                                                           | Exit      | Result                                                                                                                           |
| ----------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `python3 ~/.codex/skills/devops/scripts/pre_push_check.py "$PWD"` | 1, then 0 | Initial cumulative architecture-review requirement resolved by read-only review and review marker; zero findings on final check. |
| `sw-midgard-run --pull out/round-g -- bash out/round-g/run.sh`    | 0         | Final wrapper completes captures and suite and cleans up; individual statuses below.                                             |
| `bun out/round-g/capture.ts fixed`                                | 0         | All six requested captures, eleven labels each.                                                                                  |
| `bun run test:graph`                                              | 1         | Only observed product failure is the neighborhood-height assertion above.                                                        |
| `sw-midgard-run --pull out/round-g -- bash out/round-g/post.sh`   | 0         | Oxfmt, 1920 reference capture and pixel/geometry analysis complete.                                                              |
| `bun out/round-g/reference-1920.ts fixed`                         | 0         | Both reference themes captured from round-f source.                                                                              |
| `bun out/round-g/review.ts`                                       | 0         | Per-state pixel counts, collision/clipping results and leader distances recorded.                                                |

The initial setup attempt failed before graph opening because the copied Vite script used an unwritable round-d cache path. Capture and suite each exited 1; that suite attempt never reached product assertions. The copied launcher now uses its own round-g cache. The single completed graph journey above is the retry after this infrastructure failure. Rejected logs remain in `out/round-g/failed-cache-attempt`.

## Artifacts and cleanup

Captures, JSONL measurements, reference source, logs, pixel counts and native review tiles stay outside Git under `out/round-g`. Aggregate results are `out/round-g/review/results.json`; suite statuses are `out/round-g/results.tsv`. Wrapper logs are in scratch as `round-g-midgard.log`, `round-g-midgard-retry.log` and `round-g-review.log`.

Owned frontend PIDs were 4045785 (failed setup), 4048958 (candidate) and 4074365 (1920 reference). Each wrapper records its stop and CLEANUP_COMPLETE. Capture finally blocks close Chromium and isolated APIs. Exact-PID absence is checked before delivery.

No product source, thresholds, task status or tracked file other than this handoff changed. Heavy work used the unchanged wrapper, disposable data under the dev area, loopback isolation and frontend port 5471. Only the allowed scratch bare repository was synchronized. No origin/GitHub push, main merge, branch deletion, owner checkout/data, production service, external service or yggdrasil access occurred.

## Open regressions and next step

No open regression in the requested settled label matrix. The neighborhood-height failure remains unresolved and is not proven inherited from main. Continue T076 at the broader journey gate; establish a matching main height comparison before assigning inheritance. Keep live-pan behavior outside this settled-state verdict.
