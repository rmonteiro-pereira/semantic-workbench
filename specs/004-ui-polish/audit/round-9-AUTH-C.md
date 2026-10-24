# Supplemental authentication visual audit — R9-AUTH-C

Application head: `c0a81f6`. Source: `/tmp/polish-final-gate/browser-auth-shots`.
Manifest: `/tmp/polish-auth-review-C.txt`.
All 28 original screenshots were inspected individually at native resolution.
The browser-auth log was read; it records passing authentication scenarios.
This report judges the screenshots independently of those functional results.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R9-AUTH-C-1 | S2 | `workbench-auth-sign-in-error-1280.png`; `workbench-auth-sign-in-error-1440.png`; `workbench-auth-sign-in-error-2560.png`; `workbench-auth-sign-in-error-390.png`; `workbench-auth-signed-out-1280.png`; `workbench-auth-signed-out-1440.png`; `workbench-auth-signed-out-2560.png`; `workbench-auth-signed-out-390.png` | The small brand image beside “Semantic Workbench” renders as a browser broken-image glyph inside its frame. This affects both authentication cards at all four widths, unlike the correctly rendered workspace logo. | Restore the shared brand image on authentication pages and verify the image has loaded before capturing both states at every width. |

Counts: **0 S1, 1 S2, 0 S3**. One repeated defect affects eight images.

## Screens with no defects

- `workbench-auth-roles-bob-1280.png`
- `workbench-auth-roles-bob-1440.png`
- `workbench-auth-roles-bob-2560.png`
- `workbench-auth-roles-bob-390.png`
- `workbench-auth-roles-carol-1280.png`
- `workbench-auth-roles-carol-1440.png`
- `workbench-auth-roles-carol-2560.png`
- `workbench-auth-roles-carol-390.png`
- `workbench-auth-roles-dave-1280.png`
- `workbench-auth-roles-dave-1440.png`
- `workbench-auth-roles-dave-2560.png`
- `workbench-auth-roles-dave-390.png`
- `workbench-auth-roles-hank-1280.png`
- `workbench-auth-roles-hank-1440.png`
- `workbench-auth-roles-hank-2560.png`
- `workbench-auth-roles-hank-390.png`
- `workbench-auth-viewer-workspace-1280.png`
- `workbench-auth-viewer-workspace-1440.png`
- `workbench-auth-viewer-workspace-2560.png`
- `workbench-auth-viewer-workspace-390.png`

Reviewed: **28/28** originals.

Coverage limitation: the four viewer-workspace images show “Arranging … graph nodes…”
and an empty graph canvas. Their loading shells show no additional visual defects,
but these still images cannot establish whether the settled viewer graph is correct.
Capture that settled state separately; no persistent loading failure is inferred here.

Most serious defect: the broken authentication brand image. No second or third defect found.
