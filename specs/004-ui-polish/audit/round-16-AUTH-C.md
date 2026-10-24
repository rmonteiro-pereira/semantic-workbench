# Round 16 — Authentication light, partition C

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Authentication light passed on 2026-10-24 at 19:21:28 UTC, producing 84 originals.
Read `/tmp/polish-round16/auth/capture.log` before review. This partition inspected all
28 assigned fresh originals individually at native resolution with original image detail.
No sampling or prior verdict substitution was used.

Severity totals: **S1: 0; S2: 0; S3: 1**. No S1 or S2 defects observed.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-AUTH-C-1 | S3 | `workbench-auth-roles-bob-1280.png`; `workbench-auth-roles-dave-1440.png`; `workbench-auth-roles-hank-1280.png` | The sidebar file list exposes an incomplete final row or leaves its type line hidden directly above the fixed footer separator. This is the recurring minor sidebar scroll-boundary issue F118; footer controls remain separate and readable. | End the initial list at a complete row boundary or reserve clearance above the fixed footer. |

All four role menus are opaque, readable and contained at every width. Source control gives
clear no-change and no-file-selected explanations. Signed-out and sign-in-error pages show the
brand mark, readable messages and a clear recovery action. All four viewer graphs show three
whole counted area cards with legible names, connecting lines and a legend. Phone headers,
actions, tabs and graph controls remain bounded. No other clipping, overlap, low contrast,
unreadable text or sideways page scrollbar was observed in these images.

## Screens with no defects

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

Reviewed **28/28**: 25 clean filenames above and three filenames in the S3 row.
