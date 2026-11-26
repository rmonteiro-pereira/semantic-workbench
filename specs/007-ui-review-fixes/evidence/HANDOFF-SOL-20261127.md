# Review-fix handoff

All five findings are addressed in separate local commits on `007-ui-review-fixes`. `bun run check` passes. The graph suite still fails its previously recorded neighborhood canvas-height assertion. The capture matrix remains paused and T076 remains unchecked.

Starting commit: `2201f521`. Final application/test commit: `932b0aea`. Comparison main remains `da54cf17`.

## Findings and coverage

| Finding | Commit | Change | Covering check | Exit |
| --- | --- | --- | --- | --- |
| 1 | `056f627f` | Show consumes Escape; a second Escape closes Controls and restores its trigger's focus. | `bun run test:grouping-validation`: both Graph and Neighborhood, nine checks total. | 0 |
| 2 | `e30a249e` | Branch/head observation and notice stay in the mounted comparison hook. | `bun run test:item-diff`: branch switches and a commit while Controls is closed. | 0 |
| 3 | `8137b3fb` | Retains folded snapshots and adds expanded Graph/Neighborhood toolbar signatures to both baseline families. | `bun run test:item-diff`; `bun run test:usage-traffic` (51 checks). | 0 / 0, first invocations; wrapper caveat below |
| 4 | `62fbf688` | Retains the list-only shell step, selects a metric, requires visible detail and measures both wide-screen outer edges. | `RESPONSIVE_ONLY='shell screens:' bun run test:responsive`: four widths plus browser-error check. | 0 |
| 5 | `932b0aea` | Moves comparison styles to item-diff.css and imported-card/key styles to graph-canvas.css, without changing rules. | `bun run test:item-diff`; final `bun run test:mesh`, including the new style assertions. | 0 / 0 |

The item-comparison style assertions run at 1440 and 390 pixels in both themes. The mesh journey passes at 1440, 768 and 390 pixels in both themes. The imported-card fixture references its imported Invoice, reloads after direct fixture writes and opens Controls before checking the imported key.

## Commands and results

All browser runs used the unchanged `sw-midgard-run`. The scratch launcher starts a temporary-data frontend on port 5481; browser helpers use isolated temporary APIs.

The first launcher was `/srv/dev/review-run.sh`. Its replacement, `/srv/dev/review-run-v2.sh`, starts Node directly, records `CHECK_EXIT` and stops its exact frontend PID.

- `sw-midgard-run -- bash /srv/dev/review-run.sh bun run test:grouping-validation`: exit 0 after the fix; the added check failed with exit 1 before it because Show was unmounted after Escape.
- `sw-midgard-run -- bash /srv/dev/review-run.sh bun run test:item-diff`: exit 0 after the fix; the extended journey failed with exit 1 before it because the branch notice was absent.
- Baseline recording through `sw-midgard-run`, with both fixture JSON files pulled back: `bun scripts/record-item-diff-baseline.ts` and `bun scripts/usage-traffic-browser-check.ts --record`, exit 0. Every pre-existing signature and consumer answer is unchanged.
- The combined item-diff/Traffic command completed its first invocations successfully, including all 51 Traffic checks. Editing its scratch launcher in place caused the shell to re-enter the command tail. The duplicate was stopped; its later navigation failed and the combined wrapper returned 1. This is not a clean wrapper pass. The completed first Traffic result is retained in `finding3-checks.log`; item-diff subsequently passed under the replacement launcher.
- `sw-midgard-run -- env 'RESPONSIVE_ONLY=shell screens:' bash /srv/dev/review-run-v2.sh bun run test:responsive`: exit 0, five checks at 390, 1280, 1440 and 2560 pixels.
- `bun out/shell-width-proof.ts` through the replacement launcher: exit 0. Removing detail padding produced both edge errors and a 2234 px width against the 1600 px limit. Restoring padding returned no problems.
- `bun out/style-proof.ts out/review-styles/before` and the matching `after` command through the replacement launcher: exit 0 each with the completed fixture.
- `sw-midgard-run -- bash /srv/dev/review-run-v2.sh bash /srv/dev/finding5-checks.sh`: wrapper exit 1; inner item-diff 0, initial mesh 1 and graph 1. Mesh's fixture refresh and folded-key access were then corrected.
- `sw-midgard-run -- bash /srv/dev/review-run-v2.sh bun run test:mesh`: final exit 0. The intermediate retry reached the card assertions but failed to find the still-folded key; the final check opens Controls.
- `bun run check`: exit 0 after all five commits. Type checking, formatting, lint, comment, theme and brand checks pass.
- The changed-line readability checker, documentation synchronization check, `git diff --check` and documentation leak scans returned 0.

Scratch-only setup failures included an initial shell-quoting error, a duplicate API declaration in the width probe, an incorrect `flex` expectation for the existing `inline-flex` legend, and a missing dependency manifest in the first imported-card probe. These were corrected in the scratch harness. They did not require application changes.

## Stylesheet proof

The relocated selector/declaration blocks are byte-identical to their original text. Computed-style JSON is identical before and after.

At the same 1440 × 900 viewport and with a normalized imported-card camera:

- Comparison content crop, 840 × 500: zero changed pixels, including alpha.
- Imported card, 184 × 60: nine pixels differ by at most one channel level; no visible change.
- The full comparison screenshot has differences outside the content crop in the graph behind the modal. Both changed pairs were visually reviewed. No design change was found.

Images remain outside Git in `out/review-styles/before` and `out/review-styles/after`. Cropped comparison images are named `comparison-content.png`. Run logs are in `out/review-checks`; scratch harnesses remain under the task's scratch directory and `/srv/dev`.

## Open issues and next step

`test:graph` returned 1 at the existing neighborhood canvas-height check: 458.609375 px against a 480 px minimum. This matches the inherited failure already compared with main in GATE.md. Its graph-opening checks and pending-layout control check passed before that assertion. The suite is not green and was not broadened or repeated after the mesh-only fixture correction.

No new confirmed application regression remains among these five findings. The broader graph/rest capture inventory and visual classification are still incomplete. Continue that work from the earlier capture handoff only in a later requested round; do not mark T076 complete from these focused results.

All commits are local. No origin/GitHub push, main merge, branch deletion or owner-checkout operation was performed. Owned Vite children left by the first launcher were stopped by exact PID. The final process audit found no remaining owned launcher or port-5481 frontend process.
