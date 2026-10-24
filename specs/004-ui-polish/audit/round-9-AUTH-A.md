# Round 9 supplemental authentication review — partition A

Captured head: `c0a81f6`. Evidence: `/tmp/polish-final-gate/browser-auth-shots`.
The browser-auth run completed PASS at 2026-10-24T08:20:01Z; its log was read.
All 28 assigned fresh images were individually inspected at original resolution.
This covers seven states at 390, 1280, 1440 and 2560 pixels, independently of the tour.

**Counts: 1 S1, 0 S2, 2 S3.** This supplemental partition is not S1-free.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R9-AUTH-A-1 | S1 | `workbench-auth-guarded-refusal-1280.png` | The header occupies approximately y=0–404 in the main pane. Its controls are stranded at y=183, the document title is absent, and the source editor is compressed to approximately y=502–646. The neighboring sizes have an ordinary compact header. This is visibly broken layout with substantial content space lost. | Keep the refusal status within the compact header row and preserve the document title and editor height at this width. |
| R9-AUTH-A-2 | S3 | `workbench-auth-metric-approve-steward-1280.png`, `workbench-auth-metric-approve-steward-1440.png`, `workbench-auth-metric-deprecate-form-1280.png`, `workbench-auth-metric-deprecate-form-1440.png` | The independently scrolling project list ends through a file row immediately above Clear workspace: the finance/revenue filename at 1280 and the people.mapping row at 1440. The actions remain unobscured, but the small fragments look unfinished. | Give the scroll edge a subtle affordance or align the initial edge with a complete row. |
| R9-AUTH-A-3 | S3 | `workbench-auth-metric-deprecate-form-390.png` | The reason placeholder is cut after “replaces” in the narrow input and Cancel wraps onto its own line. The reason remains understandable, but this row is cramped compared with the desktop form. | Put the phone input on its own full-width row, followed by aligned action buttons. |

Connected-account dialogs are opaque, readable and contained at all four sizes. Their connection
states and next steps are explicit. The refusal explanation is fully readable in the bottom alert,
including on the phone. Disabled approval names the required role. The two phone approval captures
show an “Explaining order_count…” loading state; those pixels do not establish the settled explanation
layout. Editor horizontal overflow is confined to the editor. No additional observed overlap,
unreadable text or page-wide sideways scrollbar was found.

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

Reviewed: **28/28**. Clean images: **22/28**. All 28 are accounted for above.
