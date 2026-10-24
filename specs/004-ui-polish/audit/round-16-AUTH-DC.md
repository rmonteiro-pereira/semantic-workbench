# Round 16 — Authentication dark, partition C

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Authentication dark passed on 2026-10-24 at 19:22:28 UTC, producing 84 originals.
Read `/tmp/polish-round16/auth-dark/capture.log` before review. Every assigned fresh original
was inspected individually at native resolution with original image detail, applying the strict
visual audit brief. No sampling or previous-round verdict substitution was used.

Severity totals: **S1: 0; S2: 0; S3: 1**. No S1 or S2 defects observed.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-AUTH-DC-1 | S3 | `workbench-auth-roles-bob-1280.png`; `workbench-auth-roles-dave-1440.png`; `workbench-auth-roles-hank-1280.png` | At the sidebar bottom, the next row or file-type subtitle is partially exposed or clipped immediately above the fixed footer separator. This repeats F118; the list and footer controls remain visually distinct. | Keep the final visible row whole or clip before the next row begins, with clearance above the fixed footer. |

All four role menus have opaque dark surfaces and readable names, email, role and actions.
Source-control empty states explain what to select; phone controls remain inside the page.
Signed-out and sign-in-error cards show the brand mark, a clear message and a recovery action.
Their surfaces are consistently dark. Viewer graphs show all three counted area cards whole at
every size, with readable names, routes and legend. No additional overlap, clipping, low contrast,
sub-12-pixel-looking text, light-theme remnants or sideways page scrollbar was observed.

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

Reviewed **28/28**: three affected filenames in the S3 row and 25 clean filenames above.
