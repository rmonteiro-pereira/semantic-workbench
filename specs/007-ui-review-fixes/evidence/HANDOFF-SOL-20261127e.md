# Regression review handoff

The six review findings are fixed locally. The dataset-lineage capture now completes three consecutive walks at 390×844 in both themes. The fourteen accepted visual states have no label collisions or clipping. The broader gate remains red at the same graph-height and full-screen-transform assertions reported in the preceding handoff. T076 remains open.

## Commits and findings

| Finding                                                           | Status | Implementation                                                                                                                                                                                                                                          | Commit                             |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Diagonal leader can miss the rendered stroke                      | Fixed  | The existing SVG path reports its geometry when the smart route or Bézier fallback changes. Placement candidates and leader anchors share that geometry. Nearest-point projection supports diagonal segments.                                           | `d081ef10`                         |
| Offscreen routes claim visible lanes; distant searches waste work | Fixed  | Cull route bounds outside the viewport, discard invalid horizontal candidates and jump each vertical search to its first fitting offset.                                                                                                                | `d081ef10`                         |
| Mini-map covers labels                                            | Fixed  | Measure the displayed map rectangle, transform it into graph coordinates and reserve it alongside cards and headers. Toggle, canvas resize, pan and zoom update the exclusion.                                                                          | `d081ef10`                         |
| Duplicate canvas observers leave stale dimensions after remount   | Fixed  | Measure the existing React Flow root from the refit observer; remove both duplicate canvas observers.                                                                                                                                                   | `d081ef10`                         |
| Header obstacles scan nodes once per area without eligible labels | Fixed  | Build obstacles only for eligible collapsed Network labels. Accumulate each parent's minimum child y in one pass over nodes.                                                                                                                            | `d081ef10`                         |
| Six-column assertion accepts missing markup                       | Fixed  | Require Metric, Type, Unit, Status, Owner and Concept individually, with visible boxes and CSS visibility/opacity checks.                                                                                                                               | `6ae4749f`, `81fbc609`             |
| Name-only lineage cards are missed by the capture script          | Fixed  | Keep uncovered card-level Walk here first. Otherwise select an unvisited uncovered title, use the shared Selected path region and open its phone control when needed. Wait for framing after Fit and confirm the new center before recording the visit. | `147aeb9d`, `d205c9d8`, `eace3283` |

Product geometry is unchanged after `d081ef10`; later commits refine assertions and capture actions. The final code revision is `eace3283`. The independent architecture review found one capture fallback issue, fixed in `d205c9d8`, and approved the subsequent assertion and framing changes. Documentation of collapsed labels is amended in `docs/graph-design.md`.

## Commands and results

All browser runs and captures use unchanged `sw-midgard-run`. Every frontend uses port 5471 inside its own loopback namespace and a temporary DATA_DIR beneath the dev scratch root. The isolated API helpers use disposable roots and ephemeral loopback ports.

| Command                                                                                          | Revision                                   | Exit                | Result                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                                                                                  | Final code                                 | 0                   | TypeScript, formatter, lint, comments, theme and brand checks pass. Local log: `~/scratch/sw-007/round-e-check.log`.                                                                                                 |
| `sw-midgard-run -- bun test ./tests/neighborhood-layout.test.ts ./tests/label-placement.test.ts` | `eace3283`                                 | 0                   | 14 tests, 278 assertions, no failures. Includes obstructed diagonal projection, mini-map exclusion, offscreen culling and distant intersecting-route search. Log: `~/scratch/sw-007/round-e-unit-exact.log`.         |
| `bun run test:graph` through `sw-midgard-run -- bash out/round-e/run.sh`                         | `d205c9d8`                                 | 1                   | Neighborhood canvas 458.609375 px, expected at least 480 px; `graph-review-checks.ts:90`. Same assertion and measurement as the preceding candidate handoff.                                                         |
| `sw-midgard-run --pull out/round-e -- bash out/round-e/responsive-run.sh`                        | `eace3283`                                 | 0 wrapper / 1 suite | Full-screen Graph transform restoration fails at `responsive-ui-tests.ts:547`, matching the preceding handoff's failure class. Individual status is recorded in `results.tsv`.                                       |
| `sw-midgard-run --pull out/round-e -- bash out/round-e/mall-run.sh`                              | `eace3283`                                 | 0                   | Mall comparison, final phone walks and header probes complete; owning frontends stop normally.                                                                                                                       |
| `bun out/round-e/header-probe.ts` inside the preceding job                                       | `eace3283`                                 | 0                   | Six headers and readable detail at 1920 and 2560 px in both themes. Removing every header, or hiding Type, Owner or Concept with display, visibility or opacity, is detected. No metric screenshots were recaptured. |
| `bun out/round-e/review.ts`                                                                      | Final captures                             | 0                   | Pixel comparison followed by geometry assertions and native review crops. Eight graph states have no label collisions or clipping. Six phone walks have matching expected and rendered centers.                      |
| Oxfmt, readable-code checker, docs-sync and `git diff --check`                                   | Changes                                    | 0                   | Passed. Markdown uses a scratch formatter configuration because the repository formatter excludes Markdown.                                                                                                          |
| Pre-push check and architecture review marker                                                    | `eace3283`, before scratch synchronization | 0                   | No findings. No origin/GitHub push.                                                                                                                                                                                  |

