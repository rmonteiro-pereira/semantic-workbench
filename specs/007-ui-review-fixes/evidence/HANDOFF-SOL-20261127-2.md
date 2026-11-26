# Server comparison review, job 2

No visual regressions were identified in the 214 assigned pairs. The integrator can merge these dispositions into the combined gate; this review does not close T076 by itself.

| Disposition     | Pairs |
| --------------- | ----: |
| Intended        |   206 |
| Unchanged       |     8 |
| Traversal noise |     0 |
| Regression      |     0 |
| Total           |   214 |

The input was `~/scratch/sw-007/pending-server-2.tsv`, matched by baseline and key against `~/scratch/sw-007/review3d/earlier-pixels.tsv`. All assigned baselines are main `da54cf17`. Candidate `df201d11` is the frozen earlier matrix candidate recorded in the existing gate. The decisions and input checksum are in `REVIEW-SOL-20261127-2.json`.

Every pair was seen. The review used 118 labelled bounding-box sheets and two supplemental sheets, exactly 120 images. Main is left and candidate right. Each image contains at most two distinct pairs and has a longest side no greater than 1600 pixels. Crops include 40 pixels of context around differences where source bounds allow. Pixel comparison used channel tolerance 16. Of the primary pair crops, 62 were native and 152 were downscaled because their width exceeded 780 pixels. Selected native text details were also seen for 56 pairs. Per-pair bounds, scale, resolution and detail references are recorded in the JSON.

The crops and manifest remain outside git at `/srv/dev/review-sol2` on midgard, with a local copy at `~/scratch/sw-007/review-sol2`. These are derived crops of existing screenshots, not new application captures. The original matrix under `/srv/dev/sw/007-ui-review-fixes/out/after-main-da54cf17` was read only.

## Decisions and limits

The intended changes include readable graph names and fitting, responsive folded Controls, the separate fullscreen action, sidebar type labels, catalog counts and descriptions, bounded admin content, permission checkmarks, humanized audit actions, clearer source-control help, theme-aware diffs, and safer stale-save actions. The Show badge remains where exposed. Neighborhood legends below the canvas at 1280 and 1440 and the shared metric list/detail width at 2560 are intended. Wide neighborhood cards are smaller than main's oversized cards; their native text remains readable.

The eight unchanged pairs are 1939, 1942, 1945, 1948, 1961, 1973, 1976 and 1988. Their differences are fixture hashes or timestamps, source gutter/focus presentation, or small dialog placement changes without changed content or actions.

No regression crops or fix commits are required for this list. Some pairs also contain incidental fixture, hover or navigation differences alongside intended UI changes; the JSON classifies the substantive visible change.

Coverage limits remain:

- Pair 1858 shows only Git-remotes table headers on both sides; it does not establish loaded-row preservation.
- Query-composer filenames sometimes show the empty mapping state on both sides. Property-edit, contract-search and contract-team filenames also do not always show the named open state.
- Phone source-control pairs 2034 and 2037 compare the list with the intended responsive detail view. Pair 2034's filename does not establish a consistent added-file fixture across both screenshots.
- Traffic, imported items and unpublished-change behavior are not comprehensively established by this subset. Still images do not establish interaction correctness.
- Native insets cover selected text regions, not every text region of a wide screen. Primary downscaling is recorded explicitly.

## Commands and results

Commands below ran from this review worktree or against this job's own scratch files. No browser, app server, test suite or mutation run was started during this review-only session.

| Command                                                                                                                                      | Exit | Result                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------- |
| `ssh midgard`                                                                                                                                |  255 | Host alias did not resolve; subsequent SSH used the host configured in `sw-midgard-run`. |
| `ssh <configured-host> '/home/dev/.bun/bin/bun /srv/dev/sol2-sheets.ts'`                                                                     |    0 | 214 pairs, 118 bounding-box sheets.                                                      |
| `ssh <configured-host> '/home/dev/.bun/bin/bun /srv/dev/sol2-details.ts'`                                                                    |    0 | Native text details added; two supplemental images.                                      |
| `rsync -a -e 'ssh -o ControlPath=/home/rodrigo/.ssh/cm-sw-midgard-%C' <configured-host>:/srv/dev/review-sol2/ ~/scratch/sw-007/review-sol2/` |    0 | Own derived review images copied locally.                                                |

Final validation results are appended below before the local commit. Browser suites, mutation tests and new captures were excluded by the review-only instructions. No code, GATE.md or tasks.md changes were made. Next step: integrate this JSON with the other jobs' dispositions and resolve any regressions reported by those jobs.

Final validation:

| Check                                                                                                        | Exit | Result                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ---: | ---------------------------------------------------------------------------------------------------- |
| Repo `node_modules/.bin/oxfmt` on both delivered files                                                       |    0 | Both files formatted.                                                                                |
| Queue/JSON identity, count and PNG-dimension assertions                                                      |    0 | Exact 214-pair coverage; 120 images within 1600 pixels; downscaling only above 780-pixel crop width. |
| `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <both delivered files>`          |    0 | No findings.                                                                                         |
| `python3 ~/.codex/skills/never-leak-process/scripts/leak_scan.py --confidential-only <both delivered files>` |    0 | Both internal evidence files clean.                                                                  |
