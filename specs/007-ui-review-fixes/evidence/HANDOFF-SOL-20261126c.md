# Dark local capture handoff

The missing-key capture commands are complete, but the visual gate remains incomplete. No product regression was confirmed. Keep T076 unchecked: 422 changed pairs still need visual review, and lineage traversal coverage contains layout noise.

## Scope and revisions

- Evidence branch: `007-gate-captures`, starting at `2201f521`.
- Frozen candidate: the earlier `candidate-source/` snapshot, recorded as `df201d11` in the preceding handoff. Main: the frozen `main-source/` snapshot at `da54cf17`.
- Only dark theme and local mode, at 390×844, 1280×720, 1440×900 and 2560×1440.
- No application code, tasks checklist or other worktree changed. No origin push. No regression fix commit.
- The earlier evidence trees were read only. Copies, new captures and comparisons belong to `/srv/dev/sw/007-gate-captures/out/after-main-da54cf17` on Midgard.

## Capture results

All 67 keys from `missing-captures-session3.txt` have a completed command with exit 0. They produced 1,267 images. Existing counterpart groups were copied from the earlier evidence for matching comparisons.

| Width | Main commands / images | Candidate commands / images | Exit |
| --- | --- | --- | --- |
| 390 | 6 / 75 | 7 / 96 | All 0 |
| 1280 | 8 / 147 | 9 / 190 | All 0 |
| 1440 | 8 / 147 | 9 / 190 | All 0 |
| 2560 | 10 / 211 | 10 / 211 | All 0 |
| Total | 32 / 580 | 35 / 687 | All 0 |

Capture exit 0 does not establish that every action was reachable. The filenames and `failures.jsonl` were audited separately.

The unchanged `sw-midgard-run` wrapper ran every capture and pixel-processing job. Frontends used ports 5440–5447 and temporary DATA_DIR values under `/srv/dev/tmp-007-gate-captures`; fixture API loopback ports were allocated inside the wrapper namespace. The final wrapper returned 0. The owned workers and Vite servers were gone after cleanup.

The isolated capture copies use a ten-second default action timeout, following the earlier retry helper; the initial three-second attempts produced startup and action timeouts. Only capture-harness timeout and viewport settings changed in ignored copies. Native application source stayed frozen.

## Commands and exits

| Command | Exit / result |
| --- | --- |
| `sw-midgard-run -- bash /srv/dev/capture-parallel-session3c.sh` before checkout initialization | 128; checkout path already contained the copied evidence; no capture started |
| `sw-midgard-run -- bash -c 'mv /srv/dev/captures-session3c-out out && bash /srv/dev/capture-parallel-session3c.sh'` | 143; owned driver stopped by exact PID after short-timeout coverage failures |
| `sw-midgard-run -- bash /srv/dev/capture-parallel-session3c.sh` with isolated ten-second harness timeout | 0; all 67 requested keys completed |
| Phone diff waiter using `rg` | 255 after the owned waiter was stopped; `rg` was unavailable remotely; replaced with `grep` |
| `sw-midgard-run --pull out/after-main-da54cf17/session3c-diff-390 -- bash -c 'while ! grep -q "CAPTURE END candidate dark 390 rest editing" out/after-main-da54cf17/matrix/worker-390.log; do sleep 5; done; cp /srv/dev/diff-session3c.ts out/diff-session3c.ts; node_modules/.bin/oxfmt out/diff-session3c.ts; DIFF_WIDTH=390 bun out/diff-session3c.ts'` | 0; 96 phone pairs |
| `sw-midgard-run --pull out/after-main-da54cf17/session3c-diff-partial -- bash -c 'cp /srv/dev/diff-session3c.ts out/diff-session3c.ts; node_modules/.bin/oxfmt out/diff-session3c.ts; DIFF_LABEL=partial bun out/diff-session3c.ts'` | 0; intermediate 180-pair snapshot |
| `sw-midgard-run --pull out/after-main-da54cf17/session3c-diff --pull out/after-main-da54cf17/matrix/commands.tsv -- bash -c 'while ! grep -q "CAPTURE END candidate dark 2560 rest editing" out/after-main-da54cf17/matrix/worker-2560.log; do sleep 5; done; cp /srv/dev/diff-session3c.ts out/diff-session3c.ts; node_modules/.bin/oxfmt out/diff-session3c.ts; bun out/diff-session3c.ts'` | 0; final 669 matched pairs |
| `sw-midgard-run --pull out/after-main-da54cf17/session3c-diff -- bash -c 'cp /srv/dev/resize-previews-session3c.ts out/resize-previews-session3c.ts; node_modules/.bin/oxfmt out/resize-previews-session3c.ts; bun out/resize-previews-session3c.ts'` | 0; corrected 177 oversized preview strips |
| `python3 ~/scratch/sw-007/classify-session3c.py` | 0; classification manifest and pending queue; zero final previews above 1600 px |

## Pixel comparison and classification

Comparison uses the existing helper's RGB channel tolerance of 16. Of 669 matched image pairs, 15 have no pixel above that tolerance and 654 differ. Comparisons cover the union of the requested keys and their copied counterparts; they are not a fresh comparison of the whole earlier gate matrix.

| Width | Intended | Unchanged | Regression | Excluded traversal noise | Pending review |
| --- | --- | --- | --- | --- | --- |
| 390 | 76 | 20 | 0 | 0 | 0 |
| 1280 | 18 | 0 | 0 | 33 | 133 |
| 1440 | 11 | 0 | 0 | 35 | 140 |
| 2560 | 24 | 0 | 0 | 30 | 149 |
| Total | 129 | 20 | 0 | 98 | 422 |

