# Regression gate handoff

The gate remains incomplete. The full mutation command passed with 958/958 mutants killed and every unmodified module baseline passing. No new product regression was confirmed in this session. T076 remains unchecked because graph/rest coverage, unreachable-state checks and visual classification are incomplete.

## Revisions and scope

- Working branch: `007-ui-review-fixes`, starting HEAD `4bd0ad14`.
- Frozen capture candidate: `df201d11`; subsequent starting-branch commits change evidence only.
- Comparison main: `da54cf17`. Accepted images: `out/gate-007/comparison/candidate` on Midgard.
- No application source changed this session. No origin push was performed.
- Earlier repairs remain `70b3b565`, `194c3dd4`, `e8cce394`, `7f3b6dee`, `08242ebb` and `df201d11`. The Mesh finding was withdrawn in `4bd0ad14`; do not fix it.

## Commands and results

| Command | Exit and result |
| --- | --- |
| Prior browser gate: `bun scripts/ci-validate.ts --step browser --suite SUITE` | 29 suites pass; four failures reproduced on main. Full per-suite table is at the top of GATE.md. |
| Additional `test:mcp` | 0, prior session |
| Supplied `sw-midgard-run -- bun test` at d5d84e57 | 0; 4383 pass, 0 fail; not repeated |
| Supplied `bun --bun run build` | 0; not repeated |
| `sw-midgard-run -- bash /srv/dev/run-mutation-session3.sh` | Inner `bun scripts/mutation-tests.ts`: 0, 958/958 killed, all baselines pass. Outer wrapper: 143 after the script recorded `mutation-retry 0`. |
| `sw-midgard-run -- bash /srv/dev/capture-parallel-session3.sh` | 143: deliberately stopped at budget limit; completed batches retained. |
| `sw-midgard-run -- bash /srv/dev/capture-retry-session3.sh 390 20` | 0; four light-phone graph/lineage retries, 43/57 images respectively on each revision. |
| `sw-midgard-run --pull out/after-main-da54cf17/matrix-diff -- bash -c 'cp /srv/dev/diff-matrix-session3.ts out/diff-matrix-session3.ts && bun out/diff-matrix-session3.ts'` | Earlier 1529-pair snapshot: 0. Expanded snapshot: 2603 pairs written, outer wrapper 143; not a clean command pass. |
| `python3 /srv/dev/audit-captures-session3.py` over SSH | 0; nine matched groups have filename or unreachable-state differences needing triage. |

The mutation frontend used port 5407 and a temporary DATA_DIR. The final log ends with `958/958 targeted mutants killed; all unmodified module baselines passed.` Evidence: `out/after-main-da54cf17/mutation.log` and `results.txt` on Midgard. No further fixture repair was needed; the existing current-head proposal fixture passed.

Capture workers used temporary DATA_DIR values and ports 5410–5417; retry used 5430–5431. The owned master PID 1075363 was stopped by exact PID, its cleanup traps stopped its workers, and a subsequent process check found none of those workers or servers remaining. The mutation frontend/processes were also gone.

## Capture inventory and review

Evidence root on Midgard: `/srv/dev/sw/007-ui-review-fixes/out/after-main-da54cf17`.

- All 64 stock-tour commands completed with exit 0: both revisions, both themes, both modes, all four widths, two halves each. They produced 4096 images, 64 per command.
- Twelve earlier focused commands produced 176 images. These cover the below-canvas legend and wide metric detail.
- The latest per-key command inventory contains 161 completed entries, all recorded exit 0, totaling 6213 images. This includes focused captures and completed graph/rest batches; it is not the complete requested matrix.
- Initial light-phone full-graph and lineage runs aborted under the helper's three-second timeout. Retrying both revisions with ten seconds in isolated, ignored source copies produced matched 43/57 image counts. Product code was unchanged.
- Capture helpers can return 0 while recording unreachable actions. Treat `failures.jsonl` and missing filenames as unresolved coverage, not successful states.
- The first 1529-pair snapshot is classified: 1296 intended, 225 unchanged, eight fixture exclusions, zero fixed and zero regression. Its `matrix-diff/classifications.tsv` includes baseline paths.
- The expanded snapshot contains 2603 pairs. Another 121 changed previews are classified intended in `matrix-diff/additional-reviewed-session3.tsv`; the expanded snapshot remains partially reviewed. Do not present the first snapshot counts as complete matrix counts.
- Previews were reviewed in batches of at most 30, maximum side 1600 px. Full-page dispositions in the first snapshot inherit their matching viewport review.
- Reviewed main pairs include 1440 dark neighborhood and 2560 dark metric detail. The legend remains below the canvas at 1280/1440 in both themes; metric list/detail retains the approved shared content width at 2560 in both themes.
- The accepted 2560 whole-model graph has a different force-layout arrangement. Its layout source is unchanged from the accepted revision and randomizes positions. No merge regression was confirmed from that arrangement.
- Older accepted images sometimes use Commerce/Mall or UBL/Commerce different fixtures; eight pairs were excluded. The Mesh row remains present and the withdrawn finding stays withdrawn.

