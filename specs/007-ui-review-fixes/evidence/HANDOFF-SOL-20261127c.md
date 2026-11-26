# Architecture refinement handoff

Architecture findings 1–4 are addressed. Findings 5–10 remain deferred in the Follow-ups list at the end of GATE.md. No new product regression is identified by the targeted checks; the inherited UBL first-view timing failure remains. The broader journey gate is still incomplete.

## Local commits

- `54e54c8f`: decouple form findings from visible labels and message wording. The existing item-edit browser suite gained characterization assertions before production code changed. Add Item, Item Editor and the metric wizard keep errors under the same controls. A shared field-control component preserves the existing DOM order without a layout wrapper.
- `3175d9e1`: share the existing nine-pixel graph name floor with text fitting and lineage. Update all consumers, including browser helpers and the disposable lineage mutation fixture.
- `5c671d21`: import the neighborhood full-screen control directly from its owner, remove the FullGraph re-export and explain the compact lineage control. Labels and actions are unchanged.
- The documentation commit containing this handoff completes the architecture map, records targeted results and adds the six deferred follow-ups.

All commits are local on `007-ui-review-fixes`. No origin or GitHub push, merge, branch deletion or owner-checkout operation was performed.

## Commands and results

Heavy commands used the unchanged `sw-midgard-run` wrapper from the integration worktree. Browser commands below ran inside a fixed-port harness on port 5481, with a disposable `/srv/dev/review-data-*` DATA_DIR, the wrapper's `/srv/dev/tmp-007-ui-review-fixes` temporary directory and screenshots under ignored `out/review-checks`. The harness is retained at `~/scratch/sw-007/review-run-v2.sh`. It stops its own frontend by exact PID on exit. The extra full-screen probe is retained at `~/scratch/sw-007/arch-fullscreen.formatted.ts` and was materialized only under ignored `out/architecture-checks` on midgard.

| Command                                                                                                                                                      | Exit | Result                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:item-edit` before production edits                                                                                                             | 0    | 12 checks, including duplicate names under Add Item, Item Editor and wizard controls, plus the denominator error                                                    |
| `bun run test:item-edit` after refactoring                                                                                                                   | 0    | Same 12 checks pass                                                                                                                                                 |
| `bun run test:metrics`                                                                                                                                       | 0    | 11 checks pass, including 390 px and 2560 px layouts                                                                                                                |
| `sw-midgard-run -- bun test tests/overview-capacity.test.ts tests/graph-tiles.test.ts tests/full-layout.test.ts tests/lineage-view.test.ts`                  | 0    | Bun treated these as filters and included archived source copies under ignored out/: 422 tests across 52 files; superseded by the explicit file run below           |
| `bun test ./tests/overview-capacity.test.ts ./tests/graph-tiles.test.ts ./tests/full-layout.test.ts ./tests/lineage-view.test.ts` inside the wrapper harness | 0    | 38 tests across the intended 4 files; 5,672 assertions                                                                                                              |
| `bun run test:overview-areas`                                                                                                                                | 0    | 7 checks pass                                                                                                                                                       |
| `bun scripts/lineage-mutation-cases.ts`                                                                                                                      | 0    | Disposable-copy baseline passes with the shared constant import; this is not a full mutation result                                                                 |
| `bun run test:lineage`, corrected run                                                                                                                        | 1    | Ten earlier checks pass, including nine-pixel names at 1280 and 1440, navigation, full screen and Mall edges; UBL first view is 4,070 ms against the 2,000 ms limit |
| `bun out/architecture-checks/fullscreen.ts`                                                                                                                  | 0    | 3 checks: whole-model, neighborhood and lineage enter/exit; existing labels work; no browser runtime errors                                                         |
| `bun run check` after each code finding                                                                                                                      | 0    | TypeScript, formatting, lint, comments, theme and brand checks pass                                                                                                 |
| `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <changed source files>`                                                          | 0    | No findings                                                                                                                                                         |
| `python3 ~/.codex/skills/project-docs/scripts/docs_sync.py --worktree .`                                                                                     | 0    | No documentation gaps                                                                                                                                               |
| `git diff --check`                                                                                                                                           | 0    | No whitespace errors                                                                                                                                                |

Logs remain outside Git under `~/scratch/sw-007/`: `arch-item-before.log`, `arch-fields-after.log`, `arch-sizing-unit.log`, `arch-sizing-browser.log`, `arch-lineage-final.log`, `arch-fullscreen.log`, `arch-check-1.log`, `arch-check-2-final.log` and `arch-check-3.log`.

## Corrected attempts

- The first wrapper invocation referenced an ignored local harness that the wrapper does not synchronize: exit 127, no browser checks executed. Passing a literal multiline harness then hit the wrapper's shell quoting: exit 2, no browser checks executed. The successful invocations encode the existing harness as one shell argument without changing the wrapper.
- The first static check after the form refactor exited 1 because TypeScript widened the mapped status key to string. Keeping that key a literal corrected it; the repeated check exited 0.
- The first sizing browser batch returned 1 because three browser-driver imports still named the removed lineage export. The overview-area suite in that batch passed. The corrected imports and mutation fixture are included in `3175d9e1`; the final lineage run reaches the known UBL timing assertion.
- A full prose leak scan of source code flagged existing programming identifiers and legacy screenshot path strings. Source files pass the confidential-only scan. Architecture prose passes the full scan; the gate and this handoff use the internal-log confidential-only scan.

## Open regressions and next step

No new product regression remains identified within these four findings. The UBL first-view timing failure is inherited: GATE.md already records the same timed assertion on main at 5,195 ms. Main was not rerun in this narrow architecture round. Assertions and timeouts were not relaxed.

Keep the journey completion checkbox unchecked. Resume the outstanding graph/rest capture classification described in GATE.md before completing the broader gate. The complete unit suite, mutation gate and stock-tour matrix were not repeated here, as this round requested only checks for the touched modules. Deferred follow-ups remain unimplemented.
