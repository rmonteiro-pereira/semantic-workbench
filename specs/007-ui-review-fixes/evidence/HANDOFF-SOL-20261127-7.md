# Phone dataset lineage: targeted walking comparison

**Verdict: main works; candidate is harness, in light and dark.** Both versions completed three consecutive walks in each of two independent attempts per theme at 390×844. Candidate walking remains possible through visible controls, but its route differs: the first two walks use Fit → select a name card → Selected path → Walk here; the third uses one Zoom in and a pan. The capture script only searches card-level Walk here buttons and misses the first route. No final attempt left a blocked walk or an empty canvas.

Recommendation: classify the reported canvas-button search failures as harness failures for the end-to-end walking question. Preserve the limitation that one Zoom in alone does not reliably reveal a neighboring canvas action. This result does not certify that narrower interaction or complete the broader T076 gate.

## Versions and verdicts

| Version   | Commit                                     | Light   | Dark    | Completed walks                |
| --------- | ------------------------------------------ | ------- | ------- | ------------------------------ |
| main      | `da54cf171f56c2c2161991ea56baf63d1f5270a3` | works   | works   | 3 per attempt, twice per theme |
| candidate | `c28793c0df27afdec8d6d5ddd80e58b3e17503e5` | harness | harness | 3 per attempt, twice per theme |

Main follows properties → operating_budgets → budget_lines → ledger_accounts. Candidate follows properties → equipment → buildings → ledger_accounts. The next target is the first unvisited, non-center card reachable through the controls, matching the capture sequence's target policy; the two versions need not expose the same next card. Every successful click was followed by the expected new center in the rendered graph. There were no forced clicks or injected viewport/state changes.

## Setup and sequence

- Sources are separate archives under `/srv/dev/repro-walk390/{main,candidate}`. The old `/srv/dev/repro-1857/` setup and its scripts remain unchanged; copies are under `/srv/dev/repro-walk390/originals/`.
- The same `startAuthApi` helper starts each built static app, using its local-mode branch. Unlike the earlier Admin reproduction, this graph sequence needs the shipped Mall example rather than the authentication fixture. Its disposable workspace loads `ubl`, `commerce`, `mapped-commerce` and `mall`, as `capture-states.ts` does. Temporary DATA_DIR and browser profiles are beneath `/srv/dev/repro-walk390/{main,candidate}-temp/`. Ports are 5461 and 5462. No external service or mock identity provider is needed.
- Playwright runs only through unchanged `sw-midgard-run`, inside its isolated loopback namespace. Each attempt has a fresh browser context, explicit theme, device scale 1 and a 390×844 viewport.
- Open `mall.odcs.yaml` → Contract → Open properties → Lineage. Record opening. Reproduce `graph-states.ts` preparation: select a center column, close Selected path, visit hops 1/2/3 and Foreign keys, open all center columns, and filter for `id` when the control exists. Main lacks that filter in this state; the original harness also treats that step as an independent attempt and continues.
- Select a visible card title and record selection. For each of three walks: close any path dialog, inspect the canvas, try Fit, then one Zoom in, then pan toward the selected/rendered card when available. If needed, Fit again and select a visible unvisited neighbor. Candidate opens Selected path, whose normal Walk here button completes the walk. On main, selecting the neighbor frames its detailed card; after that framing, the canvas button completes the walk.
- Toolbar clicks use normal Playwright clicks; card and walk actions use mouse coordinates at exposed hit points. The page scrolls the canvas into view after toolbar actions. This matters on main's taller dataset page. No desktop browser was launched.

## Measurement definitions

`C/W` means cards intersecting the canvas **and** the phone viewport / enabled card-level Walk here buttons with an exposed hit point in that intersection. Cards can be partially visible. Counts describe the geometry; an open dialog can cover cards, while its Walk here button is counted separately in the recovery column. A post-walk `W=0` means the new center has no exposed next action at that instant, not that the preceding walk failed.

