# Round 1 fixes: ODCS pages and capture tools (branch 004-ui-polish-fix4)

| Row | Status | Note |
|---|---|---|
| R1-A-15, R1-A-16 | fixed | Data Quality has an empty state with the next step. Relationships shows each key as a sentence, one legend for the two direction chips, and a table capped at 960 px. |
| R1-A-17 (ODCS pages) | fixed | ODCS pages cap tables and the header at 1400 px. Other screens are not in this area. |
| R1-A-18 | fixed | Contract id is a one-line monospace chip with a Copy button. Table descriptions wrap in full, and the overview table no longer scrolls inside the page. |
| R1-A-19 | fixed | Dataset tabs are one scrolling row (shared ScrollStrip, edge fade). On a phone Open in lineage sits on its own row. |
| R1-A-20 | fixed | Edit dialog says Save to file, gap under the title matches the other dialogs. The Classification hint is deferred: the field already explains itself when it is disabled. |
| R1-B-13, R1-C-21, R1-D-23 | fixed | Title is `Edit orders.status`. A hint says No changes yet while Save is off. The select uses the app focus style. Save button contrast is the shared primary token, deferred to the dialog owner. |
| R1-C-16 | fixed | Names and Edit buttons share one centre line, Edit column hugs its button. |
| R1-C-17 | fixed | Header: action on its own row at phone width, last change wraps inside the card. |
| R1-C-18 | fixed | See R1-A-18. |
| R1-C-19 | fixed | The duplicate odcs-contract screen is replaced by odcs-contract-search (filtered list). The projects screen is renamed sidebar-projects, because on a desktop it shows the sidebar beside whatever is open. The wide mm glyph is the headless browser's monospace fallback font, not an app defect. |
| R1-C-20 | fixed | Team and roles dialog body spacing matches the title gap. |
| R1-C-22 (ODCS pages) | fixed | See R1-A-17. |
