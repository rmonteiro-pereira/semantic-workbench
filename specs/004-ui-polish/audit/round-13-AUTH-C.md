# Round 13 authentication light — partition C

Frozen capture head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.
Capture `/tmp/polish-round13/auth/capture.log` completed successfully; progress records
`PASS auth 2026-10-24T13:18:01Z`. Authentication light produced 84 original images.
This partition independently inspected all 28 assigned originals individually at original detail.
No sampling or previous-round verdict substitution.

**S1: 0; S2: 0; S3: 1. No S1 or S2 findings.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-AUTH-C-1 | S3 | `workbench-auth-roles-bob-1280.png`, `workbench-auth-roles-dave-1440.png`, `workbench-auth-roles-hank-1280.png` | The scrolling sidebar ends immediately above the fixed actions with the next file row or its secondary line only partially visible. This is the minor scroll-boundary pattern F118; selected files and controls remain readable. | Rest the sidebar at whole-row boundaries or give the scrolling edge a clearer visual boundary. |

Screens with no defects:

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

Reviewed **28/28** exact manifest basenames. Person menus remain opaque and contained,
including the phone views. Role names, account actions, SCM empty-state guidance and disabled
controls remain readable. Signed-out/error cards have visible branding and clear recovery actions.
Viewer graph cards, headings, routes and legend fit the pane at every assigned size without
serious overlap or clipping. No unintended sideways scrollbar or visibly sub-12px foreground
interface type was found in these originals.
