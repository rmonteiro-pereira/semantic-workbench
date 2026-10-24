# R9-AUTH-B — supplemental authenticated visual review

Provenance: browser-auth PASS at 08:20:01 UTC on captured head `c0a81f6`.
All 28 assigned screenshots were inspected individually at native resolution with original detail.
This supplements the main tour and covers only this manifest.

Counts: 1 S1, 1 S2, 0 S3. No clean supplemental verdict.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R9-AUTH-B-1 | S1 | `workbench-auth-person-menu-390.png` | The EntityType area reaches beyond the graph's right boundary at x383. Its right card boundary and outgoing routes are cropped in the initial three-area view; the other two areas fit. | Fit the initial graph within the phone canvas with enough right clearance for complete area cards and routes. |
| R9-AUTH-B-2 | S2 | `workbench-auth-no-access-1280.png`, `workbench-auth-no-access-1440.png`, `workbench-auth-no-access-2560.png`, `workbench-auth-no-access-390.png` | A broken-image placeholder appears immediately before the Semantic Workbench name on the No access card at every width. | Render the existing brand asset successfully in this authentication state. |

## Capture coverage

`workbench-auth-metric-unverified-owner-390.png` shows the owner metadata clearly, but the
calculation section is still replaced by “Explaining average_order_value…”. This image verifies
the owner state and loading presentation; it does not verify the completed phone calculation layout.
A still image cannot establish whether loading subsequently completes.

## Screens with no defects

- `workbench-auth-metric-unverified-owner-1280.png`
- `workbench-auth-metric-unverified-owner-1440.png`
- `workbench-auth-metric-unverified-owner-2560.png`
- `workbench-auth-metric-wizard-owner-1280.png`
- `workbench-auth-metric-wizard-owner-1440.png`
- `workbench-auth-metric-wizard-owner-2560.png`
- `workbench-auth-metric-wizard-owner-390.png`
- `workbench-auth-person-menu-1280.png`
- `workbench-auth-person-menu-1440.png`
- `workbench-auth-person-menu-2560.png`
- `workbench-auth-property-editors-dialog-1280.png`
- `workbench-auth-property-editors-dialog-1440.png`
- `workbench-auth-property-editors-dialog-2560.png`
- `workbench-auth-property-editors-dialog-390.png`
- `workbench-auth-property-editors-editor-1280.png`
- `workbench-auth-property-editors-editor-1440.png`
- `workbench-auth-property-editors-editor-2560.png`
- `workbench-auth-property-editors-editor-390.png`
- `workbench-auth-roles-alice-1280.png`
- `workbench-auth-roles-alice-1440.png`
- `workbench-auth-roles-alice-2560.png`
- `workbench-auth-roles-alice-390.png`

Reviewed: 28/28 screenshots. Five images have table findings, one has the capture limitation above,
and 22 have no observed visual defects. No repository files were changed.
