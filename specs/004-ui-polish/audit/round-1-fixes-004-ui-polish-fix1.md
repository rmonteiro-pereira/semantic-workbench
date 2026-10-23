# Round 1 fixes: graph canvases (branch 004-ui-polish-fix1)

| Row | Status | What changed or why not |
|---|---|---|
| R1-A-1, R1-C-9 | fixed | On a phone the pierce, options, zoom and full screen controls fold behind one Controls button (`src/graph/CompactControls.tsx`); the hop path text and count hide; the legend shows kinds only. The canvas keeps more than 55 percent of the screen (asserted in the responsive suite). |
| R1-A-3, R1-C-7, R1-B-3 (count), R1-D-15 (count) | fixed | The layer gap grew to 230 and card width fell to 330 so a foreign-key label has room. The count of cards that show depends on the pane width because whole cards at a readable zoom are required; the counted control says so in its tooltip. |
| R1-A-4, R1-B-4, R1-C-7 (label), R1-D-12 | fixed | "Group by" label shows at every width (the 1100 to 1450 px rule that hid it is gone); "Auto: example areas" reads "Automatic" with the mode in its tooltip; "Full pierce" reads "Show all connected"; "Lineage options" and "Graph options" read "View options"; the footer sentence is plain words. |
| R1-A-5, R1-C-8 | fixed | A label sits just above its line, opaque, with a 6 px clearance; the first view scales up to 1.4 on a large pane; the legend sits apart from the status sentence. |
| R1-B-1, R1-D-1, R1-D-2 | fixed | The model graph opens with one card per area when the entities would not read at 12 px in the pane, names and area titles grow when zoomed out, and unfocused links fade when zoomed out. The "Routing: background worker" text is now a data attribute. |
| R1-B-2, R1-D-3 | partly fixed | Detail lines show only at a zoom of 0.92 or more; below it names grow (12 px or more, up to two lines) and the centre keeps its full height so lines spread along it; the column gap is 400. Lines still arrive on one side of the centre card from several columns: a different layout would be needed to remove the long lanes. |
| R1-B-3, R1-D-15 | partly fixed | The grouped card shows one clean line with the list in its tooltip. The type column of a row is still not in a fixed track: a fixed badge track would cut column names. Deferred. |
| R1-B-4 (graph part) | fixed | See R1-A-4. |
| R1-B-5, R1-D-12 (footer) | fixed | Counts removed from the model graph footer (the app footer holds them); one hint in plain words. The "React Flow" credit stays: its licence asks to keep it unless the project subscribes. Deferred. |
| R1-D-4 | fixed | The neighborhood toolbar wraps instead of scrolling sideways; the links to other files sit behind one Other files button on a phone; 6 neighbors show at first on a phone and the first view never zooms below 0.3, so names stay 12 px or more. |
| R1-D-16 | fixed | The legend explains the number on a bundled line. Legend text is the 12 px token. |
| R1-D-17 | not mine | Drawer part, owned by another area. |
| R1-C-12 | not mine | The audit lists it as no: catalog. |
