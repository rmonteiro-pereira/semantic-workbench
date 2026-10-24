# Supplemental R11 native proof — C

Head: `d631e56e770ebf08d3b3d8901c61e1a2933897d6`.
Manifest: `/tmp/polish-r11-proof/C/manifest.json`.
Suite PASS times, 2026-10-24 UTC: SCM 21:08:07; Git setup 21:09:50; monorepo 21:09:56.

Reviewed **19/19** fresh originals individually at native resolution. Strict review covered intended
views, overlap, clipping, alignment, spacing, type legibility, contrast, wording, empty states,
opaque dialogs and horizontal overflow. No sampling or prior verdict substitution.

**S1: 0; S2: 0; S3: 1.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-C-1 | S3 | `workbench-scm-diff.png`<br>`workbench-scm-ignore.png`<br>`workbench-scm-branch.png`<br>`workbench-scm-pulled.png`<br>`workbench-scm-conflict.png`<br>`workbench-scm-history.png`<br>`workbench-scm-waiting.png`<br>`workbench-scm-no-git.png`<br>`workbench-git-clone-1280.png` | A partial bottom sidebar row or subtitle remains visible immediately above the fixed footer. This repeats F118; main controls remain whole. | Show whole boundary rows or clarify the scroll boundary. |

SCM diff, ignore choices, pulled status, merge conflict guidance, history comparison, waiting/cancel
state and missing-Git explanation are readable. Git identity, credentials and clone dialogs remain
opaque and contained; phone clone controls and guidance fit. Monorepo hierarchy, cross-project
changes and remove/project-selection dialogs have clear scopes and actions.

Branch replacement reviewed afresh at native resolution: `workbench-scm-branch.png`, same head,
manifest suite `r11-scm-settled`, PASS 2026-10-24 22:52:25.935628 UTC. The replacement shows a
readable closed Branch selector displaying “main”, normal selector styling, no loading caption and
whole nearby actions. The supplemental unchanged SCM replay passed all 11 checks and explicitly
waited for the enabled main selector before capture, supplying the interaction readiness evidence
that a static image alone cannot establish. No serious visual defect is present; the same minor
sidebar fragment remains.

Diagnostic history: the original 19-image review noted that its earlier closed “main” screenshot
alone could not establish enabled/settled interaction. That original was not counted as verification
of readiness. The same-head replacement and replay evidence resolve this limitation; the other 18
native reviews are retained. Final visual verdict: clear of S1/S2, with one repeated S3 row.

## Clean filenames (10)

- `workbench-git-identity.png`
- `workbench-git-credentials.png`
- `workbench-git-clone.png`
- `workbench-git-clone-390.png`
- `workbench-git-clone-1440.png`
- `workbench-git-clone-2560.png`
- `workbench-monorepo-clone.png`
- `workbench-monorepo-scm.png`
- `workbench-monorepo-remove.png`
- `workbench-monorepo-projects.png`

The nine affected filenames in the row and ten clean filenames account for all 19 originals.
Coverage remains 19 distinct current proof filenames; the branch original and replacement were both
individually inspected.
