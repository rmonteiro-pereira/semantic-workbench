# Round 2 resolution ledger

The original LA–LD tables remain the baseline review. This ledger records remediation without
claiming that the release audit is closed. A final capture and independent review are still needed.

| Baseline rows | Change | Verification |
| --- | --- | --- |
| LA-1 | Exclude native dialogs from the ODCS page content-width cap. | New centring assertion reproduced the defect; all four dataset viewports passed. |
| LA-15 (width) | Remove the redundant Relationships width cap; use the existing readable content width. | Width assertion passed at all four sizes. |
| LA-2, LB-5, LC-11, LC-16, LD-7, LD-8 | Reserve scroll-cue space before revealing the selected tab; reveal again after content and size changes. Check both model and dataset strips. | Shell and dataset matrices passed at all four sizes. |
| LA-11, LB-3 | Header titles wrap instead of truncating and retain the full-title tooltip. | Shell matrix passed; explicit title-clipping assertion added. |
| LA-6 | Current wizard step has a filled row; pending steps stay plain; labels align left. | Strengthened edit matrix passed at all four sizes. |
| LB-2, LC-14 | Long catalog titles truncate on one line with the full name in a tooltip. | Edit matrix passed; full-name assertion added. |
| LB-6 | Item drawer retains space after its last field and a thin scrollbar. | Edit matrix passed; bottom-padding assertion added. |
| LB-8 | Item fields stack in one column below 480 px. | Edit matrix passed; column assertion added. |
| LA-10 (hint layout) | Footer hints take a full row above actions. | Placement assertion passed at all four sizes. |
| LA-21, LC-18 (native-dialog scrim) | Increase the native modal scrim from 33% to 60%. | Rendered-alpha assertion passed at all four sizes. |

LB-14 needs no palette change on the baseline: the actual dark screenshot uses dark text,
not white text, on the salmon Delete button. Confirm computed contrast during theme verification
before resolving that row.

Rows not listed here remain open. No S1/S2-free round has been established.
