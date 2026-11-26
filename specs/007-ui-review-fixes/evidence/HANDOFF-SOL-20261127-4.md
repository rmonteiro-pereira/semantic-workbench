# Dark screenshot recheck

No confirmed regression was found. Of 211 assigned pairs, 147 have a completed readability review and 64 remain provisional because their wide crops reduced text too far. The review reached the limit of 120 viewed images. This is an incomplete review; the provisional verdicts must not close the gate.

The screenshot candidate is `df201d11`, compared with main `da54cf17`. The assigned queue is `/home/rodrigo/scratch/sw-007/recheck-dark-1.tsv`. Decisions, crop coordinates, scale, resolution, evidence filenames and completion status are recorded per pair in `REVIEW-SOL-20261127-4.json`.

| Classification  | Pairs, including provisional verdicts |
| --------------- | ------------------------------------: |
| Intended        |                                   161 |
| Unchanged       |                                    39 |
| Traversal noise |                                    11 |
| Regression      |                           0 confirmed |
| Total           |                                   211 |

There were 113 primary images and seven supplemental native-detail images covering 14 pairs. Eighteen pairs were viewed natively in their primary images, 179 were downscaled, and 14 were downscaled with supplemental native detail. Supplemental details do not establish readability of every region of a wide pair. The JSON marks all 64 pairs whose primary scale was below 0.5 as provisional.

## Changed decisions

The following prior intended verdicts are now traversal noise:

| Pair | Observation                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 0111 | Different graph framing clips properties at the candidate canvas edge; both show collapsed property rows.  |
| 0247 | Main shows Whole model while candidate selects Address with Controls open.                                 |
| 0267 | Main has expanded areas while candidate has collapsed cards and open Controls.                             |
| 0282 | Main has a blank canvas while candidate has a fitted graph, indicating different layout completion.        |
| 0299 | Walk-before cameras and visible neighbors differ.                                                          |
| 0424 | Candidate retains Address zoom while main shows the whole model.                                           |
| 0426 | Expanded areas retain different graph framing.                                                             |
| 0433 | Main shows Whole model while candidate selects Address.                                                    |
| 0476 | Suggested communities retain Address zoom on candidate.                                                    |
| 0528 | Walk-before cameras and visible center cards differ.                                                       |
| 0633 | Native detail shows main bindings closed and candidate bindings and Metrics open; both have 1057 bindings. |

Pairs 0111, 0476, 0528 and 0633 remain provisional for complete text readability despite the visible traversal differences.

Native details confirmed name-only graph cards in 0567, the Local administration label in 0598, matching save payloads in 0625, common metric content width in 0630, and retained relationship actions in 0656. Pair 0619 shows the filled Label field flagged on both main and candidate; this is inherited rather than a confirmed merge regression.

## Execution and evidence

No captures, application servers, code changes or test suites were run. Only existing PNGs were cropped and reviewed. Main is on the left and candidate on the right. Primary crops use the pixel-difference bounding box with channel tolerance 16 and 40 pixels of context; crops wider than 780 pixels are reduced to 780 pixels. Every image has at most two pairs and a longest side no greater than 1600 pixels.

| Command or operation                              | Exit | Result                                                                       |
| ------------------------------------------------- | ---: | ---------------------------------------------------------------------------- |
| SSH using host alias `midgard`                    |  255 | Alias did not resolve; subsequent commands used the configured host address. |
| `bun /srv/dev/sol4-sheets.ts`                     |  127 | Bun was absent from root's PATH; retried with its absolute path.             |
| `/home/dev/.bun/bin/bun /srv/dev/sol4-sheets.ts`  |    0 | Produced 211 pair records on 113 primary sheets.                             |
| `/home/dev/.bun/bin/bun /srv/dev/sol4-details.ts` |    0 | Produced seven native-detail sheets for 14 pairs.                            |

Existing images were read from `/srv/dev/sw/007-gate-captures/out/after-main-da54cf17/matrix`. Crops and the manifest are under `/srv/dev/review-sol4`, mirrored at `/home/rodrigo/scratch/sw-007/review-sol4`. Scratch rendering scripts are outside git.

| Suite          | Candidate                    | Main      |
| -------------- | ---------------------------- | --------- |
| Browser suites | Not rerun: review-only scope | Not rerun |
| Unit suite     | Not rerun: review-only scope | Not rerun |
| Mutation suite | Not rerun: review-only scope | Not rerun |

## Next step

Assign the 64 provisional pairs listed in the JSON to a further native-text review with tighter region crops and a fresh image allowance. Keep their classifications provisional until that review is complete. No regression crop is reported because none was confirmed. This assigned list does not cover neighborhood at 1280/1440 or comprehensive Traffic, imported-item and change-mark states.

Only this handoff and the decision JSON belong in this review commit. GATE.md and T076 remain unchanged for the integrator.
