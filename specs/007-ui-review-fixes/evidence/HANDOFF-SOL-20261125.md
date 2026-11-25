# Regression gate handoff

The gate remains incomplete at `df201d11`, compared with main `da54cf17`. Completion stays unchecked.
The call-budget stop point ends this round. No origin push, main merge or branch deletion was performed.

## Local commits

- `70b3b565`: repair contradictory SCM and duplicate Tessera footer checks.
- `194c3dd4`: address publication mutation interfaces by project/path; main has the same baseline defect.
- `e8cce394`: fix Traffic phone canvas spacing while preserving both footer legends; update user guide.
- `7f3b6dee`: refresh item-diff/Traffic DOM expectations and open entities before ring measurements.
- `08242ebb`: exercise the current lineage packing predicate; reject a missing injection anchor.
- `df201d11`: submit the freshly created proposal contribution head, avoiding timestamp-dependent hashes.

## Commands and results

Heavy commands ran through unchanged `sw-midgard-run -- COMMAND` from the designated worktree.
Each browser command was `bun scripts/ci-validate.ts --step browser --suite SUITE`.
The full per-suite candidate/main table is at the top of `evidence/GATE.md`.

| Command or group | Exit/result |
| --- | --- |
| 33 browser suites, latest individual results | 29 exit 0; responsive, graph, lineage, editor exit 1 |
| `bun run test:mcp` | 0 |
| Matched main responsive fullscreen | 1, same transform restoration assertion |
| Matched main graph canvas measurement | 409 px versus candidate 458.61 px; both below 480 px |
| Matched main lineage UBL table first view | 1, 5195 ms; candidate 4874 ms against 2000 ms |
| Main editor | 1, 58.51 ms/key; candidate 59.72 against 30 ms |
| Candidate SCM and Tessera retries | 0 each |
| Candidate item-diff retry | 0; agent answer baseline unchanged |
| Candidate Traffic final retry | 0, 51 checks, no browser errors |
| `bun scripts/mutation-tests.ts` initial attempt | 143, stopped because frontend was missing |
| Full mutation with frontend | 1, inherited publication fixture baseline exception |
| Subsequent full mutation | 1, baselines pass, mutants 0–769 killed, survivor 770 is stale lineage injection |
| `bun scripts/mutation-tests.ts --only attributes-publication` after repair | 0, 1/1 killed |
| `bun scripts/mutation-tests.ts --only lineage-review` after repair | 0, 5/5 killed |
| Latest full mutation rerun | 1, intermittent unmodified proposals baseline failure before mutant execution |
| `bun scripts/mutation-tests.ts --only proposals` after repair | 0, 14/14 killed |
| Main proposal case with a 1100 ms delay before recreating the contribution | 1, same authorization assertion receives wrong-branch refusal |
| `bun run check` at df201d11 | 0 |
| Supplied unit result at d5d84e57, not rerun | 0, 4383 pass and 0 fail |
| Supplied build result, not rerun as full gate | 0 |
| Frozen main and candidate capture builds | 0 each |
| Neighborhood 1280/1440, light/dark, main/candidate | 8 commands exit 0, 21 images each; helper records unreachable states/findings |
| Metric detail 2560, light/dark, main/candidate | 4 commands exit 0, 2 images each |
| Candidate metric width measurements | `CONTENT_WIDTH 2560 []` in both themes |
| Filtered responsive content-width attempt | 143, no progress for five minutes; exact owned timeout stopped |
| Capture driver at budget stop | TERM sent to exact owned PID 568991; cleanup closes its timeout and frontend processes |

A full mutation pass after all repairs is still required. Main's Batch 2 gate records 942/942 killed;
that historical number does not clear the current candidate. The latest full run was not a survivor failure:
it stopped in the unmodified proposal fixture. The fixture is identical on main and reproduces there.

## Regressions and visual disposition

Fixed product regression: Traffic on a 360×780 phone reduced canvas height to 406.61 px. It now measures
432.61 px (55.46%), with both legends visible. Main measures 433 px. Commit: `e8cce394`.

Open visual regression: candidate screenshots leave the Mesh navigation row blank below Source control.
Main renders the icon and label. Observed in neighborhood 1280/1440 and metric detail 2560 light.
The candidate metric DOM still reports the Mesh button as visible, with normal bounds/color/opacity.
Investigate the rendering/clipping/compositing cause before editing; no speculative fix was applied.
No fix commit exists. Passing DOM/browser assertions do not clear the missing pixels.

The initial three focused graph-region comparisons are intended, with zero regressions inside those
regions. The new matrix subset has six changed candidate/main first-view pairs: three reviewed light
pairs classified regression for the blank Mesh row, three dark pairs still unclassified. Three changed
candidate/accepted full-screen pairs have different surrounding project inventories and are excluded;
compare matching content regions separately. No unchanged pair occurs in this nine-pair pixel subset.
All numbers come from `critical-diff/pixels.tsv` with RGB tolerance 16. The light metric content region
visually preserves the approved shared centered width. The neighborhood footer legend remains visible.

## Evidence and continuation

Remote evidence: `/srv/dev/sw/007-ui-review-fixes/out/after-main-da54cf17/`.
Local evidence: `out/after-main-da54cf17/`, with additional launch logs and temporary helpers under
`~/scratch/sw-007`. Screenshots remain ignored. No captures were added to git.

- Initial suites: root logs and `results.txt`; main reruns: `main/`; successful repair runs: `retries/`.
- `mutation-survivor-770.log` preserves the earlier survivor; current remote `mutation.log` is the
  proposals baseline failure. Local copies preserve both stages and focused repair output is in scratch.
- `matrix/commands.tsv` records the 12 completed capture commands. A partial 390 px light local tour
  began before stopping; do not count that batch as complete.
- `matrix/{main,candidate}/{theme}/{width}/` contains native images/events/failures/browser errors.
- `critical-diff/` contains pixel counts and previews at no more than 1600 px.
- Frozen capture source trees: `candidate-source/` at df201d11 and `main-source/` at da54cf17.
  Only disposable capture harnesses were adapted for selections, shared fixtures and image limits.

Next steps, in order:

1. Reproduce and fix the blank Mesh row using matching captures and DOM geometry; recapture only affected screens.
2. Run `sw-midgard-run -- bun scripts/mutation-tests.ts` with a Vite frontend on a permitted fixed port and
   temporary DATA_DIR. The scratch `run-mutation.sh` provides this setup. Preserve existing logs before rerunning;
   its current rename destination already exists. Do not claim a full pass from the targeted subsets.
3. Resume the capture matrix using the existing helpers, preserving completed evidence. Stop only owned exact PIDs.
   Finish stock tours at 390/1280/1440/2560, local/server, light/dark; graph/rest states; and each task-specific script.
4. Pixel-compare before visual review, match actual example data, crop unrelated fixture differences, and classify
   every changed pair against main and accepted review images. Respect image limits. The accepted neighborhood
   first-view fixture is Mall, not UBL despite the generic basename.
5. Update the top gate section and tick completion only after no regression or unclassified required pair remains.
