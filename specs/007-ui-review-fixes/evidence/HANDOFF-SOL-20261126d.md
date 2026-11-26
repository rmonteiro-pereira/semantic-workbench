# Dark comparison review handoff

All 422 pairs left pending by the preceding handoff are reviewed. Their final disposition is **338 intended, 74 unchanged, 10 traversal/loading noise, zero confirmed regressions and zero unresolved suspects**. No fixes are proposed. The broader matrix remains incomplete; keep T076 unchecked.

## Scope

- Evidence branch: `007-gate-captures`, starting at `a8b9b244`.
- Frozen screenshots: candidate `df201d11`, main `da54cf17`.
- Existing dark local screenshots at 390, 1280, 1440 and 2560 px. No new capture, browser execution, product change or suite rerun.
- Earlier evidence and the other worktree were read only. No origin push, merge, branch deletion or production operation.
- New images are contact sheets derived from existing previews. Screenshots and sheets remain outside Git.

## Review result

| Scope | Intended | Unchanged | Traversal noise | Regression | Pending |
| --- | --- | --- | --- | --- | --- |
| This 422-pair queue | 338 | 74 | 10 | 0 | 0 |
| Complete 669-pair missing-key comparison | 467 | 94 | 108 | 0 | 0 |

The latter includes 98 previously excluded later-lineage pairs and 15 pixel-identical pairs. Existing non-pending dispositions were preserved.

The contact sheets contain four main-left/candidate-right pairs, except the final sheet with two. Every pair carries its original ID, screen/state and width. Existing difference crops retain their context. There are 106 sheets, plus standalone pair views `0468` and `0467`: 108 images total, all at most 1600 px on the longest side. Review calls contained at most six images, within the 30-image batch limit. The first four sheets use a two-by-two arrangement; the rest stack four pairs for more legible labels.

The sole suspect was `0468`, dark/2560 full-graph Layered, all areas expanded. Its camera is closer and offset after an area selection followed by Expand all. The capture sequence in `scripts/ui-review/graph-states.ts` does not Fit between those actions. The standalone settled after-fit pair `0467` contains the complete graph on both revisions. The disposition is camera-sequence noise; no missing product feature is established. No confirmed regression or fix commit applies.

Other noise includes different selected graph centers and a mapping list captured at different asynchronous loading stages. Unchanged dispositions contain equivalent controls/content with sidebar fixture inventory, metadata or focus differences. Intended changes retain the approved graph layouts, compact controls, catalog descriptions/count, wizard validation, dataset headers, Source warnings, neighborhood footer legend and wide metric content width.

## Whole matrix and light cross-check

| Theme | Intended | Unchanged | Traversal noise | Pending / missing | Total |
| --- | --- | --- | --- | --- | --- |
| Light | 860 | 209 | 7 | 445 | 1521 |
| Dark | 1024 | 207 | 109 | 407 | 1747 |
| Total | 1884 | 416 | 116 | 852 | 3268 |

The union is keyed by `(baseline, key)`. The earlier 2603 pixel rows reduce to 2599 unique entries; their recorded classifications and additional classifications override pixel-only defaults. The 669 missing-key rows have no overlapping keys and are added. Earlier pixel-identical rows without a disposition become unchanged. Earlier traversal exclusions are normalized to traversal noise. No changed pair is inferred accepted from its pixels.

There are 291 accepted-image comparisons and 2977 main comparisons. The unresolved 852 entries are 841 changed pairs without a recorded disposition and 11 missing comparisons. This ledger describes available evidence across both baselines; it does not assert complete requested-state coverage.

For every reviewed dark pair, the corresponding light key was checked after replacing the theme directory and `local-dark-` prefix. None has a recorded exact-state light disposition: 72 have only a pixel row and 350 are absent from the earlier matrix. Those gaps remain explicit in the committed manifest. Related light screens cannot clear an exact-state gap.

The preceding capture handoff's 18 main-only and 18 candidate-only filenames, one-sided Walk outcomes, shared failed selectors, loading frames and generic-helper gaps remain unchanged. Earlier focused Group/Collapse checks found no product regression. This review provides no fresh comprehensive coverage of Traffic, imported items, unpublished-change marks or agent interactions.

## Commands and exits

