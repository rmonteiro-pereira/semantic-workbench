# Round 14 — AUTH-DC native visual audit

Head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Mode: server authentication, dark. Capture PASS: 2026-10-24 17:19:37 UTC,
confirmed in `/tmp/polish-round14/progress.log` and the authentication capture log.
The mode produced 84 originals across three review partitions. This partition reviewed
28/28 exact originals from `/tmp/polish-round14-review-AUTH-DC.txt` individually,
at original native detail. No sampling, contact sheets, or earlier verdict substitution.

Severity totals: **S1: 0; S2: 0; S3: 1**. Three affected images; 25 clean images.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-AUTH-DC-1 | S3 | `workbench-auth-roles-bob-1280.png`; `workbench-auth-roles-dave-1440.png`; `workbench-auth-roles-hank-1280.png` | At the sidebar file-list bottom, the next row or type line is partially exposed immediately above the fixed footer. This is the recurring minor partial-row defect recorded as F118. | Clip the list at a complete row boundary or give the final visible row enough scrolling clearance above the footer. |

The intended role menus, signed-out and sign-in-error cards, and viewer graph are present.
Menus have opaque dark surfaces and readable labels. Brand marks are visible on the
identity cards. The viewer graph contains all three area cards inside the viewport,
including the phone view. No serious overlap, clipping, illegible small text, contrast,
confusing empty state, or sideways-scroll defect was observed in these originals.

Clean images (25; each individually inspected):

- `workbench-auth-roles-bob-1440.png`
- `workbench-auth-roles-bob-2560.png`
- `workbench-auth-roles-bob-390.png`
- `workbench-auth-roles-carol-1280.png`
- `workbench-auth-roles-carol-1440.png`
- `workbench-auth-roles-carol-2560.png`
- `workbench-auth-roles-carol-390.png`
- `workbench-auth-roles-dave-1280.png`
- `workbench-auth-roles-dave-2560.png`
- `workbench-auth-roles-dave-390.png`
- `workbench-auth-roles-hank-1440.png`
- `workbench-auth-roles-hank-2560.png`
- `workbench-auth-roles-hank-390.png`
- `workbench-auth-sign-in-error-1280.png`
- `workbench-auth-sign-in-error-1440.png`
- `workbench-auth-sign-in-error-2560.png`
- `workbench-auth-sign-in-error-390.png`
- `workbench-auth-signed-out-1280.png`
- `workbench-auth-signed-out-1440.png`
- `workbench-auth-signed-out-2560.png`
- `workbench-auth-signed-out-390.png`
- `workbench-auth-viewer-workspace-1280.png`
- `workbench-auth-viewer-workspace-1440.png`
- `workbench-auth-viewer-workspace-2560.png`
- `workbench-auth-viewer-workspace-390.png`

Coverage: the three filenames in the severity row plus these 25 clean filenames account
for every one of the 28 assigned originals exactly once.
