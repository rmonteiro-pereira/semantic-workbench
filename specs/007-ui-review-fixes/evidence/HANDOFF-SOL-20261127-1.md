# Server comparison review, job 1

Reviewed all 214 assigned pairs from the frozen candidate `df201d11` against main `da54cf17`: **208 intended, 5 unchanged, 0 traversal noise, 1 open visual regression**. No product fix or gate completion is claimed.

Pair **1857**, dark / 2560 / server-1 / admin-git-remotes, shows five project rows on main and a header-only table on candidate. Native follow-up confirms the omission. The component renders headers while its asynchronous data is absent, so a transient loading capture remains possible. Status: **open, persistence unconfirmed**. No fix commit.

Crop: `/srv/dev/review-sol1/detail-1857.png`, also available at `~/scratch/sw-007/review-sol1/detail-1857.png`. Main is left, candidate right. Source coordinates: left 220, top 100, width 780, height 440, native resolution. Original bbox comparison: `sheet-044.png`. The light 2560 counterpart, pair 2373, is header-only on both revisions and does not establish loaded-state coverage.

Next step: the integrator should compare settled Git remotes states with the same fixture, explicitly waiting for project rows or an error. Clear pair 1857 as traversal noise only if the rows appear; otherwise investigate the missing rows as a product regression. No recapture or fix was made in this review-only job.

## Review evidence

`REVIEW-SOL-20261127-1.json` records every assigned ID, key, classification, reason, source-coordinate crop, scale and review image. There are 60 native bbox pairs and 154 downscaled bbox pairs. Pair 1857 additionally has a native detail. All 118 initial sheets and the additional detail were inspected: 119 images, at most two pairs per image, longest side no more than 1600 px. Downscaling was used only for bbox crops wider than 780 px. Exact scales are retained rather than treating those views as native.

Neighborhood legend placement and the common metric/list width are intended changes. Phone catalog Edit actions and exposed Show count badges remain visible. Hashes and timestamps account for several unchanged pairs. Screens named property-edit do not necessarily show an open editor; pair 1947 shows the properties list on both revisions. Still images cannot prove subsequent loading completion or interaction behavior.

## Commands and results

| Command or operation                                         | Exit | Result                                             |
| ------------------------------------------------------------ | ---- | -------------------------------------------------- |
| `bun /srv/dev/sol1-sheets.ts` on midgard                     | 0    | 214 bbox pairs, 118 sheets from existing PNGs      |
| `bun /srv/dev/sol1-detail.ts` on midgard                     | 0    | Additional native crop for pair 1857               |
| `scp` review sheets and detail to local scratch              | 0    | Existing-image review copies                       |
| Evidence completeness and image-dimension validation         | 0    | 214 unique assigned keys; 119 images within limits |
| `oxfmt` and `oxfmt --check` on the two evidence files        | 0    | Evidence formatting passes                         |
| `git diff --check`                                           | 0    | No whitespace errors                               |
| `readable_check.py --changed` on the two evidence files      | 0    | No readability violations                          |
| `leak_scan.py --confidential-only` on the two evidence files | 0    | Internal evidence scan passes                      |

An initial SSH attempt using the unavailable `midgard` alias returned 255; the established direct SSH target worked. An initial scratch upload to a nonexistent review worktree path returned 1; subsequent uploads used `/srv/dev` scratch. Neither failure changed product files.

| Suite          | Candidate            | Main                 |
| -------------- | -------------------- | -------------------- |
| Browser suites | Not run: review-only | Not run: review-only |
| Mutation       | Not run: review-only | Not run: review-only |
| Unit / build   | Not run: review-only | Not run: review-only |

Only this handoff and its JSON are committed on the review branch. No captures, application changes, GATE.md edits, task checkbox changes, pushes or merges were performed.