The unchanged class includes the 15 pixel-identical phone pairs and five phone pairs containing only fixture hash/time or focus differences. Exact duplicates of reviewed cropped previews inherit their representative's disposition. Pending pairs have no product classification.

Visual review used 120 distinct pair-preview images in eight batches of 15, 15, 20, 20, 10, 15, 15 and 10. Main is on the left and candidate on the right. Previews crop to the differing region with context when possible. The first seven batches included strips up to 1602 px wide because of gap rounding. That exceeded the requested limit by two pixels. All 177 oversized artifacts were subsequently reduced; every final preview is at most 1600 px on its longest side. The last batch used the corrected previews. No additional review images were opened after the 120-image limit.

Reviewed intended changes include:

- Catalog counts, expanded descriptions, the empty-search message and Clear search.
- Searchable metric data inventory, stable wizard height, field-level validation and disabled-button styling.
- Readable graph openings, area packing, minimap borders, folded Controls and persistent fullscreen actions. The Show count badge remains present in the reviewed open-controls states.
- Name-only fitted lineage and mapping cards, compact dataset headers, selected-path presentation and phone mapping details.
- Neighborhood center text, Fit prompt and below-canvas legend; the wide metric list/detail share the approved common content width at 2560.
- Readable Source findings, YAML coloring and removal of duplicate invalid-draft messaging.

The below-canvas legend at 1280/1440 was already covered by the preceding accepted evidence and was not a missing key in this run. Traffic, unpublished-change marks, imported-item rendering and the agent panel are not comprehensively exercised by this missing-key subset. Their earlier suite dispositions remain unchanged; this sample does not establish fresh feature-wide coverage.

## Regression list

None confirmed in the reviewed comparable pairs. No regression crop or fix commit is applicable. This does not clear the 422 pending pairs.

## Coverage exclusions and gaps

There are 18 main-only and 18 candidate-only filenames, including successful/failed-name variants. `session3c-diff/audit.json` preserves every filename and original failure message.

- At 1280, contract walk 1 succeeds only on candidate; dataset walk 1 succeeds only on main. Dataset node selection also differs.
- At 1440, dataset walk 1 and node selection succeed only on candidate.
- At 2560, contract and dataset walks 2 and 3 succeed only on main.
- One-sided Walk here outcomes are layout noise under the capture brief. The 98 matched lineage captures after traversal, including controls/selection/fullscreen states and final stage captures, are excluded because the centers or traversed paths can differ. They are not classified as regressions or intended changes.
- Candidate's 1280 Network `areas-collapsed` and 1440 Network `grouping-menu` still have failed-name variants. Keep these as capture coverage gaps beside the earlier focused checks at the top of GATE.md; those checks found no product regression. These new generic-helper outcomes do not establish a product defect or replace a focused replay.
- Shared unreachable actions remain in the failure logs, including graph legend selectors, lineage column filters/labels, phone ODCS Team and editing validation selectors. Some resting states also capture a transient layout-loading frame. Exit 0 does not resolve these gaps.

## Earlier suite disposition

No browser suite, unit suite, build or mutation suite was repeated in this capture-only round. The complete per-suite table remains in GATE.md.

| Gate | Candidate, earlier evidence | Main, earlier evidence |
| --- | --- | --- |
| Browser | 29 pass; four failures reproduced on main | Matching responsive, graph, lineage and editor assertions |
| Additional MCP | Exit 0 | Not individually repeated |
| Mutation | 958/958 killed; inner command 0, earlier outer wrapper 143 | Batch 2: 942/942; publication fixture caveat |
| Unit | Supplied d5d84e57 result: exit 0, 4383 pass, 0 fail | Batch 2: two compile timing failures |
| Build | Supplied exit 0 | Batch 2: exit 0 |

## Evidence and next step

Authoritative new evidence root on Midgard: `/srv/dev/sw/007-gate-captures/out/after-main-da54cf17`.

- `matrix/commands.tsv`, `matrix/worker-*.log`, per-key `run.log`, `events.jsonl`, `failures.jsonl` and native PNGs.
- `session3c-diff/pairs.json`: final pixel measurements and crop boxes.
- `session3c-diff/classifications.json`: all 669 matched pairs with dispositions or explicit exclusions/pending status.
- `session3c-diff/pending.json`: the 422-pair next-review queue; preview IDs refer to the final comparison folder.
- `session3c-diff/audit.json`: both directions of filename differences and every recorded unreachable action.
- `session3c-diff/review-log.json`: the exact 120 opened pair previews. Older phone and partial preview IDs belong to their named folders, not the final folder.
- Scratch capture/diff/resize scripts and key inventory: `/srv/dev/*session3c*`; local copies under `~/scratch/sw-007`.

Resume visual review from `pending.json` in a new bounded job. Reuse the native captures and corrected previews. Replay the two generic graph-helper gaps with the focused opening sequence if fresh proof is required. Keep traversal-noise exclusions separate and do not tick T076 until the broader gate's outstanding comparisons and state coverage are resolved.

## Documentation validation

`sw-midgard-run --pull out/formatted-docs -- bash /srv/dev/validate-session3c.sh` returned 0. The repository oxfmt ran on both documents through `--stdin-filepath` because Markdown is outside the formatter script's path list. `bun run fmt:check` returned 0. `bun run lint` returned 0 with 2907 warnings and zero errors.

`python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed` on both documents returned 0. `python3 -I ~/.codex/skills/never-leak-process/scripts/leak_scan.py --confidential-only` returned 0 on both internal evidence logs. `git diff --check` returned 0. The final preview dimension audit returned zero files above 1600 px.
