# Round 1 fixes: dialogs, empty states, wording, metrics, mappings, catalog, overview, forms

Branch `004-ui-polish-fix3`. Status of each assigned row.

| Row | Status | What changed or why not |
|---|---|---|
| R1-A-2, R1-C-3 | fixed | In the split view the list pane has less padding and tighter cells, so Metric, Type and Status fit; a check asserts the table never leaves its pane. The detail pane scrolls to its top when a metric opens (the earlier first view was partly the tour scrolling while it opened every section). |
| R1-A-6, R1-C-14 | fixed | The add dialog shows no amber warning. A plain note beside the footer buttons says "Name and type are required." and the disabled button is readable. |
| R1-A-7, R1-C-5 | fixed | The relationships list shows whole rows (six, ten or eighteen by window height) with a shadow at the edge that has more rows; the compatibility note says in plain words that only basic checks ran; a text field shows its full value as a tooltip. |
| R1-A-8, R1-B-7, R1-C-6, R1-D-13 | fixed | The empty mapping detail is an empty state that names the mapping file and offers Open Source; the empty "0 resolved bindings" group is hidden; the summary is a grid; the concept list fades at its bottom edge; the heading says what Export agent context does and the AI context row says what it holds. |
| R1-A-9, R1-C-13 | fixed | Clone says Cancel until the clone has run, then Close; its disabled Clone button is readable and a note says to enter a URL; placeholders use the muted text colour at full strength. The branch row wrapping (R1-C-13) was not reproduced after the Sync button moved into its own dialog earlier; no change. |
| R1-A-12, R1-B-6, R1-C-12, R1-D-9 | fixed | Descriptions show three lines with the full text as a tooltip; every card reserves the badge row, so titles share a line; one badge pattern ("1 metric", "6 metrics"); long names wrap. The repeated sentence comes from the example data and is not changed. |
| R1-A-13, R1-C-15 (wording) | fixed except the panel height | The step is named once; the fields say "Business concept" and "Computed per" with help text; the browser's list arrow is hidden on every size; Back sits at the left. The wizard stays a full-height drawer like the item editor, so the empty area under two fields stays (deferred: a shrinking drawer would differ from every other drawer). |
| R1-A-14 | fixed | Rule cards take the height of their content; the additivity text no longer repeats its title; the checkbox has no extra indent. |
| R1-A-20, R1-B-13, R1-C-21, R1-D-23 | fixed | Title "Edit property: status", footer "Save to file", a note "No changes yet." while it is off, a hint under Classification, shared padding and the single focus ring. |
| R1-A-21 | fixed | The import radio card uses the one focus ring; the helper line is reworded. |
| R1-A-22, R1-B-11, R1-C-20, R1-D-18 | fixed | Two widths (narrow 480 px, wide 880 px), one padding, a footer on every dialog (delete, rename, move, replace, domain, trash and the item delete dialogs moved into the footer), one button order with the rule written in `Modal.tsx`; the delete button is a solid red in both themes; the project row of the delete list no longer repeats the project name. Showing a count of files with an expandable list is deferred. The stacked table at 390 in Team and roles belongs to the data pages. |
| R1-B-8, R1-D-14 | fixed | Group cards of a row share a height with the footer at the bottom; the Neighborhood button uses the tab's icon; the legend shows only when an entity is selected; "0 outgoing" is no longer dimmed and says why. |
| R1-B-10 | fixed except the history date | Heading "Source control", the project select has the field border, the panel button reads "Commit to main" (the header keeps "Commit…"), and the empty right pane is an empty state. The history timestamp format is deferred. |
| R1-B-12, R1-D-27 | fixed | One sentence in the empty trash; Close is a neutral button. |
| R1-B-14, R1-D-22 | fixed | The composer says what to do in each empty section, shows the intro on one line, keeps Close (its choices stay) and says why the preview is off. |
| R1-B-20, R1-B-21, R1-D-20, R1-D-21 | fixed | Titles "Connect a remote" / "Change remote" / "Review file move"; the sync dialog button reads "Add remote…" or "Change remote…" and sits under the sentence; the folder help text is reworded. |
| R1-B-19 | fixed | The export checkbox takes the brand colour and the intro is shorter. |
| R1-D-5, R1-B-20 | fixed | Project dialogs open over the Models explorer of the project they are about; a check compares the dialog's project with the page behind it (it found Source control behind the dialogs before the tour was fixed). |
| R1-D-10 | partly | The catalog gets bottom padding. The sidebar project list belongs to the sidebar agent. |
