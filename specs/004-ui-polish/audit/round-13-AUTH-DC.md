# Round 13 authentication dark — partition C

Frozen head: `58aa8c4d828b8857e81b1be15aa5d822faad3103`.
Dark authentication capture completed with PASS at 2026-10-24T13:19:12Z;
`/tmp/polish-round13/auth-dark/capture.log` records the successful suite.
The mode contains 84 originals. This independent partition reviewed all 28 assigned originals
individually at original detail, freshly and without sampling or reused light-theme verdicts.

**S1: 0; S2: 0; S3: 1. No S1 or S2 findings.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R13-AUTH-DC-1 | S3 | `workbench-auth-roles-bob-1280.png`, `workbench-auth-roles-dave-1440.png`, `workbench-auth-roles-hank-1280.png` | The sidebar scroll boundary directly above fixed actions leaves a secondary file line or the beginning of the next row partially visible. Selected items and actions remain readable. This repeats the minor F118 pattern. | Give the scrolling boundary clearer separation or rest the list on whole-row boundaries. |

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

Reviewed **28/28** exact manifest basenames. Dark surfaces are consistent throughout person
menus, SCM, identity cards and viewer graph. Foreground names, role descriptions, disabled
controls and recovery actions remain readable. Menus are opaque and fit the phone viewport.
Viewer graph cards and headings fit at all four sizes; routes avoid text and card interiors.
No serious clipping, overlap, confusing empty state or unintended horizontal scrollbar was seen.