All image processing ran through the unchanged worktree wrapper on Midgard. No app server was started.

| Command | Exit / result |
| --- | --- |
| `sw-midgard-run --pull out/after-main-da54cf17/review3d -- bash -c 'cp /srv/dev/sheets-review3d.ts out/sheets-review3d.ts; node_modules/.bin/oxfmt out/sheets-review3d.ts; bun out/sheets-review3d.ts'` | 0; initial 106 sheets |
| Same command after adjusting the sheet arrangement, preserving sheets 000–003 | 0; regenerated sheets 004–105 |
| Inline Python decision application and audit | 0; 422 unique decisions, no pending/suspect row in the 669-pair manifest |
| Inline Python whole-matrix union and exact light-key audit | 0; 3268 unique baseline/key entries; counts above |

The scratch sheet source is `~/scratch/sw-007/review3d/sheets.ts`; its formatted execution copy is `out/sheets-review3d.ts` on Midgard. The earlier `classify-session3c.py` is historical: rerunning it would restore the old pending queue and overwrite this review.

## Documentation validation

| Command | Exit / result |
| --- | --- |
| `sw-midgard-run --pull out/formatted-review3d -- bash -c 'mkdir -p out/formatted-review3d; for name in GATE.md HANDOFF-SOL-20261126d.md REVIEW-SOL-20261126d.json; do node_modules/.bin/oxfmt --stdin-filepath "specs/007-ui-review-fixes/evidence/$name" < "specs/007-ui-review-fixes/evidence/$name" > "out/formatted-review3d/$name" || exit; done; bun run fmt:check && bun run lint'` | 0; formatted evidence copied back; formatter passes; lint has 2907 warnings and zero errors |
| `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed specs/007-ui-review-fixes/evidence/GATE.md specs/007-ui-review-fixes/evidence/HANDOFF-SOL-20261126d.md specs/007-ui-review-fixes/evidence/REVIEW-SOL-20261126d.json` | 0 |
| `python3 ~/.codex/skills/never-leak-process/scripts/leak_scan.py --confidential-only specs/007-ui-review-fixes/evidence/GATE.md specs/007-ui-review-fixes/evidence/HANDOFF-SOL-20261126d.md specs/007-ui-review-fixes/evidence/REVIEW-SOL-20261126d.json` | 0; confidential-term check for internal evidence logs |
| `git diff --check` | 0 |

## Earlier suite results

These results are carried forward, not rerun in this review.

| Gate | Candidate | Main da54cf17 |
| --- | --- | --- |
| Browser | 29 pass; four inherited failures | Matching responsive, graph, lineage and editor assertions |
| Additional MCP | Exit 0 | Not individually repeated |
| Mutation | 958/958 killed; inner exit 0, outer wrapper 143 | Batch 2: 942/942; publication fixture caveat |
| Unit | Supplied d5d84e57 result: exit 0, 4383 pass, 0 fail | Batch 2: two compile timing failures |
| Build | Supplied exit 0 | Batch 2: exit 0 |

The complete per-suite results remain in GATE.md.

## Evidence and next step

The committed `REVIEW-SOL-20261126d.json` contains all 422 decisions, their reasons, sheet IDs and exact light-counterpart status. The ignored evidence tree is `/srv/dev/sw/007-gate-captures/out/after-main-da54cf17`, with local copies under this worktree's `out/after-main-da54cf17`:

- `session3c-diff/classifications.json`: updated 669-pair manifest.
- `session3c-diff/pending.json`: empty queue.
- `review3d/sheet-000.png` through `sheet-105.png`, plus `sheets.json`: contact sheets and membership.
- `review3d/decisions.json` and `light-crosschecks.json`: review decisions and exact light lookup.
- `review3d/whole-matrix.json` and `summary.json`: deduplicated whole-matrix ledger and counts.

SHA-256 of `review3d/whole-matrix.json`: `2114e240fdb601e1f64b2384b8625c8d81fe75a483208deb5f2578d8735fd75e`.

Next: review the remaining 841 changed pairs, resolve the 11 missing comparisons and exact-state light coverage, and retain traversal exclusions until comparable states are available. T076 stays unchecked. Any future application correction belongs to the separate fixing job; this review reports no confirmed regression to fix.
