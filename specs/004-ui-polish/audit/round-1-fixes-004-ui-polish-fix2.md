# Round 1 fixes: theme, controls and the shell (branch 004-ui-polish-fix2)

| Row | Status | What changed |
| --- | --- | --- |
| R1-C-1, R1-D-7 | fixed | Base rule in `src/style.css`: inputs, text areas and selects take `--color-surface` and `--color-text`; placeholders use `--text-muted`. |
| R1-C-2 | fixed | Same base rule covers the add-concept and item-editor text areas. |
| R1-C-4, R1-A-10, R1-B-9 | fixed | Tree edges show a shadow and a line, rows snap, the open file scrolls into view only when hidden, footer buttons share one compact style, the location note's second line gives way on short windows. A tree taller than its box still cuts a row at an edge; the shadow and thin scrollbar say it scrolls. |
| R1-C-10, R1-A-11, R1-B-15 | fixed | `ScrollStrip` draws a chevron beside each edge with more tabs; the strip keeps a margin for them so nothing is covered. Icon-only header buttons have tooltips; on a phone New and Commit show their names. |
| R1-C-11, R1-A-23, R1-B-16, R1-D-24 | fixed, one part deferred | Below 1500 px the pill draws "Saved" (full text stays in the tooltip and in the element); the title already had a tooltip. Deferred: hiding the header Commit on Source control, because the header button also flushes the pending save. |
| R1-C-15 | partly fixed | Native select follows the dark tokens. The duplicated step title and empty drawer belong to the wizard owner. |
| R1-C-22, R1-D-8, R1-A-17, R1-B-18 | fixed | `--content-max-width` (1600 px): contract, mappings, catalog and metrics list share it and are centred from 1920 px; dialogs are wider from 1920 px. The "-" in Unit is not explained (metrics owner). |
| R1-D-6 | fixed, one part deferred | Message box, project select and disabled Commit follow tokens; disabled buttons keep at least 3:1. The empty right pane wording is an empty state (not mine). |
| R1-D-17 | fixed | Scrim darker (55 %); the tree has scroll cues. The focus ring on the close button is the keyboard focus ring and stays. |
| R1-D-19, R1-B-19 | fixed, wording deferred | Checkboxes and radios use the accent colour. Dialog wording is not mine. |
| R1-D-25 | fixed | Examples and Import use the same solid style as Clear workspace and Trash; the workspace label has a tooltip. File type lines were already 12 px. |
| R1-D-26, R1-B-17 | fixed | The status bar names the first finding ("Line 6: message (+N more)", click to go there). Status text was already 12 px. The Source and Source editor names stay. |
