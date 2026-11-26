# Dark comparison recheck: job 5

No confirmed regression was found in the 211 assigned pairs. The integrator can import the decisions from `REVIEW-SOL-20261127-5.json`; no application fix is proposed.

| Classification | Count |
| --- | ---: |
| Intended | 162 |
| Unchanged | 39 |
| Traversal noise | 10 |
| Regression | 0 |

The comparison uses candidate `df201d11` and main `da54cf17`, with the existing dark local screenshots identified by `recheck-dark-2.tsv`. All 211 assigned IDs have exactly one decision. Of the earlier verdicts, 205 are confirmed and six change:

- `0098`: intended to traversal noise. The selected-path lists contain different entities and the canvas states differ.
- `0636`: intended to traversal noise. Main shows an isolated Identifier node; candidate shows the no-bindings state.
- `0233`, `0236`, `0421`, `0666`: intended to unchanged. Source content, syntax coloring and editor actions are equivalent; sidebar inventory, badge styling or focus differs.

## Visual evidence

Every primary pair uses the pixel-difference bounding box with approximately 40 pixels of context, clipped to the source bounds. Crops wider than 780 pixels are reduced to 780 pixels per side. Main is left and candidate right. Each image contains at most two pairs and has a longest side of at most 1600 pixels.

All 113 primary images and seven supplemental images were inspected: 120 images total. Primary views comprise 12 native-resolution pairs and 199 downscaled pairs. Fourteen additional pairs have focused native-resolution views, giving 26 pairs with a native view and 185 with downscaled views only. Each decision records its crop, scale, resolution and evidence path.

Primary evidence: `/srv/dev/review-sol5/`. Supplemental native views: `/srv/dev/review-sol5-detail/`. Local copies are under `~/scratch/sw-007/` with the same directory names. No new app screenshots were captured; the images are crops of existing evidence. No images are committed.

The compact dataset lineage header, fitted name-only graph cards, folded Controls with Show count, separate canvas actions, catalog descriptions/count, stable wizard height and inline validation remain intended. The assigned 2560-pixel metric views retain the common list/detail width. The assigned neighborhood views retain the below-canvas legend; this list does not contain neighborhood at 1280 or 1440.

## Commands and results

| Command or check | Exit | Result |
| --- | ---: | --- |
| `ssh root@192.141.163.162 /home/dev/.bun/bin/bun /srv/dev/sol5-sheets.ts` | 0 | Generated comparison crops and manifest from existing PNGs. Seven oversized combined sheets were split before inspection. |
| `ssh root@192.141.163.162 /home/dev/.bun/bin/bun /srv/dev/sol5-detail.ts` | 0 | Generated 14 focused native views on seven images. |
| Python manifest and PNG-header assertions | 0 | 211 unique assigned IDs; 120 images; every image within 1600 pixels. |

Both delivered files passed the repository oxfmt formatter (exit 0; JSON formatted as a remote file, Markdown through `--stdin-filepath`), the required readable-code checker (exit 0), `git diff --check` (exit 0), and the confidentiality scanner with `--confidential-only` (exit 0). These are internal evidence records, so their explicitly requested commands and evidence paths are retained. In the existing capture checkout, `bun run fmt:check` exited 0 and `bun run lint` exited 0 with 2907 warnings and zero errors; those checks cover that checkout, not a newly synchronized review branch.

A final JSON parse initially failed because formatter stdin output ended at 65536 bytes despite exit 0. The JSON was restored from the manifests and formatted as a remote file instead. The delivered JSON parses successfully and exactly matches all 211 TSV IDs (exit 0).

The initial `midgard` hostname lookup failed with exit 255; the wrapper's configured SSH address above worked. Desktop Pillow and remote `rg` were unavailable; existing PNG dependencies and standard-library checks were used. No dependencies were installed.

Browser, mutation, unit and build suites were not rerun in this review-only job. Their earlier results are not replaced by a screenshot review. No servers were started and no app code, GATE.md or task checkboxes were changed.

## Open points and next step

No confirmed visual regression remains in this assigned list. The ten traversal-noise pairs do not establish matching settled behavior. Loading and failed-selector frames cannot establish successful interactions. Traffic, imported items and unpublished marks are not comprehensively covered by this assigned subset.

The integrator should merge these classification counts with the other review jobs and retain ownership of the overall regression gate and T076 decision. No push or merge is performed by this job.
