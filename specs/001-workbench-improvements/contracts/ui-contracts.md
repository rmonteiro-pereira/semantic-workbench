# UI Contracts

Stable user-facing surfaces that browser checks assert against (accessible names are the
contract; layout is not).

| Surface | Contract |
| --- | --- |
| Sidebar | `tree` named "Projects"; each project a `treeitem` with its files; per-item menu with Rename, Move, Delete; buttons "Clear workspace", "Trash" |
| Delete confirmation | `dialog` naming each removed item, unsaved-draft warning, broken-reference list; buttons "Delete" and "Cancel" |
| Undo | `status` toast with "Undo" button for 10 s after a delete or Clear |
| Trash | `dialog` listing entries with "Restore" and "Delete permanently"; "Empty trash" with confirmation |
| Suggestions | `region` "Grouping suggestions" with evidence and "Add to project" / "Dismiss" |
| Source editor | `textbox` "Definition source" (CodeMirror content element), lint gutter markers with tooltips, "Go to line" |
| Item editor | `dialog` or panel "Edit <item name>" with fields per type, inline findings, "Save" disabled while invalid |
| RDF item editor | `dialog` "Edit <label>": `region` "Statements" with "Predicate N" / "Object N" fields, "Remove statement N", "Add statement"; tabs Statements / Source; `status` with the graph check; an `alert` with "Open line N in Source" when the item cannot be edited in place |
| Metrics view | tab "Metrics"; `table` of KPIs (Label, Type, Unit, Status, Owner, Concept); filters; "New KPI" wizard with numbered steps |
| KPI explanation | region "How it is calculated": composition `tree`, inputs list, rules, concepts, SQL preview `code` labelled "Preview · not executed" |
| Neighborhood | center picker `combobox` "Neighborhood center"; breadcrumb `navigation` "Walk"; Back/Forward buttons; "Show links between neighbors" toggle; "N more neighbors" control |
| Full screen | button "Full screen" / "Exit full screen"; Escape exits |
| ODCS dataset page | header facts; tabs "Schema", "Lineage", "History", "Quality"; property `table` |
| Source Control | region "Source Control" per project (sidebar "Source control"): groups "Merge conflicts", "Staged changes", "Changes" (hidden files labelled "not shown in workspace"), per-row "Stage/Unstage/Open/Add <path> to .gitignore", `textbox` "Commit message" + "Commit", `combobox` "Branch" + "New branch", group "Remote" with Fetch/Pull/Push/Sync, `status` "Waiting for Git (credentials may be requested in a separate window)" with "Cancel", group "History"; diff view `group` "Changes in <path>" / "Versions of <path>" |
| Status messages | `status` regions auto-dismiss (≤ 6 s) or clear on next action; never overlap graph controls |
