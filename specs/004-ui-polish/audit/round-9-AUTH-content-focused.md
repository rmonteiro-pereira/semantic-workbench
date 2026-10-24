# Focused authenticated content review

Reviewed all 12 assigned images in `/tmp/polish-auth-fixed1` individually at original native detail.
The phone person-menu graph now fits completely with visible outer boundaries and complete routes.
The phone metric now shows its loaded formula, and all viewer images contain loaded graph nodes.
Menus are opaque, readable and within the viewport at all four sizes.

Counts: 0 S1, 1 S2, 0 S3.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R9-AUTH-CONTENT-1 | S2 | `workbench-auth-viewer-workspace-1280.png`, `workbench-auth-viewer-workspace-1440.png`, `workbench-auth-viewer-workspace-2560.png` | The desktop viewer graph is a small cluster at the upper left, approximately x334–669 and y225–594 at every desktop size. At 2560, most of the canvas is unused, while the same graph in the person-menu image is centered and larger. | Apply the same initial fit and centering after the viewer workspace has loaded and its canvas has its final size. |

## Screens with no defects

- `workbench-auth-person-menu-390.png`
- `workbench-auth-person-menu-1280.png`
- `workbench-auth-person-menu-1440.png`
- `workbench-auth-person-menu-2560.png`
- `workbench-auth-metric-unverified-owner-390.png`
- `workbench-auth-metric-unverified-owner-1280.png`
- `workbench-auth-metric-unverified-owner-1440.png`
- `workbench-auth-metric-unverified-owner-2560.png`
- `workbench-auth-viewer-workspace-390.png`

Reviewed: 12/12 screenshots. Nine clean images and three images covered by one grouped finding.
No repository files, source, build or formatter were changed.
