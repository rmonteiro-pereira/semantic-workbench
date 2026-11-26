# Graph and rest comparison handoff

All 200 requested pending pairs are reviewed: **162 intended, 10 unchanged, 28 traversal noise, zero confirmed regressions and zero pending pairs in this queue**. No fix is proposed. Keep T076 unchecked: the broader matrix remains incomplete.

## Scope and evidence

Evidence branch: `007-gate-captures`, starting at `d6b64398`. Existing screenshots compare frozen candidate `df201d11` with main `da54cf17` and the earlier accepted 007 captures. The supplied queue contains light-theme screenshots only: 126 main comparisons and 74 accepted-image comparisons. The exact baseline/key identities and preview IDs are in `REVIEW-SOL-20261126e.json`.

No app code changed, no browser or app server ran, and no captures or suites were repeated. The other worktree and its Midgard capture tree were read only. No origin push, merge or branch deletion occurred. The unchanged wrapper updated only its permitted scratch remote and the capture checkout.

Source queue: `~/scratch/sw-007/pending-graphs-rest.tsv`. Source ledger: `~/scratch/sw-007/review3d/earlier-pixels.tsv`. Original images: `/srv/dev/sw/007-ui-review-fixes/out/after-main-da54cf17`; accepted-image paths come from the ledger under `out/gate-007/comparison/candidate` in the same read-only tree.

Derived review evidence is outside Git at `out/review3e` in the capture worktree locally and on Midgard. `manifest.json` records source paths, exact crop bounds, scale and sheet membership. `sheet-000.png` through `sheet-099.png` are the final sheets; older leftover files with higher numbers are unused. `whole-matrix.json` preserves earlier decisions and applies only these 200 dispositions. `summary.json` contains counts and its checksum.

## Review method and findings

Crops use the original screenshot pair's pixel-difference bounding box, channel tolerance 16, with 40 px of context clipped at the image edge. Crops at most 780 px wide remain at native resolution; wider crops are reduced to 780 px. Per-pair resolution and numeric scale are committed: **133 native, 67 downscaled**.

There are two pairs per sheet, baseline left and candidate right. Labels include preview ID, baseline, screen/state, width and theme. Narrow crops keep native pixels on a wider label canvas. Review used 100 unique sheets and repeated four after the narrow-label correction: **104 images total**, at most four images per batch, no longest side over 1600 px.

The intended changes include folded Controls, Show count badges, readable area/entity names, name-only mapping/lineage cards, separate zoom/fullscreen controls, below-canvas neighborhood legends, catalog counts, complete descriptions and clear-search recovery. Main branch actions and Mesh navigation remain present. Idle desktop catalog Edit controls intentionally reveal on hover/focus (`3731b0ae`); `CatalogView` retains them. Phone Edit actions remain visible.

The 28 traversal-noise comparisons include differing camera/center/selection, incomplete layout and failed later lineage Walk here frames. Blank later walk canvases also occur in accepted evidence. These exclusions do not prove usable traversal. Shared failed-selector and coverage caveats remain open. The queue provides no new comprehensive Traffic, imported-item, unpublished-change-mark or agent coverage.

**Regressions: none confirmed. Fix commits: none.** There is no regression crop to report. Product corrections, if needed later, belong to the separate fixing job.

## Whole-matrix disposition

Identity remains `(baseline, key)` across 3268 unique entries, with the prior deduplication preserved.

| Theme | Intended | Unchanged | Traversal noise | Pending / missing | Total |
| --- | --- | --- | --- | --- | --- |
| Light | 1022 | 219 | 35 | 245 | 1521 |
| Dark | 1024 | 207 | 109 | 407 | 1747 |
| Total | 2046 | 426 | 144 | 652 | 3268 |

The unresolved entries comprise 641 changed pairs and 11 missing comparisons. This review clears exactly 200 earlier pending entries and changes no existing disposition. The earlier 669-pair missing-key decisions remain unchanged. Of the 422 dark-reviewed states, all 72 available exact main/light counterparts now have dispositions (67 intended, five traversal noise); 350 exact light counterparts remain absent from the earlier matrix.

SHA-256 of `out/review3e/whole-matrix.json`: `badfc30a0dff28953a69341dfe4ddca449646e9e8c8eca8a142a657231fc8c42`.

## Commands and exits

| Command | Exit / result |
| --- | --- |
| Read `/srv/dev/b2-capture.sh`, `/srv/dev/b2-diff.sh` and `/srv/dev/ui-diff.ts` over SSH | 0; existing helper behavior inspected |
| Inline Python queue/ledger join | 0; 200 unique baseline/key pairs |
| `scp` scratch crop source and queue JSON to `/srv/dev` | 0 |
| `sw-midgard-run --pull out/review3e -- bash -c 'cp /srv/dev/review3e-sheets.ts out/review3e-sheets.ts && node_modules/.bin/oxfmt out/review3e-sheets.ts && bun out/review3e-sheets.ts'` | 0 on all three runs; initial vertical packing made 131 sheets, corrected packing made 100; final run widened narrow labels |
| Inline Python decision and whole-matrix audit | 0; 200 decisions, only pending entries changed |
| Optional local `import PIL` probe | 1; Pillow unavailable; existing pngjs used instead, no dependency added |
| Optional remote process listing using `rg` | 127; remote rg unavailable; image job completed normally |

Crop script source: `~/scratch/sw-007/review3e-sheets.ts`; formatted execution copy: `out/review3e-sheets.ts` on Midgard. The scripts only read existing screenshots and write derived images.

## Validation

| Command | Exit / result |
| --- | --- |
| `sw-midgard-run --pull out/formatted-review3e -- bash -c 'mkdir -p out/formatted-review3e; for name in GATE.md HANDOFF-SOL-20261126e.md REVIEW-SOL-20261126e.json; do node_modules/.bin/oxfmt --stdin-filepath "specs/007-ui-review-fixes/evidence/$name" < "specs/007-ui-review-fixes/evidence/$name" > "out/formatted-review3e/$name" || exit; done; bun run fmt:check && bun run lint'` | 0; format passes; lint has 2907 warnings and zero errors |
| Inline Python evidence assertions | 0; exact queue coverage, 200 unique decisions, resolution/scale consistency, 100 two-pair sheets, exactly 200 pending-only ledger updates |

| `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed` with the three changed evidence files | 0 |
| `python3 ~/.codex/skills/never-leak-process/scripts/leak_scan.py --confidential-only` with the three changed evidence files | 0; no hits; internal working evidence scope |
| `git diff --check` | 0 |

The final documents were formatted again through the same wrapper after the integrity audit and validation results were added. No browser, mutation, unit or build command ran.

## Earlier suite results, unchanged

| Gate | Candidate | Main da54cf17 |
| --- | --- | --- |
| Browser | 29 pass; four inherited failures | Matching responsive, graph, lineage and editor assertions |
| Additional MCP | Exit 0 | Not individually repeated |
| Mutation | 958/958 killed; inner exit 0, outer wrapper 143 | Batch 2: 942/942; publication fixture caveat |
| Unit | Supplied d5d84e57: exit 0, 4383 pass, 0 fail | Batch 2: two compile timing failures |
| Build | Supplied exit 0 | Batch 2: exit 0 |

The full per-suite table remains in GATE.md. No suite result was inferred from this screenshot review.

## Next step

Review the remaining 641 changed pairs, resolve the 11 missing comparisons and exact-state coverage gaps, and keep traversal exclusions explicit until comparable successful states exist. T076 stays unchecked. This local evidence commit completes the supplied 200-pair review-only queue; it does not complete the broader gate.