The per-step table records the state after each named action. The recovery table records the state before the walk and after each attempted recovery. `—` means unnecessary or unavailable; for candidate walk 2, there is no rendered selected/non-center card to pan toward after Zoom in. `Path=yes` means the visible Selected path dialog supplied Walk here; a changed center confirms that it worked. Each screenshot is the full 390×844 viewport, retained outside Git.

## Per-step states and screenshot paths

| Version   | Theme | Attempt | Step     | Cards | Canvas Walk here visible/clickable | Result                      | Screenshot path                                             |
| --------- | ----- | ------- | -------- | ----: | ---------------------------------- | --------------------------- | ----------------------------------------------------------- |
| main      | light | 1       | open     |     1 | no                                 | opened                      | `/srv/dev/repro-walk390/out/main-light-1-open.png`          |
| main      | light | 1       | selected |     1 | yes (1)                            | selected properties         | `/srv/dev/repro-walk390/out/main-light-1-selected.png`      |
| main      | light | 1       | walk-1   |     2 | no                                 | walked to operating_budgets | `/srv/dev/repro-walk390/out/main-light-1-walk-1.png`        |
| main      | light | 1       | walk-2   |     1 | no                                 | walked to budget_lines      | `/srv/dev/repro-walk390/out/main-light-1-walk-2.png`        |
| main      | light | 1       | walk-3   |     3 | yes (1)                            | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/main-light-1-walk-3.png`        |
| main      | light | 2       | open     |     1 | no                                 | opened                      | `/srv/dev/repro-walk390/out/main-light-2-open.png`          |
| main      | light | 2       | selected |     1 | yes (1)                            | selected properties         | `/srv/dev/repro-walk390/out/main-light-2-selected.png`      |
| main      | light | 2       | walk-1   |     2 | no                                 | walked to operating_budgets | `/srv/dev/repro-walk390/out/main-light-2-walk-1.png`        |
| main      | light | 2       | walk-2   |     1 | no                                 | walked to budget_lines      | `/srv/dev/repro-walk390/out/main-light-2-walk-2.png`        |
| main      | light | 2       | walk-3   |     3 | yes (1)                            | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/main-light-2-walk-3.png`        |
| main      | dark  | 1       | open     |     1 | no                                 | opened                      | `/srv/dev/repro-walk390/out/main-dark-1-open.png`           |
| main      | dark  | 1       | selected |     1 | yes (1)                            | selected properties         | `/srv/dev/repro-walk390/out/main-dark-1-selected.png`       |
| main      | dark  | 1       | walk-1   |     2 | no                                 | walked to operating_budgets | `/srv/dev/repro-walk390/out/main-dark-1-walk-1.png`         |
| main      | dark  | 1       | walk-2   |     1 | no                                 | walked to budget_lines      | `/srv/dev/repro-walk390/out/main-dark-1-walk-2.png`         |
| main      | dark  | 1       | walk-3   |     3 | yes (1)                            | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/main-dark-1-walk-3.png`         |
| main      | dark  | 2       | open     |     1 | no                                 | opened                      | `/srv/dev/repro-walk390/out/main-dark-2-open.png`           |
| main      | dark  | 2       | selected |     1 | yes (1)                            | selected properties         | `/srv/dev/repro-walk390/out/main-dark-2-selected.png`       |
| main      | dark  | 2       | walk-1   |     2 | no                                 | walked to operating_budgets | `/srv/dev/repro-walk390/out/main-dark-2-walk-1.png`         |
| main      | dark  | 2       | walk-2   |     1 | no                                 | walked to budget_lines      | `/srv/dev/repro-walk390/out/main-dark-2-walk-2.png`         |
| main      | dark  | 2       | walk-3   |     3 | yes (1)                            | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/main-dark-2-walk-3.png`         |
| candidate | light | 1       | open     |    19 | no                                 | opened                      | `/srv/dev/repro-walk390/out/candidate-light-1-open.png`     |
| candidate | light | 1       | selected |     2 | no                                 | selected properties         | `/srv/dev/repro-walk390/out/candidate-light-1-selected.png` |
| candidate | light | 1       | walk-1   |     1 | no                                 | walked to equipment         | `/srv/dev/repro-walk390/out/candidate-light-1-walk-1.png`   |
| candidate | light | 1       | walk-2   |     1 | no                                 | walked to buildings         | `/srv/dev/repro-walk390/out/candidate-light-1-walk-2.png`   |
| candidate | light | 1       | walk-3   |     1 | no                                 | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/candidate-light-1-walk-3.png`   |
| candidate | light | 2       | open     |    19 | no                                 | opened                      | `/srv/dev/repro-walk390/out/candidate-light-2-open.png`     |
| candidate | light | 2       | selected |     2 | no                                 | selected properties         | `/srv/dev/repro-walk390/out/candidate-light-2-selected.png` |
| candidate | light | 2       | walk-1   |     1 | no                                 | walked to equipment         | `/srv/dev/repro-walk390/out/candidate-light-2-walk-1.png`   |
| candidate | light | 2       | walk-2   |     1 | no                                 | walked to buildings         | `/srv/dev/repro-walk390/out/candidate-light-2-walk-2.png`   |
| candidate | light | 2       | walk-3   |     1 | no                                 | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/candidate-light-2-walk-3.png`   |
| candidate | dark  | 1       | open     |    19 | no                                 | opened                      | `/srv/dev/repro-walk390/out/candidate-dark-1-open.png`      |
| candidate | dark  | 1       | selected |     2 | no                                 | selected properties         | `/srv/dev/repro-walk390/out/candidate-dark-1-selected.png`  |
| candidate | dark  | 1       | walk-1   |     1 | no                                 | walked to equipment         | `/srv/dev/repro-walk390/out/candidate-dark-1-walk-1.png`    |
| candidate | dark  | 1       | walk-2   |     1 | no                                 | walked to buildings         | `/srv/dev/repro-walk390/out/candidate-dark-1-walk-2.png`    |
| candidate | dark  | 1       | walk-3   |     1 | no                                 | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/candidate-dark-1-walk-3.png`    |
| candidate | dark  | 2       | open     |    19 | no                                 | opened                      | `/srv/dev/repro-walk390/out/candidate-dark-2-open.png`      |
| candidate | dark  | 2       | selected |     2 | no                                 | selected properties         | `/srv/dev/repro-walk390/out/candidate-dark-2-selected.png`  |
| candidate | dark  | 2       | walk-1   |     1 | no                                 | walked to equipment         | `/srv/dev/repro-walk390/out/candidate-dark-2-walk-1.png`    |
| candidate | dark  | 2       | walk-2   |     1 | no                                 | walked to buildings         | `/srv/dev/repro-walk390/out/candidate-dark-2-walk-2.png`    |
| candidate | dark  | 2       | walk-3   |     1 | no                                 | walked to ledger_accounts   | `/srv/dev/repro-walk390/out/candidate-dark-2-walk-3.png`    |

## Recovery states per walk

All figures below are `C/W`. At most one Zoom in was used per walk. Main's last column includes Fit again → select a neighbor title → wait for card framing → canvas Walk here. Candidate's first two walks use Fit again → select a neighbor title → Selected path → Walk here. Those actions are visible UI routes.

| Version   | Theme | Attempt | Walk   | Before | After Fit | After one Zoom in | After pan | Final usable route                        |
| --------- | ----- | ------- | ------ | ------ | --------- | ----------------- | --------- | ----------------------------------------- |
| main      | light | 1       | walk-1 | 1/1    | —         | —                 | —         | canvas button before recovery             |
| main      | light | 1       | walk-2 | 2/0    | 83/0      | 80/0              | 76/0      | 1/1; selected-card framing, canvas button |
| main      | light | 1       | walk-3 | 1/0    | 72/0      | 70/0              | 47/0      | 3/2; selected-card framing, canvas button |
| main      | light | 2       | walk-1 | 1/1    | —         | —                 | —         | canvas button before recovery             |
| main      | light | 2       | walk-2 | 2/0    | 83/0      | 80/0              | 76/0      | 1/1; selected-card framing, canvas button |
| main      | light | 2       | walk-3 | 1/0    | 72/0      | 70/0              | 47/0      | 3/2; selected-card framing, canvas button |
| main      | dark  | 1       | walk-1 | 1/1    | —         | —                 | —         | canvas button before recovery             |
| main      | dark  | 1       | walk-2 | 2/0    | 83/0      | 80/0              | 76/0      | 1/1; selected-card framing, canvas button |
| main      | dark  | 1       | walk-3 | 1/0    | 72/0      | 70/0              | 47/0      | 3/2; selected-card framing, canvas button |
| main      | dark  | 2       | walk-1 | 1/1    | —         | —                 | —         | canvas button before recovery             |
| main      | dark  | 2       | walk-2 | 2/0    | 83/0      | 80/0              | 76/0      | 1/1; selected-card framing, canvas button |
| main      | dark  | 2       | walk-3 | 1/0    | 72/0      | 70/0              | 47/0      | 3/2; selected-card framing, canvas button |
| candidate | light | 1       | walk-1 | 2/0    | 2/0       | 1/0               | 1/0       | 1/0; Path=yes                             |
| candidate | light | 1       | walk-2 | 1/0    | 2/0       | 1/0               | —         | 2/0; Path=yes                             |
| candidate | light | 1       | walk-3 | 1/0    | 2/0       | 2/0               | 2/1       | canvas button after pan                   |
| candidate | light | 2       | walk-1 | 2/0    | 2/0       | 1/0               | 1/0       | 1/0; Path=yes                             |
| candidate | light | 2       | walk-2 | 1/0    | 2/0       | 1/0               | —         | 2/0; Path=yes                             |
| candidate | light | 2       | walk-3 | 1/0    | 2/0       | 2/0               | 2/1       | canvas button after pan                   |
| candidate | dark  | 1       | walk-1 | 2/0    | 2/0       | 1/0               | 1/0       | 1/0; Path=yes                             |
| candidate | dark  | 1       | walk-2 | 1/0    | 2/0       | 1/0               | —         | 2/0; Path=yes                             |
| candidate | dark  | 1       | walk-3 | 1/0    | 2/0       | 2/0               | 2/1       | canvas button after pan                   |
| candidate | dark  | 2       | walk-1 | 2/0    | 2/0       | 1/0               | 1/0       | 1/0; Path=yes                             |
| candidate | dark  | 2       | walk-2 | 1/0    | 2/0       | 1/0               | —         | 2/0; Path=yes                             |
| candidate | dark  | 2       | walk-3 | 1/0    | 2/0       | 2/0               | 2/1       | canvas button after pan                   |

## Interpretation and remaining limits

The candidate's `LineageOverviewCard` intentionally has a selectable title and no card-level Walk here button. `scripts/ui-review/graph-states.ts` searches only `.lineage-card:not(.center):not(.group)` descendant buttons and stops when none has an uncovered center point. It neither selects an overview neighbor to use Selected path nor performs the recovery above. That search cannot establish that a person is unable to walk.

The visible alternative is implemented by `src/app/odcs/LineageCanvas.tsx` (`select`, `walkSelected`) and `src/app/odcs/SelectedPath.tsx` (`SelectedPath`). The candidate's title selection opens the phone path dialog in overview mode; its Walk here action changes the center. Main's selected-card framing provides the canvas action instead. The third candidate walk also demonstrates that a detailed canvas Walk here remains reachable after Zoom in and a pan.

No new end-to-end walking regression remains open from this comparison. A standalone Fit → one Zoom in check is insufficient for both versions in several recorded states: main has many tiny cards after Fit, while candidate returns name cards and then often only the center in detail. This limitation is retained rather than treated as a pass for every detailed-card action. No product fix is proposed. The earlier empty-canvas captures are not disproved as historical frames; they did not persist as a blocked walk in the final manual-control routes.

Main's own Batch 2 gate lists inherited responsive, graph, editor, lineage and back-history suite failures. This narrow reproduction does not rerun or clear those suites, and does not mark T076 complete.

## Pixel and visual evidence

All 20 matching version/theme/attempt/step image pairs differ: 69,018–122,200 changed pixels out of 329,160 per image. This is a change detector, not a regression score: the versions frame different cards and their first reachable walking routes differ. Candidate repeat comparisons are identical for six of ten step/theme pairs; the other four have 48, 78, 81 and 6,356 changed pixels. The walking outcomes and card/button counts agree between repetitions.

Pixel comparison preceded the final visual review. Changed phone screens in both themes show the recorded center after each walk; representative selected, second-walk and third-walk screens show the candidate's name cards versus main's detailed cards. No image exceeds 390×844. There are 40 final screenshots and 33 preliminary screenshots, 73 in total, outside Git; visual inspection stayed below the 30-image batch limit. Screenshot references above are paths only.

Raw final records: `/srv/dev/repro-walk390/out/steps.jsonl` (use the last record for each version/theme/attempt/step; main's final replay supersedes its earlier probe). Reproduction source: `/srv/dev/repro-walk390/repro.ts` and `scripts/repro-walk390.ts` in each archived source. Local normalized records and pixel comparisons are under `~/scratch/sw-007/walk390/` (`final-steps.json`, `version-pixels.json`, `candidate-repeat-pixels.json`).

## Commands and exit codes

The heavy commands below were invoked from `007-gate-repro` using unchanged `sw-midgard-run`. No GitHub/origin push or merge occurred. The helper's permitted scratch-repository synchronization is the only push.

| Command                                                                                                                                                | Exit | Result                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---: | ------------------------------------------------------------------------------------ |
| `git --git-dir=/srv/dev/sw.git archive da54cf17` and `git --git-dir=/srv/dev/sw.git archive c28793c0`, extracted into the two new source folders       |    0 | Separate pinned sources.                                                             |
| `python3 ~/.codex/skills/devops/scripts/pre_push_check.py .`                                                                                           |    0 | Two local commits checked; zero findings before scratch synchronization.             |
| In each source, `bun --bun run build` through `sw-midgard-run`                                                                                         |    0 | Built artifacts; logs in `preliminary/build-{main,candidate}.log`.                   |
| In each source, `bunx --bun oxfmt scripts/repro-walk390.ts scripts/helpers/processes.ts scripts/auth-environment.ts /srv/dev/repro-walk390/pixels.mjs` |    0 | Scratch scripts formatted.                                                           |
| In each source, `bunx --bun oxlint --quiet scripts/repro-walk390.ts`                                                                                   |    0 | Zero errors; two warnings.                                                           |
| `TMPDIR=/srv/dev/repro-walk390/candidate-temp bun scripts/repro-walk390.ts candidate` through `sw-midgard-run`                                         |    0 | Two light and two dark attempts; 12 completed walks. Log: `out/run-candidate.log`.   |
| `TMPDIR=/srv/dev/repro-walk390/main-temp bun scripts/repro-walk390.ts main` through `sw-midgard-run`, final replay                                     |    0 | Two light and two dark attempts; 12 completed walks. Log: `out/run-main-replay.log`. |
| `sw-midgard-run -- bash -c 'bun run fmt:check && bun run lint'`                                                                                        |    0 | Repository format and lint checks.                                                   |
| Local final-record assertions: 40 unique step records; every walk's expected target equals its rendered new center                                     |    0 | All 24 walks confirmed.                                                              |
| `bun ~/scratch/sw-007/walk390/pixels.mjs FIRST.png SECOND.png`, all version pairs and candidate repeat pairs                                           |    0 | Pixel counts above; no image dependency added.                                       |
| `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed` on the scratch probe, pixel script and handoff                            |    0 | Readability check.                                                                   |
| `oxfmt` on this handoff with a scratch config, followed by `oxfmt --check`                                                                             |    0 | Handoff formatted.                                                                   |
| `python3 ~/.codex/skills/never-leak-process/scripts/leak_scan.py --confidential-only specs/007-ui-review-fixes/evidence/HANDOFF-SOL-20261127-7.md`     |    0 | Internal evidence log; zero confidential-term hits.                                  |

The final replay wrapper is:

```sh
sw-midgard-run -- bash -c '
set -e
base=/srv/dev/repro-walk390
source="$base/main"
cp "$base/repro.ts" "$source/scripts/repro-walk390.ts"
cd "$source"
bunx --bun oxfmt scripts/repro-walk390.ts
bunx --bun oxlint --quiet scripts/repro-walk390.ts
TMPDIR="$base/main-temp" bun scripts/repro-walk390.ts main
'
```

The preceding successful matrix wrapper iterates `main candidate`, formats the copied helper/probe files, and runs the same command with each version's TMPDIR. Its initial main probe omitted a final post-selection button check; the complete main replay above supersedes it.

### Preliminary commands, excluded from the verdict

- First server readiness attempt: exit 1 before browser execution. Bun's timeout DOMException has a numeric `code`, while main's copied retry helper checked that before its `name`. The copied helper now recognizes `TimeoutError` by name, retaining the same `/readyz` predicate and 30-second deadline. The same scratch-only compatibility change applies to both sources. Log: `preliminary/startup-main-failed.log`.
- First prefix probe: four main attempts stopped at a missing Filter columns control; the command subsequently continued to candidate and exited 0, but those main attempts are not walking results. The final probe conditionally skips the absent filter, matching the capture harness's independent-attempt behavior. Logs: `preliminary/prefix-main-failed.log` and `.jsonl`.
- Initial candidate canvas-only probe: command exit 0, but its walk searches missed the visible Selected path route. Preliminary logs and images remain in `preliminary/`; these are not accepted as blocked product walks.
- A wrapper copy failed with exit 1 because a newly copied scratch script belonged to root. Ownership was corrected only within `/srv/dev/repro-walk390/` before restarting.
- An unscrolled main probe was deliberately interrupted by SIGTERM to its own browser PID 3759409; command exit 1. Main's scrollable dataset page otherwise left the graph partly below the viewport. Its helper stopped server PID 3758779 in cleanup. Evidence: `preliminary-unscrolled/`.
- The first local pixel command found no Pillow (`ModuleNotFoundError`, exit 1), and a Node invocation found no Node executable (exit 127). The final comparison uses Bun and built-in PNG/zlib decoding; no dependency was installed.

## Cleanup and next step

The owning `startAuthApi.stop()` sends SIGTERM to the exact child PID and awaits its exit. Final candidate server PID 3776864 and final main server PID 3792084 both have matching `OWNED_SERVER_PID` / `STOP_SERVER_PID` log lines and `CLEANUP_COMPLETE`. Earlier main PID 3765901 also has matching cleanup. Known earlier server PIDs 3737574, 3745837 and 3758779, and deliberately interrupted browser PID 3759409, were also checked absent by exact PID. The first readiness failure awaited its helper-owned child during cleanup; its PID was not logged. Browser contexts and browser processes close through their owning Playwright APIs; disposable DATA_DIR roots are removed by the fixture.

After all browser runs, a `/proc` cwd check for this reproduction returned `OWNED_PROCESSES_REMAINING []`; exact-PID checks also showed no remaining listed process. The original repro folder, review worktrees, candidate worktree/deployment, owner's checkout, production data and ports were not modified.

Next step: use overview-card selection and Selected path as a fallback in the capture harness, and wait for selected-card framing before deciding that main has no target. Keep the separate one-Zoom-in canvas-action limitation visible in the broader review. Only this handoff is committed locally on `007-gate-repro`; no product code or task checklist is changed.