## Remaining captures

The following keys were absent from the final completed-command inventory. An interrupted folder can exist without a completed command; rerun it rather than trusting partial files.

- main, dark, 390, rest: shell, catalog, metrics, mappings, odcs, editing
- candidate, dark, 390, graphs: neighborhood
- candidate, dark, 390, rest: shell, catalog, metrics, mappings, odcs, editing
- main, dark, 1280, graphs: lineage, mapping-graph
- main, dark, 1280, rest: shell, catalog, metrics, mappings, odcs, editing
- candidate, dark, 1280, graphs: full-graph, lineage, mapping-graph
- candidate, dark, 1280, rest: shell, catalog, metrics, mappings, odcs, editing
- main, dark, 1440, graphs: lineage, mapping-graph
- main, dark, 1440, rest: shell, catalog, metrics, mappings, odcs, editing
- candidate, dark, 1440, graphs: full-graph, lineage, mapping-graph
- candidate, dark, 1440, rest: shell, catalog, metrics, mappings, odcs, editing
- main, dark, 2560, graphs: full-graph, lineage, mapping-graph, neighborhood
- main, dark, 2560, rest: shell, catalog, metrics, mappings, odcs, editing
- candidate, dark, 2560, graphs: full-graph, lineage, mapping-graph, neighborhood
- candidate, dark, 2560, rest: shell, catalog, metrics, mappings, odcs, editing

## Resume steps

1. Reuse completed captures. Read `/srv/dev/capture-worker-session3.sh` and `matrix/commands.tsv`; finish the missing keys above through unchanged `sw-midgard-run`, using the same frozen sources, fixtures, ports and split selections.
2. Triage the nine audit differences. Light 1280 network `areas-collapsed` and several lineage walk/select states succeed on main but are unreachable on candidate; these are unresolved checks, not confirmed regressions. Other differences favor candidate. Labels/legend selectors fail on both revisions in several graph batches and require harness-aware inspection.
3. Rebuild pixel comparisons after capture completion. Invalidate cached light-390 graph/lineage rows and previews first: the 2603 snapshot may include pre-retry or in-flight files. Audit filenames in both directions because the diff script iterates candidate files.
4. Finish visual classification against main and accepted 007. Local scratch `review-expanded-session3.json` has 614 new changed non-full previews: the first 60 were reviewed, plus the first 60 graph-filtered entries and preview 2299. The additional TSV is the authoritative record, keyed with baseline paths. Do not deduplicate accepted comparisons by screen key alone: multiple accepted paths can match one key.
5. Fix only confirmed product regressions in small commits; recapture affected screens. Preserve visual design and main's additions. Tick T076 only after complete coverage and zero regressions.

## Local resume files

Local scratch root: `~/scratch/sw-007`. Scripts and manifests include `capture-worker-session3.sh`, `capture-parallel-session3.sh`, `capture-retry-session3.sh`, `diff-matrix-session3.ts`, `audit-captures-session3.py`, `commands-session3.tsv`, `capture-audit-session3.jsonl`, `review-expanded-session3.json` and `missing-captures-session3.txt`. Remote counterparts live directly under `/srv/dev` except evidence under the root above. Screenshots and scratch scripts remain outside git.

The four inherited browser failures remain responsive fullscreen zoom restoration, graph canvas height, lineage timing and editor typing performance. The confirmed Traffic phone regression is fixed by `e8cce394`. No additional product fix was made this session; incomplete checks remain open.

## Documentation validation

`bun run fmt:check` and `bun run lint` returned 0. The repository formatter excludes Markdown paths; oxfmt was run through `--stdin-filepath` on both changed documents instead. The readable-code check and confidential-term scan returned 0 on both files. `git diff --check` returned 0.
