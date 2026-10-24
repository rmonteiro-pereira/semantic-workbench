# Round 16 — authentication light, partition AUTH-A

Capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
Authentication light capture passed at 2026-10-24 19:21:28 UTC.
Reviewed 28/28 fresh originals individually at native/original detail using the strict audit brief.
All intended views match the filenames. This report covers only the assigned 28 images.

Severity counts: **S1: 0; S2: 0; S3: 2**. No S1 or S2 defects observed.
23 screenshots are clean; five have the minor observations below.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R16-AUTH-A-1 | S3 | `workbench-auth-metric-approve-steward-1280.png`, `workbench-auth-metric-approve-steward-1440.png`, `workbench-auth-metric-deprecate-form-1280.png`, `workbench-auth-metric-deprecate-form-1440.png` | The sidebar scroll boundary leaves part of the next file row: finance/revenue filename at about y=502 in 1280, and the people.mapping type subtitle below y=625 in 1440. Separate sidebar controls remain clear. | Add a subtle scroll-edge affordance or align the initial boundary to a complete row. |
| R16-AUTH-A-2 | S3 | `workbench-auth-metric-deprecate-form-390.png` | The narrow deprecation reason field cuts the placeholder within “replaces”, while Cancel occupies a separate row. All controls fit, but this form feels cramped. | Put the reason field on a full-width row and group the actions below it. |

Connected-account dialogs are opaque, centered and readable at all four sizes, with clear
connection status and separated footer actions. Branding is decoded. The guarded-refusal
header wraps without collisions, and its complete reason remains visible in the lower banner.
Metric permission text is clear. Normal editor and content scrolling were not treated as defects.
No sideways page overflow, overlapping controls or visibly unreadable foreground text observed.

## Screens with no defects

- `workbench-auth-connect-prompt-1280.png`
- `workbench-auth-connect-prompt-1440.png`
- `workbench-auth-connect-prompt-2560.png`
- `workbench-auth-connect-prompt-390.png`
- `workbench-auth-connected-accounts-1280.png`
- `workbench-auth-connected-accounts-1440.png`
- `workbench-auth-connected-accounts-2560.png`
- `workbench-auth-connected-accounts-390.png`
- `workbench-auth-connected-github-1280.png`
- `workbench-auth-connected-github-1440.png`
- `workbench-auth-connected-github-2560.png`
- `workbench-auth-connected-github-390.png`
- `workbench-auth-guarded-refusal-1280.png`
- `workbench-auth-guarded-refusal-1440.png`
- `workbench-auth-guarded-refusal-2560.png`
- `workbench-auth-guarded-refusal-390.png`
- `workbench-auth-metric-approve-disabled-1280.png`
- `workbench-auth-metric-approve-disabled-1440.png`
- `workbench-auth-metric-approve-disabled-2560.png`
- `workbench-auth-metric-approve-disabled-390.png`
- `workbench-auth-metric-approve-steward-2560.png`
- `workbench-auth-metric-approve-steward-390.png`
- `workbench-auth-metric-deprecate-form-2560.png`
