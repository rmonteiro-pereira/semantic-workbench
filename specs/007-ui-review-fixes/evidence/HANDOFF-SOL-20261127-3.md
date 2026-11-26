# Assigned server comparison review

One open visual regression remains in the 213 assigned pairs: pair **2372**, the light-theme Git remotes screen at 2560 pixels. Main shows five project rows and their **Set remote** actions; the candidate shows table headers with an empty body. Reproduce after the list settles before deciding whether this is a persistent regression or capture timing. No fix was made.

| Classification   | Pairs |
| ---------------- | ----: |
| Intended         |   207 |
| Unchanged        |     4 |
| Traversal noise  |     1 |
| Regression, open |     1 |
| Total            |   213 |

Decisions and per-pair crop coordinates, resolution, rationale and image paths are in [REVIEW-SOL-20261127-3.json](REVIEW-SOL-20261127-3.json). The comparison uses main `da54cf17` and the existing candidate captures identified as `df201d11`; this review worktree starts at `3bb8f61f`.

## Open regression

- **2372 — `light/2560/server-1/server-admin-git-remotes-2560-full.png`: open.** Native-resolution evidence showing both project names and missing actions: `/home/rodrigo/scratch/sw-007/review-sol3-detail2/sheet-000.png`. Main contains five project rows; candidate contains none. Loading or traversal timing remains a possible explanation. Next step: reproduce the settled list and recapture only this state, then fix or reclassify through the integrator.
- **1729 — dark Git remotes, 1440 pixels: traversal noise.** The opposite asymmetry appears here: main has the empty table while candidate has populated rows and actions. This supports a timing hypothesis but does not resolve 2372.

## Intended changes and coverage

The reviewed neighborhoods at 1280 and 1440 retain the legend below the canvas. The 2560-pixel metric detail shares the common content width with its list. Compact name-only contract graph cards, adaptive graph fitting, folded graph controls, catalog counts and readable kind labels are intended changes. Dialog spacing, responsive actions, themed source diffs and bounded administrative forms also remain intended.

Pairs 1940, 1943, 1946 and 1997 have only volatile revision/date or sign-in timestamp differences and are classified unchanged. Some property-edit and query-composer filenames show a detail or empty mapping state in both images; those names do not establish successful editor or populated-query traversal.

Every assigned pair was visually inspected. The initial bounding-box review contains 54 native and 159 downscaled pairs. Five pairs also received native detail inspection; pair 2372 received additional native project-name and action-column crops. There were 119 viewed images: 115 primary sheets and four supplemental sheets. Each sheet has at most two comparisons, main left and candidate right. Crops use the RGB difference threshold of 16 with approximately 40 pixels of context, clipped at image edges. Widths exceeding 780 pixels are reduced to 780 per panel; native details retain legible text. All sheets stay within the 1600-pixel longest-side limit.

This assignment covers only its listed changed server-mode pairs. It does not establish complete coverage of Traffic, imported mesh items, change marks or the full journey. T076 and GATE.md were not changed.

## Commands and results

Scratch crop scripts only transform existing PNGs; they do not launch an app, browser or capture. The existing batch comparison helpers were read before adapting the crop script. Remote outputs stay under `/srv/dev/review-sol3*`; local copies stay under `/home/rodrigo/scratch/sw-007/review-sol3*`.

| Command or check                                                                                                                                                                           | Result                                                            | Exit |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---: |
| `runuser -u dev -- /home/dev/.bun/bin/bun /srv/dev/sol3-sheets.ts` on midgard through the existing SSH control socket                                                                      | 213 pairs, 115 primary sheets                                     |    0 |
| `runuser -u dev -- /home/dev/.bun/bin/bun /srv/dev/sol3-details.ts` on midgard                                                                                                             | Five native detail pairs, three sheets                            |    0 |
| `runuser -u dev -- /home/dev/.bun/bin/bun /srv/dev/sol3-detail2.ts` on midgard                                                                                                             | Two additional native regions for 2372, one sheet                 |    0 |
| `rsync` of the three crop output directories through the existing SSH control socket                                                                                                       | Local evidence copies available                                   |    0 |
| `python3 /home/rodrigo/scratch/sw-007/write-sol3-review.py`                                                                                                                                | Per-pair JSON written; classification total 213                   |    0 |
| `python3 /home/rodrigo/scratch/sw-007/validate-sol3-review.py`                                                                                                                             | Exact input coverage, unique IDs, counts and image limits checked |    0 |
| `bunx --bun oxfmt --config /home/rodrigo/scratch/sw-007/sol3-oxfmt.json --ignore-path /home/rodrigo/scratch/sw-007/sol3-empty-ignore` with the two explicit evidence paths; then `--check` | Both evidence files formatted                                     |    0 |
| `bun run fmt:check`                                                                                                                                                                        | Repository formatting check                                       |    0 |
| `git diff --check`                                                                                                                                                                         | No whitespace errors                                              |    0 |
| `leak_scan.py --confidential-only` on both evidence files and the commit message                                                                                                           | Internal evidence log confidentiality check                       |    0 |

The default explicit-file formatter invocation exited 2 because the repository configuration excludes `specs/**` and Markdown. A temporary configuration retaining the repository formatting options without its exclusions formatted the two deliverables successfully. No repository configuration was changed.

Initial connection attempts using the unavailable `midgard` alias and root's missing `bun` executable failed with exits 255 and 127 respectively. The existing SSH control socket and the dev account's Bun path resolved those setup errors.

| Suite          | Candidate                                        | Main    |
| -------------- | ------------------------------------------------ | ------- |
| Browser suites | Not run: review-only assignment                  | Not run |
| Mutation       | Not run: review-only assignment                  | Not run |
| Unit / build   | Not rerun: existing status supplied in the brief | Not run |

Only this review JSON and handoff are committed locally on the review branch. No new screenshots, product changes, gate edits or remote pushes were made. The integrator should merge these decisions and investigate pair 2372 before accepting this subset as regression-free.
