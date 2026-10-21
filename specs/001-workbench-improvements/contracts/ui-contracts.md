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
| Metrics view | tab "Metrics"; `table` of KPIs (Label, Type, Unit, Status, Owner, Concept); filters; "New KPI" wizard with numbered steps |
| KPI explanation | region "How it is calculated": composition `tree`, inputs list, rules, concepts, SQL preview `code` labelled "Preview · not executed" |
| Neighborhood | center picker `combobox` "Neighborhood center"; breadcrumb `navigation` "Walk"; Back/Forward buttons; "Show links between neighbors" toggle; "N more neighbors" control |
| Full screen | button "Full screen" / "Exit full screen"; Escape exits |
| ODCS dataset page | header facts; tabs "Schema", "Lineage", "History", "Quality"; property `table` |
| Source Control | panel "Source Control" per project: changes list (labels for hidden files), Stage/Unstage, message `textbox` + "Commit", branch `combobox`, "Create branch", Fetch/Pull/Push/Sync, "Add to .gitignore" in the item menu, diff view |
| Status messages | `status` regions auto-dismiss (≤ 6 s) or clear on next action; never overlap graph controls |
