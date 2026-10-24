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

The second batch implements the following rows, with full audit closure still pending:

| Baseline rows | Change | Verification |
| --- | --- | --- |
| LA-4, LD-1, LD-2 (detail and layering) | Hide unreadable summaries/badges and draw edges behind opaque headings. | Four graph viewport checks pass; zoom unit checks pass. |
| LA-5, LA-6, LB-9, LD-4 | Center the short wizard and distinguish disabled actions with readable text and dashed borders. | Four edit viewport checks pass. |
| LA-9, LB-10, LB-11, LD-5, LD-6 | Clear input prompts, binding guidance, counted file lists, file-move and export wording. | Four edit checks, 13 trash checks and 8 monorepo checks pass. |
| LA-13, LB-4, LC-22 | Remove tree fades/insets; pair Examples and Import on short windows. | Four shell viewport checks pass. |
| LB-1, LC-15 | Name the catalog open action and retain full-description tooltips. | Four edit viewport checks pass. |
| LC-12, LD-9 | Compact phone metric cards; retain Unit and hide Type with its heading. | Four edit viewport checks pass, including column correspondence. |
| LB-13, LC-21 | Add Source Control margin, move its empty state near controls, label counts and keep Sync with branch controls. | New geometry assertions; full page matrix pending. |
| LA-14, LB-7 (wording) | Short schema-coverage note with the exact supported version. | Static checks pass; final source capture pending. |

The original LA–LD tables now carry a disposition for every row. Fixed rows describe the code
change; triaged rows explain the observed behavior or screenshot interpretation. S3 preferences
remain deferred unless covered by a shared fix. All dispositions still await the full fresh audit.

The third batch adds selected-mapping Source actions, one unbound-concept summary, page-owned
mapping scroll, equal summary columns, graph count units and legend, wrapped area names, bounded
edge labels, concise path summaries, first-position schema findings, quality Source navigation,
compact phone editor chrome, standard Sync typography and a single phone property Edit label.
The mapping navigation regression passes all six sizes. No S1/S2-free round has been established.

Final closure: the complete round 8 independently reviewed 864 native images with zero S1/S2.
The 59 fixed baseline serious rows and six explicit triages are resolved; see `closure.md`.
Minor S3 preferences remain recorded rather than represented as serious defects.
