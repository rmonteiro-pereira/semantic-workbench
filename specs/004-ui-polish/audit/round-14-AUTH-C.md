# Round 14 — AUTH-C — authentication light

Capture head: `2ce466ca0e39184b573e6631525c0e524c3b7ceb`.
Authentication light PASS: 2026-10-24T17:18:36Z, with 84 originals across its three partitions.
Read evidence: `/tmp/polish-round14/auth/capture.log` and `/tmp/polish-round14/progress.log`.
Assigned manifest: `/tmp/polish-round14-review-AUTH-C.txt`.

Reviewed **28/28** fresh assigned originals individually at native/original detail.
No sampling, contact sheets or earlier verdict substitution. Inspected intended view, theme,
overlap, clipping, alignment, spacing, type size, contrast, labels, empty states, opaque menus
and sideways overflow at 390, 1280, 1440 and 2560 pixels.

**No S1 or S2 found. Totals: S1: 0; S2: 0; S3: 1.**

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R14-AUTH-C-1 | S3 | `workbench-auth-roles-bob-1280.png`, `workbench-auth-roles-dave-1440.png`, `workbench-auth-roles-hank-1280.png` | The sidebar ends with a fragment of its next file/type line immediately above the fixed footer separator. This repeats F118; the foreground menu and source-control actions remain readable. | Reserve sufficient bottom inset or rest at a whole-row boundary so the next line is not stranded. |

All four role menus are present, opaque and bounded; names, email addresses, roles and account
commands are legible. The sign-in error and signed-out cards show their brand mark and clear
recovery actions. Viewer graph screenshots show whole counted cards with readable names and
clear routes at each size. Source-control empty panes explain that no file is selected and
how to view a diff. No additional defect was observed.

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

Reviewed **28/28**: 25 without defects; three covered by the repeated S3 row.
