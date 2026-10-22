# UI polish findings (v0.3.0)

Findings for the full UI polish pass, with their screenshots and, once fixed, the fix. Collected
during implementation and from owner/coordinator review; the polish pass adds its own sweep.

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| 1 | Mapping graph toolbar | The options button still reads "Lineage options…" on the mapping graph; use a neutral label ("Graph options…") or one per graph. | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 2 | Status footer on a mapping file | Reads "167 entities · 0 relationships", contradicting the mapping lines shown; show counts for the current graph (cards, mappings). | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 3 | Mapping graph first view on a metric | When the first view centres on a metric, also show the dataset(s) the metric reads, so concept → dataset → metric is visible at step 1. | /tmp/workbench-mapping-graph-mall-1440.png | open |
| 4 | Neighborhood after Full pierce | Lines between nodes in non-adjacent columns are routed as lanes around the whole canvas (large rectangles). Pierce now draws only the lines that reached each node; check the remaining lane routes on expansions. | /tmp/workbench-neighborhood-pierce-budget.png | open |
| 5 | Metric wizard step strip | At 390 and 1440 px the eight steps run past the drawer edge ("7 Explanatio…" cut, steps 5–8 off-screen at 390) with no visible scroll cue; wrap the steps or show a compact "Step 3 of 8" strip. | scratchpad p7-wizard-390.png, p7-wizard-1440.png | open |
| 6 | Source Control change row (shared repository) | The project tag ("Finance") wraps onto its own line under the file name at 1440 px, so rows of a shared repository are taller and uneven; keep the tag on the name line and truncate the folder instead. | /tmp/workbench-monorepo-scm.png | open |
| 7 | Projects in this repository dialog | The project-name inputs use the 16 px dialog input size while the folder paths are 12.5 px monospace; the rows look heavy. Use the 13 px input style of other compact forms. | /tmp/workbench-monorepo-projects-1440.png | open |
| 8 | Delete dialog, subfolder choice | The bold labels "Remove from workspace" / "Delete folder" render at regular weight in the dialog font; the two choices read as one paragraph each. Make the label a heading line and the explanation a muted second line. | /tmp/workbench-monorepo-delete-1280.png | open |
| 9 | Clone dialog result | When a clone has invalid files and a manifest, the manifest sentence sits above "These files are not valid definitions"; group the result as a short list (projects made, files to repair) so the outcome reads at a glance. | /tmp/workbench-monorepo-clone.png | open |
| 10 | Mappings concept list | The concept list scrolls the selected concept into view and leaves the first visible card cut at the top ("ManufacturerName" half hidden) at 1600 px; scroll so a whole card is at the top, or add a top fade. | /tmp/workbench-mapping-chains.png | open |
| 11 | Compose a query dialog | With many fields the "Group by mapped fields" list scrolls inside a 280 px box inside a scrolling dialog (nested scroll); give it a filter box and let the dialog scroll once. | /tmp/billing-verified-query.png | open |
| 12 | Delete project Sales, 390 px | The dialog title wraps to two lines ("Remove project Sales from the / workspace?"); a shorter title ("Remove Sales?") with the explanation below would fit one line. | /tmp/workbench-monorepo-delete-390.png | open |
| 13 | Editor status bar, large file mode | "Large file mode" is plain small text beside the cursor position; give it a badge style like the syntax label so the mode is noticed, and keep the switch button next to it. | /tmp/workbench-sql-large-mode.png | open |

