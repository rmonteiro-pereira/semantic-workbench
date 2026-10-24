# Round 11 — authentication dark, partition AUTH-DA

Captured head: `f648e4aaaa07a4ce82c340cafa84baefad71328a`.
Evidence directory: `/tmp/polish-round11/auth-dark`.
Fresh independent inspection of all 28 assigned images individually at original resolution.
Seven states at 390, 1280, 1440 and 2560 pixels; all intended states match their filenames.
The completed capture log was read. The mode produced 84 screenshots;
`/tmp/polish-round11/progress.log` records `PASS auth-dark 2026-10-24T08:52:49Z`.
The auth suite logs behavior assertions rather than the tour's MEASURE rows.

**Counts: 0 S1, 0 S2, 2 S3.** No S1 or S2 defects were found in this partition.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R11-AUTH-DA-1 | S3 | `workbench-auth-metric-approve-steward-1280.png`, `workbench-auth-metric-approve-steward-1440.png`, `workbench-auth-metric-deprecate-form-1280.png`, `workbench-auth-metric-deprecate-form-1440.png` | The independently scrolling project list ends through a file row immediately above Clear workspace: the finance/revenue filename at 1280 and the people.mapping row at 1440. The actions remain unobscured, but the small fragments look unfinished. | Give the scroll edge a subtle affordance or align the initial edge with a complete row. |
| R11-AUTH-DA-2 | S3 | `workbench-auth-metric-deprecate-form-390.png` | The reason placeholder is cut after “replaces” in the narrow input and Cancel wraps onto its own line. The reason remains understandable, but this row is cramped compared with the desktop form. | Put the phone input on its own full-width row, followed by aligned action buttons. |

The refusal header is compact at all four sizes; its full explanation is readable in the bottom
alert. All 28 images visibly use the dark theme. Account dialogs are opaque and readable, with no leftover light surfaces. Disabled approval explicitly names the required
role, and the phone metric explanations are settled. Logos are decoded. Editor overflow remains
inside its pane. No additional observed overlap, unreadable text or page-wide sideways scrollbar
was found. Modal underlays do not establish a settled graph first view or hidden interaction behavior.

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

Reviewed: **28/28**. Clean images: **23/28**. All 28 are accounted for above.