The first remote unit command used unprefixed file filters and also matched archived tests under ignored out directories: 164 passed across 32 files. The exact `./tests/` invocation above supersedes that count for the targeted proof.

## Visual proof

Accepted captures are outside Git. UBL uses Network, collapsed areas, Labels and Mini-map on, at 1440×900, 1920×1080 and 2560×1440, light and dark. Each state has eleven visible labels: ten counts and one relationship name. No card/header/map or label collision and no clipped label was found. Maximum measured leader-to-SVG distance is 0.122286 px.

Mall uses `mall.semantic.yaml`, Network, collapsed areas, Labels and Mini-map on, at 1440×900 in both themes. Two normal Zoom in actions expose the diagonal routes at readable detail. Each final frame has 21 visible labels, no collisions or clipped labels, and a maximum leader-to-SVG distance of 0.131877 px. The DOM contains 32 edges; this zoomed viewport does not show the entire model. The earlier ontology Fit frames had no displayed labels and are excluded from the diagonal proof.

The map probe at UBL 1440 light checks off, on, and pan plus Zoom in: eleven labels and zero map overlaps in every state. Header probes preserve all six columns and the detail width at both wide sizes and themes.

Pixel comparison precedes visual review. UBL is compared with the preceding handoff's frozen captures. Mall is compared with a `c28793c0` archive under the same viewport and actions. Phone walks are compared with the prior reproduction's candidate frames; target selection can produce a different third center. All fourteen accepted changed images were personally reviewed at native resolution in batches of at most six. Graph review crops have a longest side no greater than 1600 px; phone images are 390×844. Ancillary preparation and rejected captures are not accepted visual states.

- Graph images and measurements: `out/round-e/fixed/` for UBL; `out/round-e/mall-{before,fixed}/` for Mall.
- Pixel counts, geometry and graph review crops: `out/round-e/review/`.
- Final phone images and events: `out/round-e/phone-final/phone/`.
- Suite logs and statuses: `out/round-e/{graph,responsive}.log`, `out/round-e/results.tsv`.
- Header probes: `out/round-e/header-probe.log`.

## Phone walks

Both themes complete properties → equipment → buildings → entrances. The capture's existing first-unvisited policy is preserved. Every action uses an uncovered card control or a normally clicked Selected path action; no forced clicks or viewport injection are used. The expected target equals the rendered center for all six walks, and each final walk capture reports no screen problems.

Preparation still records an unavailable Filter columns control in both themes. That optional preparation attempt is independent of walking and is retained in `failures.jsonl`; no walk failure remains in the accepted replay. Existing generic overlap diagnostics on open Foreign keys and Selected path dialogs also remain in preparation events and are not used as walking verdicts.

## Rejected attempts and cleanup

- A multiline command failed in wrapper quoting before any frontend started (exit 23 including the failed artifact pull). Setup files were subsequently copied only into dev scratch and executed by the unchanged wrapper.
- The first map probe tried Zoom in with Controls closed and exited 1. Its frontend was stopped by its owning trap. The successful probe opens Controls first.
- The first dark walking attempt searched immediately after Fit and missed its first card; later walks succeeded. The final capture waits on an uncovered title after Fit and supersedes that attempt.
- The long capture-plus-suite wrapper's local wait exited 143. Its remote graph job continued, recorded suite exit 1 and stopped its owned frontend. Responsive was then run through a separate wrapper. An attempted background local waiter did not persist and did not launch another job.
- The responsive job started before the final capture job had finished because its waiting PID was incorrect. Both used separate loopback namespaces and the same committed source. They completed, and their exact owned server PIDs were checked absent. No product source changed between them.

Successful final capture frontends logged matching start/stop PIDs 3890524 and 3894351. Responsive logged matching start/stop PID 3898784. The earlier frontend PIDs 3847950, 3851342 and 3857703 were also checked absent. Browser contexts, Chromium and isolated API fixtures close through their owning helpers. No owner's checkout, production port/data, origin branch or external service was changed.

## Open gate and next step

The six review findings and the specified walking harness defect have no remaining failure in the accepted matrix. The full gate remains unaccepted. Responsive's full-screen transform failure was reproduced on main in the preceding handoff. The graph-height failure matches the preceding candidate; that handoff's complete main graph run stopped earlier on timing, so this round does not infer a new complete-suite main comparison. Main's Batch 2 gate also lists inherited responsive and graph failures.

Next: continue the broader T076 gate at those assertions, retaining the existing main comparison evidence and keeping this targeted visual matrix accepted. No thresholds, assertions or product visual design were loosened. All commits remain local on `007-ui-review-fixes`.
